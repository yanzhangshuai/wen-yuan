# Research: v5-pipeline 管线编排接口清单

- **Query**: 摸清 v5 各 Pass 组件（identity/extraction/review/skills/graph）调用接口 + 编排依赖，供主任务写 runAnalysisJob
- **Scope**: internal（纯代码勘探，只读）
- **Date**: 2026-08-07

> 结论先行：所有 Pass 组件已就绪且有清晰输入契约，但**编排缺口集中在 5 处**——① `runAnalysisJob` 模块不存在（唯一 tsc 残留）；② extractSlice 只返回不落库，facts/mentions/aliases 写入需管线实现；③ `bookSummary`（全书摘要）无任何生成函数，需管线自建；④ Neo4j 同步函数 `syncNeo4jBookGraph` 是 findPersonaPath.ts 的私有函数（未导出），管线需自行实现/导出；⑤ `markOrphan` 全库不存在（v4 有 `markOrphanPersonas`，v5 已删）。

---

## 1. 各 Pass 组件调用接口表

### Pass0 身份解析（identity 域，`src/server/modules/identity/`）

| 函数 | 位置 | input | output | 依赖 |
|---|---|---|---|---|
| `runTier1(input, modelId)` | tier1.ts:59 | `Tier1Input{ bookId, jobId, fullText, bookSizeTokens, prescanCandidates? }` (tier1.ts:24) | `{ created, updated }`（writeRegistry 返回值） | `pickTier1Path`（读 `scripts/eval/ab-calibration.json` A/B 校准表，缺省 `single_pass`，tier1.ts:33-43）；`callIdentityLlm` stage=`ROSTER_DISCOVERY`；末尾 `writeRegistry({source:"tier1"})` |
| `runTier2(input, registry)` | tier2.ts:42 | `Tier2Input{ bookId, jobId, bookSummary, skills, candidates: Tier2Candidate[] }` (tier2.ts:22)；`Tier2Candidate{ surfaceForm, windows: MentionWindow[] }` | `Tier2Result{ resolved, newEntities, ambiguous }` (tier2.ts:30) | `runPrimitive`（原语，stage=`TITLE_RESOLUTION`）；`collectResidualCandidates(registry)` 产出候选（tier2.ts:91：LOW 或 MEDIUM+TITLE_ONLY）；`writeRegistry({source:"tier2"})` |
| `runReconcile(input, registry)` | reconcile.ts:73 | `ReconcileInput{ bookId, jobId, bookSummary, skills, minMentions? }` (reconcile.ts:19) | `ReconcileResult{ scanned, resolved, newEntities, ambiguous }` | `runPrimitive`；内部查 `prisma.mention` groupBy rawText 扫漏网高频（reconcile.ts:43-48）；`writeRegistry({source:"reconcile"})` |
| `getRegistry(bookId, txClient?)` | registry.ts:57 | bookId（+可选事务客户端） | `BookRegistry{ bookId, entries: RegistryEntry[], loadedAt }` | 书级内存缓存（registry.ts:43），`identityService` 写后 `invalidateRegistryCache` 失效 |
| `writeRegistry(input)` | identityService.ts:37 | `RegistryWriteRequest{ bookId, source, agentRunId, entries: RegistryWriteEntry[] }` | `{ created, updated }` | 单事务写 entities + aliases + entity_profiles + agent_write_audits；`WriteSource = "tier1" \| "tier2" \| "reconcile" \| "cross_validation"`（identityService.ts:14） |
| `scanMisattribution(bookId, aliasesMap, entities, txClient?)` | conflictScan.ts:37 | aliasesMap `{别名→实体ID}` + 登记表实体 | `MisattributionFlag[]` | 按章分布判误归属（D11）；`scanCandidateMisattribution`（conflictScan.ts:91）供 Tier2 候选级复用；同一代码跑两遍：Tier2 候选级 + Pass3 全量终扫（conflictScan.ts:6-10） |

