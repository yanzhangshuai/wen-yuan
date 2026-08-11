# 文渊 · 对 v8 目标架构的审查意见（回应版）

> 审查日期：2026-08-11
>
> 审查对象：`target-architecture-v8.md`（证据优先解析架构 v8）与 `architecture-review.md`（v7 静态审查报告）。
>
> 审查基准：当前代码为 **v7**（逐章提取 + 实体验收闸 + 紧凑名单身份折叠 + 确定性归并），`skills version` 已移除（`Skill` 不再有独立版本表，loader 读当前 content）。
>
> 立场：独立审查，非逐条附和。认可的部分明确认可，不认可的部分给出依据与替代方案。

---

## 一、结论先行

**v8 的诊断是正确的，处方是过重的。**

- 认可：v8（及 architecture-review）识别的四个核心边界——**任务隔离 / 书内身份 / 证据可验证 / 图缓存异步**——确实是我们运行中真实踩过的坑，属于结构性缺陷而非个别 bug。
- 不认可：把上述边界包装成「整套发布版本化 + ~20 张新表 + SkillRevision 全版本化 + 分布式作业语义」，并要求「推翻 v7 核心数据流」整体迁移。这对此项目的成熟度（单书质量仍在收敛）是过度的，且与当前的简化方向（移除 skills version）相冲突。
- 建议：**以 v7 为基底，采纳 v8 的四个核心边界（外科手术式增量），不整体迁 v8。**

---

## 二、对 architecture-review.md 的逐项回应

### 2.1 认可的部分（P0 诊断属实，附运行证据）

| 审查 P0 | 运行证据 |
|---|---|
| 任务启动先删整本书关系（`startBookAnalysis`） | 任务排队/失败即空图，用户在任务运行期间看不到任何图谱 |
| 重跑没有隔离旧事实 | 多次重跑后 facts/relationships 重复，关系权重与「提及 ≥ 2」被伪造满足，必须手工清库 |
| 全局实体与书级身份混用 | `ensureEntityByName` 按全局 name 复用旧书实体且不建本书档案，重导入后新书丢失约 440 个实体（范进等关键人物不可见） |
| LLM 输出无运行时结构校验 | 模型输出枚举外 `category: "MARRIAGE"`，直到 Prisma 落库才抛错 |
| 证据校验只验名字出现 | `guardrails` 的锚定是子串匹配，不能证明关系/事件由原文支持——关系幻觉可穿过锚定 |
| 身份 Pass 遗漏被解释为 dropped | v7 的 dropped 软删若被模型漏项触发，会误删合法实体（fail-open） |

**这六条都是真实的，且不是「堆规则能修」的**——它们来自数据写入边界不清。

### 2.2 认可但建议换解决方案的部分

**实体验收闸把实体限制为事实参与者（review §3.1）——批评方向正确，方案回退不对。**

- 正确之处：v7 的实体验收闸会系统性漏掉「只出场、无关系」的人物（背景官僚、叙述中只露一面的角色）。「人物没有事实」≠「人物不存在」。
- 但架构审查隐含的替代方向（实体自由列举）正是 v5/v6 过度列举问题的来源——0 提及垃圾（轿夫/看门人）会复现。
- 正确解法不是二选一，而是 **「实体候选」与「事实断言」分离**：实体候选可以存在（有 mention 即可），但没有通过事实验收的候选不自动进发布图谱、不自动删除。这正是 v8 的 MentionCandidate 思路，但**不需要单独建 MentionCandidate 全套表**——用「实体 + 是否参与保留事实」的标记即可达成。

### 2.3 不认可的部分

1. **「不建议继续在当前 v7 上堆规则，应推翻核心数据流」——否定过头了。**
   v7 的两项核心设计是**经端到端验证有效**的，不应推翻：
   - **逐章提取**：章节归属天然正确，消灭了 v6 分片时代的「猜章节」问题（BIOGRAPHY 章节定位从 41% 失败到天然正确）；
   - **紧凑名单身份折叠**：身份判定在去重表面形式名单上做（~10-15K token），消除过度列举，模型一眼看到变体两端。这是业界 2025 长文档 KG 的收敛模式。
   v8 的端到端流程图并不排斥逐章提取——它兼容。所以「推翻 v7」会丢掉已验证价值。

