# 文渊 · Agent 分析架构（当前版）

> 本文档描述文渊（中国古典文学知识图谱系统）当前的**整体架构设计**。
> 面向阅读审查与外部 AI 评审，只描述现状，不涉及历史版本演进。

---

## 第一部分 · 整体流程图

```
                        ┌────────────────────────────────────────────────────────────┐
                        │                       管理员 / 前端                           │
                        │   导入书籍 → 章节拆分 → 创建分析任务 → 审核 → 图谱浏览          │
                        └───────────────┬────────────────────────────────────────────┘
                                        │ POST /api/books/:id/analyze
                                        ▼
                        ┌────────────────────────────────────────────────────────────┐
                        │   startBookAnalysis（books 域）                               │
                        │   创建 analysis_job（QUEUED，scope=章节范围）                  │
                        └───────────────┬────────────────────────────────────────────┘
                                        ▼
                        ┌────────────────────────────────────────────────────────────┐
                        │   runAnalysisJobById（analysis/jobs，乐观并发 claim）          │
                        │   QUEUED ──抢到──► RUNNING                                   │
                        └───────────────┬────────────────────────────────────────────┘
                                        ▼
                        ┌────────────────────────────────────────────────────────────┐
                        │   Skill 装载（LLM 动态选择）                                   │
                        │   selectSkillsForJob（书上下文+skill目录→AI 现选→快照进 job）  │
                        │   resolveSkillsForJob（装载 GLOBAL ∪ 选中 skill 正文）         │
                        │   ──► skillsSnapshot / relationshipTypesSnapshot（防漂移）    │
                        └───────────────┬────────────────────────────────────────────┘
                                        ▼
              ┌─────────────────────────┴─────────────────────────────┐
              │        Pass1 逐章提取（并发 ≤3，单章重试 2 次）            │
              │  每章一次 LLM：本章正文 + 全书摘要 + skill ──► 提取 JSON    │
              │  entities[] / relations[] / bioFacts[]（章内共指）        │
              │  chapterNo = 本章（天然正确，无需定位）                    │
              └───────────────┬─────────────────────────────────────────┘
                              ▼
              ┌──────────────────────────────────────────────────────────┐
              │   实体验收闸（guardrails，零 LLM，承重墙）                    │
              │  实体从保留事实两端反推，过三闸：                            │
              │  ①证据锚定(本章可证) ②从属指称(拦"X的妻") ③泛称/虚指         │
              │  ──► 丢弃的事实留痕(dropRecords)；通过者 → 临时实体           │
              └───────────────┬──────────────────────────────────────────┘
                              ▼
              ┌──────────────────────────────────────────────────────────┐
              │   Pass1 落库：entity + entity_profile + alias +            │
              │   fact(DRAFT) + mention + agent_write_audits              │
              └───────────────┬──────────────────────────────────────────┘
                              ▼
              ┌──────────────────────────────────────────────────────────┐
              │   Pass1.5 身份 Pass（LLM，按类型各一次）                      │
              │   全书去重表面形式 + 频次 ──► {canonical→aliases} + dropped   │
              │   （紧凑名单全局折叠：范进/范老爷/范学道→范进）                │
              └───────────────┬──────────────────────────────────────────┘
                              ▼
              ┌──────────────────────────────────────────────────────────┐
              │   Pass1.75 确定性归并 + dropped 清理（零 LLM）               │
              │   identityService.writeRegistry（逐 entry 独立事务）         │
              │   临时实体→canonical：facts/mentions 重指向 + 别名注册        │
              │   dropped 一次性称呼 → 软删实体+mentions+以其为主体的 facts   │
              └───────────────┬──────────────────────────────────────────┘
                              ▼
              ┌──────────────────────────────────────────────────────────┐
              │   Pass3 聚合（零 LLM）                                      │
              │   Union-Find 别名注册 → refreshRelationshipsForBook         │
              │   （幂等重建 relationships 物化投影）→ Neo4j 惰性同步         │
              └───────────────┬──────────────────────────────────────────┘
                              ▼
              ┌──────────────────────────────────────────────────────────┐
              │   Pass4 自动接受栈（零 LLM，五条件）                          │
              │   ①证据锚定 ②登记表HIGH ③提及≥2 ④冲突扫描干净 ⑤关系码闭集      │
              │   scanMisattribution（按章分布误归属扫描）接入条件④           │
              │   ──► 通过=VERIFIED(AUTO_VERIFIED)；否则留 DRAFT            │
              └───────────────┬──────────────────────────────────────────┘
                              ▼
              ┌──────────────────────────────────────────────────────────┐
              │   Pass5 收尾（零 LLM）                                      │
              │   markOrphan（mention<2 降置信，FULL_BOOK 门控）              │
              │   skillGenerator 候选（高频称谓/字典外关系码 → DRAFT 技能）    │
              │   ──► 终态：job SUCCEEDED + book COMPLETED                 │
              └───────────────┬──────────────────────────────────────────┘
                              ▼
              ┌──────────────────────────────────────────────────────────┐
              │   例外优先审核（review 域）                                   │
              │   人审队列：跨章冲突 / 低置信新实体 / merge-split 建议 /       │
              │   关系级幻觉定向抽样 / 棘轮回查校准                           │
              │   crossModel（定向换模型复核）→ 人审/自动接受                 │
              └───────────────┬──────────────────────────────────────────┘
                              ▼
              ┌──────────────────────────────────────────────────────────┐
              │   数据权威链 & 消费                                          │
              │   facts(权威) ─► relationships(物化投影) ─► Neo4j(查询缓存)   │
              │   前端：图谱可视化 / 角色资料工作台 / 章节事迹 / 书库列表      │
              │   personaCount = PERSON ∧ 未软删 ∧ 本书内 ≥1 mention         │
              └──────────────────────────────────────────────────────────┘
```

