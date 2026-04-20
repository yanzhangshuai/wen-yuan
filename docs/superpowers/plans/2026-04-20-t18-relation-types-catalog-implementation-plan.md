# T18 Relation Types Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a KB v2 backed relation-type governance layer that keeps `relationTypeKey` open-string, ships common presets, supports synonym/negative lookup, and allows reviewed custom relations to be promoted into reusable catalog knowledge.

**Architecture:** Implement a focused `knowledge-v2/relation-types` module instead of adding a new database enum or a parallel `relation_types` table. The module compiles `relation taxonomy rule`, `relation label mapping rule`, and `relation negative rule` knowledge items plus code presets into one runtime/review catalog, then Stage A+ consumes that catalog for relation normalization while later review APIs and relation editor APIs can reuse the same loader.

**Tech Stack:** TypeScript strict, Vitest, Zod, existing KB v2 repository/runtime contracts, existing T07 Stage A+ relation normalization flow

---

## Source Of Truth

- Architecture spec: `docs/superpowers/specs/2026-04-18-evidence-review-architecture-rewrite-design.md` §5.2, §7.3, §8.3, §9.4, §9.5, §9.6, §13.2
- Task doc: `docs/superpowers/tasks/2026-04-18-evidence-review/18-relation-types-catalog.md`
- Runbook: `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- Historical PRD: `.trellis/tasks/04-18-evidence-review-18-relation-types-catalog/prd.md`
- Upstream completed work:
  - `src/server/modules/knowledge-v2/base-types.ts`
  - `src/server/modules/knowledge-v2/payload-schemas.ts`
  - `src/server/modules/knowledge-v2/repository.ts`
  - `src/server/modules/knowledge-v2/runtime-loader.ts`
  - `src/server/modules/knowledge-v2/promotion.ts`
  - `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/relation-normalization.ts`
  - `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/KnowledgeRecallStage.ts`

## Scope Constraints

- Do not add a Prisma enum for `relationTypeKey`.
- Do not create a new `relation_types` table in this task. KB v2 knowledge objects are the governance truth source.
- Do not require a database migration to add a new business relation type.
- Do not silently rewrite `relation_claims.relationLabel`; normalization only returns suggestions while preserving the original label.
- Do not implement review routes or UI in T18. Expose reusable module APIs that T12/T14 can call later.
- Do not refactor unrelated KB v2 knowledge families. T18 is limited to relation taxonomy, relation mapping, and relation negative rules.

## Current Repo Facts

- `src/server/modules/analysis/claims/base-types.ts` already keeps `relationTypeKey` as an open trimmed string.
- `src/server/modules/knowledge-v2/payload-schemas.ts` already supports:
  - `relation taxonomy rule`
  - `relation label mapping rule`
  - `relation negative rule`
- `src/server/modules/knowledge-v2/promotion.ts` already promotes accepted claims into knowledge items with scope/version/review metadata.
- `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/relation-normalization.ts` currently reads raw compiled relation rule arrays directly from Stage A+ knowledge adapter output.
- `src/server/modules/knowledge-v2/runtime-loader.ts` only exposes `VERIFIED` and optional `PENDING` runtime items; it does not expose `DISABLED`, so review-side relation catalog loading needs its own query path.
- T18 acceptance explicitly requires disabled relation types, preset/custom/promotion flows, and “no enum migration requirement”, so the safest implementation is to stay entirely inside existing KB v2 tables.

## File Structure

- Create `src/server/modules/knowledge-v2/relation-types/contracts.ts`
  - Responsibility: relation catalog DTOs, zod parsers, key/label normalization helpers, and serializable runtime/review shapes.
- Create `src/server/modules/knowledge-v2/relation-types/contracts.test.ts`
  - Responsibility: lock open-string key policy, enabled/disabled semantics, and schema guards.
- Create `src/server/modules/knowledge-v2/relation-types/preset-registry.ts`
  - Responsibility: system preset registry for common relation types and aliases. No database access.
- Create `src/server/modules/knowledge-v2/relation-types/preset-registry.test.ts`
  - Responsibility: prove presets are stable, non-duplicated, and serializable.
- Create `src/server/modules/knowledge-v2/relation-types/catalog.ts`
  - Responsibility: compile presets + KB items into one relation catalog and expose suggestion / negative lookup helpers.
- Create `src/server/modules/knowledge-v2/relation-types/catalog.test.ts`
  - Responsibility: prove scope precedence, disabled handling, synonym mapping, and negative-rule lookup.
- Create `src/server/modules/knowledge-v2/relation-types/loader.ts`
  - Responsibility: load relation knowledge items from KB v2 repository for runtime or review modes, then compile catalog.
- Create `src/server/modules/knowledge-v2/relation-types/loader.test.ts`
  - Responsibility: prove repository query filters, scope chain, and review-state selection including `DISABLED`.
- Create `src/server/modules/knowledge-v2/relation-types/promotion.ts`
  - Responsibility: relation-specific wrapper around generic KB promotion for taxonomy and observed-label mapping promotion.
- Create `src/server/modules/knowledge-v2/relation-types/promotion.test.ts`
  - Responsibility: prove accepted custom relation promotion and optional mapping promotion.
- Create `src/server/modules/knowledge-v2/relation-types/index.ts`
  - Responsibility: barrel export for runtime, review, and later UI/API consumption.
- Modify `src/server/modules/knowledge-v2/index.ts`
  - Responsibility: export relation-types module from KB v2 public surface.
- Modify `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/relation-normalization.ts`
  - Responsibility: stop inspecting raw relation rule arrays directly; consume the compiled relation catalog helper.
- Modify `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/relation-normalization.test.ts`
  - Responsibility: re-lock raw-label preservation, preset/custom suggestion behavior, and disabled/negative rule handling against the new catalog API.
- Modify `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/KnowledgeRecallStage.ts`
  - Responsibility: compile a relation catalog from the loaded KB bundle and pass it to relation normalization.
- Modify `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/KnowledgeRecallStage.test.ts`
  - Responsibility: prove Stage A+ passes relation catalog input and still records cost-free rule runs.
- Modify `docs/superpowers/tasks/2026-04-18-evidence-review/18-relation-types-catalog.md`
  - Responsibility: execution record and checkbox updates only after validation passes.
- Modify `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
  - Responsibility: mark T18 complete only after validation passes.

## Modeling Decisions

