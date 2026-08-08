# 文渊 · Agent 分析架构 v6（Extract-then-Resolve：先提取后判身份）

> **本文档取代 `13-agent-architecture-v5.md`（identity-first 架构），为唯一权威。**
> 发现矛盾请回到本文档修正。

## 第一部分 · 为什么推翻 v5：两个性质相反的任务被放进了同一个上下文

知识图谱解析实际上由**两个性质相反的子任务**组成，它们的最优上下文完全不同：

| 子任务 | 需要看到的 | 最优粒度 | 失败模式 |
|---|---|---|---|
| **提取**（谁、在哪章、和谁、发生了什么） | 局部段落 | 小（并行、便宜） | 漏提、证据缺失 |
| **身份判定**（范老爷 = 范进 = 范学道 = 范相公） | **必须同时看到变体两端** | 全局（紧凑名单） | 过度列举、变体拆分 |

v5 的 Pass0 把"身份判定"这个**全局任务压在了 30 万字原文上**让模型做，造成结构性失败：

- 分卷小时（3 章），模型**物理上看不到** 范老爷(ch2) 与 范进(ch7) 是同一人，只能把变体各列一条 → 单卷产出 ~500 实体（儒林外史真实实体 ~200 个）→ 输出膨胀 10 倍 → 被迫缩小分卷 → **57 次调用、Pass0 80 分钟**；
- 分卷大时（整卷 8 万 token），模型要"边读边列名单"，列举倾向压过合并倾向，输出逼近上限截断。

**结论：v5 不是 prompt 不够好，是把全局身份任务放错了上下文。** 任何在该路径上打补丁（调 prompt、改分卷）都是治标。v6 从结构上拆开这两个任务，各用其最优上下文。

## 第二部分 · 分层与管线

```
┌──────────────────────────────────────────────────────────────┐
│ 验收层（工具化判据，代码而非 prompt）                          │
│  证据锚定 · 关系码契约闭集校验 · 泛称安全级别 · 幻觉过滤        │
│  · 实体归并（投影/合并，确定性）· merge 人审门禁                │
│  · 分布式冲突扫描 · goldset 评测门禁 · 定向跨模型复核           │
├──────────────────────────────────────────────────────────────┤
│ 提取层（局部，模型自由发挥，prompt 极简）                      │
│  分片提取（单轮）：实体 + 关系 + 传记事实，局部共指解析         │
│  身份 Pass（全局，紧凑名单）：表面形式 → 规范实体（canonical） │
├──────────────────────────────────────────────────────────────┤
│ 上下文层（渐进式披露）                                        │
│  分片提取注入"片正文 + 全书摘要 + 相关 skill"                  │
│  身份 Pass 注入"全书去重表面形式名单 + 提及频次"               │
├──────────────────────────────────────────────────────────────┤
│ 数据层（权威链）                                              │
│  facts ─► relationships（物化聚合）─► Neo4j（惰性同步）        │
└──────────────────────────────────────────────────────────────┘
```

### 管线时序（v6，硬约束）

```
claim → 快照(selectSkillsForJob) → 装载(resolveSkillsForJob)
  → Pass1 分片提取 + 落库（临时实体 + facts + mentions，局部共指）
  → Pass1.5 身份 Pass（紧凑名单全局规范化 → 身份映射）
  → Pass1.75 确定性归并（临时实体 → canonical，facts/mentions 重指向）
  → Pass3 聚合（别名注册 + 幂等重建 relationships + Neo4j）
  → Pass4 自动接受（五条件）
  → Pass5 markOrphan + skillGenerator → 终态
```

**关键差异：提取在前、身份在后。** 身份登记表从"预计算的输入"变成"从提取产物（mentions 表面形式）**派生**的视图"——这正是 v5 §6 声称却从未做到的"登记表是派生视图"。

### 各 Pass 职责

| Pass | 职责 | 是否 LLM | 调用数（儒林外史） |
|---|---|---|---|
| Pass1 分片提取 | 局部提取实体/关系/传记事实；片内共指解析 | 是 | 19 片（并发 ≤3，~8 分钟） |
| Pass1.5 身份 | 全书去重表面形式名单 → canonical 实体 | 是 | 3-4 次（按类型，~4 分钟） |
| Pass1.75 归并 | 临时实体按身份映射合并，facts/mentions 重指向 | 否 | 0（确定性） |
| Pass3 聚合 | 别名注册 + 重建 relationships + Neo4j | 否 | 0 |
| Pass4 自动接受 | 五条件自动接受 + 冲突扫描 | 否 | 0 |
| Pass5 收尾 | markOrphan + SkillGenerator 候选 | 否（生成器未接线） | 0 |

**全书墙钟目标：~15-20 分钟**（v5 实测 3h+）。

## 第三部分 · Pass1 分片提取（局部）

