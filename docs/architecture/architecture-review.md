# 文渊架构审查报告

> 审查日期：2026-08-10
>
> 审查范围：`docs/architecture/current-architecture.md`、v7 架构文档、解析/身份/审核/聚合代码、Prisma Schema、相关测试，以及参考项目 AI-Reader-V2。
>
> 审查性质：静态架构与代码审查。未修改业务代码，未运行真实数据库管线和 eval gate。

## 一、结论

当前架构**不可靠，也不能准确支持“证据级”古典文学解析**。

问题不是个别函数存在缺陷，而是核心边界存在结构性错误：

- 解析结果直接写入全局实体与正式事实，没有真正的 job staging。
- “证据锚定”实际上只验证名字出现，不验证关系或事件由原文支持。
- 书内实体与跨书全局实体混用，存在跨作品污染。
- 重跑、失败恢复、取消、Neo4j 同步均不具备可靠的版本化语义。
- 当前架构文档中有多项目标设计尚未在代码中实现。

建议推翻当前 v7 的数据写入边界，重建为 v8“证据优先、任务隔离、版本发布”的架构。Next.js 和 PostgreSQL 可以保留，但必须重做解析结果模型与发布机制。

## 二、P0 问题

| 问题 | 代码依据 | 后果 |
|---|---|---|
| 任务启动时先删除整本书关系 | `src/server/modules/books/startBookAnalysis.ts:238-242` | 任务排队、崩溃或失败时，用户立即看到空图 |
| 重跑没有隔离旧事实 | `runAnalysisJob.ts:501-553`、`prisma/schema.prisma:418-472` | facts、mentions、别名重复，关系权重和“提及 >= 2”条件会被伪造满足 |
| 全局实体和书级身份混用 | `runAnalysisJob.ts:216-235`、`identityService.ts:50-85` | “老爷”“知县”或同名人物可能跨书误合并 |
| 归并没有完整书籍边界 | `identity/projection.ts:98-117` | 一本书的归并可能改写其他书的 fact、mention，甚至软删除全局实体 |
| 证据校验不成立 | `extraction/guardrails.ts:147-168`、`review/autoAccept.ts:55-62` | 只要人物名字出现在章节，模型就可以虚构两人的关系 |
| 自动接受条件过宽 | `review/autoAccept.ts:61`、`:174-181`、`:204` | 任意名字命中、两端提及数合计达到阈值、空契约也可能放行 |
| LLM 输出没有运行时结构校验 | `extraction/extractor.ts:64-93`、`providers/ai/callJsonLlm.ts:45-53` | `{}`、错误枚举、缺字段可能直到后续落库才失败 |
| 超长章节拆分是死代码 | `extraction/slices.ts:55-73`，实际管线只调用 `buildSlices` | 长章可能截断、超上下文或静默漏召回 |
| 身份 Pass 的遗漏会被解释为 dropped | `identity/identityPass.ts:156-178` | 模型截断、空输出或漏项会导致合法实体被软删除 |

最危险的问题是：当前系统不是 fail-closed，而是会把模型的不确定性转化为破坏性写操作。

## 三、解析准确性问题

### 3.1 实体被错误地限制为事实参与者

`guardrails.ts:201-205` 明确只从事实两端反推实体，测试也锁定了“没有参与事实的人物不落库”。

这会系统性漏掉：

- 只有出场、没有关系的人物；
- 只出现在叙述中的人物；
- 只被背景提及的人物；
- 事件参与者没有被模型同时识别为关系端点的情况。

应分离：

```text
实体候选
  -> 原文 mention
  -> 身份候选
  -> 事实参与者
```

“人物没有事实”不等于“人物不存在”。

### 3.2 `TITLE_ONLY` 实际上基本不会生效

`ExtractedEntity` 没有 `nameType` 字段，管线创建实体时又固定使用：

```ts
nameType: "NAMED"
```

位置：`src/server/modules/analysis/jobs/runAnalysisJob.ts:238-246`。

因此“老爷”“夫人”“学道”等称谓大多会被当作正式命名实体，后续人审队列和自动接受中的 `TITLE_ONLY` 分支无法覆盖真实风险。

### 3.3 当前提取几乎没有有效的跨章上下文

`buildBookSummary()` 只取简介、开头和结尾：`runAnalysisJob.ts:355-394`。

