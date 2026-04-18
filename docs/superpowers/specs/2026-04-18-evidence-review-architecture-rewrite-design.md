# Evidence-first 审核型角色图谱架构重构设计

## 1. 结论

本次重构采用唯一主方案：

**Evidence-first Review Architecture**

它不是在现有 `sequential` 或现有 `threestage` 基础上继续补丁，而是直接重建一套以“证据、候选事实、人工审核、最终投影”四段式责任分离为核心的新架构。

该方案的本质是：

1. 逐章做证据抽取，而不是逐章定最终人。
2. 全书做身份归并与一致性检查，而不是让单章模型独立决策。
3. 人工审核决定最终图谱，而不是 AI 直接产出最终人物档案。
4. 图谱、时间线、人物卡片都从审核后投影层读取，而不是直接读取 AI 草稿表。

本设计明确不兼容旧解析结果，不要求延续旧 `Profile / BiographyRecord / Relationship` 作为主审核真相源。

## 2. 设计目标

### 2.1 主目标

1. 为《儒林外史》《三国演义》等中国古典文学作品提供统一的角色图谱解析底座。
2. 以人工审核工作台为系统中心，而不是以自动化解析完成度为中心。
3. 所有 AI 产出必须保留原文证据、阶段来源、模型版本、审核状态。
4. 支持人物、人物事迹、人物关系、时间线四类事实的独立审查与修订。
5. 支持多部作品复用，且允许不同书型共享抽取规则、知识包和审核流程。

### 2.2 核心约束

1. 优先可审查性，而不是纯自动化。
2. 优先准确性、稳定性、可追溯性，而不是纯召回率。
3. 古典文学中的字号、官称、亲属称谓、冒名、误认、追叙、诗词、评点都必须被显式建模。
4. 审核页面必须简单清晰，不能退化成笨重的通用知识图谱后台。
5. 数据库和中间层要反向服务审核 UI，而不是让 UI 围着后端草稿表妥协。

### 2.3 非目标

1. 不保留旧解析结果的无缝兼容。
2. 不把旧 `draft tabs` 审核页继续演化为未来主入口。
3. 不在本设计中承诺所有作品一次性达到统一高准确率。
4. 不以 Neo4j 或图数据库作为审核主真相源。

## 3. 现有架构问题

### 3.1 问题不是只有“模型抽不准”

当前仓库已有：

1. 旧 `sequential` 按章路径。
2. 现有 `threestage` 路径。
3. 围绕 `Profile / BiographyRecord / Relationship` 的旧审核/展示链路。

现状问题有三类：

1. **中间层语义错误**
   AI 候选、人工草稿、正式图谱混在同一批表中，导致读写口径漂移。
2. **证据链不稳定**
   很多结果是“有一条记录”，但不能稳定回到原文 span，也不能解释是哪一阶段产生的。
3. **审核目标和落库粒度不匹配**
   审核者真正要看的不是“大段传记草稿”，而是“某人物在某章节发生了什么、证据在哪、是否可信、是否要修改”。

### 3.2 旧主表不适合继续做新系统核心

以下对象在新架构中不适合作为审核主真相层：

1. `Profile`
   它更像书内人物展示投影，不适合作为 claim 容器。
2. `BiographyRecord`
   它粒度偏展示化，容易一条记录塞多个事实，不利于细粒度审核。
3. `Relationship`
   它缺少“候选关系、方向争议、时效区间、证据绑定、冲突状态”这一整层中间语义。
4. `Persona.aliases String[]`
   这是展示字段，不是身份仲裁字段。

因此，新系统必须把“AI 候选事实”和“最终图谱”分层。

## 4. 架构总览

新架构分四层：

1. **Text & Evidence Layer**
   保存原始文本、章节分段、原文 span、运行日志、模型输出。
2. **Candidate Claim Layer**
   保存 AI 和规则系统提出的候选人物、别名、事件、关系、时间 claim。
3. **Review Control Layer**
   保存审核状态、人工修改、冲突标记、审计日志、人工 override。
4. **Projection Layer**
   面向人物矩阵、时间矩阵、关系编辑器和图谱看板提供读模型。

