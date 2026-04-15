# 主实施执行计划 — Sequential 准确率提升 + 知识库服务化

> **决策基线**: `docs/待确认项汇总.md` D1-D13 全部锁定  
> **入口文档**: `docs/MASTER.md`  
> **验收文档**: `.trellis/tasks/04-13-acceptance-execution/prd.md`  
> **完整规格来源**: `.trellis/tasks/04-13-04-13-convergence-revision/prd.md` 第 5~8 节

## Goal

按照确定的分阶段顺序，编排子任务的 Codex 执行计划。每个任务定义：
- 分配给哪个 Trellis 任务 ID（或新建内联实现）
- 精确的执行要点和文件范围
- 可检查的 DoD（Done Definition）
- 前置依赖关系

---

## 阶段 P0：基础层

> P0 是所有后续任务的前提。必须按 P0-1 → P0-3 → P0-4 → P0-5 顺序执行；P0-2 可与 P0-1 并行。

---

### P0-1：Prisma Schema 新增 3 张知识库表

**分配任务**: `04-12-wave2-kb-schema-extend`  
**参考**: `docs/全局知识库服务化重构设计.md` 3.1～3.5 节

**执行要点**:

1. `prisma/schema.prisma` 新增 3 个 model:

```prisma
model HistoricalFigureEntry {
  id          String   @id @default(uuid()) @db.Uuid
  name        String   @db.VarChar(100)
  aliases     String[] @default([])
  dynasty     String?  @db.VarChar(50)
  category    String   @db.VarChar(30)   // EMPEROR | SAGE | POET | GENERAL | MYTHICAL | STATESMAN
  description String?
  isVerified  Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@map("historical_figure_entries")
}

model RelationalTermEntry {
  id         String   @id @default(uuid()) @db.Uuid
  term       String   @unique @db.VarChar(20)
  category   String   @db.VarChar(30)   // KINSHIP | SOCIAL | GENERIC_ROLE
  isVerified Boolean  @default(false)
  createdAt  DateTime @default(now())
  @@map("relational_term_entries")
}

model NamePatternRule {
  id          String   @id @default(uuid()) @db.Uuid
  ruleType    String   @db.VarChar(30)   // FAMILY_HOUSE | DESCRIPTIVE_PHRASE | RELATIONAL_COMPOUND
  pattern     String   @db.VarChar(200)  // 正则表达式，≤200 字符（D9）
  action      String   @db.VarChar(20)   // BLOCK | WARN
  description String?
  isVerified  Boolean  @default(false)
  createdAt   DateTime @default(now())
  @@map("name_pattern_rules")
}
```

2. `GenericTitleEntry` 新增字段：
   - `exemptInBooks String[] @default([])`（书籍级豁免，存 bookId）
   - `category String? @db.VarChar(30)`（OFFICIAL / RELIGIOUS / SERVANT / MILITARY）

3. 执行 `npx prisma migrate dev --name add_knowledge_base_phase7`

**DoD**:
- [x] `pnpm prisma:migrate` 成功（migration 文件存在）
- [x] 3 张新表在 DB 中存在
- [x] `pnpm prisma:generate` 成功
- [x] `pnpm type-check` 通过

---

### P0-2：删除 Book.genre 字段

**分配任务**: `04-12-deprecate-classical-names`（第一步）  
**决策**: D8 - 直接删除，不做数据迁移

**执行要点**:

1. `prisma/schema.prisma`: Book model 删除 `genre String?` 行
2. 执行 `npx prisma migrate dev --name remove_book_genre`
3. 替换代码引用（共 4 个文件，已确认位置）：
   - `src/app/admin/books/import/page.tsx` Line 318: `formData.set("genre", genre)` → 仅传 `bookTypeId`，移除 genre 相关 state 和 UI
   - `src/app/api/books/route.ts` Lines 81, 140, 155: `createBookFormSchema` 移除 `genre` 字段，`POST()` 中移除 genre 赋值
   - `src/server/modules/books/createBook.ts` Line 118: 删除 `genre: normalizeOptionalText(input.genre) ?? null`
   - `src/server/modules/analysis/services/ChapterAnalysisService.ts`: 删除 `resolveBookLexiconConfig()` 函数（Lines 1482-1488）及全部调用