**调用依赖**：
- Tier1 **不硬依赖 prescan**。`prescanCandidates` 为可选（tier1.ts:29），有则合并进草稿表（tier1.ts:101-106）。管线可空跑。
- Tier1 → Tier2 顺序：Tier2 的 `collectResidualCandidates` 读 registry，**必须先跑 Tier1 写登记表**。
- reconcile 时序：**Pass1 之后、Pass3 之前**（reconcile.ts:8 注释明示；arch doc §2.3 "回写登记表必须先于 Pass3 聚合与 Pass4 自动接受"）。原因：reconcile 扫 `prisma.mention`（Pass1 提取才写 mentions），且 Pass3 聚合按登记表分组、Pass4 自动接受读登记表 HIGH。

### Pass1 事实提取（extraction 域）

| 函数 | 位置 | input | output | 依赖 |
|---|---|---|---|---|
| `extractSlice(input)` | extractor.ts:70 | `ExtractSliceInput{ bookId, jobId, sliceText, chapterNos, registry, bookSummary, skills, relationshipTypeCodes, deicticJunk?, entityIdByName? }` (extractor.ts:18-34) | `ExtractSliceResult{ slice, facts: PersistableFact[], dropRecords }` (extractor.ts:36-40) | `callIdentityLlm` stage=`INDEPENDENT_EXTRACTION`；内部**直接调用** `runGuardrails`（extractor.ts:96-101，护栏在 extractSlice 内部，非管线另调） |
| `buildSlices(chapters, bookId, sliceSize=6)` | slices.ts:31 | 已按 no 排序的 `ChapterRef{id,no,title,content}[]` | `Slice{ bookId, chapters, chapterNos }[]` | `DEFAULT_SLICE_SIZE=6`、`DEFAULT_MAX_CHAPTER_CHARS=12000`（slices.ts:22-23）；超长章 `splitOversizedChapter`（slices.ts:55，段≤3） |
| `refreshRelationshipsForBook(bookId, txClient?)` | aggregator.ts:37 | bookId（+可选事务） | `RebuiltRelationship[]` | 幂等重建 relationships（全删重建，RELATION 事实 GROUP BY）；注释明示 "Neo4j 惰性同步由管线层调用"（aggregator.ts:14） |
| `runGuardrails(slice, sliceText, validCodes, junkList?)` | guardrails.ts:60 | 提取片 + 正文 + 有效关系码集合 + 虚指名单 | `{ facts, dropRecords }` | **零 LLM**；在 extractSlice 内部被调用 |

**关键缺口**：`extractSlice` **只返回、不落库**。extraction 域内 grep 无任何 `prisma.fact/mention/alias.create`。facts(DRAFT) + mentions + aliases + agent_write_audits 的写入逻辑**须由管线实现**（extractor.ts:6 头注释声明的"落库"职责当前无人承担）。落库时需用 `entityIdByName`（canonical→entityId，可从 `getRegistry` 构造）把 PersistableFact 的 `sourceName/targetName` 字符串解析为 entityId。

### Pass2 确定性护栏
已在 Pass1 内（`runGuardrails` 由 `extractSlice` 内部调用，extractor.ts:96）。管线不需要单独调护栏。

### Pass4 审核（review 域，`src/server/modules/review/`）

| 函数 | 位置 | input | output | 依赖 |
|---|---|---|---|---|
| `acceptFactsForJob(jobId, prismaClient?)` | autoAccept.ts:82 | jobId | `AcceptResult{ accepted, rejected, rejectReasons }` | 读 AnalysisJob.relationshipTypesSnapshot → validCodes；查 jobId+DRAFT facts；五条件判定（证据锚定/登记表HIGH/提及≥2/冲突扫描/契约校验）。**注意**：条件④ `passesConflictScan` 当前为**占位恒 true**（autoAccept.ts:183-191，注释"管线接入时替换为真实 conflictScan 结果"）——管线需接入真实冲突扫描 |
| `listReviewQueue(filters)` | reviewQueue.ts:42 | `{ bookId, type?, page?, pageSize? }` | `ReviewQueueItem[]` | 只读查询，**非管线步骤**（人审界面消费） |
| `crossModelReview(input)` | crossModel.ts:43 | `CrossModelReviewInput{ surfaceForm, windows, registry, bookSummary, skills, jobId, modelId }` | `{ verdict, highConfidence, resolvedEntityId, modelId }` | 复用 `runPrimitive` + 显式 modelId 换模型（AiCallExecutor 的 `modelSource=CROSS_MODEL`） |
| `calibrateAutoAccept(samples)` / `sampleRatchetSize(total)` | ratchet.ts:36/54 | 抽样回查结果 | `RatchetResult` / 抽样数 | 棘轮校准，纯函数 |
| `sampleRelationHallucination(bookId, max=20)` | hallucinationSample.ts:27 | bookId | `HallucinationSample[]` | 证据单薄 RELATION 事实抽样，进跨模型/人审 |
| `mergeEntitiesInTransaction(client, {sourceId, targetId})` | mergeEntities.ts:24 | 事务客户端 + 合并对 | void | 人审接受合并路径（L3），内部调 `refreshRelationshipsForBook(bookId, tx)` |

