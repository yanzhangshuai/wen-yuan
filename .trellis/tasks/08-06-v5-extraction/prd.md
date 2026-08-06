# 事实提取与护栏聚合（Pass1-3）

## Goal

实现分片单轮事实提取（Pass1）+ 确定性护栏（Pass2）+ 确定性聚合（Pass3），产出 facts/mentions/aliases 与物化 relationships。这是"模型只提取、系统只验收"的提取侧主体。

## Requirements

- **Pass1 分片提取**：每片 5-8 章一次 LLM 调用，上下文 = 片正文 + 身份登记表 + 全书摘要（1-2K）+ 相关 skill（按书型预注入）。输出结构化 facts（JSON Schema / function calling）。超长章分段 + 合并；失败重试 + 错误分类。
- **schema 动态生成**：按书型从 relationship_types 表生成（全局行 + 本书型行）+ 任务级快照（relationshipTypesSnapshot）。
- **Pass2 确定性护栏**（零 LLM）：证据锚定（名字在正文可证，幻觉过滤）+ 关系码表驱动校验 + 泛称安全级别（safety level 判据）。
- **Pass3 确定性聚合**（零 LLM）：alias resolver（Union-Find，泛称不桥接）+ name authority（canonical 唯一事实来源）+ 全量分布式冲突终扫 + `refreshRelationshipsForBook` 幂等重建 + Neo4j 惰性同步。
- prompt 极简：systemPrompt ≤300-500 token；无分步流程/CRITICAL/负面指令/few-shot。

## Acceptance Criteria

- [ ] 分片提取单测全绿；超长章分段合并正确；失败重试/错误分类生效
- [ ] schema 按书型动态生成（全局+书型关系码），快照生效
- [ ] 证据锚定：无正文证据事实被丢弃（幻觉过滤）；关系码表校验拦截非法码
- [ ] Union-Find 别名合并 + canonical 选择正确；泛称不参与桥接
- [ ] `refreshRelationshipsForBook` 幂等（重跑结果一致）；SYMMETRIC 方向规范化
- [ ] `pnpm eval:gate` 跑分：entityF1 / relationF1 达标（依赖 goldset）
- [ ] 行覆盖 ≥90%（providers 豁免）；`pnpm type-check`/`pnpm lint` 通过

## Constraints

- Pass2/3 零 LLM，全部确定性代码，可单测
- 证据锚定盲区（真实实体 + 假关系）显式保留，由 `v5-review` 定向抽样兜底

## Dependencies

- 依赖 `v5-identity`（登记表）+ `v5-data-model`（relationship_types）+ `v5-goldset-eval`（门禁）。
- 下游：`v5-review`（facts DRAFT 进审核流）、`v5-pipeline`（Pass3 产物接 Pass5）。
