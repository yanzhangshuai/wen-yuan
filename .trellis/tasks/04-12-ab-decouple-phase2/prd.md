# Phase 2: 顺序解析独立实现 — SequentialPipeline

## Goal

将 `runAnalysisJob.ts` 中"Legacy 章节详细分析"循环逻辑（约 120 行）提取到 `SequentialPipeline` 类，实现 `AnalysisPipeline` 接口。

## 前置依赖

- Phase 1 已完成：`pipelines/types.ts` 和 `factory.ts` 已存在

## Requirements

### R1: 提取 workerLoop 到 SequentialPipeline

从 `runAnalysisJob.ts` 的 Pass 3 / Legacy 部分提取以下逻辑：
- `workerLoop()` 函数（章节并发处理循环）
- `scheduleIncrementalTitleResolution()` 增量称号溯源调度
- 风险门控 `CHAPTER_VALIDATION` 机制
- 进度更新回调

### R2: 行为完全一致

- SequentialPipeline.run() 的行为必须与当前 `enableTwoPassArchitecture: false` 路径完全一致
- 相同输入 → 相同 DB 写入 → 相同人物/提及/关系结果
- 写对比测试验证

### R3: runAnalysisJob 瘦身

- 移除 workerLoop 内联代码（约 80-120 行）
- 替换为：
  ```typescript
  const pipeline = createPipeline("sequential", deps);
  await pipeline.run(params);
  ```
- 保留全书收尾逻辑（demoteOrphanPersonas, resolvePersonaTitles, grayZone, bookValidation）

### R4: 不引入 externalPersonaMap

- SequentialPipeline 内部调用 `analyzeChapter(chapterId, { jobId })` 时不传 `externalPersonaMap`
- 确保走 discoverRosterWithProtection 路径（原始模式）

## 测试要求

- 现有 runAnalysisJob.test.ts 中**非 it.skip** 的测试全部通过
- 新增 `SequentialPipeline.test.ts` 至少验证：
  - 正常多章节顺序执行
  - 取消检查中断
  - 失败章节重试
  - 进度回调正确性

## 涉及文件

- `pipelines/sequential/SequentialPipeline.ts` — 新建
- `pipelines/sequential/SequentialPipeline.test.ts` — 新建
- `jobs/runAnalysisJob.ts` — 瘦身
- `jobs/runAnalysisJob.test.ts` — 调整
- `pipelines/factory.ts` — 注册 sequential