**审核位置**：按 arch doc §2.2，Pass4 自动接受栈在 Pass3 聚合之后（DRAFT 事实 → 五条件 → VERIFIED）。管线内只触发 `acceptFactsForJob(jobId)`；人审队列 / 棘轮 / 跨模型是人审界面或定向抽样路径，非主流程阻塞步骤。

### Skill 装载

| 函数 | 位置 | input | output | 依赖 |
|---|---|---|---|---|
| `skillSelector.selectSkillsForJob({bookId, jobId})` | skillSelector.ts:439 | `SkillSelectionInput{ bookId, jobId }` | `SkillsSnapshot`（同时写 `analysis_jobs.skillsSnapshot` + `relationshipTypesSnapshot` 两列，skillSelector.ts:450-456） | 一次 `SKILL_SELECT` LLM 调用（走 `aiCallExecutor`，skillSelector.ts:242）；zod 目录过滤；**jobId 必须真实**（写 analysis_phase_logs 外键，skillSelector.ts:20） |
| `skillSelector.selectSkills({bookId, jobId})` | skillSelector.ts:382 | 同 | `SkillSelectionResult{ selectedSlugs, selectedSkills, allLoadedSlugs, relationshipCodes, inferredType, reasons }` | 不落库，选择原语 |
| `skillLoader.resolveSkillsForJob(jobId)` | loader.ts:50 | jobId | `ResolvedSkillContext{ skills: SkillDocument[], summary, deicticJunk: string[], loadedAt }` (loader.ts:33-41) | 从 `job.skillsSnapshot.allLoadedSlugs` 装载（GLOBAL ∪ 快照）；`deicticJunk` 从装载 GLOBAL skill 契约并集 |
| `skillGenerator.generateSkillFromSignals(signals)` | skillGenerator.ts:98 | `SkillGenerationSignals{ bookId, frequentTitles?, unknownRelationshipCodes?, newNamePatterns? }` | `GenerateSkillResult{ skillId, slug, status:"DRAFT" }` | **架构标注"规划中，未接线"**（arch doc §5 末段，无任何 admin API / 管线调用）；要求至少一类信号，否则抛错 |

### 关系码契约（Pass1 输入来源）
- `relationshipCodesFromSnapshot(snapshot)` — schema.ts:77：从 `AnalysisJob.relationshipTypesSnapshot` 恢复 `RelationshipCodeInfo[]`。
- `getRelationshipCodesFromSkills(skills)` — schema.ts:29：skill frontmatter relationshipCodes 并集（skillSelector 装载时算）。
- `buildExtractionSchema(relationshipCodes)` — schema.ts:67：生成 schema（factTypes/relationshipTypeCodes/eventCategories/payloadShapes）。

---

## 2. runAnalysisJob 编排顺序草案（Pass0→1→3→4→5）

依据 arch doc §2.2 管线图 + §2.3 双 tier 时序 + PRD：