4. 运行 `pnpm prisma:generate` 刷新生成类型
5. 修复测试文件中引用 genre 的 mock

**DoD**:
- [x] `grep -r "book\.genre" src/ --include="*.ts" | grep -v "\.test\." | wc -l` 返回 0
- [x] `grep -r "resolveBookLexiconConfig" src/ --include="*.ts" | wc -l` 返回 0
- [x] `grep "genre" prisma/schema.prisma | grep -v "BookType\|//"` 返回 0 条
- [x] `pnpm type-check` + `pnpm test` 通过

---

### P0-3：种子数据初始化脚本

**分配任务**: `04-12-wave1-filter-hardening`（数据迁移部分）  
**参考**: `docs/全局知识库服务化重构设计.md` 1.3 节迁移清单

**执行要点**:

新建 `scripts/init-knowledge-phase7.ts`，使用 upsert 保证幂等性：

1. **迁移 ExtractionRule**（来自 `lexicon.ts` 硬编码，共 42 条）:
   - `HARD_BLOCK_SUFFIXES` (10 条) → `ruleType: "HARD_BLOCK_SUFFIX"`
   - `DEFAULT_SOFT_BLOCK_SUFFIXES` (12 条) → `ruleType: "SOFT_BLOCK_SUFFIX"`
   - `UNIVERSAL_TITLE_STEMS` (10 条) → `ruleType: "TITLE_STEM"`
   - `DEFAULT_POSITION_STEMS` (10 条) → `ruleType: "POSITION_STEM"`

2. **扩充 GenericTitleEntry**（来自 `全局知识库服务化重构设计.md` 2.1 节增补词表，~50 条新增）

3. **填充 HistoricalFigureEntry** 初始 ~100 条（后续 LLM 扩充到 500+）:
   - EMPEROR: 秦始皇、汉武帝、朱元璋、康熙、雍正等
   - SAGE: 孔子、孟子、庄子、朱熹等
   - POET: 苏轼、李白、杜甫、白居易等
   - GENERAL: 岳飞、戚继光、关羽等
   - MYTHICAL: 吕洞宾、关圣帝君、文昌帝君等
   - STATESMAN: 王安石、张居正、于谦等

4. **填充 RelationalTermEntry** ~80 条（KINSHIP/SOCIAL/GENERIC_ROLE 三类）

5. **填充 NamePatternRule** ~15 条（FAMILY_HOUSE / DESCRIPTIVE_PHRASE / RELATIONAL_COMPOUND）

6. **修复 D1 数据**: `classical-names.ts` RULIN_NAMES 中：
   - 删除 `{ canonicalName: "牛布衣", aliases: ["牛浦郎"] }` 的错误映射
   - 新增独立 `{ canonicalName: "牛浦郎", aliases: ["牛浦"] }`
   - 新增 `{ canonicalName: "牛布衣" }` 独立条目

7. 迁移 `classical-names.ts` 全部 5 类数据 → seed JSON 文件于 `data/knowledge-base/`

8. 新增 `package.json` script: `"kb:seed-phase7": "tsx scripts/init-knowledge-phase7.ts"`

**DoD**:
- [x] 脚本可幂等执行：`pnpm kb:seed-phase7` 连续运行 2 次无报错
- [x] `GenericTitleEntry count ≥ 110`
- [x] `ExtractionRule count ≥ 54`
- [x] `HistoricalFigureEntry count ≥ 100`
- [x] `RelationalTermEntry count ≥ 80`
- [x] `NamePatternRule count ≥ 15`
- [x] 种子数据中无 `{ canonicalName: "牛布衣", aliases: [...包含"牛浦郎"...] }`

**前置**: P0-1

---

### P0-4：`loadFullRuntimeKnowledge()` 实现

**分配任务**: `04-12-wave2-resolver-kb-integration`（前半段）  
**参考**: `docs/全局知识库服务化重构设计.md` 5~6 节，决策 D12

**执行要点**:

文件: `src/server/modules/knowledge/load-book-knowledge.ts`

