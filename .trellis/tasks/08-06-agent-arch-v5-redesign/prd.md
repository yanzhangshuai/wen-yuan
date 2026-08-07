# Agent 分析架构 v5 重构实现

## Goal

按 v5.1 架构重写分析域：**确定性扫描打底 → 双 tier 身份解析（全局一遍草稿 + 原语兜底）→ 分片单轮事实提取 → 确定性护栏过滤 → 确定性聚合 → 例外优先审核 + 评测门禁**。彻底移除 v4 的 Agent 工具循环、跨章记忆、自修复闭环。

权威架构：`docs/architecture/13-agent-architecture-v5.md`（本文档是本任务执行参考）。

## Requirements

### R1 · 删除 v4 遗留机制

- 删除 AgentEngine / 工具循环 / 治理层 hook（lookup/load_skill/search_memory/verify_in_text 等工具不复存在）
- 删除跨章记忆（chapter_memories 不建）
- 删除 ValidationAgent 自修复闭环（校验只检测 + 例外人审）

### R2 · 双 tier 身份解析（Pass0）

- Tier1：全书一遍草稿登记表（全局整合，模型上下文 ≥ 书时走单遍；否则分卷一等路径，相邻卷重叠衔接）
- Tier2：身份判定原语兜底（残余候选：冲突/低置信/漏网高频/跨卷边界/风险类）
- 身份判定原语 = 局部采样窗口 + 全局登记表 + HIGH 组合规则（LLM 判定 ∧ 提及数 ≥2 ∧ 分布式冲突扫描干净 ∧ 采样窗口一致）
- 分布式冲突扫描：按章分布判误归属，禁止邻近窗口重叠
- reconcile：位于 Pass1 与 Pass3 之间（必需步骤），复用原语补判漏网高频
- 登记表 = 派生视图（无新表），四路回写统一走 identityService 单一写路径 + 审计

### R3 · 分片单轮事实提取（Pass1）

- 每片（5-8 章）一次 LLM 调用，上下文 = 片正文 + 登记表 + 全书摘要 + 相关 skill
- 结构化输出走 JSON Schema / function calling（schema 运行时从 skill 契约 relationshipCodes 并集动态生成 + 任务级快照）
- 超长章分段 + 合并；失败重试、错误分类

### R4 · 确定性护栏 + 聚合（Pass2/3）

- 证据锚定（名字在正文可证）+ 关系码表驱动校验 + 泛称安全级别
- alias resolver（Union-Find）+ name authority + refreshRelationshipsForBook + Neo4j 惰性同步

### R5 · 例外优先审核（Pass4）

- 自动接受栈（强置信 = 证据锚定 + 提及数 + 登记表 HIGH + 扫描干净 + 确定性校验全过）
- 跨片一致 = 加分项不用于免审；MERGE/SPLIT 一律人审
- 棘轮校准（抽样回查自动接受准确率 → 放宽/收紧）
- 关系级幻觉残留显式标注 + 定向抽样兜底

### R6 · 评测先行（goldset-first）

- goldset 跨段取样（首段 + 科举中段硬章节 + 尾段，4-6 章）+ 冷门书对照（2-3 章）
- eval gate：entityF1≥0.74 / relationF1≥0.68
- Pass0 A/B 校准表（离线，模型 × 书大小分档 → 单遍/分卷路径）
- 棘轮法：只在评测暴露真实失败后加确定性约束

### R7 · 数据模型调整

- 关系码契约入 skill frontmatter（`relationshipCodes` 闭集；`relationship_types` 表已删）+ `analysis_jobs.relationshipTypesSnapshot`
- `agent_runs.runType` 补全（PRESCAN/IDENTITY/EXTRACTION/RECONCILE/VALIDATION/CROSS_VALIDATION/SKILL_GENERATION）
- 删除 `agent_steps`；`facts.recordSource` 加 `AUTO_VERIFIED`
- 保留 facts → relationships → Neo4j 权威链、Skill 域、审核域

## Acceptance Criteria

- [ ] `grep -ri "agentengine\|tool-loop\|load_skill\|submit_facts\|chapter_memories\|ValidationAgent" src/` 零引用（工具循环/记忆/自修复全部移除）
- [ ] `agent_steps` 表已删除，迁移成功（`pnpm prisma:migrate` 通过）
- [ ] 关系码契约进 skill frontmatter（`relationshipCodes` 闭集）；`relationship_types` 表已删；schema 生成按所选 skill 契约并集取码
- [ ] identityService：登记表派生视图 + 四路回写 + `agent_write_audits` 审计落全；身份判定原语 HIGH 组合规则实现
- [ ] reconcile 在 Pass1 与 Pass3 之间执行（时序保证）
- [ ] goldset 就绪（跨段 ≥4 章 + 冷门书 ≥2 章），eval gate 可跑
- [ ] `pnpm eval:gate` 通过：entityF1≥0.74 / relationF1≥0.68
- [ ] `pnpm type-check`、`pnpm lint` 通过；行覆盖率 ≥90%（providers 豁免）
- [ ] 端到端：上传书籍 → 分析 → 图谱 → 审核，全链路可用
- [ ] 每批自动接受后棘轮抽样回查机制存在（准确率阈值驱动放宽/收紧）

## Constraints

- 复用现有 28 表 schema，只做最小微调（R7），不引入新架构域
- 不迁移旧分析数据（git 历史可回退），书籍需重新分析
- 默认目标模型 DeepSeek（1M 上下文 + 前缀缓存），但架构不绑定 1M——分卷一等路径随时可用
- 90% 行覆盖率；providers 豁免；管线/原语/审核为高覆盖主战场
- prompt 极简：systemPrompt ≤300-500 token；不写分步流程、CRITICAL、负面指令、few-shot
- 保留 roleWorkbench 审核 UI 壳与 RAG QaAgent 用户功能

## Notes

- 复杂任务：`design.md` + `implement.md` 就绪后 `task.py start`，先评审再进入实现。
- 子任务拆分解耦独立可验证，父任务负责跨子任务验收与最终集成评审。