```
claim（QUEUED→RUNNING，乐观并发 updateMany）
  └─ 重置目标章节 chapter.parseStatus = "PENDING"
  └─ 初始化 book.status = "PROCESSING"（parseProgress 列已删，进度由 AnalysisJob 状态推导）
  └─ selectSkillsForJob({bookId, jobId})          ← 任务启动快照（skillsSnapshot + relationshipTypesSnapshot）
  └─ resolveSkillsForJob(jobId)                   ← 从快照装载（skills 全文 + deicticJunk）
  └─ buildSlices(目标章节)                         ← 5-8 章/片，超长章拆段
Pass0 身份解析
  ├─ runTier1({bookId, jobId, fullText, bookSizeTokens, prescanCandidates?}, modelId)   ← 全书一遍草稿登记表
  └─ runTier2({bookId, jobId, bookSummary, skills, candidates: collectResidualCandidates(registry)}, registry)
     └─ 候选级冲突扫描 scanCandidateMisattribution（可选）
Pass1 分片提取
  └─ 每片 extractSlice({bookId, jobId, sliceText, chapterNos, registry, bookSummary,
                       skills, relationshipTypeCodes, deicticJunk, entityIdByName})
     └─ 内部已跑 runGuardrails（Pass2 护栏）
  └─ [管线实现] facts(DRAFT) + mentions + aliases + agent_write_audits 落库（当前无此函数）
  └─ [管线实现] 分片并发控制（见 §5）
reconcile（Pass1 与 Pass3 之间，必需）   ← arch doc §2.3 / reconcile.ts:8
  └─ runReconcile({bookId, jobId, bookSummary, skills, minMentions:2}, registry)   ← 扫 mentions 漏网高频
     └─ 全量分布式冲突扫描 scanMisattribution（捕跨候选交互）
Pass3 确定性聚合
  └─ mergeAliasGroups（alias resolver，Union-Find；aliasResolver.ts:24，当前无管线调用方）
  └─ refreshRelationshipsForBook(bookId)            ← 幂等重建 relationships
  └─ Neo4j 惰性同步（管线实现，见 §6）
Pass4 例外优先审核
  └─ acceptFactsForJob(jobId)                      ← 自动接受栈（五条件；冲突扫描条件④待管线接入真实信号）
     └─ 可选：sampleRelationHallucination / crossModelReview 定向复核
Pass5 评测门禁 + 终态
  ├─ markOrphan（管线实现，v5 无此函数）
  ├─ skillGenerator.generateSkillFromSignals（候选 DRAFT，交人确认启用）
  ├─ Neo4j 同步 · refreshRelationshipsForBook 已含
  └─ 终态落库：job SUCCEEDED + book COMPLETED（失败 → job FAILED + book ERROR）
```

**要点**：
- reconcile 时序**必须先于 Pass3 聚合**（聚合分组依赖登记表）和 **Pass4 自动接受**（判定读登记表 HIGH）——这是 PRD 验收硬条件。
- `acceptFactsForJob` 读 `job.relationshipTypesSnapshot`（快照），与 `selectSkillsForJob` 启动时落库衔接。
- 失败路径：捕获 → 写 job FAILED + errorLog + finishedAt，book ERROR + errorLog（参考 v4 骨架，见 §7 旧文件片段）。

---

## 3. startBookAnalysis → runAnalysisJob 衔接（analyze route 接线）

**现状**（`src/app/api/books/[id]/analyze/route.ts`）：
- 第 39 行：`import { runAnalysisJobById } from "@/server/modules/analysis/jobs/runAnalysisJob"` ← **模块不存在，唯一 tsc 错误**（已用 `npx tsc --noEmit` 确认，仅此一条 TS2307）。
- 第 159 行：`const data = await startBookAnalysis(parsedRoute.bookId, parsedBody.data)`。
- 第 168 行：`void runAnalysisJobById(data.jobId).catch(...)` —— **fire-and-forget 异步触发**，路由先返回 202，失败只记日志不阻塞。
- 路由注释（route.ts:163-166）：`runNextAnalysisJob` 可恢复 RUNNING/QUEUED 任务（进程重启中断恢复——但 v5 中该函数**不存在**，需随 runAnalysisJob 一起实现或从 route 移除该注释）。
- `startBookAnalysis(bookId, input)`（startBookAnalysis.ts:194-298）：创建 `analysis_jobs`（status=QUEUED，含 scope/chapterStart/chapterEnd/chapterIndices/overrideStrategy/keepHistory），返回 `StartBookAnalysisResult{ jobId, ... }`；**FULL_BOOK 事务内先清空 relationships**（startBookAnalysis.ts:239-242）；同步把 book.status → PROCESSING。

