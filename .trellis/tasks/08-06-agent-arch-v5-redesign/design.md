# 父任务技术设计：v5.1 架构落地

> 架构单一权威：`docs/architecture/13-agent-architecture-v5.md`。本文档只承载**跨子任务契约**与**实现边界**，不复述完整架构。子任务实现以本文档契约 + v5 文档对应章节为准。

## 1. 数据流与任务图

```
上传书籍 → 章节拆分
  → [goldset-eval] 评测先行（质量锚）
  → [data-model] schema 调整（relationship_types/runType/删 agent_steps/AUTO_VERIFIED）
  → [identity] Pass0：Tier1 全书一遍草稿登记表 → Tier2 原语兜底 → 登记表（派生视图）
  → [extraction] Pass1 分片提取 → reconcile（Pass1 与 Pass3 之间）→ Pass2 护栏 → Pass3 聚合
  → [review] Pass4 例外审核（自动接受栈 + 人审 + 棘轮）
  → [pipeline] Pass5 图谱同步 + 终态落库
```

依赖（写在各子任务 prd，非树形位置隐含）：goldset-eval 先行 → data-model → identity → extraction / review → pipeline。

## 2. 跨子任务契约（C1-C6）

### C1 · 身份登记表（identity 产出，extraction/review 消费）
- 派生视图，无新表。物理载体：`entities`（canonical 全局）+ `aliases`（书级，`status/confidence/recordSource` 骑身份置信）+ `mentions`（证据/活跃章区）+ `entity_profiles`。
- 唯一写入口：`identityService.write()`（四路回写：Tier1/Tier2/reconcile/跨模型复核）→ 写 entities/aliases/mentions + `agent_write_audits`。
- 查询接口：`getRegistry(bookId)` → 返回 `{ entityId, canonical, aliases[], type, confidenceTier(HIGH|MEDIUM|LOW), activeChapters[] }`。HIGH/MEDIUM/LOW 为派生分类。

### C2 · 身份判定原语（identity 内部）
- 输入：表面形式/候选簇 + 分层采样窗口（≤15，按章）+ 登记表 + 全书摘要。
- 输出：`{ verdict: resolvedEntityId | newEntity | ambiguous, evidenceAnchors[], }`。
- HIGH 组合规则（写死）：LLM 判定 resolved ∧ 提及数≥2 ∧ 分布式扫描干净 ∧ 采样窗口语义一致。置信只作弱输入。
- 复用方：Tier2 / reconcile / 跨卷合并 / 跨模型复核（换模型）。

### C3 · relationship_types（data-model 产出，extraction 消费）
- 表驱动：`code / name / direction(INVERSE|SYMMETRIC) / category / aliases[] / bookTypeId?(可空=全局)`。
- schema 生成：`WHERE bookTypeId IS NULL OR bookTypeId = :current`（全局行 + 本书型行）。
- 任务级快照：`analysis_jobs.relationshipTypesSnapshot`（同 skillsSnapshot 模式）。

### C4 · 分片提取输出（extraction 产出，review 消费）
- 每片输出结构化 facts：`{ factType, sourceEntityId?, targetEntityId?, relationshipTypeCode?, eventCategory?, evidence, chapterId, chapterNo, paraIndex?, payload }`。
- 证据锚定必填；关系码必须命中 C3 表（schema 枚举 + 落库双检）。

### C5 · 自动接受栈（review）
- 五条件合取才自动落 VERIFIED（`recordSource=AUTO_VERIFIED`）：证据锚定 ∧ 登记表 HIGH ∧ 提及数≥2 ∧ 分布式扫描干净 ∧ 确定性校验全过。
- 跨片一致 = 加分项不用于免审；MERGE/SPLIT 一律人审。

### C6 · reconcile 时序（pipeline 强制）
- 位于 Pass1 与 Pass3 之间（必需步骤）。Pass4 自动接受判定读登记表 HIGH，故 reconcile 回写必须先于 Pass3 聚合与 Pass4。

## 3. 跨子任务验收标准（父任务最终集成评审）

- [ ] `grep -ri "agentengine\|tool-loop\|load_skill\|submit_facts\|chapter_memories\|ValidationAgent" src/` 零引用
- [ ] `pnpm prisma:migrate` 通过；`agent_steps` 不存在
- [ ] `pnpm eval:gate`：entityF1≥0.74 / relationF1≥0.68
- [ ] 端到端：上传→分析→图谱→审核全链路可用
- [ ] `pnpm type-check`/`pnpm lint` 通过；行覆盖 ≥90%（providers 豁免）

## 4. 兼容性与回滚

- 保留 roleWorkbench UI 壳（`personaId→entityId` 契约调整）、RAG QaAgent 用户功能。
- 权威链 `facts→relationships→Neo4j` 不动。
- 回滚：git 回退；旧分析数据不迁移，书籍重新分析。每阶段独立 gate + commit，可单独回退。

## 5. 关键权衡（已决）

| 权衡 | 决策 | 理由 |
|---|---|---|
| 承重墙冗余 | 双 tier（Tier1 全局 + Tier2 原语兜底）而非纯单遍 | 单遍是待验证赌注，A/B 校准表决定路径 |
| 冲突扫描 | 按章分布，非邻近窗口重叠 | 防"范老爷/范进同场共现"海量误报 |
| 审核 | 例外优先 + 棘轮校准 | 人工量随系统验证可靠而递减 |
| 登记表 | 派生视图，非新表 | 单一写入口哲学，与 facts/relationships 一致 |
| 关系码 | DB 表驱动 + 书型作用域 | 保住"新关系码无代码改动"承诺 |
