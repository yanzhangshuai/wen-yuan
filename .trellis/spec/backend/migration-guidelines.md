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

## 场景：已应用 migration 被改写，导致本地 drift

### 1. Scope / Trigger

- 触发条件：`pnpm prisma migrate status` 或 `pnpm prisma:migrate` 输出 `was modified after it was applied`、`Drift detected`。
- 典型原因：已经写入数据库历史的目录被二次编辑，或本地残留了未提交/错误命名的 ghost migration。
- 适用文件：`prisma/schema.prisma`、`prisma/migrations/<timestamp>_<name>/migration.sql`。

### 2. Signatures

- 检查命令：`pnpm prisma migrate status`
- 应用命令：`pnpm prisma:migrate`
- 历史表：`_prisma_migrations`
- 目录格式：`prisma/migrations/YYYYMMDDHHMMSS_<name>/migration.sql`

### 3. Contracts

- 已经应用过的 migration 目录只能视为历史快照，禁止直接改写其 SQL 内容。
- 需要修正 schema 时，只能新增一个更晚的 forward migration，不能通过重写旧 migration “补救”。
- 如果 drift 来自本地 ghost migration：
  - 先删除仓库内无效 migration 目录。
  - 再把本地数据库手工修到“已提交 migration 历史应有的状态”。
  - 最后新增一个正式 migration 承载真实 schema 变更。
- 修库操作必须是对象级修复，不能默认执行 `prisma migrate reset`；只有明确接受丢库时才允许 reset。

### 4. Validation & Error Matrix

| 现象 | 判断 | 正确动作 | 禁止动作 |
|------|------|----------|----------|
| `was modified after it was applied` | 已应用 migration 被改写 | 回退该目录到历史版本，或删除本地 ghost 目录后补新 migration | 继续编辑旧目录 SQL |
| `Drift detected` 且差异是索引/FK 缺失 | 本地库对象不等于 migration 历史 | 手工补齐索引/FK，使 DB 回到历史预期，再生成新 migration | 直接 reset 开发库 |
| `Database schema is up to date!` | 历史与 schema 一致 | 继续运行 lint/type-check/test | 跳过后续验证 |

### 5. Good / Base / Bad Cases

- Good:
  - 删除错误的本地目录 `prisma/migrations/20260415095518`
  - 手工补回缺失对象，例如 `alias_entries(canonical_name)` 索引、`alias_packs(scope)` 索引、`prompt_template_versions(template_id, created_at)` 索引，以及 `ner_lexicon_rules` / `prompt_extraction_rules` / `prompt_template_versions` 到 `book_types` 的外键
  - 新增 `prisma/migrations/20260416093000_finalize_kb_refactor_schema/migration.sql`
- Base:
  - 目录没有被改写，但 `schema.prisma` 与最新 migration 不一致
  - 先生成新 migration，再执行 `pnpm prisma:migrate`
- Bad:
  - 直接编辑一个已经应用过的 `migration.sql`
  - 为了消除 drift 直接执行 `prisma migrate reset`
  - 手动修改 `src/generated/prisma/**` 试图绕过 schema/migration 不一致

### 6. Tests Required

- `pnpm prisma migrate status`
  - 断言输出包含 `Database schema is up to date!`
- `pnpm prisma:migrate`
  - 断言没有 `Drift detected` / `was modified after it was applied`
- `pnpm lint`
- `pnpm type-check`
- `pnpm test`

### 7. Wrong vs Correct

#### Wrong

```sql
-- 旧 migration 已经在本地库执行过，又继续改写内容
ALTER TABLE "prompt_template_versions"
  ADD CONSTRAINT "prompt_template_versions_book_type_id_fkey"
  FOREIGN KEY ("book_type_id") REFERENCES "book_types"("id");
```

#### Correct

```text
1. 删除未提交的 ghost migration 目录
2. 手工修复本地 DB 缺失对象，使其重新匹配已提交 migration 历史
3. 新建一个更晚时间戳的 migration 目录承载正式修复
4. 运行 pnpm prisma migrate status / pnpm prisma:migrate / pnpm lint / pnpm type-check / pnpm test
```