### 标注

- **LLM 调用点（共 4 类）**：Skill 选择（1 次）、Pass1 逐章提取（56 次）、身份 Pass（3-4 次）、定向跨模型复核（抽样）。其余全部确定性。
- **审计贯穿**：`agent_runs`（runType）+ `agent_write_audits`（实体/别名/事实/提及落库）+ `analysis_phase_logs`（每阶段模型调用）。
- **取消贯穿**：每个 Pass 前查 job CANCELED，抛出哨兵跳过终态写入。
- **facts 唯一写入口**：facts/mentions/aliases 由管线落库，aggregator 只读重建 relationships。
- **评测门禁**（独立于管线）：goldset + eval gate（entityF1≥0.74 / relationF1≥0.68），见第十五部分。

---

## 第二部分 · 系统定位与数据流

文渊是面向中国古典文学的知识图谱系统。核心流程：**导入书籍 → 章节拆分 → AI 分析提取人物/关系/传记 → 确定性验收与聚合 → 图谱可视化**。两种用户角色：ADMIN（管理书籍、运行分析、审核 AI 产出）、VIEWER（只读图谱浏览）。

**一句话架构**：

> **逐章提取（单章上下文，天然带章节归属）→ 实体验收闸（确定性，实体从事实两端反推）→ 身份 Pass（紧凑名单全局折叠）→ 确定性归并 + dropped 清理 → 聚合 → 例外优先审核。**
> 没有 agent 循环、没有跨章记忆、没有自修复闭环。模型输出即证据，系统只验收。

**核心设计哲学**：

1. **模型只做它擅长的提取**，系统只做模型永远不会的验收（证据锚定、身份折叠、聚合、审核）。凡是为补模型能力缺口而写的组件都删除。
2. **L3 责任不转移给模型**：验收标准（goldset、证据锚定判据、merge 授权边界）由代码/DB 强制，不靠 prompt 说服。
3. **facts 是唯一写入口**：`facts`（权威）→ `relationships`（可重算物化投影）→ `Neo4j`（查询缓存）。任何事实变更后调用 `refreshRelationshipsForBook` 幂等重建。
4. **提取粒度 = 单章**：章节归属天然正确，不需要任何"猜章节"机制（模型输出章号 / evidence 反查），这是三处历史问题（章节事迹全空、传记无法定位、实体膨胀）的共同结构性解。

---

## 第三部分 · 分层总览