**接线方案**：新建 `src/server/modules/analysis/jobs/runAnalysisJob.ts`，导出 `runAnalysisJobById(jobId)`（route 的 import 不动即可修复 tsc）。签名建议 `Promise<void>`（route.test.ts:19 mock 为 `vi.fn(async () => undefined)`，已锁定契约）。可选一并导出 `runNextAnalysisJob()` 恢复调度（v4 骨架有，route 注释也提到）。

**下游消费**：
- 进度：`getBookStatus(bookId)`（getBookStatus.ts:118）从最新 job 状态推导（QUEUED→0 / RUNNING→50 / SUCCEEDED→100，getBookStatus.ts:56-67），并映射 `chapter.parseStatus` PENDING→REVIEW_PENDING（被成功任务覆盖的章，getBookStatus.ts:147-154）。
- 任务列表：`listBookAnalysisJobs(bookId)`（listBookAnalysisJobs.ts:71）读 scope/attempt/errorLog/startedAt/finishedAt + 最新 phaseLog 的模型名。
- 成本：`getJobCostSummary(jobId)`（jobCostSummary.ts:95）聚合 analysis_phase_logs。

---

## 4. scope 支持（FULL_BOOK / CHAPTER_RANGE / CHAPTER_LIST）

**字段承载**（AnalysisJob，schema.prisma:594-624）：`scope`（String，默认 FULL_BOOK）、`chapterStart`/`chapterEnd`（Int?）、`chapterIndices`（Int[]）。**按章节 `no` 过滤**，无独立管线分支参数。

- `startBookAnalysis` 校验/标准化三类 scope（startBookAnalysis.ts:84-142），章节数校验用 `chapter.count` 按 no 过滤（startBookAnalysis.ts:218-233）。
- 管线**选择目标章节**时统一转成 `ChapterRef[]`（`chapter.findMany` where `bookId` + scope 对应 no 过滤），再 `buildSlices`。三类 scope 对管线的差异**仅在选章**：
  - FULL_BOOK → 全部章；启动时已清空 relationships。
  - CHAPTER_RANGE → `no >= chapterStart && no <= chapterEnd`。
  - CHAPTER_LIST → `no IN chapterIndices`。
- 旧 v4 行为参考：`markOrphanPersonas` 仅 FULL_BOOK 触发（v4 runAnalysisJob，非 FULL_BOOK 不做全局孤儿判断）。v5 的 markOrphan 是否按 scope 门控由主任务决定。
- `getBookStatus.isChapterCoveredBySucceededJob`（getBookStatus.ts:69-90）已按三种 scope 判断章节是否被成功任务覆盖。
- `overrideStrategy`（DRAFT_ONLY/ALL_DRAFTS）+ `keepHistory` 已落库，但**当前无消费方**（管线是否需要按策略清旧草稿属设计决策）。

---

## 5. 并发 / 重试 / 取消机制盘点

**现状盘点**：
- **并发 util：无**。analysis/identity/extraction 三域 grep `pLimit/promise.all/concurrency/Semaphore` 均为空。唯一并发控制是旧 v4 骨架（已删）。PRD "分片提取并发控制" 需主任务新增（可各片并发 `Promise.all` + 限流，或逐片顺序）。
- **重试**：`AiCallExecutor`（AiCallExecutor.ts:290-377）做**单次 AI 调用**级重试——`maxRetries` 取 `model.params.maxRetries`，指数退避 `retryBaseMs * 2^(attempt-1)`，`isRetryableError` 判定（429/rate limit/timeout/network 等），耗尽抛 `AiCallExhaustedError`。**无任务/章节级重试**：`AnalysisJob.attempt`（Int，default 1，schema.prisma:602）存在但**无代码递增**；PRD "章节重试 2 次" 需管线实现（失败章节标记后重跑）。
- **取消**：AnalysisJob **没有 `isCanceled` 字段**（schema.prisma:594-624 已全字段核对）。取消通过 `status = CANCELED`（enum，schema.prisma:54-62）。旧 v4 骨架用 `isJobCanceled(prisma, jobId)` 轮询读 status 返回 CANCELED 作为 `isCanceled` 回调传给 pipeline（v4 runAnalysisJob.ts 旧片段：`status === AnalysisJobStatus.CANCELED` 即取消）。PRD 中"job 级 isCanceled"应指这个**回调模式**，非新字段。

