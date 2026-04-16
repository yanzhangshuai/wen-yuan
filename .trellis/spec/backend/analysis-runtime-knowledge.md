---
stage: mvp
---

# 分析运行时知识契约

## Scenario: DB-only Runtime Knowledge For Analysis

### 1. Scope / Trigger

- Trigger: 分析链路需要从知识库数据库加载词库、Prompt 抽取规则、别名包、历史人物、名字模式规则，并注入章节分析、两阶段实体解析与 PersonaResolver。
- Boundary: `src/server/modules/knowledge/load-book-knowledge.ts` 是唯一运行时知识网关；分析模块只能消费它产出的 `BookLexiconConfig` / `FullRuntimeKnowledge`。
- Rule: DB 无规则 = 运行时无规则。不得在 `lexicon.ts`、`prompts.ts`、Resolver 或 Pipeline 中补硬编码默认词库。

### 2. Signatures

```ts
export async function loadAnalysisRuntimeConfig(
  bookTypeKey: string | null | undefined,
  prisma: PrismaClient
): Promise<BookLexiconConfig>;

export async function loadFullRuntimeKnowledge(
  bookId: string,
  bookTypeKey: string | null | undefined,
  prisma: PrismaClient
): Promise<FullRuntimeKnowledge>;
```

Primary consumer signatures:

```ts
buildRosterDiscoveryRulesText(input: Pick<RosterDiscoveryInput, "genericTitlesExample" | "entityExtractionRules">): string;

buildChapterAnalysisRulesText(input: Pick<BuildPromptInput, "genericTitlesExample" | "entityExtractionRules" | "relationshipExtractionRules">): string;

buildIndependentExtractionRulesText(input: Pick<IndependentExtractionInput, "entityExtractionRules" | "genericTitlesExample">): string;
```

### 3. Contracts

Runtime DB mapping:

| DB source | Filter | Runtime field |
| --- | --- | --- |
| `genericTitleRule` | `tier === "SAFETY"` | `BookLexiconConfig.safetyGenericTitles` and `FullRuntimeKnowledge.safetyGenericTitles` |
| `genericTitleRule` | `tier === "DEFAULT"` | `BookLexiconConfig.defaultGenericTitles` and `FullRuntimeKnowledge.defaultGenericTitles` |
| `genericTitleRule` | `tier === "RELATIONAL"` | `FullRuntimeKnowledge.relationalTerms` |
| `surnameRule` | `isCompound === true` | `BookLexiconConfig.surnameCompounds` |
| `surnameRule` | `isCompound === false` | `BookLexiconConfig.surnameSingles` |
| `promptExtractionRule` | `ruleType === "ENTITY"` | `BookLexiconConfig.entityExtractionRules` |
| `promptExtractionRule` | `ruleType === "RELATIONSHIP"` | `BookLexiconConfig.relationshipExtractionRules` |
| `nerLexiconRule` | `ruleType === "HARD_BLOCK_SUFFIX"` | `BookLexiconConfig.additionalRelationalSuffixes` and `FullRuntimeKnowledge.hardBlockSuffixes` |
| `nerLexiconRule` | `ruleType === "SOFT_BLOCK_SUFFIX"` | `BookLexiconConfig.softRelationalSuffixes` and `FullRuntimeKnowledge.softBlockSuffixes` |
| `nerLexiconRule` | `ruleType === "TITLE_STEM"` | `BookLexiconConfig.additionalTitlePatterns` and `FullRuntimeKnowledge.titlePatterns` |
| `nerLexiconRule` | `ruleType === "POSITION_STEM"` | `BookLexiconConfig.additionalPositionPatterns` and `FullRuntimeKnowledge.positionPatterns` |

Empty DB behavior:

- `buildEffectiveGenericTitles(undefined)` returns an empty set.
- `buildSafetyGenericTitles(undefined)` returns an empty set.
- `buildDefaultGenericTitles(undefined)` returns an empty set.
- `extractSurname(name, undefined)` returns `null`.
- Prompt builders use `input.entityExtractionRules ?? []` and `input.relationshipExtractionRules ?? []`; they must not import or call default-rule helpers.
- `genericTitlesExample` is caller-provided from runtime knowledge. Missing value becomes `""`, not a module-level fallback.

Phase 7 seed contract:

