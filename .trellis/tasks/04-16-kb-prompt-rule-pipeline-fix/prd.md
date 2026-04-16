# 知识库加载层重构 — PromptExtractionRule 断链修复 + 硬编码清理 + Phase 7 种子入库

**创建日期**：2026-04-16  
**执行人**：codex-agent  
**优先级**：P0（断链修复）+ P1（硬编码清理）+ P2（种子入库）  
**类型**：fix  
**范围**：backend  
**设计文档**：`docs/superpowers/specs/2026-04-16-kb-pipeline-refactor-design.md`

---

## 背景与根因

### 问题一：PromptExtractionRule 完全断链（P0）

`load-book-knowledge.ts` 只查询 `nerLexiconRule` 表，然后过滤 `ruleType === "ENTITY"` / `"RELATIONSHIP"`。但 `NerLexiconRule` schema 注释明确：这两个类型属于 `promptExtractionRule` 表，`nerLexiconRule` 只有 HARD_BLOCK_SUFFIX / SOFT_BLOCK_SUFFIX / TITLE_STEM / POSITION_STEM。

结果：过滤返回空数组 `[]`（注意：是 `[]` 而非 `undefined`）。

```typescript
const entityRules = input.entityExtractionRules ?? getDefaultEntityExtractionRules();
// 传入 [] → ?? 不触发 fallback → entityRules = [] → prompt 规则段为空！
```

**`[]` 是 truthy，`??` 不触发**。所以 prompt 中实体/关系规则段**完全空白**，不是"使用硬编码默认值"。所有 UI 编辑、启停、AI 生成的 PromptExtractionRule 完全无效。

### 问题二：硬编码双轨（P1）

`lexicon.ts` 的 `buildEffective*` 函数始终合并硬编码常量 + DB 值：

```typescript
export function buildEffectiveHardBlockSuffixes(bookConfig?: BookLexiconConfig): Set<string> {
  return new Set(toUniqueSortedList([
    ...HARD_BLOCK_SUFFIX_VALUES,                        // 始终包含硬编码
    ...(bookConfig?.additionalRelationalSuffixes ?? [])
  ]));
}
```

DB 删除某条规则不会真正生效，硬编码层仍然存在。DB 不是唯一数据源。

### 问题三：Phase 7 种子孤立（P2）

`data/knowledge-base/` 下 4 类 phase7.v1 种子文件无入库路径（对应脚本 `init-knowledge-phase7.ts` 已被清理），导致历史人物识别、名字模式规则、RELATIONAL 关系词过滤均无数据。

---

## 设计目标

- `load-book-knowledge.ts` 成为**唯一的知识数据网关**
- `lexicon.ts` 退化为**纯类型定义 + 无状态工具函数**，不持有任何数据常量
- 分析管道完全信任 DB：DB 无规则 = 无规则，不 fallback 到硬编码
- Phase 7 种子全部入库，消除数据缺口

---

## Step 1：`load-book-knowledge.ts` — 统一 Payload 与查询

### 1-1. 更新 `RuntimeLexiconPayload` 接口

删除 `baseConfig` 字段（`loadBookTypeConfig` 已是空壳），`extractionRules` 重命名为 `nerLexiconRules`（消除歧义），新增 `promptRules`：

```typescript
interface RuntimeLexiconPayload {
  genericTitles  : Array<{ title: string; tier: string; exemptInGenres: string[] }>;
  surnames       : Array<{ surname: string; isCompound: boolean }>;
  nerLexiconRules: Array<{ ruleType: string; content: string }>;  // 原 extractionRules
  promptRules    : Array<{ ruleType: string; content: string }>;  // 新增
}
```

### 1-2. 查询扩展为 4 路并发

```typescript
async function loadRuntimeLexiconPayload(
  bookTypeKey: string | null,
  prisma: PrismaClient
): Promise<RuntimeLexiconPayload> {
  const [genericTitles, surnames, nerLexiconRules, promptRules] = await Promise.all([
    prisma.genericTitleRule.findMany({
      where  : { isActive: true },
      orderBy: [{ tier: "asc" }, { title: "asc" }],
      select : { title: true, tier: true, exemptInGenres: true }
    }),
    prisma.surnameRule.findMany({
      where: {
        isActive: true,
        OR: [
          { bookTypeId: null },
          ...(bookTypeKey ? [{ bookType: { key: bookTypeKey } }] : [])
        ]
      },
      orderBy: [{ isCompound: "desc" }, { priority: "desc" }, { surname: "asc" }],
      select : { surname: true, isCompound: true }
    }),
    prisma.nerLexiconRule.findMany({
      where: {
        isActive: true,
        OR: [
          { bookTypeId: null },
          ...(bookTypeKey ? [{ bookType: { key: bookTypeKey } }] : [])
        ]
      },
      orderBy: [{ ruleType: "asc" }, { sortOrder: "asc" }],
      select : { ruleType: true, content: true }
    }),
    prisma.promptExtractionRule.findMany({
      where: {
        isActive: true,
        OR: [
          { bookTypeId: null },
          ...(bookTypeKey ? [{ bookType: { key: bookTypeKey } }] : [])
        ]
      },
      orderBy: [{ ruleType: "asc" }, { sortOrder: "asc" }],
      select : { ruleType: true, content: true }
    })
  ]);

  return { genericTitles, surnames, nerLexiconRules, promptRules };
}
```

