---
stage: growth
---

# 日志规范

> [SYNC-NOTE]
> 角色：事实基准（供 agents 使用）
> 主文档：.trellis/spec/backend/logging-guidelines.md
> 镜像文档：.trellis/spec/backend/logging-guidelines.zh.md
> 最近同步：2026-03-03
> 同步负责人：codex


## 当前模式

长时运行的分析服务记录结构化事件，并使用稳定事件名。

## 必须遵循的模式

- 使用可被机器检索的事件 ID（例如 `analysis.start`）。
- 在 payload 中包含主键 ID（`chapterId`、`bookId` 等）。
- 当 AI 输出被丢弃时，记录 hallucination/filter 决策。

## 现有参考

- `src/server/modules/analysis/services/ChapterAnalysisService.ts`

## 反模式

- 没有标识符的自由文本日志。
- 直接记录敏感 payload。

---

## 代码案例与原因

反例：
```ts
console.log("分析失败", error);
```

正例：
```ts
console.error("analysis.failed", {
  chapterId,
  requestId,
  code: "ANALYZE_CHAPTER_FAILED",
  message: error instanceof Error ? error.message : "unknown",
});
```

原因：
- 结构化日志可被机器检索与聚合，便于跨服务排查。
- 明确主键与错误码后，可快速定位单次请求与业务失败类型。