**建议接入模式**（忠于旧骨架）：
- claim：`analysisJob.updateMany({ where: { id, status: QUEUED }, data: { status: RUNNING, startedAt, finishedAt: null, errorLog: null } })`，`updated.count === 1` 才算抢到（乐观并发）。
- 执行中每 Pass 前查 `isJobCanceled`，CANCELED 则提前 return（不覆盖取消状态）。
- 终态写 `SUCCEEDED`（+finishedAt）或 `FAILED`（+errorLog），book 同步 COMPLETED/ERROR。

---

## 6. Pass5 集成依赖

| 项 | 现状 | 缺口 |
|---|---|---|
| Neo4j 同步 | `syncNeo4jBookGraph(neo4jDriver, bookId, personas, graphEdges)` — **findPersonaPath.ts:391-442 私有函数**，未导出。仅在 `findPersonaPath` 内**惰性触发**（findPersonaPath.ts:586-595：有 Neo4j 时先 `syncNeo4jBookGraph` 再 shortestPath，失败回退 PG BFS）。节点 MERGE + 边按 bookId 全删重建（`[r:RELATES {bookId}]`），边口径含 DRAFT+VERIFIED、排除 REJECTED（findPersonaPath.ts:26） | 管线无独立同步入口。aggregator.ts:14 注释称"Neo4j 惰性同步由管线层调用"，但该函数未导出 → **主任务需抽出/导出同步入口**（数据来源 = `getBookGraph` 同口径的 relationships + entityProfiles，或 `refreshRelationshipsForBook` 返回值） |
| markOrphan | **全库无**（`grep -rn "markOrphan" src` 为空）。v4 有 `markOrphanPersonas`（mention 数 <2 → confidence 0.4），v5 已删 | PRD Pass5 要求 → **主任务新建** |
| SkillGenerator | `skillGenerator.generateSkillFromSignals(signals)`（skillGenerator.ts:98）已实现，**未接任何运行时路径**（arch doc §5 明示）；`SKILL_GENERATION` runType 枚举已存在（schema.prisma:172） | 管线 Pass5 调用它，把信号（高频 TITLE_ONLY 称谓 / 字典外关系码 / 新名字模式）生成 DRAFT 技能包，需主任务采集信号 |
| refreshRelationshipsForBook | aggregator.ts:37，支持事务客户端，返回 `RebuiltRelationship[]` | 已就绪；任何 facts 变更后调用（arch doc §2.2 末） |
| `updateGraphLayout` | updateGraphLayout.ts:89，用户拖拽坐标保存（entityProfile.visualConfig），**非管线同步** | 无关 |
| getBookGraph | getBookGraph.ts:181 读 relationships → 图谱 DTO（DRAFT+VERIFIED，resolveNodeStatus 按 recordSource） | 消费端，无需管线改动 |

---

## 7. 建议的 runAnalysisJob 模块结构（基于旧 v4 骨架 + v5 组件）

参考已删的 `src/server/modules/analysis/jobs/runAnalysisJob.ts`（v4，960 行，commit d2c116b 删除）的骨架，v5 应显著更薄（无 pipeline 工厂 / 无章节分析器）：