接口定义（新增或扩展）:
```typescript
export interface FullRuntimeKnowledge {
  bookId: string;
  bookTypeKey: string | null;
  lexiconConfig: BookLexiconConfig;
  aliasLookup: Map<string, { personaId: string; confidence: number; source: string }>;
  historicalFigures: Set<string>;                              // 含 aliases
  historicalFigureMap: Map<string, HistoricalFigureEntry>;    // name → entry
  relationalTerms: Set<string>;
  namePatternRules: Array<{ compiled: RegExp; action: string; ruleType: string }>;
  hardBlockSuffixes: Set<string>;
  softBlockSuffixes: Set<string>;
  safetyGenericTitles: Set<string>;
  defaultGenericTitles: Set<string>;
  titlePatterns: RegExp[];
  positionPatterns: RegExp[];
  loadedAt: Date;
}

// D12: 任务启动强制刷新
export function clearKnowledgeCache(bookId: string): void;
export async function loadFullRuntimeKnowledge(
  bookId: string,
  bookTypeKey: string | null,
  prisma: PrismaClient,
): Promise<FullRuntimeKnowledge>;
```

实现要点:
1. 使用 `Promise.all()` 并行加载 7 种知识类型（减少串行等待）
2. bookId 级内存缓存（`Map<string, FullRuntimeKnowledge>`）
3. 正则编译含 D9 安全校验：
   - 长度 ≤ 200 字符
   - 禁嵌套量词（`(\w+)+` 等模式）
   - 编译超时保护（100ms）
4. `historicalFigures` Set 包含 name 和所有 aliases（快速查找）
5. 废弃旧的 `buildAliasLookupFromDb()` 孤立调用，统一入口

**DoD**:
- [x] 函数可加载全部 9 种知识类型
- [x] 缓存命中时返回相同引用，不产生额外 DB 查询
- [x] 非法正则入库前被校验拦截（D9）
- [x] 单元测试 ≥ 5 个（mock DB → 验证结构、缓存命中、正则编译）

**前置**: P0-1, P0-3

---

### P0-5：删除全部硬编码常量

**分配任务**: `04-12-deprecate-classical-names`（第二步，D2/D11）  
**注意**: 必须在 P0-4 完成且替代方案就绪后执行

**执行要点**:

1. `src/server/modules/analysis/config/lexicon.ts`: 删除以下 9 个常量导出（保留接口类型）:
   - `SAFETY_GENERIC_TITLES`, `DEFAULT_GENERIC_TITLES`
   - `HARD_BLOCK_SUFFIXES`, `DEFAULT_SOFT_BLOCK_SUFFIXES`
   - `UNIVERSAL_TITLE_STEMS`, `DEFAULT_POSITION_STEMS`
   - `CHINESE_SURNAME_LIST`
   - `ENTITY_EXTRACTION_RULES`, `RELATIONSHIP_EXTRACTION_RULES`

2. **删除整个文件**: `src/server/modules/analysis/config/classical-names.ts`

3. `src/server/modules/analysis/config/pipeline.ts`: 删除 `GENRE_PRESETS` 对象及其类型

4. 全局替换：`grep -r "GENRE_PRESETS\|buildAliasLookup\|resolveByKnowledgeBase" src/ --include="*.ts"` 找到所有引用，改为从 `runtimeKnowledge` 获取

5. 更新测试文件中引用上述常量的 mock，改为 mock `FullRuntimeKnowledge`

**DoD**:
- [x] `test ! -f src/server/modules/analysis/config/classical-names.ts` 为真
- [x] `grep -r "GENRE_PRESETS\|RULIN_NAMES\|SANGUO_NAMES\|SHUIHU_NAMES\|HONGLOU_NAMES\|XIYOU_NAMES" src/ --include="*.ts"` 返回 0 条
- [x] `grep -c "SAFETY_GENERIC_TITLES\|DEFAULT_GENERIC_TITLES\|HARD_BLOCK_SUFFIXES" src/server/modules/analysis/config/lexicon.ts` 返回 0
- [x] `pnpm type-check` + `pnpm test` 通过

**前置**: P0-4

---

## 阶段 P1：核心解析链路

> P0 全部完成后开始 P1。P1-1 和 P1-2 可并行；P1-3 依赖 P1-1+P1-2；P1-4 依赖 P1-1。

---

### P1-1：PersonaResolver 接入 runtimeKnowledge

