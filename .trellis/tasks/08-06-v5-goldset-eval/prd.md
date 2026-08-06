# goldset 评测先行

## Goal

在写提取代码之前建立评测体系（D6 · 先建裁判）：goldset 跨段取样 + 冷门书对照 + eval gate + Pass0 A/B 校准表。这是全架构的质量锚，所有子任务的质量依赖本任务。

## Requirements

- **goldset 跨段取样**：儒林外史首段（王冕，人物稀疏）+ 中段科举硬章节（范进/周进/张静斋，歧义密度最高）+ 尾段，共 4-6 章。标注标准：实体（canonical + 别名 + 类型）+ 关系（类型 + 方向）+ 传记事实（证据锚点）。
- **冷门书对照**：一本模型预训练大概率没吃过的同类书（2-3 章），检测 Pass0 是否依赖记忆而非长上下文整合。
- **eval gate**：`pnpm eval:gate` 脚本，门禁 entityF1≥0.74 / relationF1≥0.68。
- **Pass0 A/B 校准表**：对 goldset/冷门书跑"全书一遍 vs 分卷"，产出"模型 × 书大小分档 → 默认路径"表；生产任务查表选路径。
- 评测命令纳入 PR 门禁（CI）。

## Acceptance Criteria

- [ ] 儒林外史 goldset 标注完成（跨段 ≥4 章），入库或文件化
- [ ] 冷门书对照集标注完成（≥2 章）
- [ ] `pnpm eval:gate` 可运行，输出 entityF1/relationF1
- [ ] A/B 校准表生成，Pass0 路径选择逻辑可读
- [ ] goldset 标注规范文档就绪

## Constraints

- 标注人工完成，数据文件受版本管理
- goldset 先于提取代码实现（本任务独立先行）

## Dependencies

- 无（先行任务）。所有下游子任务的质量验收依赖本任务产出。