核心原则：

1. 所有 claim 都必须能追溯到 evidence span。
2. 所有 projection 都必须可以从 claim + review state 重建。
3. 人工修改不能覆盖原始 AI 输出，只能新增审核动作或人工 claim。
4. AI 的不确定性要以 `conflict` 或 `pending` 显式暴露，而不是静默吞掉。

## 5. 核心领域对象

### 5.1 证据对象

#### `chapter_segments`

用途：保存章节内部的叙事区段和 offset 范围。

最小字段：

- `id`
- `bookId`
- `chapterId`
- `segmentIndex`
- `segmentType`
- `startOffset`
- `endOffset`
- `rawText`
- `normalizedText`
- `confidence`

`segmentType` 固定为：

- `TITLE`
- `NARRATIVE`
- `DIALOGUE_LEAD`
- `DIALOGUE_CONTENT`
- `POEM`
- `COMMENTARY`
- `UNKNOWN`

#### `evidence_spans`

用途：所有 claim 的统一证据锚点。

最小字段：

- `id`
- `bookId`
- `chapterId`
- `segmentId`
- `startOffset`
- `endOffset`
- `quotedText`
- `normalizedText`
- `speakerHint`
- `narrativeRegionType`
- `createdByRunId`

### 5.2 候选 claim 对象

#### `entity_mentions`

用途：保存文本中一次人物相关出现，不直接等于最终人物。

最小字段：

- `id`
- `bookId`
- `chapterId`
- `surfaceText`
- `mentionKind`
- `identityClaim`
- `aliasTypeHint`
- `speakerPersonaCandidateId`
- `suspectedResolvesTo`
- `evidenceSpanId`
- `confidence`
- `source`
- `runId`

#### `persona_candidates`

用途：全书级候选人物聚类，不等于最终确认 persona。

最小字段：

- `id`
- `bookId`
- `canonicalLabel`
- `candidateStatus`
- `firstSeenChapterNo`
- `lastSeenChapterNo`
- `mentionCount`
- `evidenceScore`
- `runId`

#### `alias_claims`

用途：保存“某称谓是否是某人别名”的候选判断。

最小字段：

- `id`
- `bookId`
- `aliasText`
- `aliasType`
- `personaCandidateId`
- `targetPersonaCandidateId`
- `claimKind`
- `evidenceSpanIds`
- `confidence`
- `status`
- `source`

`claimKind` 包含：

- `ALIAS_OF`
- `COURTESY_NAME_OF`
- `TITLE_OF`
- `KINSHIP_REFERENCE_TO`
- `IMPERSONATES`
- `MISIDENTIFIED_AS`
- `UNSURE`

#### `event_claims`

用途：保存一条可审查的原子事件事实。

最小字段：

- `id`
- `bookId`
- `chapterId`
- `subjectMentionId`
- `subjectPersonaCandidateId`
- `predicate`
- `objectText`
- `objectPersonaCandidateId`
- `locationText`
- `timeHintId`
- `eventCategory`
- `narrativeLens`
- `evidenceSpanIds`
- `confidence`
- `status`
- `source`

要求：

1. 一条 `event_claim` 只表达一个原子事实。
2. 不允许把整段人物传记塞进 `summary` 当作审核单位。

#### `relation_claims`

用途：保存一条有方向、可变更、可审查的候选关系。

最小字段：

- `id`
- `bookId`
- `chapterId`
- `sourceMentionId`
- `targetMentionId`
- `sourcePersonaCandidateId`
- `targetPersonaCandidateId`
- `relationType`
- `direction`
- `effectiveChapterStart`
- `effectiveChapterEnd`
- `timeHintId`
- `evidenceSpanIds`
- `confidence`
- `status`
- `source`

#### `time_claims`

用途：保存时间表达和阶段性时间线索。

最小字段：

- `id`
- `bookId`
- `chapterId`
- `rawTimeText`
- `timeType`
- `normalizedLabel`
- `relativeOrderWeight`
- `chapterRangeStart`
- `chapterRangeEnd`
- `evidenceSpanIds`
- `confidence`
- `status`
- `source`

`timeType` 支持：

