# Backend Type Safety

> [同步说明]
> 角色：中文镜像（供人阅读）
> 主文档：.trellis/spec/backend/type-safety.md
> 镜像文档：.trellis/spec/backend/type-safety.zh.md
> 最后同步：2026-03-03
> 同步人：codex


> [SYNC-NOTE]
> Role: Source of truth (for agents)
> Canonical: .trellis/spec/backend/type-safety.md
> Mirror: .trellis/spec/backend/type-safety.zh.md
> Last synced: 2026-03-03
> Sync owner: codex


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
- 未经守卫/校验就使用 `as unknown as X` 这类不安全断言。
- 外部 payload 的 `unknown` 隐式向下游传播。
