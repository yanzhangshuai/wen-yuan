# Phase 5: 废弃清理与测试迁移

## Goal

移除所有临时开关、废弃标记和内联残留代码，确保代码库干净。

## 前置依赖

- Phase 4 完成：架构选择器已可用，两种 Pipeline 均通过 factory 路由

## Requirements

### R1: 移除 enableTwoPassArchitecture 配置

- 从 `ANALYSIS_PIPELINE_CONFIG` 中删除 `enableTwoPassArchitecture` 字段
- 移除所有引用此字段的代码

### R2: 清理 @deprecated 标记

- `src/types/pipeline.ts:13-15`：移除 ROSTER_DISCOVERY 上的 `@deprecated` 注释
- 改写为正常注释：说明此阶段用于"顺序解析架构"的角色发现

### R3: 移除 runAnalysisJob 中的内联两遍代码

- 确认 runAnalysisJob.ts 中不再有 Pass 1 / Pass 2 内联代码
- 确认 `useTwoPass` 变量已不存在
- 确认 `externalPersonaMap` 不在 runAnalysisJob 中直接声明

### R4: 测试清理

- 确认 `runAnalysisJob.test.ts` 中无 `it.skip`
- 两遍式测试已在 `TwoPassPipeline.test.ts` 中正常运行
- 运行全套测试确认绿灯

### R5: 文档更新

- 更新 cross-layer-thinking-guide.md，标注 A/B 架构已解耦
- 更新 pipeline.ts 文件头注释，说明架构选择逻辑改为由 Pipeline 工厂管理

## 涉及文件

- `src/server/modules/analysis/config/pipeline.ts` — 移除字段
- `src/types/pipeline.ts` — 清理注释
- `src/server/modules/analysis/jobs/runAnalysisJob.ts` — 确认干净
- `src/server/modules/analysis/jobs/runAnalysisJob.test.ts` — 确认无 skip
- `.trellis/spec/guides/cross-layer-thinking-guide.md` — 更新
