# 数据迁移规范

> 数据库 schema 变更采用可回滚、可灰度的迁移策略。

---

## 必须遵守

- 结构变更优先 expand-contract：先新增，再回填，再切换读写，再清理旧字段。
- 迁移脚本必须幂等，可重复执行。
- 高风险迁移必须准备回滚脚本与回滚触发条件。
- 迁移涉及大表时应分批执行并监控耗时与锁竞争。

---

## 代码案例

反例：
```sql
-- 一次性重命名字段，直接破坏线上读取
ALTER TABLE books RENAME COLUMN title TO name;
```

正例：
```sql
-- Step 1: expand
ALTER TABLE books ADD COLUMN name TEXT;

-- Step 2: backfill
UPDATE books SET name = title WHERE name IS NULL;

-- Step 3: app 双读双写一段时间后再清理旧字段（单独变更）
```

---

## 原因

- 一步到位重命名在多版本并存时极易触发线上兼容事故。
- expand-contract 将风险拆分成可观察、可回滚的小步骤。
- 幂等迁移便于失败重试与跨环境复现。

---

## 验收清单

- [ ] 是否采用 expand-contract
- [ ] 是否提供回滚方案与触发条件
- [ ] 是否评估大表执行时间与锁风险
- [ ] 是否在验证文档记录迁移前后检查项
