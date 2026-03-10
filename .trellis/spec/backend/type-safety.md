---
stage: mvp
---

# 后端类型安全

> [SYNC-NOTE]
> 角色：事实基准（供 agents 使用）
> 主文档：.trellis/spec/backend/type-safety.md
> 镜像文档：.trellis/spec/backend/type-safety.zh.md
> 最近同步：2026-03-03
> 同步负责人：codex


## 必须遵循的模式

- 在 `src/types/**` 中定义可复用契约。
- service 接口与 action 返回类型必须显式声明。
- 成功/失败分支优先使用可辨识联合（discriminated union）响应类型。

## 现有参考

- `src/types/api.ts`
- `src/types/analysis.ts`
- `src/server/actions/analysis.ts`

## 禁用模式

- 在业务逻辑中使用 `any`。
- 无 guard/validation 前提下使用 `as unknown as X` 这类不安全断言。
- 外部 payload 的 `unknown` 隐式向下游传播。

---

## 代码案例与原因

反例：
```ts
const body = (await request.json()) as { chapterId: string };
return chapterAnalysisService.analyzeChapter(body.chapterId);
```

正例：
```ts
const body: unknown = await request.json();

const chapterId =
  typeof (body as { chapterId?: unknown })?.chapterId === "string"
    ? (body as { chapterId: string }).chapterId
    : undefined;

if (!chapterId) {
  throw new Error("chapterId is required");
}

return chapterAnalysisService.analyzeChapter(chapterId);
```

原因：
- unknown 输入若不校验直接断言，会把异常推迟到更深层，增加排障成本。
- 在入口做类型收敛，下游 service 可保持稳定接口与更简单逻辑。