```
┌──────────────────────────────────────────────────────────────┐
│ 验收层（工具化判据，代码而非 prompt）                          │
│  实体验收闸（锚定+从属指称+泛称过滤）· 关系码契约闭集校验        │
│  · dropped 清理（软删无持续身份称呼）· 分布式冲突扫描           │
│  · 自动接受栈（五条件）· merge 人审门禁                        │
│  · goldset 评测门禁 · 定向跨模型复核                           │
├──────────────────────────────────────────────────────────────┤
│ 提取层（局部，模型自由发挥，prompt 极简）                      │
│  逐章提取（单轮）：实体 + 关系 + 传记事实，天然带章节归属       │
│  身份 Pass（全局，紧凑名单）：表面形式 → 规范实体（canonical） │
├──────────────────────────────────────────────────────────────┤
│ 上下文层（渐进式披露）                                        │
│  逐章提取注入"本章正文 + 全书摘要 + 相关 skill"                │
│  身份 Pass 注入"全书去重表面形式名单 + 提及频次"               │
├──────────────────────────────────────────────────────────────┤
│ 数据层（权威链）                                              │
│  facts ─► relationships（物化聚合）─► Neo4j（惰性同步）        │
└──────────────────────────────────────────────────────────────┘
```

---

## 第四部分 · 管线时序（硬约束）

```
claim(QUEUED→RUNNING) → 快照(selectSkillsForJob) → 装载(resolveSkillsForJob)
  → Pass1 逐章提取 + 实体验收闸 + 落库（临时实体 + facts + mentions，章内共指，chapterNo=本章）
  → Pass1.5 身份 Pass（紧凑名单全局规范化 → 身份映射）
  → Pass1.75 确定性归并（临时实体 → canonical，facts/mentions 重指向）+ dropped 清理
  → Pass3 聚合（别名注册 + 幂等重建 relationships + Neo4j 惰性同步）
  → Pass4 自动接受（五条件；全量分布式冲突扫描结果接入条件④）
  → Pass5 markOrphan（FULL_BOOK 门控）+ skillGenerator 候选 → 终态
```

| Pass | 职责 | 是否 LLM | 调用量（儒林外史 56 章） |
|---|---|---|---|
| Pass1 逐章提取 | 单章提取实体/关系/传记；章内共指；chapterNo=本章 | 是 | 56 次（并发 ≤3） |
| Pass1.5 身份 Pass | 全书去重表面形式名单 → canonical 实体 | 是 | 3-4 次（按类型） |
| Pass1.75 归并+dropped 清理 | 临时实体按身份映射合并，facts/mentions 重指向；一次性称呼软删 | 否 | 0（确定性） |
| Pass3 聚合 | 别名注册 + 重建 relationships + Neo4j | 否 | 0 |
| Pass4 自动接受 | 五条件自动接受 + 冲突扫描 | 否 | 0 |
| Pass5 收尾 | markOrphan + SkillGenerator 候选 | 否（生成器未接线） | 0 |

**成本**：逐章 56 次调用与"分片 10 片×6 章"读的正文总量相同（都要读全书），总 token 基本持平；单章上下文更短、可高并发。**预算即上界**（结构性单轮，无重发）。

---

## 第五部分 · Pass1 逐章提取（局部）

**输入**：本章正文 + 全书摘要（≤2K 字符）+ 相关 skill（AI 动态选择）。
**输出**：`ExtractionSlice`（JSON）：`entities[]` + `relations[]` + `bioFacts[]`。

**关键规则**：

1. **每章一次调用**：`chapterNo` 天然等于本章。模型无需输出章号、代码无需反查。
2. **章内共指契约**：同一对象在本章的多个称呼并入一个实体（canonical 取本章最常见称呼，其余进 aliases）；不做跨章合并（跨章由身份 Pass 负责）。
3. **证据必在本章**：`evidence` 是本章原文引用，供实体验收闸锚定与人审溯源。
4. **prompt 减法原则**：systemPrompt ≤300-500 token（目标 + 输出 JSON Schema + 成功判据 + 约束），无分步流程 / CRITICAL / 负面指令 / few-shot。领域知识由 skill 注入 user。

**失败语义**：单章重试 2 次（`attempt` 递增）；重试耗尽标记该章 `parseStatus=FAILED`，任务终态 FAILED。已成功章节仍落库。

---

## 第六部分 · 实体验收闸（Pass1 内，零 LLM，承重墙）

**问题**：实体存在性若交给模型自由列举，会产出大量 0 提及垃圾实体（如"季苇萧的新娘""差人"及一水地点），身份 Pass 只折叠不删除 → 垃圾永久占位。