2. **部分 P0 是 bug，不是架构缺陷，且已修复。** 例如：
   - 跨书实体复用不建档 → 已修复（复用即补建书级档案）；
   - 输出截断 → 已把「非 JSON/截断」纳入可重试；
   - Neo4j 连接不稳定 → 已 fail-safe + 修复 hostname 解析。
   这些是 v7 的运行时问题，不是「必须重做数据模型」的理由。

3. **SkillRevision 全版本化（v8 §10.1）与本项目现状冲突。** 我们刚移除 skills version（skill 不再有独立版本表），v8 重新引入完整不可变 revision 会推翻这次简化。当前 skill 是 seed + 管理台启停，无频繁编辑场景，「为了版本化而版本化」。

---

## 三、v8 具体：采纳 / 暂缓清单

### 3.1 采纳（5 项，做进 v7）

| 优先级 | 边界 | 最小实现形态（不建全套表） |
|---|---|---|
| P0 | **Run staging 隔离** | 任务只写 `analysis_run` 作用域数据；停止「任务启动删整本书关系」；重跑不清当前结果（新结果先 staging，通过校验再切）。**用 run 作用域字段而非 PublicationVersion 全套** |
| P0 | **书内身份边界** | 实体改为书级候选，禁止按全局 name 跨书复用；跨书归一化改为显式人工决定 |
| P0 | **证据 span + 运行时 Schema** | evidence 存 `(revisionId, startOffset, endOffset, textHash)` 并可验证为原文连续片段；claim payload 用按类型的 Zod Schema，运行时校验 |
| P1 | **Neo4j outbox 异步同步** | 发布事务只写 outbox，独立 worker 按版本同步、可重试、失败不影响事实 |
| P1 | **修正实体验收闸过度限制** | 实体候选可存在（mention 即证），但未通过事实验收的不进发布图谱、不自动删 |

### 3.2 暂缓（明确不做，等有真实需求）

| 项 | 暂缓理由 |
|---|---|
| PublicationVersion 原子发布 + 回滚 + 版本指针 | 需要的是「重跑不污染 + 失败不清空」，run staging 隔离已覆盖；版本对比需求出现前不加 |
| SkillRevision 全版本化 | 与本项目刚做的简化冲突；无频繁编辑场景 |
| MentionCandidate / EvidenceSpan / ClaimCandidate 全套分离表 | 用「实体候选 + 证据校验」轻量替代即可，全套表是为多书严格审计场景预付 |
| 分布式 lease / heartbeat / cancel CAS / worker 租约 | 当前单 worker 部署，这些是分布式作业语义，用不上 |

---

## 四、给 ChatGPT 的明确问题（若继续迭代 v8）

1. **能否把 v8 收敛为「v7 增量边界」而非「整体推翻」？** 即保留 v7 的逐章提取 + 紧凑名单身份折叠，只加四个边界（staging 隔离 / 书内身份 / 证据可验证 / Neo4j outbox）？
2. **不引入 PublicationVersion 全套的前提下，如何实现「重跑隔离 + 失败不清空」？** 我倾向：`analysis_run` 作用域 + 校验通过后切指针，而非逐表 staging + 版本回滚。
3. **证据 span 的最小可用形态是什么？** 不建 EvidenceSpan 全套表，用 `evidence(revision_id, start_offset, end_offset, text_hash)` 四字段是否能满足「证据可验证」的核心诉求？
4. **实体验收闸的正确替代**：如何在不回到「实体自由列举」（0 提及垃圾复现）的前提下，允许「只出场、无关系」的人物存在？我的倾向：实体候选（有 mention 即建）与「事实断言通过」分离，未通过的不自动进发布图谱也不自动删。
5. **哪些 P0 属于 bug 而非架构**：architecture-review 的 P0 清单中，哪些是「修 bug 即可」，哪些是「必须重做数据模型」？

---

## 五、最终立场

v8 的四个核心边界（任务隔离 / 书内身份 / 证据可验证 / 图缓存异步）是正确方向，值得采纳；但「整体推翻 v7 迁 v8（20 张新表 + 版本发布 + Skill 全版本化）」对这个项目是过度投资。

