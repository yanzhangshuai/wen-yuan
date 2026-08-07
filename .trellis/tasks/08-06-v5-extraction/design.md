# v5-extraction 技术设计：事实提取 + 确定性护栏 + 聚合（Pass1-3）

> 架构依据：`docs/architecture/13-agent-architecture-v5.md` §2.2/§6。
> 现有代码无 facts/relationships 服务（v4 未建），本任务从零建提取域。
> 复用：`identity` 模块（登记表）、`llm.ts` 调用模式、`AiCallExecutor`。

## 1. 模块结构

```
src/server/modules/extraction/
├── index.ts              # 导出
├── types.ts              # 提取输出契约（对齐 scripts/eval/types.ts 的 ExtractionChapter）
├── slices.ts             # 分片策略（5-8 章/片，超长章分段）
├── schema.ts             # 提取 schema 动态生成（按书型 relationship_types + 快照）
├── prompts.ts            # 提取 prompt（任务契约，减法原则，同 identity/prompts）
├── extractor.ts          # Pass1：分片单轮提取（LLM 调用 → 护栏 → 落库）
├── guardrails.ts         # Pass2：确定性护栏（证据锚定/关系码校验/泛称过滤）
├── nameAuthority.ts      # canonical 选取 + 泛称安全级别（唯一事实来源）
├── aliasResolver.ts      # Union-Find 别名合并（泛称不桥接）
├── aggregator.ts         # Pass3：聚合 + refreshRelationshipsForBook + Neo4j 同步
└── *.test.ts             # 各文件单测
```

## 2. 提取输出契约（types.ts）

对齐 eval 的 `ExtractionChapter`（scripts/eval/types.ts），落库前映射到 facts/mentions。

```ts
interface ExtractedEntity { canonical: string; type: "PERSON"|"LOCATION"|"ORGANIZATION"|"CONCEPT"; aliases?: string[] }
interface ExtractedRelation { typeCode: string; sourceCanonical: string; targetCanonical: string; attitudeTags?: string[] }
interface ExtractedBioFact { category: "BIRTH"|"EXAM"|"CAREER"|"TRAVEL"|"SOCIAL"|"DEATH"|"EVENT"; subjectCanonical: string; summary: string; location?: string }
interface ExtractionSlice { book, chapterNos: number[], entities, relations, bioFacts, newEntityCandidates: string[] }
```

## 3. 提取 schema 动态生成（schema.ts）

**按书型生成提取 JSON schema**（运行时从 relationship_types 表读，任务启动时快照）：

- `factType` 枚举：BIOGRAPHY / RELATION / ITEM_TRANSFER / ORGANIZATION_EVENT / GENERIC
- `relationshipTypeCode` 枚举：`WHERE bookTypeId IS NULL OR bookTypeId = :current`（全局 + 本书型）
- `payload` 结构：按 factType 定义（BIOGRAPHY:{summary,ironyNote,tags} RELATION:{summary} ...）
- 快照：`analysis_jobs.relationshipTypesSnapshot`（任务启动时固化，防跑批中途改表片间漂移）

## 4. 分片策略（slices.ts）

- 每片 5-8 章（按章节数分片，超长章片内顺序读入）
- 片边界取章节边界；分片输出（ExtractionSlice）与 eval goldset 章节对齐
- 超长单章（>12K 字）拆段，段输出合并（复用 eval-gate 的合并思路）

## 5. Pass1 分片单轮提取（extractor.ts）

每片一次 LLM 调用（**无工具循环**，上下文一次给全）：

```
输入 = 片正文 + 身份登记表(该书) + 全书 1-2K 摘要 + 相关 skill 全文(按书型)
输出 = ExtractionSlice（JSON，schema 动态生成约束）
```

- 调用复用 `identity/llm.ts` 模式（AiCallExecutor + generateJson，重试/fallback 自带）
- prompt 走 `prompts.ts`（任务契约，减法——与 identity/prompts 同一原则）
- 落库：`extractor.ts` 调 guardrails → 写 facts(DRAFT) + mentions + aliases + agent_runs/audit

## 6. Pass2 确定性护栏（guardrails.ts，零 LLM）

| # | 检查 | 防什么 |
|---|---|---|
| 1 | **证据锚定**：事实中出现的实体名必须在片正文可证（`name_not_in_chapter` 丢弃） | 幻觉 |
| 2 | **关系码校验**：`typeCode` 必须在 relationship_types（全局+书型） | 非法码/碎片化 |
| 3 | **泛称过滤**：safety level 判据（见 nameAuthority），泛称不落库 | 垃圾实体（旧系统 337+ profile 教训） |

**证据锚定算法**：取片正文，对每个事实的 source/target canonical 做归一化子串匹配；不命中 → 丢弃 + 记 agent_write_audits(allowed=false, reason)。

## 7. 确定性聚合（aggregator.ts + nameAuthority.ts + aliasResolver.ts，零 LLM）

### 7.1 nameAuthority（canonical 唯一事实来源）
- `aliasSafetyLevel(alias)`：0=硬屏蔽（泛称/亲属通称/共享称谓，绝不作 canonical 或 UF 节点）/ 1=可疑 / 2=安全
- `pickCanonical(members, freq)`：最短 + 高频优先，昵称/称号降级（AI-Reader-V2 同款）

### 7.2 aliasResolver（Union-Find）
- 合并实体别名组（来自 entities.aliases + aliases 表 + 提取的 newAliases）
- 安全过滤：safety level 0 的泛称**不注册为 UF 节点**（防桥接无关实体簇）
- canonical 选择走 nameAuthority.pickCanonical

### 7.3 refreshRelationshipsForBook（幂等重建，v5 §2.4）
```
1. DELETE 该书全部 relationships（全量重建）
2. SELECT 有效 RELATION 事实 GROUP BY (bookId, src, tgt, typeCode)
3. SYMMETRIC 类型规范化 source<target；自环丢弃
4. 任一底层事实 VERIFIED → 边 VERIFIED；否则 DRAFT
5. weight=factCount；first/latest 取 min/max chapterNo
6. 生成 merge_suggestions（PENDING 人审）——跨片冲突/低置信
```

### 7.4 Neo4j 惰性全量重同步
- 输入换 relationships；幂等；失败不阻断主流程（warn）

## 8. 与 identity / eval 对接

- Pass1 输入登记表来自 `identity.getRegistry(bookId)`；新实体候选 → reconcile（identity 模块）
- 提取结果 → `scripts/eval/types.ts` ExtractionChapter 格式 → `pnpm eval:gate` 可比对 F1
- 落库审计：agent_runs(runType=EXTRACTION) + agent_write_audits

## 9. 权衡与边界

| 决策 | 理由 |
|---|---|
| 单轮提取 + 上下文一次给全 | 无工具循环；身份已全局判完（identity 前置），片内是映射+提取 |
| schema 运行时动态生成 | 新关系码插表即可，无代码改动（D13） |
| 护栏零 LLM | 确定性验收，模型只提取 |
| refreshRelationships 全量重建 | 幂等、可重算、facts 唯一权威 |
| prompt 任务契约 + skill 注入 | 减法原则（同 identity/prompts） |

## 10. 风险

- 关系级幻觉残留（真实实体+假关系）证据锚定兜不住 → 显式保留，由 v5-review 定向抽样兜底
- 分片提取质量未实测 → goldset eval gate 在集成阶段测量