### 1-3. 修正 `buildRuntimeLexiconConfig` 数据来源

| 输出字段 | 修改前来源 | 修改后来源 |
| --- | --- | --- |
| `entityExtractionRules` | `extractionRules`（nerLexiconRule）→ 永远空 | `promptRules`（promptExtractionRule） |
| `relationshipExtractionRules` | `extractionRules`（nerLexiconRule）→ 永远空 | `promptRules`（promptExtractionRule） |
| `additionalRelationalSuffixes` | `extractionRules` ✅ | `nerLexiconRules`（仅重命名） |
| `softRelationalSuffixes` | `extractionRules` ✅ | `nerLexiconRules`（仅重命名） |
| `additionalTitlePatterns` | `extractionRules` ✅ | `nerLexiconRules`（仅重命名） |
| `additionalPositionPatterns` | `extractionRules` ✅ | `nerLexiconRules`（仅重命名） |

删除所有 `...payload.baseConfig` 展开和 `payload.baseConfig.xxx ?? []` 合并逻辑（因 `baseConfig` 字段已删除）。直接使用 DB 数据构建 `lexiconConfig`：

```typescript
const lexiconConfig: BookLexiconConfig = {
  safetyGenericTitles,
  defaultGenericTitles,
  surnameCompounds,
  surnameSingles,
  entityExtractionRules      : toUniqueList(entityExtractionRules),
  relationshipExtractionRules: toUniqueList(relationshipExtractionRules),
  additionalRelationalSuffixes: toUniqueList(hardBlockSuffixes),
  softRelationalSuffixes      : toUniqueList(softBlockSuffixes),
  additionalTitlePatterns     : toUniqueList(titleStems),
  additionalPositionPatterns  : toUniqueList(positionStems)
};
```

### 1-4. 删除 `loadBookTypeConfig`

该函数已是空壳（仅返回 `{}`），直接删除。同步清理 `loadAnalysisRuntimeConfig` 中对该函数的调用。

---

## Step 2：`lexicon.ts` — 删除硬编码，保留工具函数

### 2-1. 删除以下常量

```text
SAFETY_GENERIC_TITLE_VALUES       → 数据已在 genericTitleRule
DEFAULT_GENERIC_TITLE_VALUES      → 同上
HARD_BLOCK_SUFFIX_VALUES          → 数据已在 nerLexiconRule
SOFT_BLOCK_SUFFIX_VALUES          → 同上
UNIVERSAL_TITLE_STEM_VALUES       → 同上
DEFAULT_POSITION_STEM_VALUES      → 同上
COMPOUND_SURNAME_VALUES           → 数据已在 surnameRule
SINGLE_SURNAME_VALUES             → 同上
ENTITY_EXTRACTION_RULE_VALUES     → 数据已在 promptExtractionRule
RELATIONSHIP_EXTRACTION_RULE_VALUES → 同上
getDefaultEntityExtractionRules()   → 无消费者
getDefaultRelationshipExtractionRules() → 无消费者
```

### 2-2. `buildEffective*` 改为纯数据透传

所有函数不再合并硬编码基础值，仅使用 `bookConfig` 中的 DB 数据：

```typescript
// 修改前
export function buildEffectiveHardBlockSuffixes(bookConfig?: BookLexiconConfig): Set<string> {
  return new Set(toUniqueSortedList([
    ...HARD_BLOCK_SUFFIX_VALUES,                        // 删除
    ...(bookConfig?.additionalRelationalSuffixes ?? [])
  ]));
}

// 修改后
export function buildEffectiveHardBlockSuffixes(bookConfig?: BookLexiconConfig): Set<string> {
  return new Set(toUniqueSortedList(bookConfig?.additionalRelationalSuffixes ?? []));
}
```

同理适用于：`buildSafetyGenericTitles`、`buildDefaultGenericTitles`、`buildEffectiveSoftBlockSuffixes`、`buildEffectiveTitlePattern`、`buildEffectivePositionPattern`、`extractSurname`。

### 2-3. 保留的内容