**正确路径：以 v7 为基底，采纳 3.1 的增量边界（P0 优先），保留 v7 已验证的逐章提取与紧凑名单身份折叠，暂缓 3.2 的重型机制。**

如果你的目标是「可靠的单书解析 + 可追溯证据 + 可重跑不污染」，这条路径在 v8 语义的 1/5 工作量内达成；如果你的目标是「多书、多版本、严格审计的企业级知识图谱平台」，那 v8 全套才值得投入——但那不是当前项目阶段。

---

## 六、最终共识（2026-08-11 三方确认后修订）

> 本节是对上文审查的修订与收敛，覆盖并取代与之冲突的表述。

### 6.1 确认采纳（P0）

| 边界 | 结论 |
|---|---|
| Run staging 隔离 | `AnalysisJob` 作为 run 边界，**所有写入对象（Fact / BookEntity / Mention / Alias / Relationship）一律带 job scope**，不是只给 Fact 加 scope |
| 书内身份边界 | 解析主体为 `BookEntity`（书级 + job 级），禁止按全局 `Entity.name` 复用；跨书归一化显式人工决定 |
| 证据可验证 | `SourceRevision` + evidence offset/hash，**evidence 由代码在章内定位**（不依赖模型 offset）；找不到唯一位置 → DRAFT/REVIEW，不删除 |
| Mention-only 召回 | **新增轻量 `MentionCandidate` 表**，不复用现有 `mentions`——后者 `entityId` 强绑定全局 Entity，复用会产生半切换 |
| 最小发布指针 | `Book.publishedAnalysisJobId`，失败任务不得改变当前指针 |
| 基础任务安全 | **不因单 worker 放弃**：终态更新 CAS（`WHERE status=RUNNING`）、同书活动任务互斥、启动时 stale RUNNING 恢复。这三个是单机基础安全，不是分布式语义 |

### 6.2 修订说明（对上一版审查的更正）

- **撤回**「分布式 lease/heartbeat/CAS 暂缓」：终态 CAS、同书互斥、stale recovery 是单机必做的基础安全（进程崩溃会留永久 RUNNING 卡死重跑；API 双触发会并发跑两个 job），升为 P0。真正暂缓的是「多 Worker 租约/心跳/横向扩展」。
- **撤回**「只给 Fact 加 job scope」：所有写入对象必须隔离，否则事实会引用其他 job 的实体，自相矛盾。
- **维持**「新增 MentionCandidate 而非复用 mentions」：现有 mentions 的 FK 耦合决定了新增表更安全。

### 6.3 暂缓（明确不做，等真实需求）

SkillRevision 全版本化 / 完整 PublicationVersion 历史 / 多 Worker 分布式语义 / 完整 ClaimCandidate 与 ReviewDecision 事件表 / 全量事件溯源。

### 6.4 文档尚缺、动手前必须补齐的三项

1. **跨 run 实体对齐机制**：重跑时新 job 的 BookEntity 如何与已发布 job 的实体确认「复用 vs 新建」——不能靠名字相等（书内同名≠同一人），必须走显式判定。这是重跑不污染的关键，v8-Core §5.5 只提了一句。
2. **全部读路径清单**：`graph/*`、`roleWorkbench/chapterEvents`、`reviewQueue`、`registry` 等所有读 `Entity/Profile/Fact.sourceEntityId` 的消费方列出，避免写端已切、读端未切的半切换。
3. **写入对象 job 隔离的明确范围**：哪张表、哪些字段带 `analysisJobId`、唯一键如何从 `(bookId, …)` 调整为 `(analysisJobId, …)`，写进 schema 变更清单。

### 6.5 实施顺序（修订）

1. **Phase 0（半天）**：冻结危险写路径 + 三项基础任务安全（CAS / 同书互斥 / stale recovery）
2. **Phase 1（1-2 天）**：`publishedAnalysisJobId` + 全部写入对象 job scope + 读路径按 published job
3. **Phase 3（2-3 天）**：SourceRevision + evidence offset/hash + Zod 运行时校验
4. **Phase 2（3-5 天）**：BookEntity + MentionCandidate + 身份书内化（最大块，放在 run 与证据边界之后）
5. **Phase 4-5（2-3 天）**：审核统一 + 发布一致性检查 + ProjectionOutbox

**总估：1-2 周。**