- Presets are code-only defaults, not the primary source of truth. They provide fast choices and fallback labels/directions, but KB items may override or disable them within a scope.
- The relation catalog is a compiled read model, not a persisted table. It is rebuilt from presets plus KB items and is therefore fully traceable.
- `enabled` is a compiled field:
  - `true` when a catalog entry is visible and not disabled by a higher-precedence KB item.
  - `false` when a higher-precedence `DISABLED` taxonomy item suppresses that key in the current scope.
- Scope precedence is `GLOBAL < BOOK_TYPE < BOOK < RUN`, matching KB v2.
- `VERIFIED` knowledge participates in runtime and review modes.
- `PENDING` knowledge participates in runtime and review as low-confidence suggestions.
- `DISABLED` knowledge participates only in review-mode loading and in catalog suppression logic; runtime Stage A+ should not surface disabled entries as valid suggestions.
- Promotion is two-step but one workflow:
  - taxonomy promotion creates the reusable relation key entry
  - optional mapping promotion preserves observed raw labels without mutating historic claims
- T18 will not remove relation-related arrays from `stageAPlus/knowledge-adapter.ts`. That cleanup can wait; only relation normalization is rewired now.

## Task 1: Define Relation-Type Contracts And Preset Registry

**Files:**
- Create: `src/server/modules/knowledge-v2/relation-types/contracts.test.ts`
- Create: `src/server/modules/knowledge-v2/relation-types/contracts.ts`
- Create: `src/server/modules/knowledge-v2/relation-types/preset-registry.test.ts`
- Create: `src/server/modules/knowledge-v2/relation-types/preset-registry.ts`

- [ ] **Step 1: Write the failing contract tests**

Create `src/server/modules/knowledge-v2/relation-types/contracts.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  parseRelationCatalogEntry,
  parseRelationNormalizationSuggestion
} from "@/server/modules/knowledge-v2/relation-types/contracts";

describe("relation-types contracts", () => {
  it("keeps relationTypeKey as an open string", () => {
    const parsed = parseRelationCatalogEntry({
      relationTypeKey   : "political_patron_of",
      defaultLabel      : "政治庇护",
      direction         : "FORWARD",
      relationTypeSource: "CUSTOM",
      aliasLabels       : ["门生", "依附"],
      scopeType         : "BOOK",
      scopeId           : "book-1",
      reviewState       : "VERIFIED",
      systemPreset      : false,
      enabled           : true,
      knowledgeItemId   : "knowledge-1"
    });

    expect(parsed.relationTypeKey).toBe("political_patron_of");
  });

  it("rejects blank display labels and blank aliases", () => {
    expect(() => parseRelationCatalogEntry({
      relationTypeKey   : "teacher_of",
      defaultLabel      : " ",
      direction         : "FORWARD",
      relationTypeSource: "PRESET",
      aliasLabels       : ["师徒", " "],
      scopeType         : "GLOBAL",
      scopeId           : null,
      reviewState       : "VERIFIED",
      systemPreset      : true,
      enabled           : true,
      knowledgeItemId   : null
    })).toThrow();
  });

  it("keeps normalization suggestions serializable for Stage A+ and review APIs", () => {
    const parsed = parseRelationNormalizationSuggestion({
      relationTypeKey   : "teacher_of",
      matchedLabel      : "师生",
      normalizedLabel   : "师徒",
      direction         : "FORWARD",
      relationTypeSource: "PRESET",
      confidence        : 0.91,
      reviewState       : "VERIFIED",
      knowledgeItemId   : "knowledge-2"
    });

    expect(parsed.normalizedLabel).toBe("师徒");
  });
});
```

Create `src/server/modules/knowledge-v2/relation-types/preset-registry.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { RELATION_TYPE_PRESETS } from "@/server/modules/knowledge-v2/relation-types/preset-registry";

describe("relation-type preset registry", () => {
  it("ships stable preset keys without duplicates", () => {
    expect(RELATION_TYPE_PRESETS.map((item) => item.relationTypeKey)).toEqual([
      "teacher_of",
      "parent_of",
      "spouse_of",
      "sworn_brother",
      "ruler_of",
      "subordinate_of"
    ]);
  });

  it("does not duplicate alias labels across presets", () => {
    const aliases = RELATION_TYPE_PRESETS.flatMap((item) => item.aliasLabels);
    expect(new Set(aliases).size).toBe(aliases.length);
  });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run:

```bash
pnpm exec vitest run \
  src/server/modules/knowledge-v2/relation-types/contracts.test.ts \
  src/server/modules/knowledge-v2/relation-types/preset-registry.test.ts \
  --coverage=false
```

Expected: FAIL because the `relation-types` module does not exist yet.

- [ ] **Step 3: Implement the contracts**

Create `src/server/modules/knowledge-v2/relation-types/contracts.ts`:

```ts
import { z } from "zod";

import {
  knowledgeReviewStateSchema,
  knowledgeScopeTypeSchema,
  type KnowledgeReviewState,
  type KnowledgeScopeType
} from "@/server/modules/knowledge-v2/base-types";
import {
  relationDirectionSchema,
  relationTypeSourceSchema,
  type RelationDirection,
  type RelationTypeSource
} from "@/server/modules/analysis/claims/base-types";

const trimmedNonEmptyString = z.string().trim().min(1);

export const relationCatalogEntrySchema = z.object({
  relationTypeKey   : trimmedNonEmptyString,
  defaultLabel      : trimmedNonEmptyString,
  direction         : relationDirectionSchema,
  relationTypeSource: relationTypeSourceSchema,
  aliasLabels       : z.array(trimmedNonEmptyString).default([]),
  scopeType         : knowledgeScopeTypeSchema,
  scopeId           : trimmedNonEmptyString.nullable().default(null),
  reviewState       : knowledgeReviewStateSchema,
  systemPreset      : z.boolean(),
  enabled           : z.boolean(),
  knowledgeItemId   : trimmedNonEmptyString.nullable().default(null)
}).superRefine((value, ctx) => {
  if (value.scopeType === "GLOBAL" && value.scopeId !== null) {
    ctx.addIssue({ code: "custom", path: ["scopeId"], message: "GLOBAL scope must not define scopeId" });
  }

  if (value.scopeType !== "GLOBAL" && value.scopeId === null) {
    ctx.addIssue({ code: "custom", path: ["scopeId"], message: `${value.scopeType} scope requires scopeId` });
  }
});

