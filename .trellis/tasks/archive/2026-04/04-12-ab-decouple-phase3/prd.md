# Phase 3: 两遍式独立实现 — TwoPassPipeline

## Goal

将 `runAnalysisJob.ts` 中内联的 Pass 1 + Pass 2 代码块（约 120 行）以及 `GlobalEntityResolver` 迁移到 `TwoPassPipeline` 类。

## 前置依赖

- Phase 1 已完成：`pipelines/types.ts` 和 `factory.ts` 已存在

## Requirements

### R1: 迁移 Pass 1 + Pass 2 逻辑

从 `runAnalysisJob.ts:605-720` 提取：
- Pass 1 并行提取 worker（pass1Worker）
- Pass 2 全局消歧调用
- 预加载别名查找表与词表配置

### R2: 移动 GlobalEntityResolver

- 将 `services/GlobalEntityResolver.ts` 移动到 `pipelines/twopass/GlobalEntityResolver.ts`
- 同时移动 `services/GlobalEntityResolver.test.ts`
- 更新所有 import 路径
- 此服务**仅两遍式架构使用**，归属 twopass 目录合理

### R3: TwoPassPipeline.run() 完整流程

```
Pass 1 → Pass 2 → Pass 3（复用 analyzeChapter with externalPersonaMap）
```

Pass 3 中每章调用 `analyzeChapter(chapterId, { externalPersonaMap, preloadedLexiconConfig })`，
走 `useExternalMap = true` 路径。

### R4: 测试恢复

- 将 `runAnalysisJob.test.ts` 中 3 个 `it.skip` 测试迁移到 `TwoPassPipeline.test.ts`
- 移除 `it.skip`，正常运行
- 新增测试：Pass 1 失败容错、Pass 2 空结果处理

## 涉及文件

- `pipelines/twopass/TwoPassPipeline.ts` — 新建
- `pipelines/twopass/TwoPassPipeline.test.ts` — 新建
- `pipelines/twopass/GlobalEntityResolver.ts` — 移动自 services/
- `pipelines/twopass/GlobalEntityResolver.test.ts` — 移动自 services/
- `pipelines/factory.ts` — 注册 twopass
- `jobs/runAnalysisJob.ts` — 移除内联 Pass 1/2 代码块
- `jobs/runAnalysisJob.test.ts` — 移除 it.skip 测试
