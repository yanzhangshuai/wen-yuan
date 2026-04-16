# 知识库加载层重构与管道断链修复

**创建日期**：2026-04-16
**优先级**：P0（断链修复）+ P1（种子入库）+ P2（RELATIONAL 层级）
**范围**：backend（核心 3 文件 + 种子脚本 + 测试）

---

## 1. 背景与根因

### 1.1 问题现象

1. **P0 — PromptExtractionRule 断链**：管理后台对 `prompt_extraction_rules` 表（ENTITY / RELATIONSHIP 类型）的所有编辑对分析管道完全无效。
2. **P1 — Phase 7 种子缺口**：`historical-figures.seed.json`、`name-pattern-rules.seed.json`、`classical-characters.seed.json`、`relational-terms.seed.json` 四类种子文件无入库路径。
3. **P2 — RELATIONAL 层级空置**：代码中有 `tier === "RELATIONAL"` 过滤逻辑，但 DB 中无对应数据。

### 1.2 根因追溯

KB 架构重构将提示词注入规则从 `nerLexiconRule` 独立拆分为 `promptExtractionRule` 表：

| 表 | ruleType 取值 | 用途 |
|----|-------------|------|
| `ner_lexicon_rules` | HARD_BLOCK_SUFFIX, SOFT_BLOCK_SUFFIX, TITLE_STEM, POSITION_STEM | 配置 NER 评分算法 |
| `prompt_extraction_rules` | ENTITY, RELATIONSHIP | 注入 AI Prompt |

但 `load-book-knowledge.ts` 的 `loadRuntimeLexiconPayload` 未同步更新，仍只查询 `nerLexiconRule`。随后 `buildRuntimeLexiconConfig` 对 `extractionRules`（来自 `nerLexiconRule`）过滤 `ENTITY` / `RELATIONSHIP`——这两个 ruleType 在 `nerLexiconRule` 中不存在，过滤结果永远为空数组 `[]`。

**关键**：空数组 `[]` 是 truthy 值。`prompts.ts` 中的 `input.entityExtractionRules ?? getDefaultEntityExtractionRules()` 不会触发 `??` fallback，导致 prompt 中实体/关系规则段实际为空。

### 1.3 硬编码双轨问题

`lexicon.ts` 的 `buildEffective*` 系列函数始终合并硬编码常量 + DB 附加值。例如：

```typescript
export function buildEffectiveHardBlockSuffixes(bookConfig?: BookLexiconConfig): Set<string> {
  return new Set(toUniqueSortedList([
    ...HARD_BLOCK_SUFFIX_VALUES,                        // 始终包含硬编码
    ...(bookConfig?.additionalRelationalSuffixes ?? [])  // 附加 DB 值
  ]));
}
```

后果：DB 删除某条规则不会真正生效（硬编码层仍然存在），无法完全信任 DB 为唯一数据源。

---

## 2. 设计目标

- `load-book-knowledge.ts` 成为**唯一的知识数据网关**，统一查询所有知识表
- `lexicon.ts` 退化为**纯类型定义 + 无状态工具函数**，不再持有任何数据常量
- 分析管道完全信任 DB：DB 无规则 = 无规则，不 fallback 到硬编码
- Phase 7 种子全部入库，消除数据缺口

---

## 3. 详细设计

### 3.1 `load-book-knowledge.ts` — 统一 Payload 与查询

#### 3.1.1 新的 `RuntimeLexiconPayload` 接口

```typescript
interface RuntimeLexiconPayload {
  genericTitles  : Array<{ title: string; tier: string; exemptInGenres: string[] }>;
  surnames       : Array<{ surname: string; isCompound: boolean }>;
  nerLexiconRules: Array<{ ruleType: string; content: string }>;  // 原 extractionRules，重命名
  promptRules    : Array<{ ruleType: string; content: string }>;  // 新增：来自 promptExtractionRule
}
```

变更：
- 删除 `baseConfig` 字段（`loadBookTypeConfig` 已是空壳，返回 `{}`，直接内联删除）
- `extractionRules` 重命名为 `nerLexiconRules`，消除歧义
- 新增 `promptRules` 字段

#### 3.1.2 查询扩展

`loadRuntimeLexiconPayload` 从 3 路并发扩展到 4 路：