export const relationNormalizationSuggestionSchema = z.object({
  relationTypeKey   : trimmedNonEmptyString,
  matchedLabel      : trimmedNonEmptyString,
  normalizedLabel   : trimmedNonEmptyString,
  direction         : relationDirectionSchema,
  relationTypeSource: relationTypeSourceSchema,
  confidence        : z.number().min(0).max(1),
  reviewState       : z.union([z.literal("VERIFIED"), z.literal("PENDING")]),
  knowledgeItemId   : trimmedNonEmptyString.nullable().default(null)
});

export type RelationCatalogEntry = z.infer<typeof relationCatalogEntrySchema>;
export type RelationNormalizationSuggestion = z.infer<typeof relationNormalizationSuggestionSchema>;
export type RelationCatalogVisibilityReviewState = Extract<
  KnowledgeReviewState,
  "VERIFIED" | "PENDING" | "DISABLED"
>;
export type RelationCatalogScopeType = KnowledgeScopeType;
export type RelationCatalogDirection = RelationDirection;
export type RelationCatalogTypeSource = RelationTypeSource;

export function parseRelationCatalogEntry(input: unknown): RelationCatalogEntry {
  return relationCatalogEntrySchema.parse(input);
}

export function parseRelationNormalizationSuggestion(
  input: unknown
): RelationNormalizationSuggestion {
  return relationNormalizationSuggestionSchema.parse(input);
}

export function normalizeRelationCatalogLabel(value: string): string {
  return value.trim();
}
```

- [ ] **Step 4: Implement the preset registry**

Create `src/server/modules/knowledge-v2/relation-types/preset-registry.ts`:

```ts
import type { RelationCatalogEntry } from "@/server/modules/knowledge-v2/relation-types/contracts";

export const RELATION_TYPE_PRESETS: RelationCatalogEntry[] = Object.freeze([
  {
    relationTypeKey   : "teacher_of",
    defaultLabel      : "师徒",
    direction         : "FORWARD",
    relationTypeSource: "PRESET",
    aliasLabels       : ["师生", "门生"],
    scopeType         : "GLOBAL",
    scopeId           : null,
    reviewState       : "VERIFIED",
    systemPreset      : true,
    enabled           : true,
    knowledgeItemId   : null
  },
  {
    relationTypeKey   : "parent_of",
    defaultLabel      : "亲属",
    direction         : "FORWARD",
    relationTypeSource: "PRESET",
    aliasLabels       : ["父子", "母子", "父女", "母女"],
    scopeType         : "GLOBAL",
    scopeId           : null,
    reviewState       : "VERIFIED",
    systemPreset      : true,
    enabled           : true,
    knowledgeItemId   : null
  },
  {
    relationTypeKey   : "spouse_of",
    defaultLabel      : "夫妻",
    direction         : "BIDIRECTIONAL",
    relationTypeSource: "PRESET",
    aliasLabels       : ["配偶", "夫妇"],
    scopeType         : "GLOBAL",
    scopeId           : null,
    reviewState       : "VERIFIED",
    systemPreset      : true,
    enabled           : true,
    knowledgeItemId   : null
  },
  {
    relationTypeKey   : "sworn_brother",
    defaultLabel      : "结义兄弟",
    direction         : "BIDIRECTIONAL",
    relationTypeSource: "PRESET",
    aliasLabels       : ["义兄弟"],
    scopeType         : "GLOBAL",
    scopeId           : null,
    reviewState       : "VERIFIED",
    systemPreset      : true,
    enabled           : true,
    knowledgeItemId   : null
  },
  {
    relationTypeKey   : "ruler_of",
    defaultLabel      : "君臣",
    direction         : "FORWARD",
    relationTypeSource: "PRESET",
    aliasLabels       : ["主从"],
    scopeType         : "GLOBAL",
    scopeId           : null,
    reviewState       : "VERIFIED",
    systemPreset      : true,
    enabled           : true,
    knowledgeItemId   : null
  },
  {
    relationTypeKey   : "subordinate_of",
    defaultLabel      : "属下",
    direction         : "REVERSE",
    relationTypeSource: "PRESET",
    aliasLabels       : ["部属"],
    scopeType         : "GLOBAL",
    scopeId           : null,
    reviewState       : "VERIFIED",
    systemPreset      : true,
    enabled           : true,
    knowledgeItemId   : null
  }
]);
```

- [ ] **Step 5: Run the tests again**

Run:

```bash
pnpm exec vitest run \
  src/server/modules/knowledge-v2/relation-types/contracts.test.ts \
  src/server/modules/knowledge-v2/relation-types/preset-registry.test.ts \
  --coverage=false
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add \
  src/server/modules/knowledge-v2/relation-types/contracts.ts \
  src/server/modules/knowledge-v2/relation-types/contracts.test.ts \
  src/server/modules/knowledge-v2/relation-types/preset-registry.ts \
  src/server/modules/knowledge-v2/relation-types/preset-registry.test.ts
git commit -m "feat: add relation type catalog contracts and presets"
```

## Task 2: Compile Presets And KB Rules Into One Catalog

**Files:**
- Create: `src/server/modules/knowledge-v2/relation-types/catalog.test.ts`
- Create: `src/server/modules/knowledge-v2/relation-types/catalog.ts`

- [ ] **Step 1: Write the failing catalog tests**

Create `src/server/modules/knowledge-v2/relation-types/catalog.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  buildRelationTypeCatalog,
  findRelationNegativeRule,
  suggestRelationTypeByLabel
} from "@/server/modules/knowledge-v2/relation-types/catalog";