- `CHAPTER_ORDER`
- `RELATIVE_PHASE`
- `NAMED_EVENT`
- `HISTORICAL_YEAR`
- `BATTLE_PHASE`
- `UNCERTAIN`

#### `identity_resolution_claims`

用途：保存 Stage B 对“这个 mention 最可能是谁”的归并与拆分判断。

#### `conflict_flags`

用途：显式保存待人工判定的矛盾，而不是让模型强判。

冲突类型包括：

- `POSSIBLE_DUPLICATE`
- `POSSIBLE_SPLIT`
- `POST_MORTEM_ACTION`
- `IMPOSSIBLE_LOCATION`
- `RELATION_DIRECTION_CONFLICT`
- `ALIAS_CONFLICT`
- `TIME_ORDER_CONFLICT`
- `LOW_EVIDENCE_CLAIM`

### 5.3 审核与投影对象

#### `personas`

用途：人工审核后确认的人物实体。

要求：

1. `personas` 不直接由 Stage A 创建。
2. `personas` 来源于审核通过的 candidate 或人工新建。
3. `personas` 是正式图谱实体，不是临时草稿。

#### `persona_aliases`

用途：保存审核通过的正式别名、字号、官称等。

#### `persona_chapter_facts`

用途：人物 × 章节矩阵的读模型。

单元格应聚合：

- event count
- relation count
- conflict count
- review status summary
- latest updated at

#### `persona_time_facts`

用途：人物 × 时间矩阵的读模型。

#### `relationship_edges`

用途：审核通过后的正式关系边。

#### `timeline_events`

用途：审核通过后的正式时间线事件。

#### `review_audit_logs`

用途：记录所有人工审核动作。

动作包括：

- accept claim
- reject claim
- edit claim
- create manual claim
- merge persona
- split persona
- change relation interval
- relink evidence

## 6. 审核状态机

所有 claim 统一采用审核状态机，不允许每张表各自发明状态。

### 6.1 Claim 状态

- `PENDING`
- `ACCEPTED`
- `REJECTED`
- `EDITED`
- `DEFERRED`
- `CONFLICTED`

### 6.2 来源

- `AI`
- `RULE`
- `MANUAL`
- `IMPORTED`

### 6.3 状态流转规则

1. `AI/RULE` claim 初始为 `PENDING`。
2. 审核者接受后进入 `ACCEPTED`。
3. 审核者拒绝后进入 `REJECTED`。
4. 审核者在原 claim 基础上修订时，原 claim 保留，新的人工 claim 标为 `MANUAL`，原 claim 记为 `EDITED` 或保留 `PENDING` 并写 override。
5. 命中冲突规则但无人判定前标为 `CONFLICTED`。
6. 暂不处理的问题标为 `DEFERRED`，不进入正式投影。

## 7. AI 解析流水线

### 7.1 Stage 0：文本规范化与章节分段

职责：

1. 文本 normalize。
2. 建立字符 offset。
3. 识别区段类型。
4. 生成 `chapter_segments`。
5. 提供可供高亮的统一定位系统。

要求：

1. 任何后续 claim 若不能映射回 offset，视为无效输出。
2. `POEM / COMMENTARY / DIALOGUE` 必须区分，因为它们对身份判断和时间线判断有直接影响。

### 7.2 Stage A：逐章证据抽取

职责：

1. 按章抽取 `entity_mentions`。
2. 抽取 `event_claims`。
3. 抽取 `relation_claims`。
4. 抽取 `time_claims`。
5. 保存模型原始输入输出。

要求：

1. Stage A 不创建正式 persona。
2. Stage A 输出必须附带 evidence span。
3. Stage A 允许保守，宁可进入待审，也不要强判。

### 7.3 Stage A+：规则与知识库补召回

职责：

1. 基于通用姓氏、官称、亲属称谓、字号规则补 mention。
2. 基于已验证知识包补 alias。
3. 生成禁合并或疑似误认提示。

要求：

1. 规则补召回不能直接写最终投影。
2. 规则命中也必须产出 claim，而不是直接更新正式 persona。

### 7.4 Stage B：全书身份归并

