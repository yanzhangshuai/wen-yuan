# 修复 PromptExtractionRule 未接入分析管道的架构断链

**创建日期**：2026-04-16  
**执行人**：codex-agent  
**优先级**：P1  
**类型**：bug fix  
**范围**：backend（单文件）

---

## 背景与根因

### 问题现象

所有通过管理后台 UI 编辑、启停、AI 生成的 `PromptExtractionRule`（ENTITY / RELATIONSHIP 类型）对分析管道**完全无效**。分析管道实际使用的是 `src/server/modules/analysis/config/lexicon.ts` 里的硬编码默认值，而非数据库中的规则。

### 根因追溯

KB 架构重构将提示词注入规则从 `nerLexiconRule` 独立拆分为 `promptExtractionRule` 表：

| 表 | ruleType 取值 | 用途 |
|----|-------------|------|
| `ner_lexicon_rules` | HARD_BLOCK_SUFFIX, SOFT_BLOCK_SUFFIX, TITLE_STEM, POSITION_STEM | 配置 NER 评分算法 |
| `prompt_extraction_rules` | ENTITY, RELATIONSHIP | 注入 AI Prompt |

但 `load-book-knowledge.ts` 的 `loadRuntimeLexiconPayload` 未同步更新，仍只查询 `nerLexiconRule`：

```typescript
// 当前实现（有问题）
const [genericTitles, surnames, extractionRules] = await Promise.all([
  prisma.genericTitleRule.findMany(...),
  prisma.surnameRule.findMany(...),
  prisma.nerLexiconRule.findMany(...)   // ← 只查这张表
]);
```

随后 `buildRuntimeLexiconConfig` 对 `extractionRules`（来自 `nerLexiconRule`）过滤 `ruleType === "ENTITY"` 和 `ruleType === "RELATIONSHIP"`——但这两个 ruleType 在 `nerLexiconRule` 中根本不存在，过滤结果永远为空数组。

```typescript
// 当前实现（永远返回空数组）
const entityExtractionRules = toUniqueList(payload.extractionRules
  .filter((item) => item.ruleType === "ENTITY")   // ← nerLexiconRule 无此类型
  .map((item) => item.content));

const relationshipExtractionRules = toUniqueList(payload.extractionRules
  .filter((item) => item.ruleType === "RELATIONSHIP")   // ← nerLexiconRule 无此类型
  .map((item) => item.content));
```

当 `entityExtractionRules` / `relationshipExtractionRules` 为空时，`prompts.ts` fallback 到 `getDefaultEntityExtractionRules()` / `getDefaultRelationshipExtractionRules()`（`lexicon.ts` 硬编码常量）。

**碰巧** Phase 6 种子数据内容与这两个硬编码默认值完全相同，所以分析结果目前是正确的——但这是"蒙对了"，而不是正确工作。任何对 `promptExtractionRule` 的修改（新增、调整顺序、模型生成）都没有实际效果。

---

## 修复方案

**只改一个文件**：`src/server/modules/knowledge/load-book-knowledge.ts`

### Step 1：更新 `RuntimeLexiconPayload` interface

在 `RuntimeLexiconPayload` 接口新增 `promptRules` 字段，专门承载来自 `promptExtractionRule` 表的数据：

```typescript
interface RuntimeLexiconPayload {
  baseConfig     : BookLexiconConfig;
  genericTitles  : Array<{ title: string; tier: string }>;
  surnames       : Array<{ surname: string; isCompound: boolean }>;
  extractionRules: Array<{ ruleType: string; content: string }>;  // 来自 nerLexiconRule
  promptRules    : Array<{ ruleType: string; content: string }>;  // 来自 promptExtractionRule
}
```

### Step 2：在 `loadRuntimeLexiconPayload` 新增查询

将 `Promise.all` 扩展为 4 个并发查询，新增对 `promptExtractionRule` 的查询：

```typescript
async function loadRuntimeLexiconPayload(
  bookTypeKey: string | null,
  prisma: PrismaClient
): Promise<RuntimeLexiconPayload> {
  const baseConfig = bookTypeKey ? loadBookTypeConfig(bookTypeKey, prisma) : {};

  const [genericTitles, surnames, extractionRules, promptRules] = await Promise.all([
    prisma.genericTitleRule.findMany({
      where  : { isActive: true },
      orderBy: [{ tier: "asc" }, { title: "asc" }],
      select : { title: true, tier: true }
    }),
    prisma.surnameRule.findMany({
      where: {
        isActive: true,
        OR      : [
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
        OR      : [
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
        OR      : [
          { bookTypeId: null },
          ...(bookTypeKey ? [{ bookType: { key: bookTypeKey } }] : [])
        ]
      },
      orderBy: [{ ruleType: "asc" }, { sortOrder: "asc" }],
      select : { ruleType: true, content: true }
    })
  ]);

  return {
    baseConfig,
    genericTitles,
    surnames,
    extractionRules,
    promptRules
  };
}
```