describe("relation type catalog", () => {
  it("merges presets with higher-scope custom taxonomy rules", () => {
    const catalog = buildRelationTypeCatalog({
      items: [
        {
          id           : "knowledge-1",
          scopeType    : "BOOK",
          scopeId      : "book-1",
          knowledgeType: "relation taxonomy rule",
          reviewState  : "VERIFIED",
          confidence   : 0.93,
          payload      : {
            relationTypeKey   : "political_patron_of",
            displayLabel      : "政治庇护",
            direction         : "FORWARD",
            relationTypeSource: "CUSTOM",
            aliasLabels       : ["依附", "门下"]
          }
        }
      ] as never
    });

    expect(catalog.entriesByKey["political_patron_of"]?.defaultLabel).toBe("政治庇护");
    expect(catalog.activeEntries.some((entry) => entry.relationTypeKey === "teacher_of")).toBe(true);
  });

  it("suppresses active entries when a higher-precedence taxonomy rule is disabled", () => {
    const catalog = buildRelationTypeCatalog({
      items: [
        {
          id           : "knowledge-2",
          scopeType    : "BOOK",
          scopeId      : "book-1",
          knowledgeType: "relation taxonomy rule",
          reviewState  : "DISABLED",
          confidence   : null,
          payload      : {
            relationTypeKey   : "teacher_of",
            displayLabel      : "师徒",
            direction         : "FORWARD",
            relationTypeSource: "PRESET",
            aliasLabels       : []
          }
        }
      ] as never
    });

    expect(catalog.entriesByKey["teacher_of"]?.enabled).toBe(false);
    expect(catalog.activeEntries.some((entry) => entry.relationTypeKey === "teacher_of")).toBe(false);
    expect(catalog.disabledEntries.map((entry) => entry.relationTypeKey)).toContain("teacher_of");
  });

  it("suggests a normalized relation type by mapping while preserving the observed label", () => {
    const catalog = buildRelationTypeCatalog({
      items: [
        {
          id           : "knowledge-3",
          scopeType    : "BOOK",
          scopeId      : "book-1",
          knowledgeType: "relation label mapping rule",
          reviewState  : "VERIFIED",
          confidence   : 0.88,
          payload      : {
            relationTypeKey   : "political_patron_of",
            observedLabel     : "门生",
            normalizedLabel   : "政治庇护",
            relationTypeSource: "NORMALIZED_FROM_CUSTOM"
          }
        }
      ] as never
    });

    const suggestion = suggestRelationTypeByLabel({
      catalog,
      relationLabel: "门生",
      direction    : "FORWARD"
    });

    expect(suggestion?.relationTypeKey).toBe("political_patron_of");
    expect(suggestion?.matchedLabel).toBe("门生");
    expect(suggestion?.normalizedLabel).toBe("政治庇护");
  });

  it("finds negative rules by label and direction", () => {
    const catalog = buildRelationTypeCatalog({
      items: [
        {
          id           : "knowledge-4",
          scopeType    : "BOOK",
          scopeId      : "book-1",
          knowledgeType: "relation negative rule",
          reviewState  : "VERIFIED",
          confidence   : 0.92,
          payload      : {
            relationTypeKey: "sworn_brother",
            blockedLabels  : ["兄弟相称"],
            denyDirection  : "BIDIRECTIONAL",
            reason         : "上下文仅为客套称呼"
          }
        }
      ] as never
    });

    const negative = findRelationNegativeRule({
      catalog,
      relationLabel: "兄弟相称",
      direction    : "BIDIRECTIONAL"
    });

    expect(negative?.reason).toContain("客套称呼");
  });
});
```

- [ ] **Step 2: Run the new tests and confirm failure**

Run:

```bash
pnpm exec vitest run src/server/modules/knowledge-v2/relation-types/catalog.test.ts --coverage=false
```

Expected: FAIL because `catalog.ts` does not exist.

- [ ] **Step 3: Implement the catalog compiler and lookup helpers**

Create `src/server/modules/knowledge-v2/relation-types/catalog.ts`:

```ts
import type { ParsedKnowledgeItem } from "@/server/modules/knowledge-v2/repository";
import { parseKnowledgePayload } from "@/server/modules/knowledge-v2/payload-schemas";

import {
  normalizeRelationCatalogLabel,
  parseRelationCatalogEntry,
  parseRelationNormalizationSuggestion,
  type RelationCatalogEntry
} from "@/server/modules/knowledge-v2/relation-types/contracts";
import { RELATION_TYPE_PRESETS } from "@/server/modules/knowledge-v2/relation-types/preset-registry";

const SCOPE_PRIORITY = {
  GLOBAL   : 0,
  BOOK_TYPE: 1,
  BOOK     : 2,
  RUN      : 3
} as const;

export interface RelationTypeCatalog {
  activeEntries : RelationCatalogEntry[];
  disabledEntries: RelationCatalogEntry[];
  entriesByKey  : Record<string, RelationCatalogEntry>;
  mappingRules  : ParsedKnowledgeItem[];
  negativeRules : ParsedKnowledgeItem[];
}

function preferCatalogEntry(current: RelationCatalogEntry, candidate: RelationCatalogEntry): RelationCatalogEntry {
  const currentScore = SCOPE_PRIORITY[current.scopeType];
  const candidateScore = SCOPE_PRIORITY[candidate.scopeType];

  if (candidateScore !== currentScore) {
    return candidateScore > currentScore ? candidate : current;
  }

  if (candidate.reviewState === "DISABLED" && current.reviewState !== "DISABLED") {
    return candidate;
  }

  return candidate;
}

export function buildRelationTypeCatalog(input: {
  items: ParsedKnowledgeItem[];
  presets?: RelationCatalogEntry[];
}): RelationTypeCatalog {
  const presets = input.presets ?? RELATION_TYPE_PRESETS;
  const entriesByKey = Object.fromEntries(
    presets.map((entry) => [entry.relationTypeKey, parseRelationCatalogEntry(entry)])
  );

  const mappingRules: ParsedKnowledgeItem[] = [];
  const negativeRules: ParsedKnowledgeItem[] = [];

  for (const item of input.items) {
    if (item.knowledgeType === "relation taxonomy rule") {
      const payload = parseKnowledgePayload(item.knowledgeType, item.payload);
      const compiled = parseRelationCatalogEntry({
        relationTypeKey   : payload.relationTypeKey,
        defaultLabel      : payload.displayLabel,
        direction         : payload.direction,
        relationTypeSource: payload.relationTypeSource,
        aliasLabels       : payload.aliasLabels,
        scopeType         : item.scopeType,
        scopeId           : item.scopeId,
        reviewState       : item.reviewState,
        systemPreset      : item.source === "SYSTEM_PRESET",
        enabled           : item.reviewState !== "DISABLED",
        knowledgeItemId   : item.id
      });

      const previous = entriesByKey[compiled.relationTypeKey];
      entriesByKey[compiled.relationTypeKey] = previous
        ? preferCatalogEntry(previous, compiled)
        : compiled;
      continue;
    }

    if (item.knowledgeType === "relation label mapping rule") {
      mappingRules.push(item);
      continue;
    }

    if (item.knowledgeType === "relation negative rule") {
      negativeRules.push(item);
    }
  }

  const allEntries = Object.values(entriesByKey);

  return {
    activeEntries : allEntries.filter((entry) => entry.enabled),
    disabledEntries: allEntries.filter((entry) => !entry.enabled),
    entriesByKey,
    mappingRules,
    negativeRules
  };
}

