---
stage: growth
---

# 后端质量规范

> [SYNC-NOTE]
> 角色：事实基准（供 agents 使用）
> 主文档：.trellis/spec/backend/quality-guidelines.md
> 镜像文档：.trellis/spec/backend/quality-guidelines.zh.md
> 最近同步：2026-04-11
> 同步负责人：codex


## 交接前检查清单

- `pnpm lint` 通过。
- 响应契约与 `src/types/api.ts` 保持一致。
- 错误分支返回稳定、可机器识别的 `code` 值，而不仅是文本 message。
- 多表写入具备明确事务边界。
- 对外 service/action 函数包含团队 JSDoc 模板。
- 注释必须遵循 `comment-template.md` 与 `../guides/comment-guidelines.md`，确保信息完整且可复现。
- 新增或修改的后端代码、测试代码，如未按注释规范补齐，视为未完成，不得交付。
- 新增或变更的 env 契约已文档化。
- 命名简洁、可读，并与 frontend/domain 术语一致。
- 复杂业务逻辑应有足够注释，说明意图、约束、错误分支与副作用。
- 高复杂度函数应拆分为可读 helper，避免深层嵌套或超大单体函数。
- 对变更后的后端行为至少验证 1 条成功路径、1 条失败路径、1 条边界路径。
- 新增/变更业务逻辑必须补充单元测试，且测试应能定位失败原因（有效性优先）。
- 单元测试默认与源码同目录，命名使用 `*.test.ts`。
- 单元测试注释需说明场景目标；复杂用例必须标注 Arrange/Act/Assert。
- 覆盖率硬性门禁：每次执行单元测试与 coverage 校验时，必须同时满足 Statements >= 90%、Branches >= 90%、Functions >= 90%、Lines >= 90%；任一未达标即任务未完成，不得交付（高风险模块建议 >= 95%）。
- coverage 排除列表只能用于自动生成代码、测试文件、配置文件、基础设施脚本或明确不承载产品业务决策的适配层；禁止把后端业务模块、AI 编排逻辑、知识库服务、图谱服务等真实交付范围藏进全局忽略列表。
- 新增或调整 coverage 排除项时，必须同步写明排除对象、技术理由、替代验证方式与回收计划，并在同一次提交中更新 `vitest.config.ts` 注释与 Trellis 模板镜像；若排除对象包含业务逻辑，则默认视为违规。
- 测试环境中的 fallback/降级路径不得依赖“真实数据库、网络或外部服务调用失败后再兜底”来完成验证；必须显式 stub 依赖，或在 `NODE_ENV=test` 下提供稳定短路，确保单测输出可重复且无基础设施噪声。
- 若当前模块尚无单测基础设施，先补齐最小可用测试框架与 coverage 报告。

## 评审重点

- 跨层类型漂移（action -> service -> DB）。
- 错误路径一致性（`code/message/error/meta`）。
- AI/外部集成的重试与失败行为。
- 命名清晰度与跨层术语一致性。
- 非平凡分支与事务流程的注释质量。
- 函数复杂度与可读性（长度、嵌套、helper 抽取）。
- 注释是否完整覆盖业务意图、输入约束、异常策略与副作用。
- 测试是否覆盖关键分支并对错误码/契约有明确断言。
- 测试注释是否足够支持复现与排障。
- 覆盖率证据是否可复核，且四项门禁（Statements/Branches/Functions/Lines）是否全部 >= 90%。
- coverage 排除项是否严格限定在非业务代码边界，没有把真实交付模块移出全局门禁。
- `vitest.config.ts` 中的 coverage 配置是否与规范一致，没有出现“文档写 90%，配置靠忽略业务模块过线”的策略漂移。
- fallback/降级路径在测试中是否完全隔离真实 DB、AI、网络等运行时依赖。

---

## 代码案例与原因

反例：
```ts
export async function analyze(chapterId: string) {
  const result = await chapterAnalysisService.analyzeChapter(chapterId);
  return { ok: true, result };
}
```

正例：
```ts
export async function analyze(chapterId: string) {
  if (!chapterId) {
    return {
      success: false as const,
      code: "MISSING_CHAPTER_ID",
      message: "缺少必填字段 chapterId",
    };
  }

  const result = await chapterAnalysisService.analyzeChapter(chapterId);
  return {
    success: true as const,
    code: "ANALYZE_CHAPTER_OK",
    message: "章节分析成功",
    data: result,
  };
}
```

原因：
- 统一 success/error 分支结构可减少调用侧分支复杂度。
- 显式错误码比临时文本更稳定，便于监控、告警与回归验证。