- `BookLexiconConfig` 接口及所有类型定义
- `extractSurname()`（签名不变，删除硬编码 fallback，无 config 时返回 null）
- `formatRulesSection()`（无状态工具函数）
- `classifyPersonalization()`（纯规则函数）
- `buildEffective*` 系列函数签名（仅删除内部硬编码合并）
- `GENERIC_TITLES_PROMPT_LIMIT` 常量

---

## Step 3：`prompts.ts` — 清理 fallback + 修复 GENERIC_TITLES_EXAMPLE

### 3-1. 删除 `getDefault*` fallback

将 3 处 `?? getDefaultEntityExtractionRules()` 和 1 处 `?? getDefaultRelationshipExtractionRules()` 替换为 `?? []`：

```typescript
// 修改前
const entityRules = input.entityExtractionRules ?? getDefaultEntityExtractionRules();

// 修改后
const entityRules = input.entityExtractionRules ?? [];
```

删除对 `getDefaultEntityExtractionRules` / `getDefaultRelationshipExtractionRules` 的 import。

### 3-2. 修复 `GENERIC_TITLES_EXAMPLE` 模块级常量

当前代码：

```typescript
const GENERIC_TITLES_EXAMPLE = Array.from(buildEffectiveGenericTitles(undefined))
  .slice(0, GENERIC_TITLES_PROMPT_LIMIT)
  .join("、") + "等";
```

`buildEffectiveGenericTitles(undefined)` 删除硬编码后返回空集，导致此常量退化为 `"等"`。该常量在 4 处被引用，其中 `buildIndependentExtractionRulesText` 直接使用（无 `??` fallback），prompt 中泛称示例段将完全空白。

**修复**：将 `GENERIC_TITLES_EXAMPLE` 改为接受 `genericTitlesExample` 参数，并在 `buildIndependentExtractionRulesText` 的 `IndependentExtractionInput` 类型中新增该字段：

```typescript
// 删除模块级常量 GENERIC_TITLES_EXAMPLE

// IndependentExtractionInput 新增可选字段
export interface IndependentExtractionInput {
  chapterNo            : number;
  chapterTitle         : string;
  content              : string;
  entityExtractionRules?: readonly string[];
  genericTitlesExample? : string;   // 新增：来自 FullRuntimeKnowledge 的实际泛称示例
}

// buildIndependentExtractionRulesText 改为使用传入值
export function buildIndependentExtractionRulesText(
  input: Pick<IndependentExtractionInput, "entityExtractionRules" | "genericTitlesExample">
): string {
  const genericTitlesExample = input.genericTitlesExample ?? "";
  // ...
}
```

调用方 `ChapterAnalysisService` 已有 `genericTitlesExample`（来自 `FullRuntimeKnowledge`），按需传入即可。

---

## Step 4：`init-knowledge-base.ts` — 补齐 Phase 7 种子

新增 4 类种子处理（所有写入均幂等）：

### 4-1. `historical-figures.seed.json` → `HistoricalFigureEntry`

```typescript
// 每条：{ name, aliases, dynasty, category, description }
// 幂等：按 name 查找，存在则跳过
// reviewStatus = "VERIFIED"，isActive = true
for (const entry of historicalFiguresData.entries) {
  const existing = await prisma.historicalFigureEntry.findFirst({
    where: { name: entry.name }
  });
  if (!existing) {
    await prisma.historicalFigureEntry.create({
      data: {
        name        : entry.name,
        aliases     : entry.aliases,
        dynasty     : entry.dynasty ?? null,
        category    : entry.category,
        description : entry.description ?? null,
        reviewStatus: "VERIFIED",
        isActive    : true,
        source      : "IMPORTED"
      }
    });
  }
}
```

### 4-2. `name-pattern-rules.seed.json` → `NamePatternRule`

```typescript
// 每条：{ ruleType, pattern, action, description }
// 幂等：按 (ruleType, pattern) 组合查找
// reviewStatus = "VERIFIED"，isActive = true
for (const rule of namePatternData.entries) {
  const existing = await prisma.namePatternRule.findFirst({
    where: { ruleType: rule.ruleType, pattern: rule.pattern }
  });
  if (!existing) {
    await prisma.namePatternRule.create({
      data: {
        ruleType    : rule.ruleType,
        pattern     : rule.pattern,
        action      : rule.action,
        description : rule.description ?? null,
        reviewStatus: "VERIFIED",
        isActive    : true,
        source      : "IMPORTED"
      }
    });
  }
}
```

### 4-3. `relational-terms.seed.json` → `GenericTitleRule`（tier=RELATIONAL）