**规则（`guardrails.ts`）**：**实体从保留事实的两端反推**，不再独立遍历提取输出的 `entities[]` 建实体。一个名字要成为实体，必须作为某条**通过验收的事实**的参与者，且通过三道闸：

1. **证据锚定**：名字在本章正文可证（归一化子串匹配，别名感知——实体任一称呼命中即通过）。
2. **从属指称过滤**：排除 "X的妻/妾/夫/母/师/师兄/新娘…"（保守正则，无"的"不拦）。
3. **泛称/虚指过滤**：排除 `deicticJunk` 契约名单 + 单字。

任一不过 → 丢弃该事实并留痕（`dropRecords`，审计），实体不建立。`runGuardrails` 输出 `entities`（= 保留事实的参与者名单，含类型），供落库反推。

**效果**：0 提及垃圾在源头被挡；类型信息从提取 `entities[]` 的 canonical/aliases 映射取（保留模型类型判断）。

---

## 第七部分 · 身份 Pass 与归并

### 6.1 身份 Pass（Pass1.5，紧凑名单全局折叠）

**输入**：提取产出去重表面形式（实体名 + 提及频次 + 类型）。
**输出**：`{ canonical → aliases }` 映射 + `dropped` 名单。
**上下文**：紧凑名单（儒林外史 ~500-1500 条，~10-15K token），模型一眼看到变体两端（范进/范老爷/范学道同屏），折叠是确定性分类任务，不再是跨章检索。
**按类型分组**（人物/地点/组织各一次调用），互不干扰。canonical 必须是名单中的名字；禁止引入名单外名字。

### 6.2 确定性归并（Pass1.75，零 LLM）

对身份映射逐组归并：

1. **保留实体**：canonical 命中的临时实体（name 精确）即保留实体；不存在则创建。
2. **吸收实体**：每个 alias 对应的临时实体合并进保留实体——
   - facts 重指向（source/target）；
   - **mentions 重指向**（保证合并后提及统计不丢失）；
   - aliases 并集 + 注册 alias 表；
   - 软删被吸收实体。
3. 单事务执行，事务后一次 `refreshRelationshipsForBook`。

残余歧义（跨组无法判定、类型冲突）→ `merge_suggestions` 人审。

### 6.3 dropped 清理（Pass1.75 内）

身份 Pass 判定的**一次性称呼**（轿夫/看门人/X的妻）→ **软删实体 + 软删其 mentions + 软删以其为主体的 facts**（同事务）。保留 `agent_write_audits` 审计，软删可追溯。

---

## 第八部分 · 身份写路径（identityService）

`identityService.writeRegistry` 是身份四路回写（身份 Pass / 跨模型复核等）的**单一写路径**，事务内写 entities + entity_profiles + aliases + agent_write_audits。

**事务策略**：**按 entry 拆分为独立事务**（每个实体一个 `prisma.$transaction`）。全书 ~200 实体若共用一个大交互事务，会在 Prisma 5 秒超时窗口内做数千次往返而失败（"query cannot be executed on an expired transaction"）。entry 之间无依赖，拆分后各事务仅数次往返。

**登记表（registry）是派生视图**：`getRegistry` 从 entities + aliases（表）+ mentions + entity_profiles 四表物化查询，HIGH/MEDIUM/LOW 置信分类运行时推导，不落新表。书级缓存 + 写后失效。aliases 以 alias 表为权威源（取 `entity.aliases ∪ alias 表记录`）。

---

## 第九部分 · 聚合与图谱（Pass3）

### 8.1 别名注册（Union-Find）

`mergeAliasGroups` 对登记表做别名分组；单实体组幂等注册别名记录，多实体组（跨实体合并决策）交人审，不自动合并。

### 8.2 relationships 物化聚合

`refreshRelationshipsForBook` 幂等重建某书 relationships：

1. DELETE 该书全部 relationships（全量重建）。
2. GROUP BY (bookId, src, tgt, typeCode) 聚合 RELATION 事实。
3. SYMMETRIC 类型规范化 source<target；自环丢弃；折叠到同一键去重合并。
4. 任一底层事实 VERIFIED → 边 VERIFIED；否则 DRAFT。
5. weight=factCount；first/latest chapter 取 min/max。

### 8.3 Neo4j 惰性同步

节点 MERGE + 本书边全删重建。**Neo4j 是查询缓存（PG 权威源）**：连接不可达时跳过同步并告警，不使分析任务失败（`findPersonaPath` 有 PG BFS 回退）。