复用 v5 的 `extractSlice`（单轮提取）与 `guardrails`（证据锚定/关系码校验/泛称过滤）。与 v5 的差异：

1. **不携带身份登记表**：提取不再"映射到登记实体"，而是产出**表面形式 + 局部别名**。过度列举从"灾难"变为"无害的召回"——身份由后续全局 Pass 折叠。
2. **prompt 增加片内共指契约**：同一对象在本片出现的多个称呼并入一个实体（canonical 取本片最常见称呼，其余进 aliases）；不做跨片合并。
3. **落库即临时实体**：每个去重表面形式经 `ensureEntityByName` 建临时实体（`recordSource=DRAFT_AI`），facts/mentions 引用之。

## 第四部分 · Pass1.5 身份 Pass（全局，核心）

**输入**：Pass1 后本书全部去重表面形式（实体名 + 提及频次 + 类型 + 首次出现章号）。
**输出**：身份映射 `{ canonical → [aliases] }` + 弃用名单。

### 为什么这是正确的上下文

- 输入是**紧凑名单**（儒林外史 ~500-1500 条，~10-15K token），不是 30 万字原文；
- 模型**一眼看到全部变体两端**（范进/范老爷/范学道同屏），合并是一个确定性的分类任务，不再是跨章检索；
- 按类型（人物/地点/组织）各一次调用，互不干扰（对齐 2025 长文档 KG 构建的主流做法，如 LINK-KG / CORE-KG 的 NER→Resolution 分解）。

### prompt 契约（减法原则）

```
system：把名单中的表面形式折叠为规范实体（canonical）。
输出 JSON：{ "entities": [{ "canonical": string, "aliases": string[] }], "dropped": string[] }
成功判据：
- 每个条目 = 一个独立真实对象；同一对象的全部称呼并入 aliases
- canonical 必须是名单中的某个名字（取最常见、最完整称呼）
- 名单中的每个名字必须恰好出现一次（canonical 或某 aliases 或 dropped）
- dropped = 无持续身份的一次性称呼（如"轿夫""看门人"）
- 禁止臆造：不得引入名单外的名字
```

### 代码侧确定性

- 提及频次 ≤1 且无法归属 → 归 dropped（其后临时实体保持低置信，走 markOrphan/人审）；
- 弃用名单不软删实体（其 facts 仍存在），仅降级置信。

## 第五部分 · Pass1.75 确定性归并（零 LLM）

对身份映射逐组归并：

1. **保留实体**：canonical 命中的临时实体（name 精确）即保留实体；不存在则创建。
2. **吸收实体**：每个 alias 对应的临时实体合并进保留实体——
   - facts 重指向：sourceEntityId / targetEntityId → 保留实体；
   - mentions 重指向：mention.entityId → 保留实体（v5 的 mergeEntities 漏了这一步，v6 必须做，否则提及统计丢失）；
   - aliases 并集 + 软删被吸收实体；
   - aliases 表注册（bookId + entityId + alias）。
3. 单事务执行，事务后一次 `refreshRelationshipsForBook`（facts 为唯一写入口）。

残余歧义（跨组无法判定、类型冲突）→ `merge_suggestions` 人审（D8 保留，MERGE/SPLIT 一律人审）。

## 第六部分 · 与 v5 的差异清单

### 删除

| v5 组件 | 处置 | 理由 |
|---|---|---|
| `Tier1`（原文枚举登记表） | **删除** | 身份判定的错误上下文，过度列举的结构性来源 |
| `Tier2`（原文窗口原语兜底） | **删除** | 身份 Pass 看到全名单 + 频次，Tier2 的召回兜底被覆盖 |
| `reconcile`（扫漏网高频） | **删除** | 同上；提取产物即全量表面形式，无"漏网" |
| `pickTier1Plan` / A/B 校准死配置 | **删除** | 分卷策略不再需要 |
| `newEntityCandidates` | **删除（死字段）** | 无消费方 |

### 保留 / 复用

| 组件 | 保留理由 |
|---|---|
| `extractSlice` / `guardrails` / `slices` | 局部提取 + 护栏，本就是 v6 的 Pass1 |
| `aliasResolver`（Union-Find）/ `mergeEntities` 事务 | 归并的确定性基础（v6 的 Pass1.75 在其上扩展 mention 重指向） |
| `conflictScan` / `autoAccept` / `markOrphan` | Pass4/Pass5 依赖 |
| `primitive`（身份判定原语） | **跨模型复核（crossModel）仍使用**，保留 |
| `identityService.writeRegistry` | canonical 实体创建 + 别名注册的单一写路径 |
| `registry`（派生视图） | 消费方（Pass3/4、UI）不变 |
| `getBookStatus` 进度推导 | 阶段顺序重排 + 权重重置 |

## 第七部分 · Prompt 设计（减法原则）