这对古典文学中的以下问题明显不足：

- “此人”“那厮”“老爷”指向谁；
- 字、号、官职、绰号；
- 跨章出现的短名；
- 同姓同名人物；
- 人物在前文已经建立的身份关系。

“没有跨章记忆”解决了章节归属问题，但同时牺牲了身份消歧和共指解析。更合理的做法是：事实仍然按章节隔离，但提取时读取受控的前文实体上下文。

### 3.4 身份 Pass 不是可靠的全局归并器

当前实现存在以下问题：

- 没有传入 Skill：`identityPass.ts:122-126`；
- 超过 1500 个名字后分片互不重叠；
- 不同分片之间没有二次合并；
- 统计 mention 时没有限制当前书籍；
- 输出不完整时自动生成 `dropped`。

身份归并应该是：

```text
确定性候选召回
  -> 同书候选聚类
  -> LLM 判定
  -> 完整覆盖校验
  -> 不确定项进入审核
```

不能把“模型没输出”解释成“该实体是垃圾”。

### 3.5 关系聚合没有真正使用关系契约

`extraction/aggregator.ts:19-20` 使用硬编码 `SYMMETRIC_CODES`，没有按任务快照里的 `direction` 聚合。

结果是：

- Skill 新增对称关系不会自动处理；
- 有向关系可能被错误折叠；
- 反向事实的 VERIFIED 状态统计可能错误；
- 图路径查询又把所有关系当成无向边，丢失语义。

### 3.6 审核模块没有形成闭环

主管线 Pass4 实际只调用：

```text
scanMisattribution
  -> acceptFactsForJob
```

位置：`runAnalysisJob.ts:724-726`。

以下模块虽然存在，但没有真正接入完整流程：

- `hallucinationSample`
- `ratchet`
- `crossModel`
- `reviewQueue`

`reviewQueue.ts:97-109` 实际只分类低置信和 TITLE_ONLY，文档宣称的关系幻觉抽样、棘轮回查、跨章冲突并未自动形成持久化审核项。

### 3.7 Fact payload 契约不统一

提取侧写入：

```ts
payload: { summary: bio.summary }
```

展示侧读取：

```ts
payload.event
```

位置分别为 `extraction/guardrails.ts:189-197` 和 `roleWorkbench/chapterEvents.ts:150-173`。

这会出现“事件记录存在但正文为空”。JSON payload 必须使用按 `factType` 区分的运行时 Schema，并通过端到端测试验证从 LLM 输出到 UI DTO 的完整链路。

## 四、运行可靠性问题

- `instrumentation.node.ts` 只恢复 `QUEUED`，没有租约、心跳和 `RUNNING` 回收。
- 同一本书没有数据库级活动任务唯一约束，多个任务可能并发写入。
- 取消只在 Pass 边界检查，LLM 请求、重试和落库阶段没有 `AbortSignal`。
- 终态写入没有 `WHERE status = RUNNING` 的 CAS，取消可能被成功状态覆盖。
- 单章 entity、fact、mention、audit 不是一个事务，失败会留下半成品。
- AI 重试与章节重试叠加，实际调用次数可能远高于文档描述。
- Neo4j 是“节点写入 -> 删除关系 -> 重建关系”多个独立操作，没有 outbox 和版本校验。
- `confirmBookChapters.ts:171-188` 物理删除旧章节，连带删除事实和证据；没有不可变原文版本。
- `Fact.bookId` 与 `Fact.chapterId` 等跨表关系缺少数据库级一致性约束。
- `Entity.aliases` 是全局数组，但 `registry.ts:83-89` 将其直接并入书级别名，可能造成跨书别名泄漏。

## 五、文档与代码不一致

| 文档声明 | 实际情况 |
|---|---|
| `skill_versions` 防漂移快照 | Prisma 已无 `SkillVersion`，loader 读取当前 Skill 内容 |
| 取消贯穿整个管线 | 只在 Pass 边界检查 |
| facts 是唯一写入口 | `chapterEvents.ts:353-397` 允许人工直接创建 Fact |
| 关系可幂等重建 | 默认先删除后逐条创建，非事务调用会暴露半成品 |
| 五条件自动接受 | 实现没有验证 evidence 原文，也没有严格验证方向 |
| dropped 可追溯 | dropped 清理没有完整写入对应审计 |
| 超长章节会拆分 | 实际提取管线没有调用 `splitOversizedChapter` |

