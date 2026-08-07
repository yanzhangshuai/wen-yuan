# 技术设计：v5 管线生命周期与集成

> 文档基线：`docs/architecture/13-agent-architecture-v5.md` §2.2/§2.3
> 调研依据：`research/pipeline-orchestration.md`（各 Pass 接口 + 编排顺序 + 5 个自建能力）

## 0. 设计原则

- **管线薄 + 组件厚**：所有 Pass 逻辑已在 identity/extraction/review/skills 域实现，runAnalysisJob 只做**确定性编排**（串组件 + 数据准备 + 落库 + 终态）。
- **时序硬约束**：reconcile 必须先于 Pass3 聚合和 Pass4 自动接受（登记表 HIGH 依赖）。
- **facts 唯一写入口**：管线是 facts/mentions/aliases 的唯一写入方（extractSlice 只返回不落库）。

## 1. runAnalysisJob 模块结构

新建 `src/server/modules/analysis/jobs/runAnalysisJob.ts`：

```
createAnalysisJobRunner(prismaClient = prisma)
├── runAnalysisJobById(jobId): Promise<void>   ← route 直接 import（route.test 锁定签名）
├── runNextAnalysisJob(): Promise<string|null> ← 可选，恢复 RUNNING/FIFO 消费 QUEUED
├── 生命周期辅助
│   ├── claimQueuedJob      — updateMany QUEUED→RUNNING 乐观抢占（updated.count===1 才算抢到）
│   ├── isJobCanceled       — 读 status===CANCELED（轮询回调，非新字段）
│   ├── loadChaptersForJob  — 按 scope 选目标章节（FULL_BOOK/CHAPTER_RANGE/CHAPTER_LIST）
│   └── writeTerminalState  — 终态事务（job SUCCEEDED/FAILED + book COMPLETED/ERROR）
├── Pass 步骤（私有函数）
│   ├── runPass0     — runTier1 → runTier2（+候选级冲突扫描）
│   ├── runPass1     — extractSlice + 落库（facts/mentions/aliases/audit）+ 并发控制
│   ├── runReconcile — runReconcile + 全量 scanMisattribution
│   ├── runPass3     — mergeAliasGroups + refreshRelationshipsForBook + Neo4j 同步
│   ├── runPass4     — acceptFactsForJob（自动接受栈）
│   └── runPass5     — markOrphan + skillGenerator + 终态
└── 数据准备
    ├── buildBookSummary    — 全书摘要（管线新建，无现成函数）
    ├── buildEntityIdByName — getRegistry 构造（canonical→entityId）
    └── relationshipTypeCodes — relationshipCodesFromSnapshot(job.relationshipTypesSnapshot)
```

## 2. 编排顺序（硬时序）

```
claim(QUEUED→RUNNING) → 重置章节 parseStatus=PENDING → book.status=PROCESSING
  → selectSkillsForJob({bookId,jobId})    ← 任务启动快照（skills + relationshipTypes）
  → resolveSkillsForJob(jobId)            ← 从快照装载（skills 全文 + deicticJunk）
  → buildSlices(目标章节)                  ← 5-8 章/片，超长章拆段
  → runPass0: runTier1 → runTier2         ← 全书一遍草稿登记表 + 原语兜底
  → runPass1: 每片 extractSlice + 落库     ← 内部已跑 runGuardrails（Pass2 护栏）
  → runReconcile                          ← Pass1 后 Pass3 前（扫 mentions 漏网高频）
  → runPass3: mergeAliasGroups + refresh + Neo4j 同步
  → runPass4: acceptFactsForJob           ← 自动接受栈（五条件）
  → runPass5: markOrphan + skillGenerator + 终态
  → job SUCCEEDED + book COMPLETED（失败 → FAILED + ERROR）
```

## 3. 5 个管线自建能力（编排空白）

### 3.1 facts 落库（最大缺口）

extractSlice 返回 `PersistableFact[]`，管线实现写入：
- `fact`（DRAFT + recordSource=DRAFT_AI + evidence/chapterNo/typeCode/eventCategory/payload）
- `mention`（实体提及）
- `alias`（别名注册）
- `agent_write_audits`（写审计留痕）
- **entityId 解析**：PersistableFact 的 `sourceName/targetName` 字符串 → `buildEntityIdByName`（getRegistry 构造）解析为 entityId

### 3.2 bookSummary 生成

`buildBookSummary(book)`：全书 1-2K 摘要。用书 description + 章节内容首尾截取（确定性，零 LLM 或一次 LLM 可选）。Tier2/reconcile/extractSlice 都消费。

### 3.3 Neo4j 同步

`syncNeo4jBookGraph` 是 findPersonaPath.ts 私有函数（未导出）。管线：
- 抽取/导出为 graph 域公共函数，或管线内联（节点 MERGE + `[r:RELATES {bookId}]` 边全删重建）
- 数据来源 = `refreshRelationshipsForBook` 返回值 + entityProfiles

### 3.4 markOrphan

全库不存在（v4 markOrphanPersonas 已删）。管线新建：
- mention 数 < 2 的实体 → confidence 降级（0.4）
- FULL_BOOK scope 才触发（门控）

### 3.5 自动接受栈条件④接入

autoAccept.ts 的 `passesConflictScan` 当前占位恒 true。管线把 `scanMisattribution` 结果接入（或改造 autoAccept 接收 conflictScan 结果）。

## 4. 并发 / 重试 / 取消

- **并发**：分片提取 `Promise.all` + 简单限流（max 3 并发），无现成 util，管线内联
- **章节重试 2 次**：失败章节标记后重跑（AnalysisJob.attempt 递增）
- **取消**：`isJobCanceled` 轮询 status===CANCELED（非新字段），每 Pass 前检查

## 5. scope 支持

三类 scope 差异**仅在选章**（loadChaptersForJob 按 no 过滤）：
- FULL_BOOK → 全部章（启动已清空 relationships）
- CHAPTER_RANGE → no ∈ [chapterStart, chapterEnd]
- CHAPTER_LIST → no ∈ chapterIndices
markOrphan 仅 FULL_BOOK 触发。

## 6. 端到端 + eval gate

- 端到端：上传→拆分→分析→图谱→审核（既有页面，接线 runAnalysisJob 后贯通）
- **eval gate**：`node scripts/eval/run-eval.ts` 需管线产出提取结果（scripts/eval/results/）→ entityF1≥0.74 / relationF1≥0.68

## 7. 关键边界

| 场景 | 处理 |
|---|---|
| job 创建后未抢到 claim | 乐观并发，其他 runner 已处理则返回 |
| 中途取消 | 每 Pass 前查 isJobCanceled，CANCELED 提前返回（不覆盖取消） |
| 分片某片失败 | 章节重试 2 次（attempt 递增），仍失败 → job FAILED |
| overrideStrategy/keepHistory | 当前无消费方，管线不实现（标注后续） |
| prescan | Tier1 可选槽，管线空跑（不实现独立 prescan） |

## 8. 风险与对策

- **facts 落库是最大实现空白**：逐类型（BIOGRAPHY/RELATION/ITEM_TRANSFER）映射 PersistableFact → Prisma 写入，entityId 解析是关键。
- **eval gate 达标不确定**：管线跑通后 F1 可能不达标，goldset 校准 + 阈值调整（棘轮法）。
- **Neo4j 抽取**：findPersonaPath 私有函数复用，需保 findPersonaPath 惰性行为不变。
- **行覆盖 ≥90%**：runAnalysisJob 是高覆盖主战场。