```
src/server/modules/analysis/jobs/runAnalysisJob.ts
├── createAnalysisJobRunner(prismaClient = prisma)
│   ├── runAnalysisJobById(jobId): Promise<void>   ← route 直接 import（route.test.ts 已锁定签名）
│   └── runNextAnalysisJob(): Promise<string|null> ← 可选，恢复中断 RUNNING / FIFO 消费 QUEUED（route 注释提及）
├── 生命周期辅助（旧骨架对应位置）
│   ├── claimQueuedJob       — updateMany QUEUED→RUNNING 乐观抢占
│   ├── isJobCanceled        — 读 status===CANCELED
│   ├── loadChaptersForJob   — 按 scope 选目标章节（no 过滤）→ ChapterRef[]
│   └── 终态事务             — job SUCCEEDED/FAILED + book COMPLETED/ERROR
├── Pass 步骤（管线内部私有函数）
│   ├── runPass0             — runTier1 → runTier2（+候选级冲突扫描）
│   ├── runPass1Slices       — extractSlice + 落库（facts/mentions/aliases/audit，管线实现）+ 并发控制
│   ├── runReconcile         — runReconcile + 全量 scanMisattribution
│   ├── runPass3             — mergeAliasGroups + refreshRelationshipsForBook + Neo4j 同步
│   ├── runPass4             — acceptFactsForJob（+可选 hallucination/crossModel 抽样）
│   └── runPass5             — markOrphan + skillGenerator + 终态
└── 数据准备
    ├── bookSummary 生成（管线新建，无现成函数）
    ├── entityIdByName（getRegistry 构造）
    └── relationshipTypeCodes（relationshipCodesFromSnapshot(job.relationshipTypesSnapshot)）
```

**关键衔接**：
- route 只 import `runAnalysisJobById`（route.ts:39），因此模块必须导出该命名。
- `jobId` 是全部 LLM 调用（callIdentityLlm / callSkillSelectorLlm / AiCallExecutor）写 analysis_phase_logs 的外键，**必须先创建 AnalysisJob 再跑任何 LLM**。
- 各 Pass 可用 `agent_runs` 表留痕（runType = PRESCAN/IDENTITY/EXTRACTION/RECONCILE/VALIDATION/CROSS_VALIDATION/SKILL_GENERATION，schema.prisma:166-176）满足 PRD "全链路留痕"。

---

## Caveats / Not Found

- **`bookSummary`（全书摘要）无生成函数**：identity（Tier2/primitive/reconcile）与 extractSlice/crossModel 都要求传，但三域内 grep 无产出方。管线需自行生成（如书 description + 章节内容 LLM 摘要，或截取）。架构 doc §2.2 称"全书 1-2K 摘要"，实现未落地。
- **extractSlice 不落库**：facts/mentions/aliases 写入为 v5 编排最大实现空白，须管线补齐（含 entityId 解析 + agent_write_audits）。
- **`markOrphan` 不存在**：v4 有 `markOrphanPersonas`，v5 全删。
- **`syncNeo4jBookGraph` 未导出**：管线的 Neo4j 惰性同步需自行抽出（findPersonaPath.ts:391 的逻辑可参考：节点 MERGE + `[r:RELATES {bookId}]` 边全删重建）。
- **自动接受栈条件④占位**：autoAccept.ts:183-191 `passesConflictScan` 恒 true，需管线把 `scanMisattribution` 结果接进去。
- **`runNextAnalysisJob` 在 v5 不存在**：route.ts:166 注释仍引用它，与 runAnalysisJobById 一起实现或清理注释。
- **overrideStrategy/keepHistory 无消费方**：`startBookAnalysis` 落库但管线未用，是否按策略清旧草稿属设计决策。
- **prescan 管线无实现**：`prescanCandidates` 仅 tier1.ts 有输入槽，无生成它的确定性预扫描模块（PRESCAN runType 存在）。Tier1 可空跑不依赖它。

## Related Specs

- `docs/architecture/13-agent-architecture-v5.md`（397 行，v5 权威架构）— §2.2 管线 Pass0-5、§2.3 双 tier + reconcile 时序、§5 skill 系统、§6 数据模型、§7 审核、决策基线 D1-D17
- `.trellis/tasks/08-06-v5-pipeline/prd.md` — 生命周期 5 步 + 验收标准（含 reconcile 时序、isCanceled、章节重试 2 次、Neo4j+markOrphan+SkillGenerator、快照启动落库）
- `.trellis/tasks/08-06-v5-pipeline/task.json` — 父任务 `08-06-agent-arch-v5-redesign`
