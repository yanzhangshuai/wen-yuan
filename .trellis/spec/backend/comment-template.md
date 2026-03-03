# Comment Template

> [SYNC-NOTE]
> Role: Source of truth (for agents)
> Canonical: .trellis/spec/backend/comment-template.md
> Mirror: .trellis/spec/backend/comment-template.zh.md
> Last synced: 2026-03-03
> Sync owner: codex


## Scope

Use Chinese JSDoc template for exported backend/service declarations and complex
private methods.

## Standard Template

```ts
/**
 * 功能：一句话说明做什么。
 * 输入：参数名与关键约束。
 * 输出：返回值与结构。
 * 异常：会抛出的错误或失败条件。
 * 副作用：数据库写入、网络请求、日志输出等。
 */
```

## Existing References

- `src/server/http/api-response.ts`
- `src/server/actions/analysis.ts`
- `src/server/modules/analysis/services/ChapterAnalysisService.ts`

## Rules

- Keep field order fixed: 功能 -> 输入 -> 输出 -> 异常 -> 副作用.
- If no exception/side effect exists, explicitly write `无`.
- Avoid noisy comments for obvious one-liners.
- For high-complexity logic, comments must cover business intent, key
  constraints, error/edge-case behavior, and side effects in enough detail for
  another engineer to reproduce/debug quickly.