export function suggestRelationTypeByLabel(input: {
  catalog      : RelationTypeCatalog;
  relationLabel: string;
  direction    : RelationCatalogEntry["direction"];
}) {
  const normalizedLabel = normalizeRelationCatalogLabel(input.relationLabel);

  for (const item of input.catalog.mappingRules) {
    const payload = parseKnowledgePayload(item.knowledgeType, item.payload);
    if (normalizeRelationCatalogLabel(payload.observedLabel) !== normalizedLabel) {
      continue;
    }

    return parseRelationNormalizationSuggestion({
      relationTypeKey   : payload.relationTypeKey,
      matchedLabel      : payload.observedLabel,
      normalizedLabel   : payload.normalizedLabel,
      direction         : input.catalog.entriesByKey[payload.relationTypeKey]?.direction ?? input.direction,
      relationTypeSource: payload.relationTypeSource,
      confidence        : item.confidence ?? 0.55,
      reviewState       : item.reviewState,
      knowledgeItemId   : item.id
    });
  }

  for (const entry of input.catalog.activeEntries) {
    const labels = [entry.defaultLabel, ...entry.aliasLabels].map(normalizeRelationCatalogLabel);
    if (!labels.includes(normalizedLabel)) {
      continue;
    }

    return parseRelationNormalizationSuggestion({
      relationTypeKey   : entry.relationTypeKey,
      matchedLabel      : input.relationLabel,
      normalizedLabel   : entry.defaultLabel,
      direction         : entry.direction,
      relationTypeSource: entry.relationTypeSource,
      confidence        : entry.reviewState === "VERIFIED" ? 0.9 : 0.55,
      reviewState       : entry.reviewState === "DISABLED" ? "PENDING" : entry.reviewState,
      knowledgeItemId   : entry.knowledgeItemId
    });
  }

  return null;
}

export function findRelationNegativeRule(input: {
  catalog      : RelationTypeCatalog;
  relationLabel: string;
  direction    : RelationCatalogEntry["direction"];
}) {
  const normalizedLabel = normalizeRelationCatalogLabel(input.relationLabel);

  return input.catalog.negativeRules.find((item) => {
    const payload = parseKnowledgePayload(item.knowledgeType, item.payload);
    return payload.blockedLabels.some(
      (label) => normalizeRelationCatalogLabel(label) === normalizedLabel
    ) && (payload.denyDirection === null || payload.denyDirection === input.direction);
  }) ?? null;
}
```

- [ ] **Step 4: Re-run the catalog tests**

Run:

```bash
pnpm exec vitest run src/server/modules/knowledge-v2/relation-types/catalog.test.ts --coverage=false
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add \
  src/server/modules/knowledge-v2/relation-types/catalog.ts \
  src/server/modules/knowledge-v2/relation-types/catalog.test.ts
git commit -m "feat: compile kb relation type catalog"
```

## Task 3: Add Repository-Backed Catalog Loading For Runtime And Review

**Files:**
- Create: `src/server/modules/knowledge-v2/relation-types/loader.test.ts`
- Create: `src/server/modules/knowledge-v2/relation-types/loader.ts`

- [ ] **Step 1: Write the failing loader tests**

Create `src/server/modules/knowledge-v2/relation-types/loader.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { createRelationTypeCatalogLoader } from "@/server/modules/knowledge-v2/relation-types/loader";

describe("relation type catalog loader", () => {
  it("loads verified and pending relation knowledge for runtime mode", async () => {
    const repository = {
      listKnowledgeItems: vi.fn().mockResolvedValue([])
    };
    const loader = createRelationTypeCatalogLoader({ knowledgeRepository: repository as never });

    await loader.load({
      bookId     : "book-1",
      bookTypeKey: "CLASSICAL_NOVEL",
      runId      : "run-1",
      mode       : "RUNTIME"
    });

    expect(repository.listKnowledgeItems).toHaveBeenCalledWith(expect.objectContaining({
      reviewStates  : ["VERIFIED", "PENDING"],
      knowledgeTypes: [
        "relation taxonomy rule",
        "relation label mapping rule",
        "relation negative rule"
      ]
    }));
  });

  it("includes disabled taxonomy in review mode", async () => {
    const repository = {
      listKnowledgeItems: vi.fn().mockResolvedValue([])
    };
    const loader = createRelationTypeCatalogLoader({ knowledgeRepository: repository as never });

    await loader.load({
      bookId     : "book-1",
      bookTypeKey: null,
      runId      : null,
      mode       : "REVIEW"
    });

    expect(repository.listKnowledgeItems).toHaveBeenCalledWith(expect.objectContaining({
      reviewStates: ["VERIFIED", "PENDING", "DISABLED"]
    }));
  });
});
```

- [ ] **Step 2: Run the tests and confirm failure**

Run:

```bash
pnpm exec vitest run src/server/modules/knowledge-v2/relation-types/loader.test.ts --coverage=false
```

Expected: FAIL because `loader.ts` does not exist.

- [ ] **Step 3: Implement the loader**

Create `src/server/modules/knowledge-v2/relation-types/loader.ts`:

```ts
import type { KnowledgeRepository } from "@/server/modules/knowledge-v2/repository";
import type { KnowledgeScopeSelector } from "@/server/modules/knowledge-v2/base-types";

import { buildRelationTypeCatalog } from "@/server/modules/knowledge-v2/relation-types/catalog";

const RELATION_KNOWLEDGE_TYPES = [
  "relation taxonomy rule",
  "relation label mapping rule",
  "relation negative rule"
] as const;

function buildScopeChain(input: {
  bookId     : string;
  bookTypeKey: string | null;
  runId      : string | null;
}): KnowledgeScopeSelector[] {
  return [
    { scopeType: "GLOBAL", scopeId: null },
    ...(input.bookTypeKey
      ? [{ scopeType: "BOOK_TYPE" as const, scopeId: input.bookTypeKey }]
      : []),
    { scopeType: "BOOK", scopeId: input.bookId },
    ...(input.runId
      ? [{ scopeType: "RUN" as const, scopeId: input.runId }]
      : [])
  ];
}

