# Comment Template

> [同步说明]
> 角色：中文镜像（供人阅读）
> 主文档：.trellis/spec/backend/comment-template.md
> 镜像文档：.trellis/spec/backend/comment-template.zh.md
> 最后同步：2026-03-03
> 同步人：codex


> [SYNC-NOTE]
> Role: Source of truth (for agents)
> Canonical: .trellis/spec/backend/comment-template.md
> Mirror: .trellis/spec/backend/comment-template.zh.md
> Last synced: 2026-03-03
> Sync owner: codex


## 适用范围

对导出的 backend/service 声明以及复杂的私有方法，使用中文 JSDoc 模板。

## 标准模板

```ts
/**
 * 功能：一句话说明做什么。
 * 输入：参数名与关键约束。
 * 输出：返回值与结构。
 * 异常：会抛出的错误或失败条件。
 * 副作用：数据库写入、网络请求、日志输出等。
 */
```

## 现有参考

- `src/server/http/api-response.ts`
- `src/server/actions/analysis.ts`
- `src/server/modules/analysis/services/ChapterAnalysisService.ts`

## 规则

- 字段顺序必须固定：功能 -> 输入 -> 输出 -> 异常 -> 副作用。
- 如果不存在异常或副作用，必须显式写 `无`。
- 对明显的一行逻辑避免添加噪声注释。
- 对高复杂度逻辑，注释必须覆盖业务意图、关键约束、错误/边界行为与副作用，且信息量应足够让其他工程师快速复现与排障。