- `prisma/seed.ts` must call `seedKnowledgePhase7(prisma)` after Phase 6.
- `seedKnowledgePhase7()` imports:
  - `data/knowledge-base/historical-figures.seed.json` into `historicalFigureEntry`
  - `data/knowledge-base/name-pattern-rules.seed.json` into `namePatternRule`
  - `data/knowledge-base/relational-terms.seed.json` into `genericTitleRule` with `tier: "RELATIONAL"`
  - `data/knowledge-base/classical-characters.seed.json` into `aliasPack` / `aliasEntry`

### 4. Validation & Error Matrix

| Case | Expected behavior | Required assertion |
| --- | --- | --- |
| `promptExtractionRule.findMany()` returns `[]` | Entity/relationship prompt rules are empty; no hardcoded defaults appear | Prompt tests assert explicit rule input when rules are expected |
| `nerLexiconRule` contains `ENTITY` / `RELATIONSHIP` rows | They are ignored for prompt extraction rules | Loader tests populate prompt rules through `promptExtractionRule` only |
| `bookTypeKey` is `null` / `undefined` | Load global active rules only | Loader tests pass null and expect no crash / no fallback |
| No surname config is supplied | `extractSurname()` returns `null` | `lexicon.test.ts` asserts no hardcoded surname fallback |
| Invalid `namePatternRule.pattern` | Skip rule, log warning, continue loading knowledge | `load-book-knowledge.test.ts` covers length, nested quantifier, syntax, compile timeout |
| Runtime knowledge cache hit | Same `bookId` and `bookTypeKey` returns cached object | Loader cache test asserts no extra DB reads |

### 5. Good/Base/Bad Cases

Good:

```ts
const lexiconConfig = await loadAnalysisRuntimeConfig(book.bookType?.key, prisma);
const genericTitlesExample = Array.from(buildEffectiveGenericTitles(lexiconConfig))
  .slice(0, GENERIC_TITLES_PROMPT_LIMIT)
  .join("、") + "等";

const prompt = buildChapterAnalysisPrompt({
  ...input,
  genericTitlesExample,
  entityExtractionRules      : lexiconConfig.entityExtractionRules,
  relationshipExtractionRules: lexiconConfig.relationshipExtractionRules
});
```

Base:

```ts
const rules = buildChapterAnalysisRulesText({
  genericTitlesExample       : "",
  entityExtractionRules      : [],
  relationshipExtractionRules: []
});
```

Bad:

```ts
const entityRules = input.entityExtractionRules ?? getDefaultEntityExtractionRules();
```

### 6. Tests Required

Required command before finishing runtime knowledge changes:

```bash
pnpm exec vitest run \
  src/server/modules/knowledge/load-book-knowledge.test.ts \
  src/server/modules/analysis/config/lexicon.test.ts \
  src/server/modules/analysis/services/prompts.test.ts \
  src/server/modules/analysis/services/PersonaResolver.test.ts \
  src/server/modules/analysis/services/GlobalEntityResolver.test.ts \
  src/server/modules/analysis/services/ChapterAnalysisService.test.ts \
  src/server/modules/analysis/jobs/runAnalysisJob.test.ts
```

Required assertion points:

- `load-book-knowledge.test.ts`: `promptExtractionRule` rows populate `entityExtractionRules` / `relationshipExtractionRules`; `nerLexiconRule` rows only populate suffix/stem fields.
- `lexicon.test.ts`: every `buildEffective*` helper returns empty output when config is missing.
- `prompts.test.ts`: tests that need generic title examples or extraction rules pass them explicitly.
- `PersonaResolver.test.ts`: resolver can read `lexiconConfig` from either direct input or `runtimeKnowledge.lexiconConfig`.
- `GlobalEntityResolver.test.ts`: surname grouping passes runtime `lexiconConfig` to `extractSurname`.

### 7. Wrong vs Correct

#### Wrong

```ts
// `[]` does not trigger `??`, so this silently produces an empty rules section
// when the caller has already supplied an empty array from the wrong DB table.
const entityRules = input.entityExtractionRules ?? getDefaultEntityExtractionRules();
```

#### Correct

```ts
const entityRules = input.entityExtractionRules ?? [];
```

#### Wrong

```ts
// ENTITY and RELATIONSHIP do not belong to nerLexiconRule.
const entityExtractionRules = payload.nerLexiconRules
  .filter((item) => item.ruleType === "ENTITY")
  .map((item) => item.content);
```

#### Correct

```ts
const entityExtractionRules = payload.promptRules
  .filter((item) => item.ruleType === "ENTITY")
  .map((item) => item.content);
```
