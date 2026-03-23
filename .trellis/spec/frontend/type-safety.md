---
stage: mvp
---

# 前端类型安全

> 本项目的类型安全实践规则。

---

## 类型组织

- 跨层共享契约类型统一放在 `src/types`。
  - 分析 payload 与解析类型：`src/types/analysis.ts`
  - API 响应封装类型：`src/types/api.ts`
- 组件 props interface 与组件文件 colocate。
- server action 的状态/结果 interface 放在 action 附近。

真实示例：
- `src/server/actions/analysis.ts` 中的 `AnalysisActionState`
- `src/components/ui/Button.tsx` 中的 `ButtonProps`
- `src/types/api.ts` 中的 `ApiResponse<T>`

---

## 外部数据校验

**外部输入（AI 输出、HTTP 请求体、URL 参数）一律用 Zod 校验，禁止裸 `as` 断言。**

详见 [shared/zod-typescript.md](../shared/zod-typescript.md)。

```typescript
// 禁止
const body = (await request.json()) as { chapterId: string };

// 正确：Zod 校验后类型自动收窄
const schema = z.object({ chapterId: z.string().cuid() });
const parsed = schema.safeParse(await request.json());
if (!parsed.success) return errorResponse(...);
const { chapterId } = parsed.data;
```

---

## 常用模式

- 使用 `as const` 数组定义窄类型联合（适用于 Prisma enum 等值集合）。
- 组件 props 使用 TypeScript interface，不需要 Zod（props 来自内部，不是外部输入）。
- 跨层 API 响应使用泛型 `ApiResponse<T>` 保证结构一致。

真实示例：
- `src/types/analysis.ts` 中的 `BIO_CATEGORY_VALUES as const`
- `src/types/api.ts` 中的 `ApiResponse<T>`

---

## 禁用模式

参见 [shared/code-quality.md](../shared/code-quality.md)。核心：禁止 `any`、禁止无校验 `as` 断言、禁止 `!` 断言。
