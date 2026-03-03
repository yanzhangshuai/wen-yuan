# 类型安全

> [同步说明]
> 角色：中文镜像（供人阅读）
> 主文档：.trellis/spec/frontend/type-safety.md
> 镜像文档：.trellis/spec/frontend/type-safety.zh.md
> 最后同步：2026-03-03
> 同步人：codex


> [SYNC-NOTE]
> Role: Source of truth (for agents)
> Canonical: .trellis/spec/frontend/type-safety.md
> Mirror: .trellis/spec/frontend/type-safety.zh.md
> Last synced: 2026-03-03
> Sync owner: codex


> 本项目中的类型安全模式。

---

## 概览

项目启用了 TypeScript strict mode，并在组件 props、payload 契约和外部数据解析中使用显式接口。

---

## 类型组织

- 共享契约位于 `src/types`。
  - 领域 payload：`src/types/analysis.ts`
  - API 响应契约：`src/types/api.ts`
- 组件局部的 prop 类型与组件放在一起。

示例：
- `src/server/actions/analysis.ts` 中的 `AnalysisActionState`
- `src/components/ui/Button.tsx` 中的 `ButtonProps`

---

## 运行时校验

对不可信 payload 使用类型守卫与归一化处理。

示例：
- `src/types/analysis.ts` 中的 `parseChapterAnalysisResponse` 会在使用前校验并归一化 AI JSON 输出。

对于请求体解析，在传入 service 之前先校验 unknown 输入。

示例：
- `src/app/api/analyze/route.ts` 中的 `POST` handler

---

## 常见模式

- 使用 `as const` 字面量数组构建收窄 union 类型。
- 为 unknown 值编写专用 `isRecord` / 谓词守卫。
- 使用通用响应包装表示 API 成功/失败联合类型。

示例：
- `src/types/analysis.ts` 中的 `BIO_CATEGORY_VALUES as const`
- `src/types/api.ts` 中的 `ApiResponse<T>`

---

## 禁止模式

- 在组件 props 和共享契约中使用 `any`。
- 对 unknown 输入不做检查就盲目断言。
- 在 API/action handler 中返回不一致的 payload 结构。