---

## 第十部分 · 例外优先审核（Pass4-5）

### 9.1 自动接受栈（五条件，`autoAccept.ts`）

一条事实自动落 VERIFIED（`recordSource=AUTO_VERIFIED`）需**可验证的客观信号**，不靠模型自报置信度：

1. **证据锚定**：fact 涉及的所有名字在本章正文可证（幻觉过滤）。
2. **实体登记表 HIGH**：不在登记表或 LOW → 不进自动接受。
3. **提及数 ≥ 2**：单次提及且证据单薄不自动接受。
4. **分布式冲突扫描干净**：涉及实体无误归属冲突（管线 Pass4 前全量扫描接入）。
5. **确定性校验全过**：关系码在 skill 契约闭集（任务快照）、方向正确。

**跨章一致 = 加分项，不用于免审**（同模型错误相关，独立信号来自跨模型）。

### 9.2 分布式冲突扫描（`conflictScan.ts`）

按**章分布**判读别名误归属（非邻近窗口重叠，防误报工厂）：

- 别名活跃章区只与实体 Y 重合、从不与当前实体 X 重合 → 标记重归属 Y。
- 与 X、Y 均重合 → 正常同场共现，不标记。

### 9.3 人审队列（只留异常）

| 进人审队列 | 为什么 |
|---|---|
| 跨章冲突（同一关系被提取为不同类型） | 真歧义 |
| 新实体且低置信 / TITLE_ONLY 无法溯源 | 身份不确定 |
| merge / split 建议 | 高危操作，人审门禁 |
| 关系级幻觉定向抽样 | 证据锚定覆盖不到残留风险 |
| 自动接受校准抽样（棘轮回查） | 校准自动接受质量 |

### 9.4 markOrphan（Pass5）

FULL_BOOK 门控：本书 mention 数 < 2 的实体置信度降级（0.4）。配合实体验收闸，0 提及垃圾已在源头被挡。

---

## 第十一部分 · Skill 系统（只承载 L3 知识）

- **内容源**：`scripts/skills/*.md`（frontmatter 契约 + 正文），seed 入库。承载书型特有知识（科举制、官场称谓）、历史人物溯源、关系类型契约。
- **AI 动态选择**：任务启动 `selectSkillsForJob` 按"书 + skill 目录"现选（元数据常驻 ~100 token，正文按需注入），快照进 `analysis_jobs.skillsSnapshot` / `relationshipTypesSnapshot`，任务内各阶段从快照装载，任务间互不干扰。不做书级持久化。
- **启停**：`Skill.isEnabled` 独立开关；false = 全局不可用。
- **关系码契约**：relationshipCodes 闭集进 skill frontmatter，运行时 schema/guardrail/图谱取码 = 所选 skill 契约并集 + 任务快照。不独立建表。

---

## 第十二部分 · 数据模型

核心表：

| 表 | 角色 |
|---|---|
| `facts` | **唯一写入口**；含 evidence / chapterId / chapterNo / status / recordSource |
| `entities` / `entity_profiles` | 全局实体 + 书级档案（PERSON/LOCATION/ORGANIZATION/CONCEPT） |
| `aliases` | 书级别名表（identityService 单一写路径） |
| `mentions` | 提及证据（entityId + chapterId + rawText） |
| `relationships` | 物化聚合投影（可重算） |
| `analysis_jobs` / `agent_runs` / `agent_write_audits` | 任务生命周期 + 全链路审计 |
| `skills` / `skill_versions` | L3 知识承载 |

**软删除贯穿**：Book / Entity / EntityProfile / Alias / Mention / Fact / Relationship 均有 `deletedAt`。

**计数口径（personaCount）**：书库列表/详情人物数 = **PERSON 类型 ∧ 实体未软删 ∧ profile 未软删 ∧ 本书内 mention ≥1**（`countEffectivePersonas` 独立聚合）。不再把 LOCATION/ORG/CONCEPT 与 0 提及垃圾混入"人物"列。

---

## 第十三部分 · 鉴权与前端