职责：

1. 聚类 mention，生成 `persona_candidates`。
2. 归并同人多名。
3. 拆分同名异人。
4. 把冒名、误认从“普通 alias”中剥离出来。

要求：

1. 牛浦/牛布衣这类问题必须建模为身份关系，而不是简单 alias。
2. Stage B 输出 merge/split suggestion，不能直接静默覆盖 Stage A 结果。

### 7.5 Stage B.5：一致性与冲突检测

职责：

1. 检查死后行动。
2. 检查同章跨地点冲突。
3. 检查时间顺序矛盾。
4. 检查关系方向冲突。
5. 检查 alias 互斥冲突。

输出：

`conflict_flags`

### 7.6 Stage C：事实归属

职责：

1. 把事件归属到 resolved persona candidate。
2. 把关系端点归属到 resolved persona candidate。
3. 把时间 hint 绑定到人物和事件。

要求：

1. 归属可以是多候选，不强制一步到位唯一化。
2. 低置信归属必须保留备选和证据。

### 7.7 Stage D：投影构建

职责：

1. 为审核页生成读模型。
2. 为图谱看板生成读模型。
3. 为人物详情页生成聚合视图。

要求：

1. projection 只读 claim + review state，不直接读未审核的旧草稿表。
2. projection 可删除重建。

## 8. 人工审核工作台反向约束

### 8.1 人物 × 章节矩阵

该界面是审核主入口，因此数据库必须天然支持：

1. 给定人物，列出每章有哪些待审核事实。
2. 给定章节，列出该人物涉及哪些事件和关系。
3. 在一个 cell 内完成新增、编辑、删除、接受、拒绝。
4. 直接查看原文证据和 AI 提取依据。
5. 直接查看历史修改记录。

因此，事件和关系都不能只以“大传记段落”落库，必须拆成 claim。

### 8.2 人物 × 时间矩阵

为了支撑《三国演义》这类作品，时间不能只依赖精确年份。

必须支持：

1. 章节顺序时间。
2. 相对阶段时间。
3. 战役前后。
4. 历史年份。
5. 不确定时间节点。

时间矩阵必须能回跳到章节矩阵和原文证据。

### 8.3 简洁关系编辑器

关系编辑 UI 必须支持：

1. 关系方向。
2. 多关系并存。
3. 动态变化。
4. 生效区间。
5. 证据绑定。

但不采用“巨型图数据库管理台”交互，而采用：

1. 筛选式列表。
2. 单条关系详情抽屉。
3. 人物对视图。
4. 区间编辑和证据侧栏。

因此，`relationship_edges` 只能是最终投影；真正可编辑对象必须是 `relation_claims` + `audit_logs`。

## 9. 知识库设计

知识库重构为统一的审核型条目系统。

### 9.1 作用域

- `GLOBAL`
- `BOOK_TYPE`
- `BOOK`
- `RUN`

### 9.2 知识类型

- surname lexicon
- title lexicon
- kinship lexicon
- official position lexicon
- alias pack
- negative merge rule
- time normalization rule
- relation taxonomy rule
- prompt extraction rule

### 9.3 使用原则

1. `VERIFIED` 知识可参与正式解析。
2. `PENDING` 知识只能作为候选提示，不直接提升正式 persona。
3. 人工审核确认的 alias 或禁合并规则可以提升为知识条目。

## 10. 运行时与可观测性

### 10.1 运行对象

#### `analysis_runs`

整书或局部解析任务。

#### `analysis_stage_runs`

按阶段保存运行结果、错误、耗时、输入输出计数。

#### `llm_raw_outputs`

保存模型原始 prompt、响应、解析结果、错误信息、schema 校验结果。

### 10.2 可观测性要求

每个阶段至少要记录：

1. 输入数量。
2. 输出数量。
3. 跳过数量。
4. 失败数量。
5. 失败原因分类。
6. token 和成本统计。
7. 受影响章节范围。

### 10.3 失败隔离

要求：

1. 单章 Stage A 失败不能让整书审核页无结果。
2. Stage B 或 Stage C 失败时保留前序产物。
3. 支持按章节、按阶段、按 run 重试。
4. 支持只重建 projection。