因此 `current-architecture.md` 当前更像“目标架构说明”，不应继续作为“现状文档”。

## 六、对 AI-Reader-V2 的借鉴

参考项目：<https://github.com/mouseart2025/AI-Reader-V2>

### 建议吸收

- 预扫描：jieba、n-gram、对白归属、显式命名模式；
- 每章结构化事实模型；
- Pydantic 等价的运行时 Zod 校验；
- 长章节分段、结果合并与质量元数据；
- 前文上下文摘要；
- 集中的 `NameAuthority`；
- 确定性 `FactValidator`；
- 金标准回归测试与跨小说验证。

### 不建议照搬

- 大量硬编码黑名单；
- SQLite 单文件作为长期知识库；
- 把 LLM 产出直接视为事实；
- 仅依靠字符串匹配判断关系正确性。

参考项目 README 自己也明确声明当前结果仍可能包含较多错误，不适合直接用于学术研究。应借鉴其质量工程与解析分层，而不是把其实现当作真值。

## 七、建议的 v8 架构

```text
SourceRevision
    -> Chapter / Segment Manifest（带原文 offset 和 hash）
    -> ExtractionAttempt
    -> MentionCandidate + EvidenceSpan
    -> ClaimCandidate（关系 / 事件 / 属性）
    -> BookEntity + IdentityDecision
    -> ReviewDecision
    -> PublishedProjection
    -> Neo4j Outbox Projection
```

### 7.1 原文不可变

保存 source revision、章节 hash、段落 offset。重新切章不覆盖旧版本。

### 7.2 所有解析结果按 `analysis_run_id` 隔离

新任务只写 staging。任务失败时继续使用旧发布版本。成功后通过短事务切换 `published_run_id`。

### 7.3 实体先书内、后全局

`BookEntity` 是解析主体。`CanonicalEntity` 只作为人工确认后的跨书归一化。同名不再自动等同。

### 7.4 证据使用 span，而不是裸文本

保存 `startOffset/endOffset/textHash`。代码验证 evidence 必须是原文连续片段，source 和 target 必须同时出现在 evidence span 中。一个 claim 可以关联多个 evidence。

### 7.5 实体候选与事实断言分离

mention-only 人物可以存在，但不会自动进入图谱。事实断言可以是 `CANDIDATE / SUPPORTED / VERIFIED / REJECTED`。不确定性进入审核，而不是直接删除。

### 7.6 关系契约版本化

code、direction、category、适用实体类型都存版本。聚合器只能使用本次 run 的契约快照。未知关系码进入 quarantine，不静默丢弃。

### 7.7 审核对象是 Claim，不是 Relationship

Relationship 只是投影。人工确认必须修改底层 claim 和 review decision，投影由 claim 状态重新计算。

### 7.8 Neo4j 只做异步投影

PostgreSQL 提交 outbox。Neo4j 按 book/run/version 同步。同步失败可重试，不影响事实正确性。

### 7.9 自动接受必须保守

- evidence span 精确验证；
- 两端实体分别满足门槛；
- 关系方向和类型约束通过；
- 无身份冲突；
- 高风险关系要求第二模型或人工抽样；
- 空契约必须拒绝，而不是放行。

## 八、推荐实施顺序

1. 立即停止自动全局归并、自动 dropped 软删除和当前自动 VERIFIED。
2. 修复书籍范围过滤、全局 alias 泄漏、evidence span 校验和运行时 Schema。
3. 引入 `analysis_run + staging + published_run_id`，停止任务创建时清空关系。
4. 将实体改为书内实体，跨书实体归一化改为人工决策。
5. 引入 Worker 租约、心跳、取消 token、终态 CAS。
6. 统一 Claim/Review/Projection 写路径。
7. 最后再优化 Skill、Neo4j、并发和成本。
8. 将评估指标扩展为 mention 召回率、实体精确率、别名合并/拆分准确率、关系精确率、证据支持率、误合并率和自动接受精确率。

## 九、最终判断

不建议继续在当前 v7 上堆规则。应保留模块化思想，但推翻“直接写全局实体 + 裸 evidence + 全书物理重建”的核心数据流。