export function createRelationTypeCatalogLoader(dependencies: {
  knowledgeRepository: Pick<KnowledgeRepository, "listKnowledgeItems">;
}) {
  return {
    async load(input: {
      bookId     : string;
      bookTypeKey: string | null;
      runId      : string | null;
      mode       : "RUNTIME" | "REVIEW";
    }) {
      const reviewStates = input.mode === "REVIEW"
        ? ["VERIFIED", "PENDING", "DISABLED"] as const
        : ["VERIFIED", "PENDING"] as const;

      const items = await dependencies.knowledgeRepository.listKnowledgeItems({
        scopeSelectors: buildScopeChain(input),
        reviewStates  : [...reviewStates],
        knowledgeTypes: [...RELATION_KNOWLEDGE_TYPES]
      });

      return buildRelationTypeCatalog({ items });
    }
  };
}
```

- [ ] **Step 4: Run the loader tests again**

Run:

```bash
pnpm exec vitest run src/server/modules/knowledge-v2/relation-types/loader.test.ts --coverage=false
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add \
  src/server/modules/knowledge-v2/relation-types/loader.ts \
  src/server/modules/knowledge-v2/relation-types/loader.test.ts
git commit -m "feat: add relation type catalog loader"
```

## Task 4: Add Reviewed Custom-Relation Promotion Workflow

**Files:**
- Create: `src/server/modules/knowledge-v2/relation-types/promotion.test.ts`
- Create: `src/server/modules/knowledge-v2/relation-types/promotion.ts`

- [ ] **Step 1: Write the failing promotion tests**

Create `src/server/modules/knowledge-v2/relation-types/promotion.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { createRelationTypePromotionService } from "@/server/modules/knowledge-v2/relation-types/promotion";

