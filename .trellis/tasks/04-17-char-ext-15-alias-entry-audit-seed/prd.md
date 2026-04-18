# chore: AliasEntry 冷启动审计与儒林外史 seed

## Goal
T04 Stage B 的**三通道候选组**中通道 3 依赖 `alias_entries` 知识库命中。若该表对儒林外史无内容，三通道退化为二通道，合并召回骤降。本任务前置审计现状并按需人工 seed。

## 契约
- §0-17：审计前置 + 阈值 30 + seed ≥ 50

## 前置依赖
- **无**（与 T01 并行启动）

## Requirements

### 1. 审计
```sql
SELECT COUNT(*) FROM alias_entries
WHERE "bookId" = (SELECT id FROM books WHERE title LIKE '%儒林%' LIMIT 1);
```
- 记录当前条数到审计报告

### 2. 分支决策
- **≥ 30 条**：记录审计结果即可，任务结束
- **< 30 条**：进入 seed 流程

### 3. Seed（条数 ≥ 50）
- 维护 `prisma/seed/rulin-aliases.ts`，幂等导出 `seedRulinAliases(prisma)`
- 最小集建议覆盖：
  - **字/号/尊称映射**（至少 30 条）：王冕↔贯索犯文昌；周进↔周学道；范进↔范老爷↔范举人；匡超人↔匡迥；杜少卿↔杜仪；马二先生↔马纯上；娄瓒↔娄三公子；娄瓒↔娄四公子；虞博士↔虞育德；庄绍光↔庄尚志 …
  - **禁合并清单**（IMPERSONATED_IDENTITY 关系，**不是** alias，至少 5 条）：
    - 牛浦 ✗ 牛布衣（冒名）
    - 牛玉圃 ✗ 牛布衣（误认）
    - 严贡生 ✗ 严监生（兄弟同姓）
    - 甄贾宝玉参考（红楼跨书，仅文档）
  - **官职/尊称模糊**：老爷 / 相公 / 先生 / 太公（不直接合 persona，只登记为 alias 候选）

### 4. 入库脚本
- 扩展 `prisma/seed.ts` 调用 `seedRulinAliases`
- 支持 `pnpm prisma:seed --only rulin-aliases`

### 5. 审计报告
- `docs/superpowers/reports/alias-entry-audit.md`：
  - 审计前后条数对比
  - Seed 来源（人工整理 / 参考文献）
  - 禁合并清单完整列表 + 证据章节号

## Definition of Done

- [ ] 审计报告 committed
- [ ] 若 seed 执行，条数 ≥ 50 且双人交叉复查抽 10 条无错
- [ ] `pnpm prisma:seed` 幂等（跑两次结果一致）
- [ ] 禁合并清单对 T04 Stage B 生效（测试：牛浦 / 牛布衣在 T04 绝不合并）