### Step 3：修正 `buildRuntimeLexiconConfig` 的数据来源

将 ENTITY / RELATIONSHIP 的数据来源从 `payload.extractionRules` 改为 `payload.promptRules`，同时保留 HARD_BLOCK_SUFFIX / SOFT_BLOCK_SUFFIX / TITLE_STEM / POSITION_STEM 仍从 `payload.extractionRules` 读取：

```typescript
function buildRuntimeLexiconConfig(payload: RuntimeLexiconPayload): RuntimeLexiconBuildResult {
  const safetyGenericTitles = toUniqueList(payload.genericTitles
    .filter((item) => item.tier === "SAFETY")
    .map((item) => item.title));

  const defaultGenericTitles = toUniqueList(payload.genericTitles
    .filter((item) => item.tier === "DEFAULT")
    .map((item) => item.title));

  const relationalTermTitles = toUniqueList(payload.genericTitles
    .filter((item) => item.tier === "RELATIONAL")
    .map((item) => item.title));

  const surnameCompounds = toUniqueList(payload.surnames
    .filter((item) => item.isCompound)
    .map((item) => item.surname));

  const surnameSingles = toUniqueList(payload.surnames
    .filter((item) => !item.isCompound)
    .map((item) => item.surname));

  // ↓ 修复：从 promptRules（promptExtractionRule 表）读取，而非 nerLexiconRule
  const entityExtractionRules = toUniqueList(payload.promptRules
    .filter((item) => item.ruleType === "ENTITY")
    .map((item) => item.content));

  const relationshipExtractionRules = toUniqueList(payload.promptRules
    .filter((item) => item.ruleType === "RELATIONSHIP")
    .map((item) => item.content));

  // ↓ 不变：nerLexiconRule 的 4 个类型
  const hardBlockSuffixes = toUniqueList(payload.extractionRules
    .filter((item) => item.ruleType === "HARD_BLOCK_SUFFIX")
    .map((item) => item.content));

  const softBlockSuffixes = toUniqueList(payload.extractionRules
    .filter((item) => item.ruleType === "SOFT_BLOCK_SUFFIX")
    .map((item) => item.content));

  const titleStems = toUniqueList(payload.extractionRules
    .filter((item) => item.ruleType === "TITLE_STEM")
    .map((item) => item.content));

  const positionStems = toUniqueList(payload.extractionRules
    .filter((item) => item.ruleType === "POSITION_STEM")
    .map((item) => item.content));

  const lexiconConfig: BookLexiconConfig = {
    ...payload.baseConfig,
    safetyGenericTitles,
    defaultGenericTitles,
    surnameCompounds,
    surnameSingles,
    entityExtractionRules       : toUniqueList([...(payload.baseConfig.entityExtractionRules ?? []), ...entityExtractionRules]),
    relationshipExtractionRules : toUniqueList([...(payload.baseConfig.relationshipExtractionRules ?? []), ...relationshipExtractionRules]),
    additionalRelationalSuffixes: toUniqueList([
      ...(payload.baseConfig.additionalRelationalSuffixes ?? []),
      ...hardBlockSuffixes
    ]),
    softRelationalSuffixes: toUniqueList([
      ...(payload.baseConfig.softRelationalSuffixes ?? []),
      ...softBlockSuffixes
    ]),
    additionalTitlePatterns: toUniqueList([
      ...(payload.baseConfig.additionalTitlePatterns ?? []),
      ...titleStems
    ]),
    additionalPositionPatterns: toUniqueList([
      ...(payload.baseConfig.additionalPositionPatterns ?? []),
      ...positionStems
    ])
  };

  return {
    lexiconConfig,
    safetyGenericTitles,
    defaultGenericTitles,
    relationalTermTitles,
    hardBlockSuffixes,
    softBlockSuffixes,
    titleStems,
    positionStems
  };
}
```

---

## 验收（DoD）

```bash
# 1. 类型检查
pnpm type-check

# 2. 测试
pnpm test

# 3. 逻辑验证
# 检查修复后 entityExtractionRules / relationshipExtractionRules 不再为空：
# - 确认 loadRuntimeLexiconPayload 同时查询 nerLexiconRule 和 promptExtractionRule
# - 确认 buildRuntimeLexiconConfig 的 entityExtractionRules 来源为 promptRules
# - 如果 promptExtractionRule 表有 isActive=true 的 ENTITY 记录，
#   则 lexiconConfig.entityExtractionRules 应包含这些内容
```

---

## 不在本任务范围内

- `relationalTerms` 无种子数据的问题（Phase 7 种子脚本缺失）— 可另立任务
- Phase 7 孤立种子文件（historical-figures / name-pattern-rules / classical-characters / relational-terms）— 可另立任务
- `promptExtractionRule` 的 UI 管理功能 — 见 `04-16-kb-batch-ops-ui-fix`
- `promptExtractionRule` 的模型生成功能 — 见 `04-16-kb-model-generation`
