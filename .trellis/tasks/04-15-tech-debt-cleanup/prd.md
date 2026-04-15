# 技术债清理 — 僵尸脚本 / eval 工具链 / ExtractionRule DB 模型

**创建日期**: 2026-04-15  
**执行人**: codex-agent  
**优先级**: P2  

## 背景

KB 架构重构（`feat/kb-refactor`）已完成，遗留以下技术债：

1. `ExtractionRule` Prisma model 是僵尸表——代码层已全部改用 `NerLexiconRule` / `PromptExtractionRule`，DB 表仍存在。
2. eval 评估工具链（4 个脚本）是历史 A/B 实验设施，实验已完成，不再运行。
3. `kb:seed-phase7` 种子脚本往僵尸 `ExtractionRule` 表写数据，已无意义。
4. 验收脚本、审计查询脚本为一次性开发工具，任务完成后未清理。
5. `docs/eval/` 目录存放历史实验产出物，不再需要。

---

## 执行前确认（重要）

执行前请先确认以下不会被删除：
- `scripts/init-knowledge-base.ts` — **保留**（被 `prisma/seed.ts` 引用）
- `scripts/init-knowledge-phase6.ts` — **保留**（被 `prisma/seed.ts` 引用）
- `.trellis/scripts/get_context.py` — **保留**（Trellis 基础设施）
- `data/knowledge-base/` 目录下除 `extraction-rules.seed.json` 以外的所有 JSON — **保留**

---

## 执行步骤

### Step 1：删除 eval 工具链脚本（4 个文件）

```bash
rm scripts/eval/validate-goldset.ts
rm scripts/eval/run-stage-ab.ts
rm scripts/eval/compute-metrics.ts
rm scripts/eval/check-gate.ts
rmdir scripts/eval   # 如果目录已空才执行
```

### Step 2：删除种子与一次性脚本（5 个文件）

```bash
rm scripts/init-knowledge-phase7.ts
rm scripts/acceptance/phase12-ae.ts
rm scripts/acceptance/phase3-step-8.1.3.sh
rmdir scripts/acceptance   # 如果目录已空才执行
rm scripts/audit-query.ts
rm scripts/audit-twopass-query.ts
```

### Step 3：删除数据文件

```bash
rm data/knowledge-base/extraction-rules.seed.json
rm -rf docs/eval
```

### Step 4：清理 `package.json` — 删除 6 个废弃 npm 脚本条目

**文件**: `package.json`

删除以下 6 行（在 `"scripts"` 块内）：

```json
"eval:goldset": "pnpm ts-node scripts/eval/validate-goldset.ts",
"eval:run": "pnpm ts-node scripts/eval/run-stage-ab.ts",
"eval:metrics": "pnpm ts-node scripts/eval/compute-metrics.ts",
"eval:gate": "pnpm ts-node scripts/eval/check-gate.ts",
"trellis:context": "python3 ./.trellis/scripts/get_context.py",
"kb:seed-phase7": "pnpm ts-node scripts/init-knowledge-phase7.ts",
```

注意：只删 npm 脚本条目，不删 `.trellis/scripts/get_context.py` 文件本身。

### Step 5：从 `prisma/schema.prisma` 删除 ExtractionRule model

**文件**: `prisma/schema.prisma`

删除第 805-827 行（整个 ExtractionRule model 块）：

```prisma
model ExtractionRule {
  id        String @id @default(uuid()) @db.Uuid
  sortOrder Int    @default(0) @map("sort_order")

  /// ENTITY — 实体提取规则
  /// RELATIONSHIP — 关系提取规则
  ruleType String @default("ENTITY") @map("rule_type")

  content String @db.Text // 规则正文

  /// 生效范围：nil=所有书籍类型
  genreKey String? @map("genre_key")

  isActive   Boolean @default(true) @map("is_active")
  changeNote String? @db.Text @map("change_note")

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@index([ruleType, isActive, sortOrder], map: "extraction_rules_type_active_idx")
  @@index([genreKey], map: "extraction_rules_genre_idx")
  @@map("extraction_rules")
}
```

### Step 6：生成 Prisma Client 并执行 DB 迁移

```bash
pnpm prisma migrate dev --name remove-extraction-rule
pnpm prisma:generate
```

迁移会生成一个 `DROP TABLE extraction_rules` SQL，这是预期行为。

---

## 验收（DoD）

执行以下命令，全部通过为完成：

```bash
# 1. 确认文件已删除
ls scripts/eval/ 2>/dev/null && echo "FAIL: scripts/eval should be gone" || echo "OK: scripts/eval deleted"
ls scripts/acceptance/ 2>/dev/null && echo "FAIL: scripts/acceptance should be gone" || echo "OK: scripts/acceptance deleted"
ls scripts/init-knowledge-phase7.ts 2>/dev/null && echo "FAIL" || echo "OK: phase7 deleted"
ls scripts/audit-query.ts 2>/dev/null && echo "FAIL" || echo "OK: audit-query deleted"
ls data/knowledge-base/extraction-rules.seed.json 2>/dev/null && echo "FAIL" || echo "OK: seed file deleted"
ls docs/eval/ 2>/dev/null && echo "FAIL: docs/eval should be gone" || echo "OK: docs/eval deleted"

# 2. 确认 package.json 条目已删除
grep "eval:goldset\|eval:run\|eval:metrics\|eval:gate\|trellis:context\|kb:seed-phase7" package.json && echo "FAIL: stale entries remain" || echo "OK: package.json clean"

# 3. 确认 ExtractionRule 已从 schema 删除
grep "ExtractionRule" prisma/schema.prisma | grep -v "PromptExtractionRule" && echo "FAIL: ExtractionRule still in schema" || echo "OK: schema clean"

# 4. 类型检查
pnpm type-check

# 5. 测试
pnpm test
```

---

## 不在本任务范围内

- `scripts/init-knowledge-base.ts` — 保留
- `scripts/init-knowledge-phase6.ts` — 保留
- `data/knowledge-base/` 其余 JSON 文件 — 保留
- `.trellis/scripts/` — 保留所有