## 11. 增量更新与成本控制

### 11.1 增量规则

1. 章节文本 hash 未变，且 Stage A prompt/model/version 未变，则跳过 Stage A。
2. 书型知识库变更可触发 Stage A+ 或 Stage B 局部重跑。
3. 人工审核动作不触发原始 claim 删除，只触发投影重建。
4. 时间线规则变更可只重建 `persona_time_facts`。

### 11.2 成本控制原则

1. 高频、低风险任务优先走规则和小模型。
2. 高歧义身份归并和复杂关系归属再用强模型。
3. 所有 run 必须记录 token 和成本。
4. 大模型只处理必要上下文，不对整书全文重复扫描。

## 12. 删除与保留策略

### 12.1 删除主路径职责

以下对象不再作为新架构主审核真相：

1. `Profile`
2. `BiographyRecord`
3. `Relationship`
4. 旧 `listDrafts` 服务
5. 旧 review tabs 主入口
6. 旧 `sequential` 与旧 `threestage` 对正式图谱的直接写入逻辑

### 12.2 可暂时保留的基础能力

1. 书籍导入
2. 章节切分确认
3. 模型配置
4. 用户与权限系统

保留条件：

这些模块不能反向决定新架构的数据模型。

## 13. 实施边界与阶段划分

### 13.1 MVP

范围：

1. 完成新 schema。
2. 跑通 Stage 0/A/A+/B/B.5/C/D。
3. 完成人物 × 章节审核矩阵。
4. 完成最小关系编辑。
5. 以《儒林外史》验证主链路。

MVP 不要求：

1. 完整时间矩阵。
2. 完整图谱看板。
3. 多书型全覆盖规则。

### 13.2 标准版

范围：

1. 人物 × 时间审核矩阵。
2. 三国演义时间线和关系变化支持。
3. Gold set 与回归评测。
4. 增量重跑与成本面板。

### 13.3 完整版

范围：

1. 删除旧解析与旧审核路径。
2. 图谱看板全面切换至 projection。
3. 知识反馈闭环。
4. 多书型复用稳定运行。

## 14. 风险与取舍

### 14.1 主要代价

1. Schema 要全量重建。
2. 审核 API 和审核 UI 要重做。
3. 旧测试会大面积失效，需要按新契约重写。
4. Gold set 建设不可省略，否则难以验证收益。

### 14.2 主要风险

1. 如果 claim 粒度过粗，审核体验会再次恶化。
2. 如果 projection 设计过弱，页面性能会变差。
3. 如果状态机不统一，不同 claim 表会再次漂移。
4. 如果没有严格 evidence 绑定，会退化为“AI 给了结果但无法证明”。

### 14.3 取舍

本设计明确选择：

1. 牺牲短期兼容，换取长期架构清晰。
2. 牺牲一次性开发成本，换取审核效率和可追溯性。
3. 牺牲纯自动化闭环，换取古典文学场景下可控准确率。

## 15. 验收口径

架构层验收不以“图谱是否炫酷”为主，而以以下四项为主：

1. **证据闭环**
   随机抽取任何一条事件、关系、时间事实，都能回到章节原文 span。
2. **审核闭环**
   审核者可以对任一 claim 完成接受、拒绝、编辑、追溯、查看历史。
3. **投影闭环**
   人物 × 章节、人物 × 时间、关系编辑页都不直接读 AI 草稿表。
4. **重建闭环**
   删除 projection 后，可以从 claim + review state 重新构建正式图谱。

## 16. 下一步

本设计批准后，下一步不直接写业务代码，而是创建执行计划和 Trellis 任务包，按以下原则拆分：

1. 先定契约与 schema，再建 pipeline。
2. 先建 claim 与 projection，再建审核 UI。
3. 先让《儒林外史》跑通，再扩展《三国演义》时间维度。
4. 先建立金标和回归，再做 prompt 与知识库迭代。

最终执行层将对应：

1. 一个总计划文件。
2. 一组按波次拆分的 Superpowers 可执行任务。
3. 一组可直接 `/trellis:start <slug>` 的任务目录。