**分配任务**: `04-12-wave2-resolver-kb-integration`  
**参考**: `.trellis/tasks/04-12-wave2-resolver-kb-integration/prd.md` R1~R4 节

**执行要点**:

1. `ResolveInput` 新增 `runtimeKnowledge?: FullRuntimeKnowledge`

2. `resolve()` 按以下优先级顺序添加 6 个检查点（参见收敛 PRD 6.1 节）:
   1. **safetyGenericTitles** → hallucinate（reason: "safety_generic"）
   2. **relationalTerms**（无 alias 绑定时）→ hallucinate（reason: "relational_term"）
   3. **namePatternRules（BLOCK）** → hallucinate（reason: "name_pattern_block"）
   4. **defaultGenericTitles**（无书级豁免时）→ hallucinate（reason: "default_generic"）
   5. **historicalFigures** → 进入 D13 判断（纯提及 → hallucinate, 书内参与 → 保留）
   6. **aliasLookup 命中** → 复用已有 Persona，`loadCandidates()` 优先查

3. `name_too_long` 阈值从 10 改为 **8**

4. 移除所有对 `lexicon.ts` 硬编码常量的直接引用

**DoD**:
- [x] PersonaResolver 无直接 import 硬编码常量
- [x] 6 个检查点代码存在（grep 可验证）
- [x] 过滤优先级正确（safety → relational → namePattern → default → historical → alias）
- [x] 测试 ≥ 20 个（每个检查点命中 + 放行各一用例）
- [x] `pnpm test` 通过

**前置**: P0-4, P0-5

---

### P1-2：AliasMapping 写入管线修复

**分配任务**: `04-12-wave2-alias-mapping-fix`  
**参考**: `.trellis/tasks/04-12-wave2-alias-mapping-fix/prd.md`

**执行要点**:
- Phase 1 roster 结果：所有 `aliasType != null` 的条目自动注册 `source=ROSTER_DISCOVERY`
- Phase 2 chunk resolve 成功时：`source=CHUNK_ANALYSIS`，confidence 取 resolve 结果
- 冒名场景：`source=IMPERSONATION`
- 去重：同一 alias 多 persona 抢注时保留最高 confidence，旋转覆盖
- 最低 confidence 阈值：0.5（低于此值不写入）

**DoD**:
- [x] `AliasRegistryService.registerAlias()` 被 Phase 1 roster 路径调用
- [x] `AliasRegistryService.registerAlias()` 被 Phase 2 chunk 路径调用
- [x] 重新解析儒林-3 后，`alias_mappings` 表有 ≥ 50 条记录
- [x] 测试（注册、去重、冲突处理）通过

**前置**: P0-4

---

### P1-3：PostAnalysisMerger 实现

**分配任务**: `04-12-wave2-post-merge`  
**参考**: `.trellis/tasks/04-12-wave2-post-merge/prd.md`

**执行要点**:
- 新建 `src/server/modules/analysis/services/PostAnalysisMerger.ts`
- **Tier 1** 精确名称匹配（conf=1.0）→ **AUTO_MERGED**（D3 唯一自动合并条件）
- **Tier 2** KB alias 驱动（conf=0.85~0.95）→ **PENDING**
- **Tier 3** Alias 交叉匹配（conf=0.75~0.90）→ **PENDING**
- **Tier 4/5** → **PENDING**，不自动执行
- `SequentialPipeline` 在 chapter loop 完成后调用 `PostAnalysisMerger.merge()`

**DoD**:
- [x] `PostAnalysisMerger.ts` 文件存在
- [x] D3 硬性约束：confidence < 1.0 的合并均写入 PENDING，无自动执行
- [x] 重新解析后 `merge_suggestions` 表 ≥ 30 条（儒林-3）
- [x] 测试（各 tier 逻辑 + PENDING/AUTO_MERGED 状态转换）通过

**前置**: P1-1, P1-2

---

### P1-4：Pipeline runtimeKnowledge 集成

**分配任务**: `04-12-wave2-resolver-kb-integration`（后半段）

**执行要点**:

