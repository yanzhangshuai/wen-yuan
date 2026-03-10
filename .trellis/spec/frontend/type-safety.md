---
stage: mvp
---

# 类型安全

> 本项目的类型安全实践规则。

---

## 概览

项目启用 TypeScript `strict` 模式，并在以下场景保持显式类型：
- 组件 props；
- 跨层共享 API/领域契约；
- 外部不可信输入的解析与校验。

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

## 运行时校验规则

- 外部输入在完成校验前一律视为 `unknown`。
- 对 AI/HTTP 结构化 payload 先解析、再归一化、再使用。
- 校验后返回稳定一致的 success/error 响应结构。

真实示例：
- `src/types/analysis.ts` 中的 `parseChapterAnalysisResponse`
- `src/app/api/analyze/route.ts` 中的 `POST` 请求体校验

---

## 常用模式

- 使用 `as const` 数组定义窄类型联合。
- 使用本地 predicate guards（如 `isRecord`、分类判断）处理 unknown 值。
- 使用泛型 API 响应联合保证返回结构一致。

真实示例：
- `src/types/analysis.ts` 中的 `BIO_CATEGORY_VALUES as const`
- `src/types/analysis.ts` 中的 `isRecord` 与 `isBioCategory`
- `src/types/api.ts` 中的 `ApiResponse<T>`

---

## 禁用模式

- 在共享契约和组件 props 中使用 `any`。
- 对 unknown 请求/模型输出做无校验 `as` 断言。
- 返回绕过 `ApiResponse<T>` 的临时拼接响应结构。

---

## 代码案例与原因

反例：
```ts
export function parsePayload(payload: unknown) {
  return payload as { chapterId: string };
}
```

正例：
```ts
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parsePayload(payload: unknown): { chapterId: string } {
  if (!isRecord(payload) || typeof payload.chapterId !== "string") {
    throw new Error("Invalid payload");
  }

  return { chapterId: payload.chapterId };
}
```

原因：
- 运行时校验能拦截外部脏数据，避免类型系统“静态正确、运行时崩溃”。
- 解析边界前置后，下游逻辑可直接依赖稳定类型，减少 defensive code。
