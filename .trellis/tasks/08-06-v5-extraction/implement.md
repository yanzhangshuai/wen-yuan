# v5-extraction 执行计划

> 从零建提取域。按依赖序推进，每步单测验证。复用 identity/llm.ts、AiCallExecutor。

## Step 1 · types + slices（契约与分片）

- [ ] `types.ts`：ExtractionSlice / ExtractedEntity / ExtractedRelation / ExtractedBioFact（对齐 eval 契约）
- [ ] `slices.ts`：按章节数分片（5-8 章/片），超长章分段合并策略

**验证**：`slices` 单测（分片边界、超长章拆分）
**门禁**：分片结果与 eval goldset 章节对齐

## Step 2 · schema 动态生成（schema.ts）

- [ ] 从装载 skill 契约 relationshipCodes 并集取码（`getRelationshipCodesFromSkills`，去重按 code）
- [ ] factType 枚举 + payload 结构生成
- [ ] `analysis_jobs.relationshipTypesSnapshot` 快照读写（任务启动由 `selectSkillsForJob` 固化）

**验证**：单测断言 schema 含装载 skill 全部关系码；快照中途改 skill 不影响
**门禁**：skill 契约新增关系码 → schema 自动含（无代码改动）

## Step 3 · nameAuthority + aliasResolver（确定性聚合地基）

- [ ] `nameAuthority.ts`：aliasSafetyLevel（0/1/2）+ pickCanonical（最短+高频，昵称降级）
- [ ] `aliasResolver.ts`：Union-Find 合并别名组，safety level 0 泛称不注册节点

**验证**：单测（泛称不桥接、canonical 选取、合并正确）
**门禁**：泛称（老爷/母亲）绝不作 canonical 或 UF 节点

## Step 4 · guardrails（Pass2 确定性护栏）

- [ ] 证据锚定：事实实体名在片正文可证（归一化子串匹配），不命中丢弃 + 审计
- [ ] 关系码校验：typeCode 必须在装载 skill 契约关系码闭集
- [ ] 泛称过滤：safety level 0 不落库；虚指名单（GLOBAL skill 契约 deicticJunk）

**验证**：单测（幻觉过滤、非法码拦截、泛称丢弃）
**门禁**：`name_not_in_chapter` 事实 0 入库；无非法关系码

## Step 5 · extractor（Pass1 分片单轮提取）

- [ ] `prompts.ts`：提取 prompt（任务契约，减法——同 identity/prompts 原则）
- [ ] `extractor.ts`：分片 → LLM 调用（复用 llm.ts）→ guardrails → 落库 facts/mentions/aliases
- [ ] 超长章分段合并；失败重试（AiCallExecutor 自带）+ 错误分类
- [ ] 落库审计：agent_runs(EXTRACTION) + agent_write_audits

**验证**：mock LLM，断言分片→护栏→落库链路 + 审计
**门禁**：无工具循环；提取结果符合 eval ExtractionChapter 契约

## Step 6 · refreshRelationshipsForBook（Pass3 聚合核心）

- [ ] 幂等重建：DELETE 全量 → GROUP BY → SYMMETRIC 规范化 → 状态推导 → first/latest
- [ ] merge_suggestions 生成（跨片冲突/低置信）
- [ ] Neo4j 惰性同步（幂等，失败 warn 不阻断）

**验证**：单测断言重建幂等（重跑结果一致）、SYMMETRIC source<target、自环丢弃、VERIFIED 传播
**门禁**：facts 变更多次后 relationships 一致

## Step 7 · 集成验证

- [ ] `npx vitest run src/server/modules/extraction/`（全部单测）
- [ ] `grep -r "tool-loop\|load_skill\|submit_facts" src/server/modules/extraction/` 零引用
- [ ] 类型：`npx tsc --noEmit 2>&1 | grep extraction` 零错误
- [ ] 行覆盖 ≥90%（extraction 模块）
- [ ] 生成一份测试书提取结果 → `pnpm eval:gate` 冒烟（可跑即可，分数留集成阶段）

## 评审门禁

- Step 1-4（契约/分片/schema/护栏）是承重件，完成后过 review
- Step 5-6（提取器/聚合）依赖 1-4
- 全程复用 llm.ts / AiCallExecutor，不引入工具循环

## 回滚

- 每 Step 独立 commit 可回退
- extraction 模块未接入管线前不影响现有功能