**SequentialPipeline** (`src/server/modules/analysis/pipelines/sequential/SequentialPipeline.ts`):
```typescript
// run() 入口处，D12 强制刷新
clearKnowledgeCache(bookId);
const runtimeKnowledge = await loadFullRuntimeKnowledge(bookId, bookTypeKey, prisma);
// 传入 chapter loop
await this.runSequentialChapterLoop({ ..., runtimeKnowledge });
```

**TwoPassPipeline** (`src/server/modules/analysis/pipelines/twopass/TwoPassPipeline.ts`):
- 替换 `TwoPassRuntimeContext` 中 `preloadedAliasLookup` + `preloadedLexiconConfig` 的独立加载逻辑
- 统一改为 `loadFullRuntimeKnowledge(bookId, bookTypeKey, prisma)`
- 移除对 `book.genre` 的引用，改为 `book.bookType?.key ?? null`

**DoD**:
- [x] `grep "buildAliasLookup.*genre\|book\.genre" src/server/modules/analysis/pipelines/ -r --include="*.ts"` 返回 0 条
- [x] SequentialPipeline 有 `clearKnowledgeCache` 调用
- [x] TwoPassPipeline 有 `loadFullRuntimeKnowledge` 调用
- [x] `pnpm type-check` 通过

**前置**: P0-4, P0-5, P1-1

---

### P1-5：Wave1 垃圾过滤器激活

**分配任务**: `04-12-wave1-filter-hardening`  
**参考**: `.trellis/tasks/04-12-wave1-filter-hardening/prd.md`

全部过滤规则通过 P1-1 完成的 PersonaResolver 改造自动生效。本任务重点验证效果并补充缺失的过滤逻辑：
- 家族名过滤（`X家`/`X府` 模式）
- 描述性短语过滤（含"的"/"之"的长名）
- 后缀过滤完整性（全名包含后缀词，不只做 remainder 匹配）

**DoD**:
- [x] 重新解析儒林-3 后垃圾 profile 数量（泛称 + 关系词 + 历史 + 短语 + 家族名）下降 ≥ 80%
- [x] 所有新过滤规则有测试覆盖

**前置**: P1-1

---

### P1-6：历史人物管理后台 API

**直接实现（无独立 Trellis 任务）**

**文件**（新建，参照现有 `src/app/api/admin/knowledge/` 风格）:
- `src/app/api/admin/knowledge/historical-figures/route.ts` — GET(list+filter) / POST(create)
- `src/app/api/admin/knowledge/historical-figures/[id]/route.ts` — PATCH / DELETE
- `src/app/api/admin/knowledge/historical-figures/import/route.ts` — POST (batch import JSON)

**DoD**:
- [x] 4 个路由文件存在
- [x] GET 支持按 category / dynasty / name 过滤
- [x] import 端点接受 `[HistoricalFigureEntry]` JSON 数组
- [x] 测试（happy path + error path）通过

**前置**: P0-1

---

### P1-7：关系词 + 名字规则管理后台 API

**直接实现（无独立 Trellis 任务）**

**文件**（新建）:
- `src/app/api/admin/knowledge/relational-terms/route.ts`
- `src/app/api/admin/knowledge/relational-terms/[id]/route.ts`
- `src/app/api/admin/knowledge/name-patterns/route.ts`
- `src/app/api/admin/knowledge/name-patterns/[id]/route.ts`
- `src/app/api/admin/knowledge/name-patterns/test/route.ts` — 接受 `{ name, ruleId? }` 返回匹配结果

**关键约束（D9）**: `NamePatternRule` 入库时必须校验：
- `pattern.length ≤ 200`
- 禁嵌套量词（拒绝 `(\w+)+` 等 ReDoS 模式）
- 编译耗时 ≤ 100ms

**DoD**:
- [x] 5 个路由文件存在
- [x] D9 三条正则安全规则在 API 层验证
- [x] test 端点返回 `{ matched: boolean, reason?: string }`
- [x] 测试（CRUD + 正则校验拦截）通过

**前置**: P0-1

---

### P1-8：金标准数据集

**分配任务**: `04-12-wave3-eval-pipeline`（数据标注部分）  
**参考**: `.trellis/tasks/04-12-wave3-eval-pipeline/prd.md` R1 节