与 v5 §4 一致：systemPrompt ≤300-500 token（目标 + 输出契约 + 成功判据），无分步流程/CRITICAL/负面指令/few-shot。领域知识（明清官场称谓、中文命名模式、关系类型契约）仍由 skill 注入。仅两处 prompt 变化：

1. **提取**：增加片内共指契约（正向判据，见第三部分）。
2. **身份 Pass**：新增 canonicalization 契约（见第四部分）。

## 第八部分 · 数据模型

核心表不变：`facts`（唯一写入口）/ `entities` / `aliases` / `mentions` / `relationships`（派生）/ `analysis_jobs` / `agent_runs` / `agent_write_audits`。

增量约定：

- 临时实体 `recordSource = DRAFT_AI`，归并后保留实体沿用（人工确认后升 `MANUAL`）；
- **merge 必须重指向 mentions**（v5 的 `mergeEntitiesInTransaction` 缺此步骤，v6 归并实现补上）；
- 登记表仍是派生视图（无新表），但来源从"预计算"变为"提取 mentions 统计 + 身份 Pass 映射"。

## 第九部分 · 进度阶段

```
Pass1 extraction（10 → 45，按已完成分片数推进）
Pass1.5 identity（50 → 65，按已完成类型调用数推进）
Pass3 aggregate（80）→ Pass4 auto_accept（90）→ Pass5 skill_generation（95）
```

## 第十部分 · 评测与质量门禁

沿用 v5 §8：goldset 跨段取样 + 冷门书对照 + eval gate（entityF1≥0.74 / relationF1≥0.68）+ 棘轮法 + 定向跨模型复核。

新增待验证点：

- **实体折叠 F1**：身份 Pass 的 canonical 合并准确率（对照人工标注 aliases）；
- **孤儿比例**：markOrphan 降级实体数应显著低于 v5（v5 过度列举导致大量孤儿）。

## 第十一部分 · 决策基线（v6 锁定）

| # | 决策 |
|---|---|
| D18 | **提取先于身份**：Pass1 局部提取（无登记表）→ 身份 Pass 全局折叠 → 确定性归并；登记表从输入变为派生产物 |
| D19 | **身份判定在紧凑名单上做**，不在原文上做：输入 = 去重表面形式 + 频次 + 类型，输出 = canonical 映射 |
| D20 | **按类型分组身份调用**（人物/地点/组织各一次），避免跨类型混淆 |
| D21 | **过度列举无害化**：提取阶段高召回是特性；身份 Pass 折叠；残余低置信走 markOrphan/人审 |
| D22 | **归并重指向 mentions**：facts + mentions 一并迁移，保证提及统计不因合并丢失 |
| D23 | **删除 Tier1/Tier2/reconcile**：原文上的身份兜底被名单上的全局折叠替代；`primitive` 因跨模型复核保留 |
| D24 | MERGE/SPLIT 仍一律人审（继承 D8）；归并的残余歧义进 merge_suggestions |

---

## 第十二部分 · 运行时验证记录（2026-08-08 儒林外史端到端）

首个端到端跑通（56 章）：**总耗时 ~7.7 分钟**（v5 实测 3h+），产出 **386 实体**（PERSON 269 / LOCATION 78 / ORGANIZATION 27 / CONCEPT 12）+ 351 facts + 160 relationships + 581 mentions；变体正确合并（范进 → 8 个别名，范老爷/范学道等不再拆条）。

过程中发现并修复的运行时问题（均已单测锁定）：

1. **DeepSeek V4 Flash 思考参数**：`enable_thinking: false` 会被其忽略，模型仍走推理吃掉输出预算 → 空响应/长时间卡顿（353 名单任务实测 >120s 空响应）。必须用 `thinking: { type: "disabled" }`。`OpenAiCompatibleClient` 现按 baseUrl/providerName 含 deepseek 自动切换。
2. **传记事实分类兜底**：模型可能输出枚举外 `category`（如 MARRIAGE），落库撞 Prisma 枚举。`guardrails` 现把未知分类兜底为 `EVENT`。
3. **SYMMETRIC 关系两向折叠**：`refreshRelationshipsForBook` 对对称关系做方向规范化后必须按键去重合并，否则 A→B 与 B→A 折叠同一键 → 唯一约束冲突。
4. **Neo4j 宕机 fail-safe**：Neo4j 是查询缓存（PG 权威源），连接不可达时同步跳过并告警，不使分析任务失败。
5. **登记表 aliases 以 alias 表为权威源**：v6 提取/归并把别名写入书级 alias 表，`getRegistry` 的 `aliases` 取 `entity.aliases ∪ alias 表记录`，保证名称解析完整。

---

*本文档取代 `13-agent-architecture-v5.md`。v5 的核心运行组件（提取/护栏/聚合/审核）在 v6 中原样复用，推翻的是"身份先行的执行形态"，不是整套管线。*