describe("relation-type promotion service", () => {
  it("promotes an accepted relation claim into taxonomy knowledge and mapping knowledge", async () => {
    const promotion = {
      promoteReviewedClaim: vi
        .fn()
        .mockResolvedValueOnce({ id: "knowledge-taxonomy-1" })
        .mockResolvedValueOnce({ id: "knowledge-mapping-1" })
    };
    const service = createRelationTypePromotionService({ knowledgePromotion: promotion as never });

    const result = await service.promoteAcceptedRelation({
      claimId         : "claim-1",
      actorUserId     : "user-1",
      scopeType       : "BOOK",
      scopeId         : "book-1",
      relationTypeKey : "political_patron_of",
      defaultLabel    : "政治庇护",
      direction       : "FORWARD",
      aliasLabels     : ["依附"],
      observedLabels  : ["门生"]
    });

    expect(result.taxonomyKnowledgeId).toBe("knowledge-taxonomy-1");
    expect(result.mappingKnowledgeIds).toEqual(["knowledge-mapping-1"]);
  });

  it("skips mapping promotion when observed labels are empty or equal to the default label", async () => {
    const promotion = {
      promoteReviewedClaim: vi.fn().mockResolvedValue({ id: "knowledge-taxonomy-2" })
    };
    const service = createRelationTypePromotionService({ knowledgePromotion: promotion as never });

    const result = await service.promoteAcceptedRelation({
      claimId         : "claim-2",
      actorUserId     : "user-1",
      scopeType       : "BOOK",
      scopeId         : "book-1",
      relationTypeKey : "political_patron_of",
      defaultLabel    : "政治庇护",
      direction       : "FORWARD",
      aliasLabels     : [],
      observedLabels  : ["政治庇护"]
    });

    expect(result.mappingKnowledgeIds).toEqual([]);
    expect(promotion.promoteReviewedClaim).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run:

```bash
pnpm exec vitest run src/server/modules/knowledge-v2/relation-types/promotion.test.ts --coverage=false
```

Expected: FAIL because `promotion.ts` does not exist.

- [ ] **Step 3: Implement the promotion wrapper**

Create `src/server/modules/knowledge-v2/relation-types/promotion.ts`:

```ts
import { z } from "zod";

import type { RelationDirection } from "@/server/modules/analysis/claims/base-types";
import type {
  KnowledgePromotionTargetReviewState,
  PromoteReviewedClaimInput
} from "@/server/modules/knowledge-v2/promotion";

const trimmedNonEmptyString = z.string().trim().min(1);

const relationTypePromotionSchema = z.object({
  claimId        : trimmedNonEmptyString,
  actorUserId    : trimmedNonEmptyString,
  scopeType      : z.enum(["GLOBAL", "BOOK_TYPE", "BOOK", "RUN"]),
  scopeId        : trimmedNonEmptyString.nullable(),
  relationTypeKey: trimmedNonEmptyString,
  defaultLabel   : trimmedNonEmptyString,
  direction      : z.enum(["FORWARD", "REVERSE", "BIDIRECTIONAL", "UNDIRECTED"]),
  aliasLabels    : z.array(trimmedNonEmptyString).default([]),
  observedLabels : z.array(trimmedNonEmptyString).default([]),
  targetReviewState: z.enum(["PENDING", "VERIFIED"]).default("VERIFIED")
});

type RelationTypePromotionInput = z.infer<typeof relationTypePromotionSchema>;

export function createRelationTypePromotionService(dependencies: {
  knowledgePromotion: Pick<
    { promoteReviewedClaim(input: PromoteReviewedClaimInput): Promise<{ id: string }> },
    "promoteReviewedClaim"
  >;
}) {
  return {
    async promoteAcceptedRelation(rawInput: RelationTypePromotionInput) {
      const input = relationTypePromotionSchema.parse(rawInput);

      const taxonomy = await dependencies.knowledgePromotion.promoteReviewedClaim({
        claimFamily          : "RELATION",
        claimId              : input.claimId,
        knowledgeType        : "relation taxonomy rule",
        scopeType            : input.scopeType,
        scopeId              : input.scopeId,
        payload              : {
          relationTypeKey   : input.relationTypeKey,
          displayLabel      : input.defaultLabel,
          direction         : input.direction as RelationDirection,
          relationTypeSource: "CUSTOM",
          aliasLabels       : input.aliasLabels
        },
        actorUserId          : input.actorUserId,
        targetReviewState    : input.targetReviewState as KnowledgePromotionTargetReviewState,
        supersedesKnowledgeId: null
      });

      const mappingKnowledgeIds: string[] = [];
      const dedupedObservedLabels = Array.from(new Set(input.observedLabels.map((value) => value.trim())));

      for (const observedLabel of dedupedObservedLabels) {
        if (observedLabel === input.defaultLabel) {
          continue;
        }

        const mapping = await dependencies.knowledgePromotion.promoteReviewedClaim({
          claimFamily          : "RELATION",
          claimId              : input.claimId,
          knowledgeType        : "relation label mapping rule",
          scopeType            : input.scopeType,
          scopeId              : input.scopeId,
          payload              : {
            relationTypeKey   : input.relationTypeKey,
            observedLabel,
            normalizedLabel   : input.defaultLabel,
            relationTypeSource: "NORMALIZED_FROM_CUSTOM"
          },
          actorUserId          : input.actorUserId,
          targetReviewState    : input.targetReviewState as KnowledgePromotionTargetReviewState,
          supersedesKnowledgeId: null
        });

        mappingKnowledgeIds.push(mapping.id);
      }

      return {
        taxonomyKnowledgeId: taxonomy.id,
        mappingKnowledgeIds
      };
    }
  };
}
```

- [ ] **Step 4: Re-run the promotion tests**

Run:

```bash
pnpm exec vitest run src/server/modules/knowledge-v2/relation-types/promotion.test.ts --coverage=false
```

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

```bash
git add \
  src/server/modules/knowledge-v2/relation-types/promotion.ts \
  src/server/modules/knowledge-v2/relation-types/promotion.test.ts
git commit -m "feat: add relation type promotion workflow"
```

## Task 5: Rewire Stage A+ To Use The Relation Catalog

**Files:**
- Modify: `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/relation-normalization.test.ts`
- Modify: `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/relation-normalization.ts`
- Modify: `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/KnowledgeRecallStage.test.ts`
- Modify: `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/KnowledgeRecallStage.ts`
- Create: `src/server/modules/knowledge-v2/relation-types/index.ts`
- Modify: `src/server/modules/knowledge-v2/index.ts`

- [ ] **Step 1: Update relation-normalization tests to use catalog input**

In `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/relation-normalization.test.ts`, replace raw `knowledge.relationMappings / relationTaxonomyRules / relationNegativeRules` fixtures with a compiled catalog:

```ts
import { buildRelationTypeCatalog } from "@/server/modules/knowledge-v2/relation-types";

const relationCatalog = buildRelationTypeCatalog({
  items: [
    {
      id           : "knowledge-taxonomy-1",
      scopeType    : "BOOK",
      scopeId      : "book-1",
      knowledgeType: "relation taxonomy rule",
      reviewState  : "VERIFIED",
      confidence   : 0.9,
      payload      : {
        relationTypeKey   : "teacher_of",
        displayLabel      : "师徒",
        direction         : "FORWARD",
        relationTypeSource: "PRESET",
        aliasLabels       : ["师生"]
      }
    },
    {
      id           : "knowledge-mapping-1",
      scopeType    : "BOOK",
      scopeId      : "book-1",
      knowledgeType: "relation label mapping rule",
      reviewState  : "PENDING",
      confidence   : 0.55,
      payload      : {
        relationTypeKey   : "political_patron_of",
        observedLabel     : "门生",
        normalizedLabel   : "政治庇护",
        relationTypeSource: "NORMALIZED_FROM_CUSTOM"
      }
    }
  ] as never
});
```

Then change every `normalizeStageAPlusRelations(...)` call to pass:

```ts
relationCatalog
```

instead of:

```ts
knowledge
```

- [ ] **Step 2: Run the Stage A+ tests and confirm failure**

Run:

```bash
pnpm exec vitest run \
  src/server/modules/analysis/pipelines/evidence-review/stageAPlus/relation-normalization.test.ts \
  src/server/modules/analysis/pipelines/evidence-review/stageAPlus/KnowledgeRecallStage.test.ts \
  --coverage=false
```

Expected: FAIL because Stage A+ code still expects raw `knowledge` relation arrays.

- [ ] **Step 3: Export the relation-types module and rewire normalization**

Create `src/server/modules/knowledge-v2/relation-types/index.ts`:

```ts
export * from "./contracts";
export * from "./preset-registry";
export * from "./catalog";
export * from "./loader";
export * from "./promotion";
```

Update `src/server/modules/knowledge-v2/index.ts`:

```ts
export * from "./base-types";
export * from "./payload-schemas";
export * from "./repository";
export * from "./runtime-loader";
export * from "./promotion";
export * from "./relation-types";
```

Update `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/relation-normalization.ts` to use the relation catalog helpers:

```ts
import {
  findRelationNegativeRule,
  suggestRelationTypeByLabel,
  type RelationTypeCatalog
} from "@/server/modules/knowledge-v2/relation-types";

export function normalizeStageAPlusRelations(input: {
  bookId         : string;
  chapterId      : string;
  runId          : string;
  relations      : StageAPlusRelationClaimRow[];
  relationCatalog: RelationTypeCatalog;
}): Pick<StageAPlusRecallOutput, "relationDrafts" | "discardRecords" | "knowledgeItemIds"> {
  // existing draft creation logic stays, only rule lookup changes
  const negativeRule = findRelationNegativeRule({
    catalog      : input.relationCatalog,
    relationLabel: relation.relationLabel,
    direction    : relation.direction
  });

  const suggestion = suggestRelationTypeByLabel({
    catalog      : input.relationCatalog,
    relationLabel: relation.relationLabel,
    direction    : relation.direction
  });
}
```

Update `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/KnowledgeRecallStage.ts`:

```ts
import { buildRelationTypeCatalog } from "@/server/modules/knowledge-v2/relation-types";

const relationCatalog = buildRelationTypeCatalog({
  items: [...bundle.verifiedItems, ...bundle.pendingItems]
});

const relationOutput = relationNormalizer({
  bookId         : input.bookId,
  chapterId      : input.chapter.id,
  runId          : input.runId,
  relations      : stageARelations,
  relationCatalog
});
```

- [ ] **Step 4: Re-run the Stage A+ tests**

Run:

```bash
pnpm exec vitest run \
  src/server/modules/analysis/pipelines/evidence-review/stageAPlus/relation-normalization.test.ts \
  src/server/modules/analysis/pipelines/evidence-review/stageAPlus/KnowledgeRecallStage.test.ts \
  --coverage=false
```

Expected: PASS.

- [ ] **Step 5: Commit Task 5**

```bash
git add \
  src/server/modules/knowledge-v2/relation-types/index.ts \
  src/server/modules/knowledge-v2/index.ts \
  src/server/modules/analysis/pipelines/evidence-review/stageAPlus/relation-normalization.ts \
  src/server/modules/analysis/pipelines/evidence-review/stageAPlus/relation-normalization.test.ts \
  src/server/modules/analysis/pipelines/evidence-review/stageAPlus/KnowledgeRecallStage.ts \
  src/server/modules/analysis/pipelines/evidence-review/stageAPlus/KnowledgeRecallStage.test.ts
git commit -m "feat: wire stage-a-plus to relation type catalog"
```

## Task 6: Focused Validation, No-Schema Guard, And Execution Record

**Files:**
- Modify: `docs/superpowers/tasks/2026-04-18-evidence-review/18-relation-types-catalog.md`
- Modify: `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`

- [ ] **Step 1: Run focused tests for the new module and Stage A+ integration**

Run:

```bash
pnpm exec vitest run \
  src/server/modules/knowledge-v2/relation-types/contracts.test.ts \
  src/server/modules/knowledge-v2/relation-types/preset-registry.test.ts \
  src/server/modules/knowledge-v2/relation-types/catalog.test.ts \
  src/server/modules/knowledge-v2/relation-types/loader.test.ts \
  src/server/modules/knowledge-v2/relation-types/promotion.test.ts \
  src/server/modules/analysis/pipelines/evidence-review/stageAPlus/relation-normalization.test.ts \
  src/server/modules/analysis/pipelines/evidence-review/stageAPlus/KnowledgeRecallStage.test.ts \
  --coverage=false
```

Expected: PASS.

- [ ] **Step 2: Run type-check and no-schema-change guard**

Run:

```bash
pnpm type-check
if ! git diff --exit-code -- prisma/schema.prisma prisma/migrations; then
  echo "Unexpected schema or migration changes detected"
  exit 1
fi
```

Expected:
- `pnpm type-check` passes.
- The second command exits cleanly with no output. If it fails, stop and remove any accidental schema/migration edits before proceeding.

- [ ] **Step 3: Update the task execution record**

Append this block to `docs/superpowers/tasks/2026-04-18-evidence-review/18-relation-types-catalog.md` after validation passes:

```md
## Execution Record

### 2026-04-20

- Implemented KB v2 backed relation-type governance under `src/server/modules/knowledge-v2/relation-types/**`.
- Kept `relationTypeKey` as an open string; no Prisma enum or relation-types table was added.
- Added preset registry, catalog compiler, repository-backed loader, and reviewed custom relation promotion wrapper.
- Rewired Stage A+ relation normalization to read the compiled relation catalog rather than raw relation rule arrays.
- Validation:
  - `pnpm exec vitest run src/server/modules/knowledge-v2/relation-types/contracts.test.ts src/server/modules/knowledge-v2/relation-types/preset-registry.test.ts src/server/modules/knowledge-v2/relation-types/catalog.test.ts src/server/modules/knowledge-v2/relation-types/loader.test.ts src/server/modules/knowledge-v2/relation-types/promotion.test.ts src/server/modules/analysis/pipelines/evidence-review/stageAPlus/relation-normalization.test.ts src/server/modules/analysis/pipelines/evidence-review/stageAPlus/KnowledgeRecallStage.test.ts --coverage=false`
  - `pnpm type-check`
```

- [ ] **Step 4: Mark T18 complete in the runbook**

Update `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`:

```md
- [x] T18: `docs/superpowers/tasks/2026-04-18-evidence-review/18-relation-types-catalog.md`
```

Append a completion note:

```md
### T18 Completion - 2026-04-20

- Changed files: `src/server/modules/knowledge-v2/relation-types/**`, `src/server/modules/knowledge-v2/index.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/relation-normalization.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/relation-normalization.test.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/KnowledgeRecallStage.ts`, `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/KnowledgeRecallStage.test.ts`, `docs/superpowers/tasks/2026-04-18-evidence-review/18-relation-types-catalog.md`, `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- Validation commands: `pnpm exec vitest run src/server/modules/knowledge-v2/relation-types/contracts.test.ts src/server/modules/knowledge-v2/relation-types/preset-registry.test.ts src/server/modules/knowledge-v2/relation-types/catalog.test.ts src/server/modules/knowledge-v2/relation-types/loader.test.ts src/server/modules/knowledge-v2/relation-types/promotion.test.ts src/server/modules/analysis/pipelines/evidence-review/stageAPlus/relation-normalization.test.ts src/server/modules/analysis/pipelines/evidence-review/stageAPlus/KnowledgeRecallStage.test.ts --coverage=false`, `pnpm type-check`
- Result: relation types are now governed by a KB v2 backed catalog that supports presets, custom relation promotion, synonym lookup, disabled suppression, and Stage A+ reuse without introducing a closed enum.
- Follow-up risks: review APIs and relation editor CRUD/UI still land in T12/T14; historical relation claims continue to carry raw labels and require review-side governance choices before projection.
- Next task: T08 `docs/superpowers/tasks/2026-04-18-evidence-review/08-stage-b-identity-resolution.md`
```

- [ ] **Step 5: Commit the completion docs**

```bash
git add \
  docs/superpowers/tasks/2026-04-18-evidence-review/18-relation-types-catalog.md \
  docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md
git commit -m "docs: record t18 relation type catalog completion"
```

## Self-Review

### Spec Coverage

- §7.3 relation normalization suggestion without silent rewrite: covered by Task 2 and Task 5.
- §8.3 preset + custom relation editing foundation: covered by Task 1 presets and Task 4 promotion workflow.
- §9.4 verified/pending/negative/promotion principles: covered by Task 2, Task 3, and Task 4.
- §9.5 unified knowledge object, scope, review-state, promotion symmetry: covered by Task 3 and Task 4.
- §9.6 string key + preset registry + directory governance without enum migration: covered by Task 1, Task 2, and Task 6 no-schema guard.

### Placeholder Scan

- No `TODO`, `TBD`, or “similar to Task N” placeholders remain.
- Each task contains concrete file paths, commands, and code snippets.

### Type Consistency

- `relationTypeKey`, `defaultLabel`, `direction`, `relationTypeSource`, and `reviewState` use the same names across contracts, catalog, promotion, and Stage A+ integration.
- The loader uses the same KB knowledge type strings already registered in `payload-schemas.ts`.
- Stage A+ integration consistently changes `knowledge` relation lookup input to `relationCatalog`.
