# 分析管线架构规范

> 文渊书籍 AI 分析流水线的架构边界与调用约定。

---

## 架构概览

```
API Route
  └─ runAnalysisJob (jobs/)
       ├─ createPipeline(architecture)   ← factory.ts 选择架构
       │    ├─ sequential/SequentialPipeline  — 逐章顺序分析
       │    └─ twopass/TwoPassPipeline        — 两遍式 + 全局消解
       │
       └─ pipeline.run(PipelineRunParams)
            ├─ ChapterAnalysisService         — 单章 AI 调用
            ├─ PersonaResolver                — 章内实体消歧
            ├─ PostAnalysisMerger             — 全局合并
            └─ Neo4j Sync                     — 写图谱
```

两种架构共享同一接口（`AnalysisPipeline`），通过工厂函数 `createPipeline(architecture)` 选择。

---

## 管线接口契约

```ts
// src/server/modules/analysis/pipelines/types.ts
interface AnalysisPipeline {
  architecture: AnalysisArchitecture;
  run(params: PipelineRunParams): Promise<AnalysisPipelineResult>;
}

interface PipelineRunParams {
  jobId     : string;
  bookId    : string;
  chapters  : PipelineChapterTask[];     // { id, no }
  isCanceled: () => Promise<boolean>;    // 轮询取消标志
  onProgress: (update) => Promise<void>; // 写回进度到 DB
}
```

**约定**：
- `pipeline.run` 不直接写数据库（除通过 `onProgress` 回调）；写 Persona/Relationship/Biography 由内部 service 完成
- `isCanceled` 由 jobs 层注入，每章开始前轮询；检测到取消则 pipeline 抛出 `CanceledError`
- `onProgress` 由 jobs 层注入，负责把进度持久化到 `analysis_job` 表

---

## Sequential（顺序）架构

**适用**：稳定书籍、短篇文本、调试场景

**流程**：
```
for each chapter (sequential):
  1. 用当前 bookPersonaCache（已知人物列表）作为上下文
  2. ChapterAnalysisService.analyze(chapter, context)
  3. PersonaResolver.resolve(rawPersonas, bookCache)
  4. 写回 Persona + Relationship + Biography
  5. 更新 bookPersonaCache（新发现实体追加入库）
```

**关键特性**：
- 每章用前序章节积累的实体上下文，LLM 在有约束的条件下做提取和归并
- `BookPersonaCache` 是章间状态容器，不跨书共享
- 顺序执行，并发数 = 1；适合追求准确性优先于速度

---

## TwoPass（两遍）架构

**适用**：长篇书籍、需要全局实体消歧场景

**流程**：
```
Pass 1（提取）：
  for each chapter（可并发，CONFIG 控制 concurrency）:
    ChapterAnalysisService.analyze(chapter, NO_CONTEXT)
    → 输出 rawPersonas（未消歧）

Pass 2（全局消解）：
  GlobalEntityResolver.resolve(allRawPersonas)
  → 合并跨章同名实体，产出 globalPersonaMap

Pass 3（写回）：
  for each chapter:
    PostAnalysisMerger.merge(chapterRaw, globalPersonaMap)
    写 Persona + Relationship + Biography + Neo4j
```

**关键约束**：
- Pass 1 **不传已知 profiles 上下文**，LLM 无约束提取。因此实体量会大于 sequential 模式
- Pass 2 的 `GlobalEntityResolver` 用编辑距离 + 同姓别名规则合并，有信息损失风险
- 对中文古典文学（多种称谓，无共同字符）效果弱于 sequential；见 `cross-layer-thinking-guide.md` 错误 6

---

## 阈值配置

所有调优参数集中在 `src/server/modules/analysis/config/pipeline.ts`，**不允许散落在各管线实现中**：

| 参数 | 说明 |
|------|------|
| `TWOPASS_CONCURRENCY` | Pass 1 并发章节数 |
| `PERSONA_CONFIDENCE_THRESHOLD` | 低于该置信度的实体不入库 |
| `ALIAS_EDIT_DISTANCE_MAX` | 编辑距离阈值，用于 Pass 2 规则合并 |
| `CHUNK_SIZE` | 章节分片大小（超长章节分段送 AI） |

---

## 禁止模式

| 禁止 | 原因 |
|------|------|
| 在 `pipeline.run` 内直接调用 `prisma.xxx` | jobs 层掌握 DB 写回时机，pipeline 只负责编排 |
| 在 Pass 1 中传入已有 profiles 上下文（twopass） | 破坏两遍设计——Pass 1 必须无约束提取以覆盖全量实体 |
| 在 sequential 中跳过 `bookPersonaCache` 更新 | 后续章节失去上下文，导致实体重复提取 |
| 在 config 以外硬编码阈值数字 | 阈值是业务参数，必须集中管理以便调优 |
| 两种架构共享同一 `PersonaResolver` 实例 | 实例内有章间状态，并发 twopass 会导致状态污染 |

---

## 测试约定

- 测试 `factory.ts`：验证 `createPipeline` 按 architecture 返回正确实例
- 测试各 service（`ChapterAnalysisService`、`PersonaResolver` 等）：单独 mock AI Client 和 Prisma
- **不**为整个管线端到端写单元测试（属于集成测试范畴，当前不在 CI 范围内）
