# chore: Twopass 基线评测（独立于主线 schema 迁移）

## Goal
用**当前生产 twopass 架构**跑一次完整儒林外史，手工标注 100 条抽样，产出基线 precision / recall 数字。作为后续三阶段管线的对照基准——否则三阶段完成后没数字可比。

## 契约
- §0-16：独立启动，不依赖 T01

## 前置依赖
- **无**（与 T01 / T02 / … 并行启动）

## Requirements

### 1. 对儒林外史跑完整 twopass
- `book_id=7d822600-9107-4711-95b5-e87b3e768125`
- 使用现有 `ANALYSIS_PIPELINE=twopass`（或无 flag 时的默认路径）
- 记录完整时长、API cost、错误率

### 2. 数据导出
- SQL 导出：
  - `personas` 总数 + 按 `mentionCount` / `biographyCount` 分桶
  - `biography_records` 总数 + 空 rawSpan 占比
  - `alias_mappings` 现存
  - 牛浦 / 牛布衣两条 persona 的 biography 归属明细
- 保存到 `.trellis/workspace/data/twopass-baseline-rulin.json`

### 3. 人工标注 100 条抽样
- 按 `mentionCount` 降序抽前 50 + 随机抽 50
- 每条标注：
  - `TRUE_ROLE`：有明确事迹且归属正确
  - `NOISE`：纯提及 / 称谓碎片 / 历史引用
  - `ALIAS_DUP`：与其他 persona 实为同一人
  - `ATTRIBUTION_ERROR`：事迹归属错误（如牛浦事迹归牛布衣）
- 计算：
  - twopass precision = `count(TRUE_ROLE) / 100`
  - 归属正确率 = `count(!ATTRIBUTION_ERROR) / 100`

### 4. 报告
- 产出 `docs/superpowers/reports/twopass-baseline.md`：
  - 总览数字表（分桶统计、cost、时长）
  - 抽样 100 条表格（附标注）
  - 牛浦 / 牛布衣专项 case study（贴完整归属链）
  - 结论：twopass 当前 precision = X%，归属正确率 = Y%

## Definition of Done

- [ ] 报告文件 committed
- [ ] 报告给出**具体数字**（不是"大概"），作为三阶段 T09 达标对照基准
- [ ] 双人交叉抽 10 条复查一致率 ≥ 80%