```typescript
const [genericTitles, surnames, nerLexiconRules, promptRules] = await Promise.all([
  prisma.genericTitleRule.findMany({
    where  : { isActive: true },
    orderBy: [{ tier: "asc" }, { title: "asc" }],
    select : { title: true, tier: true, exemptInGenres: true }
  }),
  prisma.surnameRule.findMany({
    where: {
      isActive: true,
      OR: [{ bookTypeId: null }, ...(bookTypeKey ? [{ bookType: { key: bookTypeKey } }] : [])]
    },
    orderBy: [{ isCompound: "desc" }, { priority: "desc" }, { surname: "asc" }],
    select : { surname: true, isCompound: true }
  }),
  prisma.nerLexiconRule.findMany({
    where: {
      isActive: true,
      OR: [{ bookTypeId: null }, ...(bookTypeKey ? [{ bookType: { key: bookTypeKey } }] : [])]
    },
    orderBy: [{ ruleType: "asc" }, { sortOrder: "asc" }],
    select : { ruleType: true, content: true }
  }),
  prisma.promptExtractionRule.findMany({
    where: {
      isActive: true,
      OR: [{ bookTypeId: null }, ...(bookTypeKey ? [{ bookType: { key: bookTypeKey } }] : [])]
    },
    orderBy: [{ ruleType: "asc" }, { sortOrder: "asc" }],
    select : { ruleType: true, content: true }
  })
]);
```

#### 3.1.3 `buildRuntimeLexiconConfig` 数据来源修正

| 输出字段 | 修改前来源 | 修改后来源 |
|---|---|---|
| `entityExtractionRules` | `extractionRules`（nerLexiconRule）→ 永远空 | `promptRules`（promptExtractionRule） |
| `relationshipExtractionRules` | `extractionRules`（nerLexiconRule）→ 永远空 | `promptRules`（promptExtractionRule） |
| `additionalRelationalSuffixes`（硬阻断后缀） | `extractionRules` ✅ | `nerLexiconRules`（仅重命名） |
| `softRelationalSuffixes`（软阻断后缀） | `extractionRules` ✅ | `nerLexiconRules`（仅重命名） |
| `additionalTitlePatterns` / `additionalPositionPatterns` | `extractionRules` ✅ | `nerLexiconRules`（仅重命名） |

构建逻辑中不再有 `payload.baseConfig` 合并（因 `baseConfig` 已删除）。`buildRuntimeLexiconConfig` 中原来的 `...payload.baseConfig` 展开和各字段的 `payload.baseConfig.xxx ?? []` 合并逻辑全部移除，直接使用 DB 数据构建 `lexiconConfig`。

#### 3.1.4 删除 `loadBookTypeConfig`

该函数已是空壳（返回 `{}`），直接删除。`loadAnalysisRuntimeConfig` 中对应的调用也一并清理。

### 3.2 `lexicon.ts` — 删除硬编码，保留工具函数

#### 3.2.1 删除的内容

| 常量/函数 | 原因 |
|---|---|
| `SAFETY_GENERIC_TITLE_VALUES` | 数据已在 `genericTitleRule` 表 |
| `DEFAULT_GENERIC_TITLE_VALUES` | 同上 |
| `HARD_BLOCK_SUFFIX_VALUES` | 数据已在 `nerLexiconRule` 表 |
| `SOFT_BLOCK_SUFFIX_VALUES` | 同上 |
| `UNIVERSAL_TITLE_STEM_VALUES` | 同上 |
| `DEFAULT_POSITION_STEM_VALUES` | 同上 |
| `COMPOUND_SURNAME_VALUES` | 数据已在 `surnameRule` 表 |
| `SINGLE_SURNAME_VALUES` | 同上 |
| `ENTITY_EXTRACTION_RULE_VALUES` | 数据已在 `promptExtractionRule` 表 |
| `RELATIONSHIP_EXTRACTION_RULE_VALUES` | 同上 |
| `getDefaultEntityExtractionRules()` | 无消费者 |
| `getDefaultRelationshipExtractionRules()` | 无消费者 |

#### 3.2.2 `buildEffective*` 函数改为纯数据透传

所有 `buildEffective*` 函数不再合并硬编码基础值，仅使用 `bookConfig` 中的 DB 数据：

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

#### 3.2.3 保留的内容

- `BookLexiconConfig` 接口、`MentionPersonalizationEvidence`、`PersonalizationTier`、`EffectiveLexicon` 类型
- `extractSurname()`（签名不变，删除硬编码 fallback，无 config 时返回 null）
- `formatRulesSection()`（无状态工具函数）
- `classifyPersonalization()`（纯规则函数）
- `buildEffective*` 系列函数（签名不变，仅删除硬编码合并）
- `GENERIC_TITLES_PROMPT_LIMIT` 常量

### 3.3 `prompts.ts` — 清理 fallback

3 处 `getDefaultEntityExtractionRules()` 调用和 1 处 `getDefaultRelationshipExtractionRules()` 调用替换为 `?? []`：

```typescript
// 修改前
const entityRules = input.entityExtractionRules ?? getDefaultEntityExtractionRules();

// 修改后
const entityRules = input.entityExtractionRules ?? [];
```

同时删除对应的 import 语句。

### 3.4 Phase 7 种子入库 — 扩展 `init-knowledge-base.ts`

#### 3.4.1 新增 4 类种子处理