```typescript
// 每条：{ term, category }
// 幂等：按 title 查找，存在则跳过（不覆盖 SAFETY/DEFAULT 已有数据）
for (const entry of relationalTermsData.entries) {
  await prisma.genericTitleRule.upsert({
    where : { title: entry.term },
    create: { title: entry.term, tier: "RELATIONAL", source: "IMPORTED" },
    update: {}
  });
}
```

### 4-4. `classical-characters.seed.json` → `AliasPack` + `AliasEntry`

```typescript
// 结构：{ genres: [{ bookTypeKey, packName, scope, sourceDetail, entries: [{ canonicalName, aliases }] }] }
// 幂等：按 (bookTypeId, name) 查找 pack，存在则跳过整个 pack
for (const genre of classicalCharactersData.genres) {
  const bookType = await prisma.bookType.findFirst({ where: { key: genre.bookTypeKey } });
  if (!bookType) continue;

  const existingPack = await prisma.aliasPack.findFirst({
    where: { bookTypeId: bookType.id, name: genre.packName }
  });
  if (existingPack) continue;

  const pack = await prisma.aliasPack.create({
    data: {
      name        : genre.packName,
      scope       : genre.scope,
      bookTypeId  : bookType.id,
      sourceDetail: genre.sourceDetail,
      isActive    : true
    }
  });

  for (const entry of genre.entries) {
    await prisma.aliasEntry.create({
      data: {
        packId       : pack.id,
        canonicalName: entry.canonicalName,
        aliases      : entry.aliases,
        reviewStatus : "VERIFIED",
        confidence   : 1.0,
        source       : "IMPORTED"
      }
    });
  }
}
```

---

## Step 5：测试更新

### 5-1. `lexicon.test.ts`

删除所有依赖硬编码常量的断言（如"无 config 时返回 N 条硬编码后缀"）。改为：

- 无 config → 各 buildEffective* 返回空集 / null
- 有 config → 返回 config 中的 DB 数据

### 5-2. `load-book-knowledge.test.ts`

新增/扩展测试：

```typescript
it("DB 有 ENTITY 规则时 lexiconConfig.entityExtractionRules 包含规则内容", async () => {
  // mock prisma.promptExtractionRule.findMany 返回 [{ ruleType: "ENTITY", content: "规则1" }]
  // 断言 lexiconConfig.entityExtractionRules = ["规则1"]
});

it("DB 无 ENTITY 规则时 lexiconConfig.entityExtractionRules 为空数组", async () => {
  // mock 返回 []
  // 断言 lexiconConfig.entityExtractionRules = []
});
```

---

## 回归风险清单（实施前必须确认）

删除硬编码 fallback 后，以下函数在无 config 时行为改变，需确认所有调用点均传入有效 `bookConfig`：

| 函数 | 无 config 时旧行为 | 无 config 时新行为 |
| --- | --- | --- |
| `extractSurname()` | 使用硬编码姓氏表 | 返回 null |
| `buildSafetyGenericTitles()` | 返回硬编码安全泛称 | 返回空集 |
| `buildDefaultGenericTitles()` | 返回硬编码默认泛称 | 返回空集 |
| `buildEffectiveGenericTitles()` | 合并硬编码 | 返回空集 |
| `buildEffectiveHardBlockSuffixes()` | 包含硬编码后缀 | 返回空集 |
| `buildEffectiveSoftBlockSuffixes()` | 包含硬编码后缀 | 返回空集 |
| `buildEffectiveTitlePattern()` | 包含硬编码词干 | 返回 never-match regex |
| `buildEffectivePositionPattern()` | 包含硬编码词干 | 返回 never-match regex |

---

## 验收（DoD）

```bash
# 1. 类型检查
pnpm type-check

# 2. 测试（含覆盖率）
pnpm test

# 3. 回归确认
# - extractSurname 所有调用点均传入 bookConfig（grep 搜索确认）
# - lexicon.ts 中无硬编码数组常量残留

# 4. 种子幂等验证
npx tsx scripts/init-knowledge-base.ts  # 执行两次无报错

# 5. DB 数据验证（执行种子后）
# SELECT count(*) FROM historical_figure_entries WHERE review_status='VERIFIED';
# SELECT count(*) FROM name_pattern_rules WHERE review_status='VERIFIED';
# SELECT count(*) FROM generic_title_rules WHERE tier='RELATIONAL';
# SELECT count(*) FROM alias_packs WHERE source_detail='phase7.classical.seed';
```

---

## 不在本任务范围内

- `promptExtractionRule` 的 UI 批量管理功能 — 见 `04-16-kb-batch-ops-ui-fix`
- `promptExtractionRule` 的模型生成功能 — 见 `04-16-kb-model-generation`
- Neo4j 图谱数据同步
- 任何 Prisma schema 变更
