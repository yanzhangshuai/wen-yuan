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

## 审核中心数据契约（legacy 分析 vs claim-first 审核）

### 1. Scope / Trigger

- Trigger: 排查 `/admin/review/:bookId` 左侧角色列表或矩阵为空时，必须区分“书籍已有 legacy 人物产物”和“审核中心可消费的 claim/projection 产物”。
- 审核中心（T12/T13 claim-first UI）不直接读取 `profiles`、`mentions`、`biography_records`、`relationships` 来生成角色列表。

### 2. Signatures

```ts
// Server page 首屏入口
createReviewQueryService().getPersonaChapterMatrix({ bookId });

// API 刷新入口
GET /api/admin/review/persona-chapter-matrix?bookId=<uuid>

// 读模型来源
prisma.personaChapterFact.findMany({ where: { bookId } });
```

### 3. Contracts

| 层 | 契约 | 说明 |
|----|------|------|
| 分析写入层 | `persona_candidates` + `*_claims` + accepted `identity_resolution_claims` | claim-first 审核的源数据 |
| Projection 层 | `persona_chapter_facts` | 审核矩阵的唯一角色/单元格来源 |
| 页面层 | `initialMatrix.personas` | `ReviewWorkbenchShell` 左侧角色列表由 `buildPersonaListItems(initialMatrix)` 派生 |
| Legacy 图谱层 | `profiles`、`mentions`、`biography_records`、`relationships` | 图谱/旧分析产物，不等价于审核中心有角色 |

### 4. Validation & Error Matrix

| 数据状态 | 审核中心表现 | 判定 |
|----------|--------------|------|
| `profiles > 0` 但 `persona_chapter_facts = 0` | 左侧角色列表为空 | 不是前端过滤问题；claim-first 投影不存在 |
| `*_claims > 0` 但 accepted `identity_resolution_claims = 0` | 投影无法映射 candidate 到 persona | 身份归并未确认或未生成 |
| accepted identity 存在但 `persona_chapter_facts = 0` | 可能 projection 未重建 | 检查 `rebuildProjection({ kind: "FULL_BOOK", bookId })` 调用链 |
| `persona_chapter_facts > 0` 但 UI 为空 | 再查 API 响应、分页/筛选、客户端状态 | 进入前端/API 调试 |

### 5. Good/Base/Bad Cases

- Good: claim-first 分析写入 candidates/claims，身份归并 claim 被接受，projection 重建后 `persona_chapter_facts` 有行，审核中心出现角色。
- Base: 旧 sequential 分析仅写 `profiles`/`relationships`/`biography_records`，图谱可见角色，但审核中心为空。
- Bad: 在审核中心为空时只检查 `profiles` 数量，误判为前端角色列表丢失。

### 6. Tests Required

- `getPersonaChapterMatrix` 测试必须断言：角色列表只来自 `personaChapterFact` 行，而不是 `profiles`。
- 投影构建测试必须覆盖：没有 accepted identity-resolution 时，event/relation claim 不生成 persona chapter facts。
- 页面集成测试若 mock “有角色”，必须 mock `initialMatrix.personas/cells`，不能只 mock `profiles`。

### 7. Wrong vs Correct

#### Wrong

```sql
-- 只看 profiles，就断定审核中心应该有角色
select count(*) from profiles where book_id = $1 and deleted_at is null;
```

#### Correct

```sql
-- 先看审核中心真正消费的读模型
select count(*) from persona_chapter_facts where book_id = $1;

-- 若为空，再向上追溯 claim-first 源数据和身份归并
select review_state, count(*)
from identity_resolution_claims
where book_id = $1
group by review_state;
```

---

## 禁止模式

| 禁止 | 原因 |
|------|------|
| 在 `pipeline.run` 内直接调用 `prisma.xxx` | jobs 层掌握 DB 写回时机，pipeline 只负责编排 |
| 在 Pass 1 中传入已有 profiles 上下文（twopass） | 破坏两遍设计——Pass 1 必须无约束提取以覆盖全量实体 |
| 在 sequential 中跳过 `bookPersonaCache` 更新 | 后续章节失去上下文，导致实体重复提取 |
| 在 config 以外硬编码阈值数字 | 阈值是业务参数，必须集中管理以便调优 |
| 两种架构共享同一 `PersonaResolver` 实例 | 实例内有章间状态，并发 twopass 会导致状态污染 |
| 用 `profiles` 数量判断审核中心是否应显示角色 | 审核中心角色来自 claim-first projection（`persona_chapter_facts`），legacy 人物档案不是该 UI 的数据源 |

---

## 测试约定

- 测试 `factory.ts`：验证 `createPipeline` 按 architecture 返回正确实例
- 测试各 service（`ChapterAnalysisService`、`PersonaResolver` 等）：单独 mock AI Client 和 Prisma
- **不**为整个管线端到端写单元测试（属于集成测试范畴，当前不在 CI 范围内）