**执行要点**:
- 文件: `data/eval/goldset-rulin.v1.jsonl`
- 基于 `docs/角色解析准确率审计报告-儒林3.md` 手工标注 50-80 条核心角色
- 格式参照 `data/eval/goldset.schema.json`：包含 `canonicalName`、`aliases`、`gender`、`isHistorical`、`isGenericTitle`、`firstAppearChapter`

**DoD**:
- [x] 文件存在，行数 ≥ 50
- [x] `pnpm eval:goldset`（`scripts/eval/validate-goldset.ts`）校验通过

---

### P1-9：评估管线脚本

**分配任务**: `04-12-wave3-eval-pipeline`  
**参考**: `.trellis/tasks/04-12-wave3-eval-pipeline/prd.md` R2~R5 节

**执行要点**:
- `scripts/eval/compute-metrics.ts`: 读取 goldset + DB Persona，计算 5 项指标
- `scripts/eval/check-gate.ts`: 对照阈值返回 exit 0 / 1

门禁阈值（D10）:
```
precision ≥ 0.70
recall    ≥ 0.75
F1        ≥ 0.72
fragmentationRate ≤ 2.0
duplicateRate     ≤ 0.10
```

`package.json` 确保以下 scripts 存在（已有则扩展，不覆盖）:
```json
"eval:metrics": "tsx scripts/eval/compute-metrics.ts",
"eval:gate":    "tsx scripts/eval/check-gate.ts"
```

**DoD**:
- [x] `pnpm eval:metrics` 可执行，输出包含 precision/recall/f1/fragmentationRate
- [x] `pnpm eval:gate` 可执行，门禁通过时 exit 0
- [x] 测试（小样本模拟计算正确性）通过

**前置**: P1-8

---

## 阶段 P2：质量提升（修复后开启）

> **前置条件**: P1 全部完成 + `pnpm eval:gate` 返回 exit 0

---

### P2-1 & P2-2：称谓动态解析 + LLM 灰区仲裁开启

**分配任务**: `04-12-wave3-title-resolution`  
**参考**: `.trellis/tasks/04-12-wave3-title-resolution/prd.md`

**执行要点**:
1. 验证 `dynamicTitleResolutionEnabled` 代码路径完整（R2 节排查）
2. 将 `pipeline.ts` 中 `dynamicTitleResolutionEnabled: false` → `true`
3. 验证 `llmTitleArbitrationEnabled` 代码路径含频率限制
4. 将 `pipeline.ts` 中 `llmTitleArbitrationEnabled: false` → `true`
5. 新增 `llmArbitrationMaxCalls: 100`，`llmArbitrationGrayZone: [0.4, 0.6]`
6. 开启后重跑 `pnpm eval:gate` 验证无退化

**DoD**:
- [x] `grep "dynamicTitleResolutionEnabled" src/server/modules/analysis/config/pipeline.ts` → `true`
- [x] `grep "llmTitleArbitrationEnabled" src/server/modules/analysis/config/pipeline.ts` → `true`
- [x] `pnpm eval:gate` 仍然通过（无退化）

**前置**: P1-1, P1-4, P1-9

---

## 执行完成检查单

完成后对照 `.trellis/tasks/04-13-acceptance-execution/prd.md` 执行全量验收。

| 阶段 | 任务 | 状态 |
|------|------|------|
| P0-1 | Prisma Schema 新增 3 表 | ✅ |
| P0-2 | Book.genre 删除 | ✅ |
| P0-3 | 种子数据初始化 | ✅ |
| P0-4 | loadFullRuntimeKnowledge | ✅ |
| P0-5 | 硬编码常量全删 | ✅ |
| P1-1 | PersonaResolver 过滤链 | ✅ |
| P1-2 | AliasMapping 写入修复 | ✅ |
| P1-3 | PostAnalysisMerger | ✅ |
| P1-4 | Pipeline 集成 | ✅ |
| P1-5 | Wave1 过滤器 | ✅ |
| P1-6 | 历史人物 API | ✅ |
| P1-7 | 名字规则 API + D9 | ✅ |
| P1-8 | 金标准数据集 | ✅ |
| P1-9 | eval:gate 可执行 | ✅ |
| P2-1 | dynamicTitle 开启 | ✅ |
| P2-2 | llmArbitration 开启 | ✅ |