| 序号 | 种子文件 | 目标表 | 幂等策略 |
|---|---|---|---|
| 1 | `historical-figures.seed.json` | `HistoricalFigureEntry` | upsert by `name` |
| 2 | `name-pattern-rules.seed.json` | `NamePatternRule` | upsert by `(ruleType, pattern)` |
| 3 | `classical-characters.seed.json` | `AliasEntry`（通过 `AliasPack`） | 跳过已存在的 pack |
| 4 | `relational-terms.seed.json` | `GenericTitleRule`（tier=RELATIONAL） | upsert by `title` |

#### 3.4.2 各种子详细处理

**historical-figures.seed.json**：
- 每条：`{ name, aliases, dynasty, category, description }`
- 幂等：按 `name` 查找，存在则跳过
- 初始 `reviewStatus = "VERIFIED"`（种子数据已审核）

**name-pattern-rules.seed.json**：
- 每条：`{ ruleType, pattern, action, description }`
- 幂等：按 `(ruleType, pattern)` 组合查找
- 初始 `reviewStatus = "VERIFIED"`

**classical-characters.seed.json**：
- Phase 7 结构别名数据，按 genre 分组
- 复用现有 AliasPack 创建逻辑
- 幂等：按 `(bookTypeId, name)` 查找 pack

**relational-terms.seed.json**：
- 115 条亲属/社会称谓（KINSHIP / SOCIAL / GENERIC_ROLE）
- 写入 `GenericTitleRule` 表，`tier = "RELATIONAL"`
- 幂等：按 `title` 查找，存在则跳过（不覆盖 SAFETY/DEFAULT 中已有的）

---

## 4. 影响范围与文件清单

### 4.1 核心改动文件

| 文件 | 改动类型 | 说明 |
|---|---|---|
| `src/server/modules/knowledge/load-book-knowledge.ts` | 重构 | 新增 promptExtractionRule 查询、重命名字段、删除 loadBookTypeConfig |
| `src/server/modules/analysis/config/lexicon.ts` | 清理 | 删除所有硬编码常量、修改 buildEffective* 函数 |
| `src/server/modules/analysis/services/prompts.ts` | 清理 | 删除 getDefault* fallback，替换为 `?? []` |
| `scripts/init-knowledge-base.ts` | 扩展 | 新增 4 类 Phase 7 种子处理 |

### 4.2 测试文件

| 文件 | 改动类型 |
|---|---|
| `src/server/modules/analysis/config/lexicon.test.ts` | 更新：删除硬编码断言，改为 DB 数据驱动 |
| `src/server/modules/knowledge/load-book-knowledge.test.ts` | 新增或扩展：覆盖 promptRules 路由 |

### 4.3 回归搜索清单

实施前需确认以下函数的所有调用点都传入了 `bookConfig`：

- `extractSurname()` — 无 config 时将返回 null（之前有硬编码兜底）
- `buildSafetyGenericTitles()` — 无 config 时返回空集
- `buildDefaultGenericTitles()` — 无 config 时返回空集
- `buildEffectiveGenericTitles()` — 无 config 时返回空集
- `buildEffectiveHardBlockSuffixes()` — 无 config 时返回空集
- `buildEffectiveSoftBlockSuffixes()` — 无 config 时返回空集
- `buildEffectiveTitlePattern()` — 无 config 时返回永不匹配正则
- `buildEffectivePositionPattern()` — 无 config 时返回永不匹配正则

---

## 5. 验收标准

| 验收项 | 方法 |
|---|---|
| `pnpm type-check` 通过 | CI |
| `pnpm test` 全量通过 | CI |
| DB 有 ENTITY 规则时 prompt 包含规则文本 | 单元测试 |
| DB 无 ENTITY 规则时 prompt 规则段为空（不 fallback） | 单元测试 |
| `init-knowledge-base.ts` 幂等运行两次无报错 | 手动执行 |
| Phase 7 种子入库后 DB 记录数与 JSON 一致 | 手动查询 |
| `extractSurname` 所有调用点均传入有效 config | 代码搜索确认 |

---

## 6. 对 Trellis 04-16-kb-prompt-rule-pipeline-fix 的修正

该任务的诊断方向正确，但有一个关键细节错误：

**原结论**：当 `entityExtractionRules` 为空时，`prompts.ts` fallback 到 `getDefaultEntityExtractionRules()` 硬编码默认值。

**实际行为**：`buildRuntimeLexiconConfig` 生成的 `entityExtractionRules` 是空数组 `[]`（非 `null`/`undefined`）。JavaScript 的 `??` 操作符不对空数组触发 fallback。因此 prompt 中实体/关系规则段实际为空，而非回退到硬编码默认值。

本设计的修复方案包含了该任务的全部修改点，且范围更广（一并清理硬编码双轨问题和补齐 Phase 7 种子）。