- **middleware**：保护 `/admin/*` 与 `/api/admin/*`，从 Cookie 验 JWT，注入 `x-auth-role` / `x-auth-current-path` 头，未登录重定向 `/login`。
- **路由分组**：`(viewer)/` 只读图谱浏览、`(graph)/` 书籍图谱详情、`admin/` 管理后台、`login/`。
- **API 与模块对应**：`src/app/api/*` 路由薄壳映射到 `src/server/modules/<domain>/` 服务层。

---

## 第十四部分 · 模型管理

- AI 模型在 `/admin/model` 自助维护（provider/model/baseUrl/apiKey），协议分 `openai-compatible`（DeepSeek、Qwen、Doubao、GLM 等）与 `gemini`。
- **模型不再 seed**；首次部署按 `docs/model-config-bootstrap.md` 手工添加首个模型。
- 所有 AI 调用统一系统默认模型（`loadSystemDefaultModel`：isDefault 优先，否则最近更新启用模型）；跨模型复核显式传 `modelId`。
- `AiCallExecutor` 统一重试 + 阶段留痕（`analysis_phase_logs`）。

---

## 第十五部分 · 评测与质量门禁

- **goldset**：`scripts/goldset/<书>/*.json` 人工标注真值，跨段取样（首段 + 中段科举硬章节 + 尾段）+ 冷门书对照（防预训练记忆高估）。
- **eval gate**：`scripts/eval/run-eval.ts` 门禁 **entityF1≥0.74 / relationF1≥0.68**（跨章微平均）。流程：真实管线跑完 → `export-extraction.ts` 导出 → `run-eval.ts` 评测。书名必须与 goldset 目录名一致。
- **棘轮法**：只在评测暴露真实失败后，才针对性加确定性约束；禁止先写校验规则防猜测的失败。
- **定向跨模型复核**：同名/近名簇、多候选 TITLE_ONLY、跨卷边界实体、关系级幻觉定向样本，用身份判定原语换模型复核。

---

## 第十六部分 · 进度与状态

- **书籍状态**：PENDING / PROCESSING / COMPLETED / ERROR（`normalizeBookStatus` 归一化）。
- **解析进度**：由最新 `AnalysisJob` 状态 + `analysis_phase_logs` 推导；阶段权重：Pass1 extraction（10→45）→ identity（50→65）→ aggregate（80）→ auto_accept（90）→ skill_generation（95）。
- **章节 parseStatus**：PENDING / PROCESSING / SUCCEEDED / FAILED（管线写入，前端面板消费）。

---

## 第十七部分 · 关键实现索引

| 能力 | 位置 |
|---|---|
| 管线编排（claim → Pass1-5） | `src/server/modules/analysis/jobs/runAnalysisJob.ts` |
| 分片策略（逐章） | `src/server/modules/extraction/slices.ts` |
| 逐章提取 | `src/server/modules/extraction/extractor.ts` |
| 实体验收闸 + 关系码校验 | `src/server/modules/extraction/guardrails.ts` |
| 身份 Pass（紧凑名单折叠） | `src/server/modules/identity/identityPass.ts` |
| 确定性归并 + dropped 清理 | `src/server/modules/identity/projection.ts` |
| 身份单一写路径 | `src/server/modules/identity/identityService.ts` |
| 登记表派生视图 | `src/server/modules/identity/registry.ts` |
| 分布式冲突扫描 | `src/server/modules/identity/conflictScan.ts` |
| relationships 物化聚合 | `src/server/modules/extraction/aggregator.ts` |
| 自动接受栈（五条件） | `src/server/modules/review/autoAccept.ts` |
| 跨模型复核 / merge 事务 | `src/server/modules/review/crossModel.ts` / `mergeEntities.ts` |
| Skill 选择/装载 | `src/server/modules/skills/skillSelector.ts` / `loader.ts` |
| 有效人物计数 | `src/server/modules/books/listBooks.ts`（`countEffectivePersonas`） |
| eval gate | `scripts/eval/run-eval.ts` / `export-extraction.ts` |

---

## 第十八部分 · 验证命令

```bash
pnpm lint          # ESLint（flat config + @stylistic）
pnpm type-check    # tsc --noEmit
pnpm test          # vitest run --coverage（门禁：src/server lines 85 / branches 75 / functions 85 / statements 85）
npx vitest run src/server/modules/<module>/<file>.test.ts   # 聚焦单测
```

测试默认 node 环境（非 jsdom）；数据库依赖一律 mock，无需起数据库。覆盖率门禁只统计 `src/server/**`。
