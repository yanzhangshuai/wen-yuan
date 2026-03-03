# Logging Guidelines

> [同步说明]
> 角色：中文镜像（供人阅读）
> 主文档：.trellis/spec/backend/logging-guidelines.md
> 镜像文档：.trellis/spec/backend/logging-guidelines.zh.md
> 最后同步：2026-03-03
> 同步人：codex


> [SYNC-NOTE]
> Role: Source of truth (for agents)
> Canonical: .trellis/spec/backend/logging-guidelines.md
> Mirror: .trellis/spec/backend/logging-guidelines.zh.md
> Last synced: 2026-03-03
> Sync owner: codex


## 当前模式

长时运行的分析服务会记录结构化事件，并使用稳定的事件名。

## 必须遵循的模式

- 使用可被机器检索的事件 ID（例如 `analysis.start`）。
- 在 payload 中包含主键 ID（`chapterId`、`bookId` 等）。
- 当 AI 输出被丢弃时，记录 hallucination/filter 的决策原因。

## 现有参考

- `src/server/modules/analysis/services/ChapterAnalysisService.ts`

## 反模式

- 没有标识符的自由文本日志。
- 直接记录敏感 payload。
