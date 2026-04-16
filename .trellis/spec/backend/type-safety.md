# 后端类型安全

---

## 必须遵循的模式

- 在 `src/types/**` 中定义可复用契约。
- service 接口与 action 返回类型必须显式声明。
- 成功/失败分支优先使用可辨识联合（discriminated union）响应类型。

真实示例：

- `src/types/api.ts`
- `src/types/analysis.ts`
- `src/server/actions/analysis.ts`

---

## Service 层代码组织：工厂函数 vs class

**Service 层用工厂函数 + 闭包；SDK wrapper / Provider 层用 class。**

判断标准：

- 需要构造注入依赖（prisma、aiClient）以便测试 → 工厂函数
- 持有已初始化的第三方 SDK 实例（如 `GoogleGenerativeAI`、`Redis`） → class

```typescript
// 禁止：service 层用 class，私有方法依赖 this，测试时 mock 麻烦
export class ChapterAnalysisService {
  constructor(private prismaClient = prisma, private aiClient = provideAnalysisAi()) {}
  async analyzeChapter(id: string) { ... }
}

// 正确：工厂函数，依赖通过参数注入，闭包捕获，测试直接传 mock
export function createChapterAnalysisService(
  prismaClient: PrismaClient = prisma,
  aiClient: AiAnalysisClient = provideAnalysisAi()
) {
  async function analyzeChapter(id: string) { /* 直接用 prismaClient / aiClient */ }
  return { analyzeChapter };
}

// 正确：SDK wrapper 保留 class，符合第三方库惯例
export class GeminiClient implements AiProviderClient {
  private readonly client: GoogleGenerativeAI;
  constructor(apiKey = process.env.GEMINI_API_KEY) { ... }
}
```

原因：工厂函数的 DI 与 class 等效，但无 `this` 绑定风险，私有逻辑作为局部函数天然隐藏，可读性更高。

---

## 外部数据校验

**所有入口（API Route 请求体、AI 输出 JSON、URL 参数）用 Zod 校验，不使用手写 guard。**

详见 [shared/zod-typescript.md](../shared/zod-typescript.md)。

```typescript
// 禁止：手写 guard 繁琐且容易漏字段
const body: unknown = await request.json();
const chapterId =
  typeof (body as { chapterId?: unknown })?.chapterId === "string"
    ? (body as { chapterId: string }).chapterId
    : undefined;

// 正确：Zod 一行搞定，类型自动推导
const { chapterId } = z.object({ chapterId: z.string() }).parse(body);
```

AI 输出的校验规则见 [ai-output-contract.md](./ai-output-contract.md)。

---

## 禁用模式

参见 [shared/code-quality.md](../shared/code-quality.md)。核心：禁止 `any`、禁止 `as unknown as X`、禁止 unknown 向下游隐式传播。
