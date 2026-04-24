# T22 End-to-End Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Execute on `dev_2`; do not create a new branch and do not touch `prisma/migrations/20260424062310/`.

**Goal:** Build the final acceptance runner, acceptance report artifacts, and launch-decision evidence for the Evidence-first rewrite by proving the evidence, review, projection, knowledge, and rebuild loops on `儒林外史` and `三国演义`.

**Architecture:** T22 is an orchestration layer on top of completed T20/T21 assets, not a new truth model. Runtime logic should live under `src/server/modules/review/evidence-review/acceptance/**`, reuse T21 regression fixtures/reports and current review services, then emit stable markdown/json acceptance artifacts under `docs/superpowers/reports/evidence-review-acceptance/**`. The final decision must combine automated loop checks with a small documented manual UI checklist; no loop may be marked passed without evidence paths and reproducible commands.

**Tech Stack:** TypeScript strict, Prisma 7 existing schema, Vitest, Node CLI via `tsx`, existing review query/mutation/audit services, existing projection builder, existing T21 regression/report modules.

---

## Source Of Truth

- Architecture spec: `docs/superpowers/specs/2026-04-18-evidence-review-architecture-rewrite-design.md` §13.3, §15, §16
- Task doc: `docs/superpowers/tasks/2026-04-18-evidence-review/22-e2e-acceptance.md`
- Runbook: `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- Upstream execution evidence:
  - `docs/superpowers/tasks/2026-04-18-evidence-review/20-cutover-read-paths.md`
  - `docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.md`
  - `docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.json`
  - `docs/superpowers/reports/review-regression/sanguo-yanyi-sample/summary.md`
  - `docs/superpowers/reports/review-regression/sanguo-yanyi-sample/summary.json`
- Existing runtime modules to reuse:
  - `src/server/modules/review/evidence-review/regression/report.ts`
  - `src/server/modules/review/evidence-review/regression/review-action-harness.ts`
  - `src/server/modules/review/evidence-review/regression/sample-seed.ts`
  - `src/server/modules/review/evidence-review/review-query-service.ts`
  - `src/server/modules/review/evidence-review/review-mutation-service.ts`
  - `src/server/modules/review/evidence-review/review-audit-service.ts`
  - `src/server/modules/review/evidence-review/projections/projection-builder.ts`
  - `src/server/modules/review/evidence-review/projections/types.ts`
  - `scripts/review-regression/run-gold-set-regression.ts`
  - `scripts/review-regression/compare-rerun-costs.ts`

## Preconditions

- T20 and T21 are already complete, committed, and locally reproducible.
- T22 must not add Prisma migrations, new database tables, or legacy truth-path compatibility shims.
- T22 must not duplicate T21 regression logic. It may wrap and cite T21 outputs, but comparison/snapshot logic stays in the existing regression layer unless an acceptance-only adapter is strictly required.
- `relationTypeKey` remains a plain string everywhere in acceptance contracts and reports.
- Manual claims in T22 must reuse the existing review-state contract. A human-created accepted claim is still modeled as `reviewState: "ACCEPTED"` and may be distinguished through `source: "MANUAL"` and audit history; T22 must not introduce `MANUAL_ACCEPTED` or any new review state.
- Acceptance output must use stable, non-timestamped artifact paths so the final go/no-go package can be cited by humans:
  - `docs/superpowers/reports/evidence-review-acceptance/rulin-waishi-sample/summary.md`
  - `docs/superpowers/reports/evidence-review-acceptance/rulin-waishi-sample/summary.json`
  - `docs/superpowers/reports/evidence-review-acceptance/sanguo-yanyi-sample/summary.md`
  - `docs/superpowers/reports/evidence-review-acceptance/sanguo-yanyi-sample/summary.json`
  - `docs/superpowers/reports/evidence-review-acceptance/final-go-no-go.md`
  - `docs/superpowers/reports/evidence-review-acceptance/final-go-no-go.json`
- Manual UI validation must also use stable input files:
  - `docs/superpowers/reports/evidence-review-acceptance/manual-checks/rulin-waishi-sample.json`
  - `docs/superpowers/reports/evidence-review-acceptance/manual-checks/sanguo-yanyi-sample.json`
- The acceptance runner may reseed T21 sample books through `seedReviewRegressionSamples`, but it must not delete unrelated user data.
- If any required T21 report is missing, the acceptance runner must regenerate it by calling the existing T21 runtime entrypoint instead of fabricating references.

## Execution Rules

- Follow strict TDD for every task: RED first, then minimal GREEN, then small refactor while staying green.
- Keep acceptance code read-focused and orchestration-focused. Only projection rebuild verification may mutate projection tables, and it must do so through the existing projection builder.
- Blocking risk rules are strict:
  - a loop failure is always blocking
  - a manual UI checklist item without observation is blocking
  - a risk item without owner or mitigation is invalid and must fail report validation
- The runner must never auto-pass manual UI checks:
  - if the scenario's manual observation file is missing, malformed, or lacks a required check, emit a blocking placeholder observation
  - any placeholder manual observation keeps the per-book decision at `NO_GO`
  - the final decision may become `GO` only after a human supplies valid observation files and reruns acceptance
- Review loop coverage must explicitly exercise all eight actions required by the task doc:
  - `ACCEPT`
  - `REJECT`
  - `DEFER`
  - `EDIT`
  - `CREATE_MANUAL_CLAIM`
  - `RELINK_EVIDENCE`
  - `MERGE_PERSONA`
  - `SPLIT_PERSONA`
- Knowledge loop acceptance must prove two things at the same time:
  - reviewed knowledge affects candidate generation or normalization inputs
  - no knowledge item bypasses review and writes projection truth directly
- Rebuild loop acceptance must cite T21 full-run versus rerun output instead of inventing a second cost model.
- Update only the T22 task doc and the runbook after implementation and validation pass. Do not edit `.trellis/tasks/**`.

## File Structure

- Create `src/server/modules/review/evidence-review/acceptance/contracts.ts`
  - Zod schemas and exported types for scenarios, loop results, manual observation files, risk items, per-book reports, and final go/no-go reports.
- Create `src/server/modules/review/evidence-review/acceptance/contracts.test.ts`
  - Locks schema validation, blocking-risk rules, and stable loop-key/value modeling.
- Create `src/server/modules/review/evidence-review/acceptance/scenarios.ts`
  - Declares the two stable sample scenarios, their fixture paths, reference report paths, report output paths, manual observation file paths, and manual UI checklist targets.
- Create `src/server/modules/review/evidence-review/acceptance/scenarios.test.ts`
  - Verifies both books are registered and all referenced paths stay stable.
- Create `src/server/modules/review/evidence-review/acceptance/repository.ts`
  - Concrete adapter that resolves book IDs by title, loads claim lists/details, audit actions, projection counts, relation catalog presence, and route paths needed by the acceptance runner.
- Create `src/server/modules/review/evidence-review/acceptance/repository.test.ts`
  - Covers book lookup, claim detail hydration, audit aggregation, and route generation.
- Create `src/server/modules/review/evidence-review/acceptance/loop-evaluators.ts`
  - Pure evaluators for evidence, review, projection, knowledge, and rebuild loops, plus aggregate decision classification.
- Create `src/server/modules/review/evidence-review/acceptance/loop-evaluators.test.ts`
  - Covers pass/fail rules, blocking vs non-blocking classification, and final go/no-go decision output.
- Create `src/server/modules/review/evidence-review/acceptance/report.ts`
  - Renders per-book markdown/json reports and the final aggregate go/no-go markdown/json package.
- Create `src/server/modules/review/evidence-review/acceptance/report.test.ts`
  - Locks section ordering, stable artifact links, and manual UI checklist rendering.
- Create `src/server/modules/review/evidence-review/acceptance/runner.ts`
  - Seeds sample books when requested, ensures referenced T21 reports exist, loads current acceptance context, exports the live snapshot/manual-check helpers, performs projection-only rebuild validation, evaluates loops, and writes artifacts.
- Create `src/server/modules/review/evidence-review/acceptance/runner.test.ts`
  - Covers orchestration order, report writing, T21 regeneration fallback, and blocking-decision behavior.
- Create `src/server/modules/review/evidence-review/acceptance/index.ts`
  - Re-export acceptance entrypoints.
- Create `scripts/review-regression/acceptance/run-e2e-acceptance.ts`
  - Thin CLI wrapper for argument parsing and final path printing.
- Create `scripts/review-regression/acceptance/run-e2e-acceptance.test.ts`
  - Covers CLI args, usage errors, and top-level delegation.
- Modify `docs/superpowers/tasks/2026-04-18-evidence-review/22-e2e-acceptance.md`
  - Mark checkpoints complete and append the execution record only after acceptance validation passes.
- Modify `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
  - Mark T22 complete only after acceptance validation passes.

## Acceptance Modeling Decisions

Use one scenario contract per book:

```ts
export interface AcceptanceBookScenario {
  scenarioKey: "rulin-waishi-sample" | "sanguo-yanyi-sample";
  bookTitle: string;
  fixturePath: string;
  manualObservationPath: string;
  reportPaths: {
    markdownPath: string;
    jsonPath: string;
  };
  referenceReports: {
    t20TaskPath: string;
    t21MarkdownPath: string;
    t21JsonPath: string;
  };
  manualChecks: Array<{
    checkKey: string;
    routeKind: "personaChapter" | "relationEditor" | "personaTime";
    expectedObservation: string;
  }>;
}
```

Use one stable manual-observation input contract per book:

```ts
export interface AcceptanceManualObservationFile {
  scenarioKey: "rulin-waishi-sample" | "sanguo-yanyi-sample";
  checks: Array<{
    checkKey: string;
    observed: string;
    passed: boolean;
    observedAtIso?: string;
  }>;
}
```

Use one per-book acceptance report contract:

```ts
export interface AcceptanceBookReport {
  scenarioKey: string;
  bookId: string;
  bookTitle: string;
  generatedAtIso: string;
  referencedArtifacts: {
    t20TaskPath: string;
    t21MarkdownPath: string;
    t21JsonPath: string;
  };
  loopResults: AcceptanceLoopResult[];
  manualChecks: AcceptanceManualCheckResult[];
  risks: AcceptanceRiskItem[];
  decision: "GO" | "NO_GO";
}
```

Use one final aggregate report contract:

```ts
export interface FinalAcceptanceReport {
  generatedAtIso: string;
  overallDecision: "GO" | "NO_GO";
  bookReports: AcceptanceBookReport[];
  blockingRisks: AcceptanceRiskItem[];
  nonBlockingRisks: AcceptanceRiskItem[];
  summaryLines: string[];
}
```

Manual-check runner behavior:

- Load `scenario.manualObservationPath` on every run.
- If the file is missing, malformed, or does not contain a required `checkKey`, create a blocking result with:
  - `observed: "PENDING_MANUAL_VERIFICATION"`
  - `passed: false`
  - `blocking: true`
- Manual validation is complete only when every configured check has a concrete observation from that file.

Loop pass rules:

- `EVIDENCE`: every accepted event/relation/time claim sampled for the scenario has at least one evidence span, quoted text, and a chapter jump target.
- `REVIEW`: the required eight actions are all observed in audit output or the rollback-safe harness result; no required action may be missing.
- `PROJECTION`: a projection-only rebuild produces an equivalent accepted snapshot compared with the pre-rebuild current snapshot.
- `KNOWLEDGE`: reviewed relation/catalog knowledge is visible to normalization inputs, while accepted projection rows still come from reviewed claims.
- `REBUILD`: T21 rerun comparison exists, reports identical snapshot truth, and cost comparison is present when baseline/candidate run IDs exist.

## Task 1: Acceptance Contracts And Scenario Registry

**Files:**
- Create: `src/server/modules/review/evidence-review/acceptance/contracts.ts`
- Create: `src/server/modules/review/evidence-review/acceptance/contracts.test.ts`
- Create: `src/server/modules/review/evidence-review/acceptance/scenarios.ts`
- Create: `src/server/modules/review/evidence-review/acceptance/scenarios.test.ts`
- Create: `src/server/modules/review/evidence-review/acceptance/index.ts`

- [ ] **Step 1: Write the failing contract tests**

```ts
import { describe, expect, it } from "vitest";

import {
  ACCEPTANCE_LOOP_KEYS,
  acceptanceManualObservationFileSchema,
  acceptanceBookReportSchema,
  acceptanceRiskItemSchema,
  finalAcceptanceReportSchema
} from "./contracts";

describe("acceptance contracts", () => {
  it("locks the five required loops", () => {
    expect(ACCEPTANCE_LOOP_KEYS).toEqual([
      "EVIDENCE",
      "REVIEW",
      "PROJECTION",
      "KNOWLEDGE",
      "REBUILD"
    ]);
  });

  it("rejects blocking risks without owner and mitigation", () => {
    expect(() => acceptanceRiskItemSchema.parse({
      severity: "BLOCKING",
      summary: "review loop missing SPLIT",
      owner: "",
      mitigation: ""
    })).toThrowError(/owner/i);
  });

  it("accepts final report with per-book decisions", () => {
    const parsed = finalAcceptanceReportSchema.parse({
      generatedAtIso: "2026-04-24T00:00:00.000Z",
      overallDecision: "GO",
      bookReports: [{
        scenarioKey: "rulin-waishi-sample",
        bookId: "book-1",
        bookTitle: "儒林外史",
        generatedAtIso: "2026-04-24T00:00:00.000Z",
        referencedArtifacts: {
          t20TaskPath: "docs/superpowers/tasks/2026-04-18-evidence-review/20-cutover-read-paths.md",
          t21MarkdownPath: "docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.md",
          t21JsonPath: "docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.json"
        },
        loopResults: [],
        manualChecks: [],
        risks: [],
        decision: "GO"
      }],
      blockingRisks: [],
      nonBlockingRisks: [],
      summaryLines: ["All loops passed."]
    });

    expect(parsed.overallDecision).toBe("GO");
  });

  it("accepts stable manual observation files", () => {
    const parsed = acceptanceManualObservationFileSchema.parse({
      scenarioKey: "rulin-waishi-sample",
      checks: [{
        checkKey: "persona-chapter-evidence-jump",
        observed: "Claim detail panel opened and jumped to chapter evidence.",
        passed: true,
        observedAtIso: "2026-04-24T00:00:00.000Z"
      }]
    });

    expect(parsed.checks).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the contract tests to verify RED**

Run:

```bash
pnpm exec vitest run src/server/modules/review/evidence-review/acceptance/contracts.test.ts --coverage=false
```

Expected: FAIL with `Cannot find module './contracts'` or equivalent missing-file error.

- [ ] **Step 3: Write the minimal contract implementation**

```ts
import { z } from "zod";

export const ACCEPTANCE_LOOP_KEYS = [
  "EVIDENCE",
  "REVIEW",
  "PROJECTION",
  "KNOWLEDGE",
  "REBUILD"
] as const;

export const acceptanceRiskItemSchema = z.object({
  severity: z.enum(["BLOCKING", "NON_BLOCKING"]),
  summary: z.string().min(1),
  owner: z.string().min(1, "owner is required"),
  mitigation: z.string().min(1, "mitigation is required")
});

export const acceptanceLoopResultSchema = z.object({
  loopKey: z.enum(ACCEPTANCE_LOOP_KEYS),
  passed: z.boolean(),
  summary: z.string().min(1),
  evidenceLines: z.array(z.string().min(1)),
  artifactPaths: z.array(z.string().min(1)),
  blocking: z.boolean()
});

export const acceptanceManualCheckResultSchema = z.object({
  checkKey: z.string().min(1),
  routePath: z.string().min(1),
  expectedObservation: z.string().min(1),
  observed: z.string().min(1),
  passed: z.boolean(),
  blocking: z.boolean()
});

export const acceptanceManualObservationFileSchema = z.object({
  scenarioKey: z.enum(["rulin-waishi-sample", "sanguo-yanyi-sample"]),
  checks: z.array(z.object({
    checkKey: z.string().min(1),
    observed: z.string().min(1),
    passed: z.boolean(),
    observedAtIso: z.string().datetime().optional()
  }))
});

export const acceptanceBookReportSchema = z.object({
  scenarioKey: z.string().min(1),
  bookId: z.string().min(1),
  bookTitle: z.string().min(1),
  generatedAtIso: z.string().datetime(),
  referencedArtifacts: z.object({
    t20TaskPath: z.string().min(1),
    t21MarkdownPath: z.string().min(1),
    t21JsonPath: z.string().min(1)
  }),
  loopResults: z.array(acceptanceLoopResultSchema),
  manualChecks: z.array(acceptanceManualCheckResultSchema),
  risks: z.array(acceptanceRiskItemSchema),
  decision: z.enum(["GO", "NO_GO"])
});

export const finalAcceptanceReportSchema = z.object({
  generatedAtIso: z.string().datetime(),
  overallDecision: z.enum(["GO", "NO_GO"]),
  bookReports: z.array(acceptanceBookReportSchema),
  blockingRisks: z.array(acceptanceRiskItemSchema),
  nonBlockingRisks: z.array(acceptanceRiskItemSchema),
  summaryLines: z.array(z.string().min(1))
});

export type AcceptanceBookReport = z.infer<typeof acceptanceBookReportSchema>;
export type AcceptanceLoopKey = (typeof ACCEPTANCE_LOOP_KEYS)[number];
export type FinalAcceptanceReport = z.infer<typeof finalAcceptanceReportSchema>;
export type AcceptanceManualObservationFile = z.infer<typeof acceptanceManualObservationFileSchema>;
```

- [ ] **Step 4: Re-run the contract tests to verify GREEN**

Run:

```bash
pnpm exec vitest run src/server/modules/review/evidence-review/acceptance/contracts.test.ts --coverage=false
```

Expected: PASS.

- [ ] **Step 5: Write the failing scenario registry tests**

```ts
import { describe, expect, it } from "vitest";

import {
  ACCEPTANCE_SCENARIOS,
  FINAL_ACCEPTANCE_REPORT_PATHS
} from "./scenarios";

describe("acceptance scenarios", () => {
  it("registers both sample books with stable report paths", () => {
    expect(ACCEPTANCE_SCENARIOS.map((item) => item.scenarioKey)).toEqual([
      "rulin-waishi-sample",
      "sanguo-yanyi-sample"
    ]);
    expect(ACCEPTANCE_SCENARIOS[0].reportPaths.markdownPath)
      .toBe("docs/superpowers/reports/evidence-review-acceptance/rulin-waishi-sample/summary.md");
    expect(ACCEPTANCE_SCENARIOS[1].referenceReports.t21JsonPath)
      .toBe("docs/superpowers/reports/review-regression/sanguo-yanyi-sample/summary.json");
  });

  it("locks the final aggregate report paths", () => {
    expect(FINAL_ACCEPTANCE_REPORT_PATHS).toEqual({
      markdownPath: "docs/superpowers/reports/evidence-review-acceptance/final-go-no-go.md",
      jsonPath: "docs/superpowers/reports/evidence-review-acceptance/final-go-no-go.json"
    });
  });
});
```

- [ ] **Step 6: Run the scenario tests to verify RED**

Run:

```bash
pnpm exec vitest run src/server/modules/review/evidence-review/acceptance/scenarios.test.ts --coverage=false
```

Expected: FAIL with `Cannot find module './scenarios'`.

- [ ] **Step 7: Write the minimal scenario registry**

```ts
export const FINAL_ACCEPTANCE_REPORT_PATHS = {
  markdownPath: "docs/superpowers/reports/evidence-review-acceptance/final-go-no-go.md",
  jsonPath: "docs/superpowers/reports/evidence-review-acceptance/final-go-no-go.json"
} as const;

export const ACCEPTANCE_SCENARIOS = [
  {
    scenarioKey: "rulin-waishi-sample",
    bookTitle: "儒林外史",
    fixturePath: "tests/fixtures/review-regression/rulin-waishi.fixture.json",
    manualObservationPath: "docs/superpowers/reports/evidence-review-acceptance/manual-checks/rulin-waishi-sample.json",
    reportPaths: {
      markdownPath: "docs/superpowers/reports/evidence-review-acceptance/rulin-waishi-sample/summary.md",
      jsonPath: "docs/superpowers/reports/evidence-review-acceptance/rulin-waishi-sample/summary.json"
    },
    referenceReports: {
      t20TaskPath: "docs/superpowers/tasks/2026-04-18-evidence-review/20-cutover-read-paths.md",
      t21MarkdownPath: "docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.md",
      t21JsonPath: "docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.json"
    },
    manualChecks: [
      {
        checkKey: "persona-chapter-evidence-jump",
        routeKind: "personaChapter",
        expectedObservation: "人物x章节矩阵可打开共享明细面板并跳转原文证据。"
      },
      {
        checkKey: "relation-editor-evidence-jump",
        routeKind: "relationEditor",
        expectedObservation: "关系编辑页可查看方向、生效区间与证据原文。"
      },
      {
        checkKey: "persona-time-evidence-jump",
        routeKind: "personaTime",
        expectedObservation: "人物x时间矩阵可打开共享明细面板并查看关联章节。"
      }
    ]
  },
  {
    scenarioKey: "sanguo-yanyi-sample",
    bookTitle: "三国演义",
    fixturePath: "tests/fixtures/review-regression/sanguo-yanyi.fixture.json",
    manualObservationPath: "docs/superpowers/reports/evidence-review-acceptance/manual-checks/sanguo-yanyi-sample.json",
    reportPaths: {
      markdownPath: "docs/superpowers/reports/evidence-review-acceptance/sanguo-yanyi-sample/summary.md",
      jsonPath: "docs/superpowers/reports/evidence-review-acceptance/sanguo-yanyi-sample/summary.json"
    },
    referenceReports: {
      t20TaskPath: "docs/superpowers/tasks/2026-04-18-evidence-review/20-cutover-read-paths.md",
      t21MarkdownPath: "docs/superpowers/reports/review-regression/sanguo-yanyi-sample/summary.md",
      t21JsonPath: "docs/superpowers/reports/review-regression/sanguo-yanyi-sample/summary.json"
    },
    manualChecks: [
      {
        checkKey: "persona-chapter-evidence-jump",
        routeKind: "personaChapter",
        expectedObservation: "人物x章节矩阵可追到战役相关原文。"
      },
      {
        checkKey: "relation-editor-evidence-jump",
        routeKind: "relationEditor",
        expectedObservation: "关系页可编辑动态关系并保留方向。"
      },
      {
        checkKey: "persona-time-evidence-jump",
        routeKind: "personaTime",
        expectedObservation: "人物x时间矩阵可展示模糊时间片并回跳章节。"
      }
    ]
  }
] as const;

export * from "./contracts";
```

- [ ] **Step 8: Re-run the scenario tests to verify GREEN**

Run:

```bash
pnpm exec vitest run src/server/modules/review/evidence-review/acceptance/contracts.test.ts src/server/modules/review/evidence-review/acceptance/scenarios.test.ts --coverage=false
```

Expected: PASS.

- [ ] **Step 9: Export the acceptance package and commit**

```ts
export * from "./contracts";
export * from "./scenarios";
```

Run:

```bash
git add \
  src/server/modules/review/evidence-review/acceptance/contracts.ts \
  src/server/modules/review/evidence-review/acceptance/contracts.test.ts \
  src/server/modules/review/evidence-review/acceptance/scenarios.ts \
  src/server/modules/review/evidence-review/acceptance/scenarios.test.ts \
  src/server/modules/review/evidence-review/acceptance/index.ts
git commit -m "feat(review): add t22 acceptance contracts"
```

## Task 2: Acceptance Repository Adapter

**Files:**
- Create: `src/server/modules/review/evidence-review/acceptance/repository.ts`
- Create: `src/server/modules/review/evidence-review/acceptance/repository.test.ts`

- [ ] **Step 1: Write the failing repository test**

```ts
import { describe, expect, it, vi } from "vitest";

import { createAcceptanceRepository } from "./repository";

describe("createAcceptanceRepository", () => {
  it("hydrates claim details, audit rows, projection counts, and route paths", async () => {
    const repository = createAcceptanceRepository({
      bookLookup: {
        findByTitle: vi.fn().mockResolvedValue({ id: "book-1", title: "儒林外史" })
      },
      reviewQuery: {
        listReviewClaims: vi.fn().mockResolvedValue([
          { claimKind: "EVENT", claimId: "event-1" },
          { claimKind: "RELATION", claimId: "relation-1" }
        ]),
        getClaimDetail: vi.fn()
          .mockResolvedValueOnce({
            claim: { claimId: "event-1", reviewState: "ACCEPTED" },
            evidence: [{ id: "ev-1", chapterId: "chapter-3", quotedText: "范进中举", startOffset: 10, endOffset: 14 }]
          })
          .mockResolvedValueOnce({
            claim: { claimId: "relation-1", reviewState: "ACCEPTED" },
            evidence: [{ id: "ev-2", chapterId: "chapter-3", quotedText: "胡屠户认范进为女婿", startOffset: 20, endOffset: 30 }]
          })
      },
      auditQuery: {
        listActions: vi.fn().mockResolvedValue(["ACCEPT", "EDIT", "MERGE_PERSONA"])
      },
      projectionQuery: {
        getCounts: vi.fn().mockResolvedValue({
          personaChapterFacts: 3,
          personaTimeFacts: 1,
          relationshipEdges: 2,
          timelineEvents: 1
        })
      },
      relationCatalog: {
        hasEntry: vi.fn().mockResolvedValue(true)
      }
    } as never);

    const context = await repository.loadBookContext({
      scenarioKey: "rulin-waishi-sample",
      bookTitle: "儒林外史"
    });

    expect(context.book.id).toBe("book-1");
    expect(context.claimDetails).toHaveLength(2);
    expect(context.auditActions).toContain("EDIT");
    expect(context.routes).toEqual({
      personaChapter: "/admin/review/book-1",
      relationEditor: "/admin/review/book-1/relations",
      personaTime: "/admin/review/book-1/time"
    });
    expect(context.relationCatalogAvailable).toBe(true);
  });
});
```

- [ ] **Step 2: Run the repository test to verify RED**

Run:

```bash
pnpm exec vitest run src/server/modules/review/evidence-review/acceptance/repository.test.ts --coverage=false
```

Expected: FAIL with `Cannot find module './repository'`.

- [ ] **Step 3: Write the minimal repository adapter**

```ts
import { reviewQueryService } from "@/server/modules/review/evidence-review/review-query-service";

export interface AcceptanceBookContext {
  book: { id: string; title: string };
  claimDetails: Array<{
    claimKind: "EVENT" | "RELATION" | "TIME" | "IDENTITY";
    claimId: string;
    reviewState: string;
    evidence: Array<{
      id: string;
      chapterId: string;
      quotedText: string;
      startOffset: number | null;
      endOffset: number | null;
    }>;
  }>;
  auditActions: string[];
  projectionCounts: {
    personaChapterFacts: number;
    personaTimeFacts: number;
    relationshipEdges: number;
    timelineEvents: number;
  };
  relationCatalogAvailable: boolean;
  routes: {
    personaChapter: string;
    relationEditor: string;
    personaTime: string;
  };
}

export function createAcceptanceRepository(dependencies: {
  bookLookup?: { findByTitle(title: string): Promise<{ id: string; title: string } | null> };
  reviewQuery?: Pick<typeof reviewQueryService, "listReviewClaims" | "getClaimDetail">;
  auditQuery?: { listActions(bookId: string): Promise<string[]> };
  projectionQuery?: {
    getCounts(bookId: string): Promise<AcceptanceBookContext["projectionCounts"]>;
  };
  relationCatalog?: { hasEntry(bookId: string): Promise<boolean> };
} = {}) {
  return {
    async loadBookContext(input: { scenarioKey: string; bookTitle: string }): Promise<AcceptanceBookContext> {
      const book = await dependencies.bookLookup?.findByTitle(input.bookTitle);
      if (book === null || book === undefined) {
        throw new Error(`Acceptance book not found: ${input.bookTitle}`);
      }

      const claimRows = await (dependencies.reviewQuery ?? reviewQueryService).listReviewClaims({
        bookId: book.id,
        claimKinds: ["EVENT", "RELATION", "TIME", "IDENTITY"],
        reviewStates: ["ACCEPTED"],
        limit: 200
      });

      const claimDetails = await Promise.all(claimRows.map(async (row) => {
        const detail = await (dependencies.reviewQuery ?? reviewQueryService).getClaimDetail({
          bookId: book.id,
          claimKind: row.claimKind,
          claimId: row.claimId
        });

        return {
          claimKind: row.claimKind,
          claimId: row.claimId,
          reviewState: detail.claim.reviewState,
          evidence: detail.evidence.map((item) => ({
            id: item.id,
            chapterId: item.chapterId,
            quotedText: item.quotedText,
            startOffset: item.startOffset,
            endOffset: item.endOffset
          }))
        };
      }));

      return {
        book,
        claimDetails,
        auditActions: await dependencies.auditQuery?.listActions(book.id) ?? [],
        projectionCounts: await dependencies.projectionQuery?.getCounts(book.id) ?? {
          personaChapterFacts: 0,
          personaTimeFacts: 0,
          relationshipEdges: 0,
          timelineEvents: 0
        },
        relationCatalogAvailable: await dependencies.relationCatalog?.hasEntry(book.id) ?? false,
        routes: {
          personaChapter: `/admin/review/${book.id}`,
          relationEditor: `/admin/review/${book.id}/relations`,
          personaTime: `/admin/review/${book.id}/time`
        }
      };
    }
  };
}
```

- [ ] **Step 4: Re-run the repository test to verify GREEN**

Run:

```bash
pnpm exec vitest run src/server/modules/review/evidence-review/acceptance/repository.test.ts --coverage=false
```

Expected: PASS.

- [ ] **Step 5: Commit the repository adapter**

```bash
git add \
  src/server/modules/review/evidence-review/acceptance/repository.ts \
  src/server/modules/review/evidence-review/acceptance/repository.test.ts
git commit -m "feat(review): add t22 acceptance repository"
```

## Task 3: Evidence, Review, And Projection Loop Evaluators

**Files:**
- Create: `src/server/modules/review/evidence-review/acceptance/loop-evaluators.ts`
- Create: `src/server/modules/review/evidence-review/acceptance/loop-evaluators.test.ts`

- [ ] **Step 1: Write the failing evidence/review/projection evaluator tests**

```ts
import { describe, expect, it } from "vitest";

import {
  evaluateEvidenceLoop,
  evaluateProjectionLoop,
  evaluateReviewLoop
} from "./loop-evaluators";

describe("evaluateEvidenceLoop", () => {
  it("fails when an accepted claim is missing evidence jump metadata", () => {
    const result = evaluateEvidenceLoop({
      claimDetails: [{
        claimKind: "EVENT",
        claimId: "event-1",
        reviewState: "ACCEPTED",
        evidence: []
      }]
    } as never);

    expect(result.passed).toBe(false);
    expect(result.blocking).toBe(true);
  });
});

describe("evaluateReviewLoop", () => {
  it("fails when one required review action is missing", () => {
    const result = evaluateReviewLoop({
      auditActions: ["ACCEPT", "REJECT", "DEFER", "EDIT", "CREATE_MANUAL_CLAIM", "RELINK_EVIDENCE", "MERGE_PERSONA"]
    } as never);

    expect(result.passed).toBe(false);
    expect(result.evidenceLines.join("\\n")).toMatch(/SPLIT_PERSONA/);
  });
});

describe("evaluateProjectionLoop", () => {
  it("passes when before and after snapshots are equivalent", () => {
    const result = evaluateProjectionLoop({
      beforeSnapshotKeys: ["persona:范进", "relation:胡屠户->范进:father_in_law_of"],
      afterSnapshotKeys: ["persona:范进", "relation:胡屠户->范进:father_in_law_of"]
    });

    expect(result.passed).toBe(true);
  });
});
```

- [ ] **Step 2: Run the evaluator tests to verify RED**

Run:

```bash
pnpm exec vitest run src/server/modules/review/evidence-review/acceptance/loop-evaluators.test.ts --coverage=false
```

Expected: FAIL with `Cannot find module './loop-evaluators'`.

- [ ] **Step 3: Write the minimal evidence/review/projection evaluators**

```ts
const REQUIRED_REVIEW_ACTIONS = [
  "ACCEPT",
  "REJECT",
  "DEFER",
  "EDIT",
  "CREATE_MANUAL_CLAIM",
  "RELINK_EVIDENCE",
  "MERGE_PERSONA",
  "SPLIT_PERSONA"
] as const;

export function evaluateEvidenceLoop(input: {
  claimDetails: Array<{
    claimKind: string;
    claimId: string;
    reviewState: string;
    evidence: Array<{
      id: string;
      chapterId: string;
      quotedText: string;
      startOffset: number | null;
      endOffset: number | null;
    }>;
  }>;
}) {
  const failedClaims = input.claimDetails.filter((claim) => claim.evidence.length === 0);

  return {
    loopKey: "EVIDENCE" as const,
    passed: failedClaims.length === 0,
    blocking: failedClaims.length > 0,
    summary: failedClaims.length === 0
      ? `Validated ${input.claimDetails.length} accepted claim evidence chains.`
      : `${failedClaims.length} accepted claims are missing evidence jumps.`,
    evidenceLines: failedClaims.length === 0
      ? input.claimDetails.map((claim) => `${claim.claimKind}:${claim.claimId} has evidence`)
      : failedClaims.map((claim) => `${claim.claimKind}:${claim.claimId} missing evidence span`),
    artifactPaths: []
  };
}

export function evaluateReviewLoop(input: { auditActions: string[] }) {
  const missingActions = REQUIRED_REVIEW_ACTIONS.filter((action) => !input.auditActions.includes(action));

  return {
    loopKey: "REVIEW" as const,
    passed: missingActions.length === 0,
    blocking: missingActions.length > 0,
    summary: missingActions.length === 0
      ? "Observed all required review mutations."
      : `Missing review actions: ${missingActions.join(", ")}`,
    evidenceLines: missingActions.length === 0
      ? input.auditActions.map((action) => `Observed ${action}`)
      : missingActions.map((action) => `Missing ${action}`),
    artifactPaths: []
  };
}

export function evaluateProjectionLoop(input: {
  beforeSnapshotKeys: string[];
  afterSnapshotKeys: string[];
}) {
  const before = [...input.beforeSnapshotKeys].sort();
  const after = [...input.afterSnapshotKeys].sort();
  const identical = JSON.stringify(before) === JSON.stringify(after);

  return {
    loopKey: "PROJECTION" as const,
    passed: identical,
    blocking: !identical,
    summary: identical
      ? `Projection rebuild preserved ${before.length} canonical keys.`
      : "Projection rebuild changed accepted snapshot truth.",
    evidenceLines: identical
      ? before.map((key) => `Preserved ${key}`)
      : [
          `before=${before.join(", ")}`,
          `after=${after.join(", ")}`
        ],
    artifactPaths: []
  };
}
```

- [ ] **Step 4: Re-run the evaluator tests to verify GREEN**

Run:

```bash
pnpm exec vitest run src/server/modules/review/evidence-review/acceptance/loop-evaluators.test.ts --coverage=false
```

Expected: PASS.

- [ ] **Step 5: Commit the first loop evaluators**

```bash
git add \
  src/server/modules/review/evidence-review/acceptance/loop-evaluators.ts \
  src/server/modules/review/evidence-review/acceptance/loop-evaluators.test.ts
git commit -m "feat(review): add t22 evidence and review loop evaluators"
```

## Task 4: Knowledge, Rebuild, And Final Decision Evaluation

**Files:**
- Modify: `src/server/modules/review/evidence-review/acceptance/loop-evaluators.ts`
- Modify: `src/server/modules/review/evidence-review/acceptance/loop-evaluators.test.ts`

- [ ] **Step 1: Extend the tests for knowledge loop, rebuild loop, and final decision**

```ts
import {
  classifyFinalAcceptanceDecision,
  evaluateKnowledgeLoop,
  evaluateRebuildLoop
} from "./loop-evaluators";

describe("evaluateKnowledgeLoop", () => {
  it("fails when reviewed knowledge is absent or projection bypasses review", () => {
    const result = evaluateKnowledgeLoop({
      relationCatalogAvailable: false,
      reviewedClaimBackedProjection: false
    });

    expect(result.passed).toBe(false);
    expect(result.blocking).toBe(true);
  });
});

describe("evaluateRebuildLoop", () => {
  it("passes when T21 rerun comparison is identical and has cost comparison", () => {
    const result = evaluateRebuildLoop({
      hasReferenceReport: true,
      rerunIdentical: true,
      hasCostComparison: true
    });

    expect(result.passed).toBe(true);
  });
});

describe("classifyFinalAcceptanceDecision", () => {
  it("returns NO_GO when any blocking loop or manual check fails", () => {
    const result = classifyFinalAcceptanceDecision({
      loopResults: [
        { loopKey: "EVIDENCE", passed: true, blocking: false, summary: "", evidenceLines: [], artifactPaths: [] },
        { loopKey: "REVIEW", passed: false, blocking: true, summary: "", evidenceLines: [], artifactPaths: [] }
      ],
      manualChecks: [{
        checkKey: "persona-chapter-evidence-jump",
        routePath: "/admin/review/book-1",
        expectedObservation: "jump works",
        observed: "not executed",
        passed: false,
        blocking: true
      }],
      risks: []
    });

    expect(result).toBe("NO_GO");
  });
});
```

- [ ] **Step 2: Run the extended evaluator tests to verify RED**

Run:

```bash
pnpm exec vitest run src/server/modules/review/evidence-review/acceptance/loop-evaluators.test.ts --coverage=false
```

Expected: FAIL with `evaluateKnowledgeLoop is not a function` or equivalent.

- [ ] **Step 3: Implement knowledge/rebuild/final decision evaluation**

```ts
export function evaluateKnowledgeLoop(input: {
  relationCatalogAvailable: boolean;
  reviewedClaimBackedProjection: boolean;
}) {
  const passed = input.relationCatalogAvailable && input.reviewedClaimBackedProjection;

  return {
    loopKey: "KNOWLEDGE" as const,
    passed,
    blocking: !passed,
    summary: passed
      ? "Reviewed knowledge influences normalization and still flows through reviewable claims."
      : "Knowledge loop is incomplete: catalog or reviewed-claim gating is missing.",
    evidenceLines: [
      `relationCatalogAvailable=${String(input.relationCatalogAvailable)}`,
      `reviewedClaimBackedProjection=${String(input.reviewedClaimBackedProjection)}`
    ],
    artifactPaths: []
  };
}

export function evaluateRebuildLoop(input: {
  hasReferenceReport: boolean;
  rerunIdentical: boolean;
  hasCostComparison: boolean;
}) {
  const passed = input.hasReferenceReport && input.rerunIdentical && input.hasCostComparison;

  return {
    loopKey: "REBUILD" as const,
    passed,
    blocking: !passed,
    summary: passed
      ? "T21 rerun comparison confirms identical truth and cost comparison is available."
      : "Rebuild loop evidence is incomplete or divergent.",
    evidenceLines: [
      `hasReferenceReport=${String(input.hasReferenceReport)}`,
      `rerunIdentical=${String(input.rerunIdentical)}`,
      `hasCostComparison=${String(input.hasCostComparison)}`
    ],
    artifactPaths: []
  };
}

export function classifyFinalAcceptanceDecision(input: {
  loopResults: Array<{ passed: boolean; blocking: boolean }>;
  manualChecks: Array<{ passed: boolean; blocking: boolean }>;
  risks: Array<{ severity: "BLOCKING" | "NON_BLOCKING" }>;
}) {
  const hasBlockingLoop = input.loopResults.some((item) => !item.passed && item.blocking);
  const hasBlockingManual = input.manualChecks.some((item) => !item.passed && item.blocking);
  const hasBlockingRisk = input.risks.some((item) => item.severity === "BLOCKING");

  return hasBlockingLoop || hasBlockingManual || hasBlockingRisk ? "NO_GO" : "GO";
}
```

- [ ] **Step 4: Re-run the evaluator tests to verify GREEN**

Run:

```bash
pnpm exec vitest run src/server/modules/review/evidence-review/acceptance/loop-evaluators.test.ts --coverage=false
```

Expected: PASS.

- [ ] **Step 5: Commit the completed loop evaluator module**

```bash
git add \
  src/server/modules/review/evidence-review/acceptance/loop-evaluators.ts \
  src/server/modules/review/evidence-review/acceptance/loop-evaluators.test.ts
git commit -m "feat(review): add t22 knowledge and rebuild loop checks"
```

## Task 5: Acceptance Report Renderer And Runner

**Files:**
- Create: `src/server/modules/review/evidence-review/acceptance/report.ts`
- Create: `src/server/modules/review/evidence-review/acceptance/report.test.ts`
- Create: `src/server/modules/review/evidence-review/acceptance/runner.ts`
- Create: `src/server/modules/review/evidence-review/acceptance/runner.test.ts`
- Modify: `src/server/modules/review/evidence-review/acceptance/index.ts`

- [ ] **Step 1: Write the failing report and runner tests**

```ts
import { describe, expect, it, vi } from "vitest";

import { renderAcceptanceBookReport, renderFinalAcceptanceReport } from "./report";
import { runEndToEndAcceptance } from "./runner";

describe("renderAcceptanceBookReport", () => {
  it("renders loop sections, manual checklist, risks, and references", () => {
    const markdown = renderAcceptanceBookReport({
      scenarioKey: "rulin-waishi-sample",
      bookId: "book-1",
      bookTitle: "儒林外史",
      generatedAtIso: "2026-04-24T00:00:00.000Z",
      referencedArtifacts: {
        t20TaskPath: "docs/superpowers/tasks/2026-04-18-evidence-review/20-cutover-read-paths.md",
        t21MarkdownPath: "docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.md",
        t21JsonPath: "docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.json"
      },
      loopResults: [{
        loopKey: "EVIDENCE",
        passed: true,
        blocking: false,
        summary: "ok",
        evidenceLines: ["EVENT:event-1 has evidence"],
        artifactPaths: []
      }],
      manualChecks: [{
        checkKey: "persona-chapter-evidence-jump",
        routePath: "/admin/review/book-1",
        expectedObservation: "jump works",
        observed: "confirmed",
        passed: true,
        blocking: true
      }],
      risks: [],
      decision: "GO"
    });

    expect(markdown).toContain("## Loop Results");
    expect(markdown).toContain("/admin/review/book-1");
  });
});

describe("runEndToEndAcceptance", () => {
  it("regenerates missing T21 report, evaluates loops, and writes artifacts", async () => {
    const writeArtifact = vi.fn().mockResolvedValue(undefined);
    const runner = await runEndToEndAcceptance({
      scenarios: [{
        scenarioKey: "rulin-waishi-sample",
        bookTitle: "儒林外史",
        fixturePath: "tests/fixtures/review-regression/rulin-waishi.fixture.json",
        manualObservationPath: "docs/superpowers/reports/evidence-review-acceptance/manual-checks/rulin-waishi-sample.json",
        reportPaths: {
          markdownPath: "docs/superpowers/reports/evidence-review-acceptance/rulin-waishi-sample/summary.md",
          jsonPath: "docs/superpowers/reports/evidence-review-acceptance/rulin-waishi-sample/summary.json"
        },
        referenceReports: {
          t20TaskPath: "docs/superpowers/tasks/2026-04-18-evidence-review/20-cutover-read-paths.md",
          t21MarkdownPath: "docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.md",
          t21JsonPath: "docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.json"
        },
        manualChecks: []
      }],
      finalReportPaths: {
        markdownPath: "docs/superpowers/reports/evidence-review-acceptance/final-go-no-go.md",
        jsonPath: "docs/superpowers/reports/evidence-review-acceptance/final-go-no-go.json"
      },
      ensureRegressionReport: vi.fn().mockResolvedValue({
        markdownPath: "docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.md",
        jsonPath: "docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.json",
        runComparison: { snapshotDiff: { identical: true }, costComparison: { totalDeltaUsd: -0.02 } }
      }),
      acceptanceRepository: {
        loadBookContext: vi.fn().mockResolvedValue({
          book: { id: "book-1", title: "儒林外史" },
          claimDetails: [{
            claimKind: "EVENT",
            claimId: "event-1",
            reviewState: "ACCEPTED",
            evidence: [{ id: "ev-1", chapterId: "chapter-3", quotedText: "范进中举", startOffset: 10, endOffset: 14 }]
          }],
          auditActions: ["ACCEPT", "REJECT", "DEFER", "EDIT", "CREATE_MANUAL_CLAIM", "RELINK_EVIDENCE", "MERGE_PERSONA", "SPLIT_PERSONA"],
          projectionCounts: { personaChapterFacts: 1, personaTimeFacts: 1, relationshipEdges: 1, timelineEvents: 1 },
          relationCatalogAvailable: true,
          routes: {
            personaChapter: "/admin/review/book-1",
            relationEditor: "/admin/review/book-1/relations",
            personaTime: "/admin/review/book-1/time"
          }
        })
      },
      snapshotProvider: {
        buildBeforeAfter: vi.fn().mockResolvedValue({
          beforeSnapshotKeys: ["persona:范进"],
          afterSnapshotKeys: ["persona:范进"],
          reviewedClaimBackedProjection: true
        })
      },
      manualCheckRecorder: vi.fn().mockResolvedValue([]),
      writeArtifact
    });

    expect(runner.overallDecision).toBe("GO");
    expect(writeArtifact).toHaveBeenCalledTimes(4);
  });
});
```

- [ ] **Step 2: Run the report and runner tests to verify RED**

Run:

```bash
pnpm exec vitest run \
  src/server/modules/review/evidence-review/acceptance/report.test.ts \
  src/server/modules/review/evidence-review/acceptance/runner.test.ts \
  --coverage=false
```

Expected: FAIL with missing module errors.

- [ ] **Step 3: Write the minimal report renderer**

```ts
export function renderAcceptanceBookReport(report: {
  scenarioKey: string;
  bookId: string;
  bookTitle: string;
  generatedAtIso: string;
  referencedArtifacts: {
    t20TaskPath: string;
    t21MarkdownPath: string;
    t21JsonPath: string;
  };
  loopResults: Array<{
    loopKey: string;
    passed: boolean;
    blocking: boolean;
    summary: string;
    evidenceLines: string[];
    artifactPaths: string[];
  }>;
  manualChecks: Array<{
    checkKey: string;
    routePath: string;
    expectedObservation: string;
    observed: string;
    passed: boolean;
    blocking: boolean;
  }>;
  risks: Array<{
    severity: string;
    summary: string;
    owner: string;
    mitigation: string;
  }>;
  decision: "GO" | "NO_GO";
}) {
  const lines = [
    `# Acceptance Report: ${report.bookTitle}`,
    "",
    `Decision: ${report.decision}`,
    `Generated at: ${report.generatedAtIso}`,
    "",
    "## Referenced Artifacts",
    `- T20 task: ${report.referencedArtifacts.t20TaskPath}`,
    `- T21 markdown: ${report.referencedArtifacts.t21MarkdownPath}`,
    `- T21 json: ${report.referencedArtifacts.t21JsonPath}`,
    "",
    "## Loop Results"
  ];

  for (const loop of report.loopResults) {
    lines.push(
      `### ${loop.loopKey}`,
      `- Passed: ${loop.passed ? "yes" : "no"}`,
      `- Blocking: ${loop.blocking ? "yes" : "no"}`,
      `- Summary: ${loop.summary}`,
      ...loop.evidenceLines.map((line) => `- Evidence: ${line}`),
      ...loop.artifactPaths.map((line) => `- Artifact: ${line}`),
      ""
    );
  }

  lines.push("## Manual Checks");
  for (const check of report.manualChecks) {
    lines.push(
      `- ${check.checkKey}: ${check.routePath}`,
      `  expected=${check.expectedObservation}`,
      `  observed=${check.observed}`,
      `  passed=${check.passed ? "yes" : "no"}`
    );
  }

  lines.push("", "## Risks");
  for (const risk of report.risks) {
    lines.push(`- [${risk.severity}] ${risk.summary} | owner=${risk.owner} | mitigation=${risk.mitigation}`);
  }

  return lines.join("\\n");
}

export function renderFinalAcceptanceReport(report: {
  overallDecision: "GO" | "NO_GO";
  generatedAtIso: string;
  summaryLines: string[];
  bookReports: Array<{ scenarioKey: string; decision: "GO" | "NO_GO" }>;
  blockingRisks: Array<{ summary: string }>;
  nonBlockingRisks: Array<{ summary: string }>;
}) {
  return [
    "# Evidence-First Rewrite Final Go/No-Go",
    "",
    `Decision: ${report.overallDecision}`,
    `Generated at: ${report.generatedAtIso}`,
    "",
    "## Books",
    ...report.bookReports.map((item) => `- ${item.scenarioKey}: ${item.decision}`),
    "",
    "## Summary",
    ...report.summaryLines.map((item) => `- ${item}`),
    "",
    "## Blocking Risks",
    ...report.blockingRisks.map((item) => `- ${item.summary}`),
    "",
    "## Non-Blocking Risks",
    ...report.nonBlockingRisks.map((item) => `- ${item.summary}`)
  ].join("\\n");
}
```

- [ ] **Step 4: Write the minimal runner implementation**

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import {
  classifyFinalAcceptanceDecision,
  evaluateEvidenceLoop,
  evaluateKnowledgeLoop,
  evaluateProjectionLoop,
  evaluateRebuildLoop,
  evaluateReviewLoop
} from "./loop-evaluators";
import { renderAcceptanceBookReport, renderFinalAcceptanceReport } from "./report";

export async function runEndToEndAcceptance(input: {
  scenarios: Array<{
    scenarioKey: string;
    bookTitle: string;
    fixturePath: string;
    manualObservationPath: string;
    reportPaths: { markdownPath: string; jsonPath: string };
    referenceReports: { t20TaskPath: string; t21MarkdownPath: string; t21JsonPath: string };
    manualChecks: Array<{ checkKey: string; routeKind: string; expectedObservation: string }>;
  }>;
  finalReportPaths: { markdownPath: string; jsonPath: string };
  ensureRegressionReport: (scenario: { fixturePath: string; referenceReports: { t21MarkdownPath: string; t21JsonPath: string } }) => Promise<{
    markdownPath: string;
    jsonPath: string;
    runComparison: { snapshotDiff: { identical: boolean }; costComparison: unknown | null } | null;
  }>;
  acceptanceRepository: {
    loadBookContext(input: { scenarioKey: string; bookTitle: string }): Promise<{
      book: { id: string; title: string };
      claimDetails: Array<{
        claimKind: "EVENT" | "RELATION" | "TIME" | "IDENTITY";
        claimId: string;
        reviewState: string;
        evidence: Array<{ id: string; chapterId: string; quotedText: string; startOffset: number | null; endOffset: number | null }>;
      }>;
      auditActions: string[];
      projectionCounts: {
        personaChapterFacts: number;
        personaTimeFacts: number;
        relationshipEdges: number;
        timelineEvents: number;
      };
      relationCatalogAvailable: boolean;
      routes: {
        personaChapter: string;
        relationEditor: string;
        personaTime: string;
      };
    }>;
  };
  snapshotProvider: {
    buildBeforeAfter(input: { bookId: string }): Promise<{
      beforeSnapshotKeys: string[];
      afterSnapshotKeys: string[];
      reviewedClaimBackedProjection: boolean;
    }>;
  };
  manualCheckRecorder: (input: {
    scenario: {
      scenarioKey: string;
      manualObservationPath: string;
      manualChecks: Array<{ checkKey: string; routeKind: string; expectedObservation: string }>;
    };
    routes: { personaChapter: string; relationEditor: string; personaTime: string };
  }) => Promise<Array<{
    checkKey: string;
    routePath: string;
    expectedObservation: string;
    observed: string;
    passed: boolean;
    blocking: boolean;
  }>>;
  writeArtifact?: (path: string, content: string) => Promise<void>;
}) {
  const writeArtifact = input.writeArtifact ?? (async (path: string, content: string) => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${content}\\n`, "utf8");
  });

  const generatedAtIso = new Date().toISOString();
  const bookReports = [];

  for (const scenario of input.scenarios) {
    const regression = await input.ensureRegressionReport({
      fixturePath: scenario.fixturePath,
      referenceReports: scenario.referenceReports
    });
    const context = await input.acceptanceRepository.loadBookContext({
      scenarioKey: scenario.scenarioKey,
      bookTitle: scenario.bookTitle
    });
    const projection = await input.snapshotProvider.buildBeforeAfter({
      bookId: context.book.id
    });
    const manualChecks = await input.manualCheckRecorder({
      scenario,
      routes: context.routes
    });

    const loopResults = [
      evaluateEvidenceLoop({ claimDetails: context.claimDetails }),
      evaluateReviewLoop({ auditActions: context.auditActions }),
      evaluateProjectionLoop({
        beforeSnapshotKeys: projection.beforeSnapshotKeys,
        afterSnapshotKeys: projection.afterSnapshotKeys
      }),
      evaluateKnowledgeLoop({
        relationCatalogAvailable: context.relationCatalogAvailable,
        reviewedClaimBackedProjection: projection.reviewedClaimBackedProjection
      }),
      evaluateRebuildLoop({
        hasReferenceReport: true,
        rerunIdentical: regression.runComparison?.snapshotDiff.identical ?? false,
        hasCostComparison: regression.runComparison?.costComparison !== null
      })
    ];

    const risks = loopResults
      .filter((item) => !item.passed)
      .map((item) => ({
        severity: "BLOCKING" as const,
        summary: `${scenario.scenarioKey} ${item.loopKey} loop failed`,
        owner: "AI acceptance runner",
        mitigation: "Fix failing loop before launch."
      }));

    const decision = classifyFinalAcceptanceDecision({
      loopResults,
      manualChecks,
      risks
    });

    const report = {
      scenarioKey: scenario.scenarioKey,
      bookId: context.book.id,
      bookTitle: context.book.title,
      generatedAtIso,
      referencedArtifacts: {
        t20TaskPath: scenario.referenceReports.t20TaskPath,
        t21MarkdownPath: regression.markdownPath,
        t21JsonPath: regression.jsonPath
      },
      loopResults,
      manualChecks,
      risks,
      decision
    };

    await writeArtifact(scenario.reportPaths.markdownPath, renderAcceptanceBookReport(report));
    await writeArtifact(scenario.reportPaths.jsonPath, JSON.stringify(report, null, 2));
    bookReports.push(report);
  }

  const blockingRisks = bookReports.flatMap((item) => item.risks.filter((risk) => risk.severity === "BLOCKING"));
  const nonBlockingRisks = bookReports.flatMap((item) => item.risks.filter((risk) => risk.severity === "NON_BLOCKING"));
  const overallDecision = blockingRisks.length > 0 || bookReports.some((item) => item.decision === "NO_GO")
    ? "NO_GO"
    : "GO";
  const finalReport = {
    generatedAtIso,
    overallDecision,
    bookReports,
    blockingRisks,
    nonBlockingRisks,
    summaryLines: bookReports.map((item) => `${item.scenarioKey}: ${item.decision}`)
  };

  await writeArtifact(input.finalReportPaths.markdownPath, renderFinalAcceptanceReport(finalReport));
  await writeArtifact(input.finalReportPaths.jsonPath, JSON.stringify(finalReport, null, 2));

  return finalReport;
}
```

`runner.ts` must also export two concrete helpers used by the CLI and tests:

```ts
export function createLiveAcceptanceSnapshotProvider(/* deps */) { /* real implementation */ }

export function createManualChecklistRecorder(/* deps */) { /* loads observation files or emits blocking placeholders */ }
```

- [ ] **Step 5: Re-run the report and runner tests to verify GREEN**

Run:

```bash
pnpm exec vitest run \
  src/server/modules/review/evidence-review/acceptance/report.test.ts \
  src/server/modules/review/evidence-review/acceptance/runner.test.ts \
  --coverage=false
```

Expected: PASS.

- [ ] **Step 6: Export the runner/report module and commit**

```ts
export * from "./contracts";
export * from "./scenarios";
export * from "./repository";
export * from "./loop-evaluators";
export * from "./report";
export * from "./runner";
```

Run:

```bash
git add \
  src/server/modules/review/evidence-review/acceptance/report.ts \
  src/server/modules/review/evidence-review/acceptance/report.test.ts \
  src/server/modules/review/evidence-review/acceptance/runner.ts \
  src/server/modules/review/evidence-review/acceptance/runner.test.ts \
  src/server/modules/review/evidence-review/acceptance/index.ts
git commit -m "feat(review): add t22 acceptance runner"
```

## Task 6: CLI Wrapper, Acceptance Execution, And Documentation Close-Out

**Files:**
- Create: `scripts/review-regression/acceptance/run-e2e-acceptance.ts`
- Create: `scripts/review-regression/acceptance/run-e2e-acceptance.test.ts`
- Modify: `docs/superpowers/tasks/2026-04-18-evidence-review/22-e2e-acceptance.md`
- Modify: `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- Create: `docs/superpowers/reports/evidence-review-acceptance/rulin-waishi-sample/summary.md`
- Create: `docs/superpowers/reports/evidence-review-acceptance/rulin-waishi-sample/summary.json`
- Create: `docs/superpowers/reports/evidence-review-acceptance/sanguo-yanyi-sample/summary.md`
- Create: `docs/superpowers/reports/evidence-review-acceptance/sanguo-yanyi-sample/summary.json`
- Create: `docs/superpowers/reports/evidence-review-acceptance/final-go-no-go.md`
- Create: `docs/superpowers/reports/evidence-review-acceptance/final-go-no-go.json`

- [ ] **Step 1: Write the failing CLI test**

```ts
import { describe, expect, it } from "vitest";

import { parseAcceptanceArgs } from "./run-e2e-acceptance";

describe("parseAcceptanceArgs", () => {
  it("defaults to all books and allows skip-seed", () => {
    expect(parseAcceptanceArgs(["--skip-seed"])).toEqual({
      scenarioKey: "all",
      skipSeed: true
    });
  });

  it("accepts a single named scenario", () => {
    expect(parseAcceptanceArgs(["--book", "rulin-waishi-sample"])).toEqual({
      scenarioKey: "rulin-waishi-sample",
      skipSeed: false
    });
  });
});
```

- [ ] **Step 2: Run the CLI test to verify RED**

Run:

```bash
pnpm exec vitest run scripts/review-regression/acceptance/run-e2e-acceptance.test.ts --coverage=false
```

Expected: FAIL with missing-file error.

- [ ] **Step 3: Implement the thin CLI wrapper**

```ts
import "dotenv/config";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const USAGE = `Usage:
  pnpm exec tsx scripts/review-regression/acceptance/run-e2e-acceptance.ts [options]

Options:
  --book        rulin-waishi-sample | sanguo-yanyi-sample | all
  --skip-seed   Reuse existing seeded sample books
  --help        Show this message
`;

class CliUsageError extends Error {}

export function parseAcceptanceArgs(argv: string[]) {
  if (argv.includes("--help")) {
    return null;
  }

  let scenarioKey: "rulin-waishi-sample" | "sanguo-yanyi-sample" | "all" = "all";
  let skipSeed = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--book") {
      const value = argv[index + 1];
      if (value !== "rulin-waishi-sample" && value !== "sanguo-yanyi-sample" && value !== "all") {
        throw new CliUsageError(`Invalid value for --book: ${value ?? ""}`);
      }
      scenarioKey = value;
      index += 1;
      continue;
    }
    if (token === "--skip-seed") {
      skipSeed = true;
      continue;
    }
    if (token.startsWith("--")) {
      throw new CliUsageError(`Unknown option: ${token}`);
    }
  }

  return { scenarioKey, skipSeed };
}

async function main() {
  const parsed = parseAcceptanceArgs(process.argv.slice(2));
  if (parsed === null) {
    console.log(USAGE);
    return;
  }

  const acceptanceModule = await import("../../../src/server/modules/review/evidence-review/acceptance/index.ts");
  const regressionModule = await import("../../../src/server/modules/review/evidence-review/regression/index.ts");
  const prismaModule = await import("../../../src/server/db/prisma.ts");

  try {
    const scenarios = acceptanceModule.ACCEPTANCE_SCENARIOS.filter((item) => (
      parsed.scenarioKey === "all" ? true : item.scenarioKey === parsed.scenarioKey
    ));

    const result = await acceptanceModule.runEndToEndAcceptance({
      scenarios,
      finalReportPaths: acceptanceModule.FINAL_ACCEPTANCE_REPORT_PATHS,
      ensureRegressionReport: async (scenario: { fixturePath: string; referenceReports: { t21MarkdownPath: string; t21JsonPath: string } }) => {
        const report = await regressionModule.runReviewGoldSetRegression({
          fixturePath: scenario.fixturePath,
          reportDir: scenario.referenceReports.t21MarkdownPath.replace(/\\/summary\\.md$/, ""),
          command: `pnpm exec tsx scripts/review-regression/run-gold-set-regression.ts --fixture ${scenario.fixturePath}`
        });
        return {
          markdownPath: report.markdownPath,
          jsonPath: report.jsonPath,
          runComparison: report.runComparison
        };
      },
      acceptanceRepository: acceptanceModule.createAcceptanceRepository(),
      snapshotProvider: acceptanceModule.createLiveAcceptanceSnapshotProvider(),
      manualCheckRecorder: acceptanceModule.createManualChecklistRecorder()
    });

    console.log(result.overallDecision);
    console.log(acceptanceModule.FINAL_ACCEPTANCE_REPORT_PATHS.markdownPath);
    console.log(acceptanceModule.FINAL_ACCEPTANCE_REPORT_PATHS.jsonPath);
  } finally {
    await prismaModule.prisma.$disconnect();
  }
}

const isDirectExecution = process.argv[1]
  ? fileURLToPath(import.meta.url) === resolve(process.argv[1])
  : false;

if (isDirectExecution) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
```

- [ ] **Step 4: Re-run the CLI test to verify GREEN**

Run:

```bash
pnpm exec vitest run scripts/review-regression/acceptance/run-e2e-acceptance.test.ts --coverage=false
```

Expected: PASS.

- [ ] **Step 5: Run local focused validation before the full acceptance execution**

Run:

```bash
pnpm exec vitest run \
  src/server/modules/review/evidence-review/acceptance/contracts.test.ts \
  src/server/modules/review/evidence-review/acceptance/scenarios.test.ts \
  src/server/modules/review/evidence-review/acceptance/repository.test.ts \
  src/server/modules/review/evidence-review/acceptance/loop-evaluators.test.ts \
  src/server/modules/review/evidence-review/acceptance/report.test.ts \
  src/server/modules/review/evidence-review/acceptance/runner.test.ts \
  scripts/review-regression/acceptance/run-e2e-acceptance.test.ts \
  --coverage=false
```

Expected: PASS.

- [ ] **Step 6: Run the acceptance command for both books**

Run:

```bash
pnpm exec tsx scripts/review-regression/acceptance/run-e2e-acceptance.ts --book all
```

Expected:

- prints `GO` or `NO_GO`
- writes per-book summaries to `docs/superpowers/reports/evidence-review-acceptance/*/summary.{md,json}`
- writes aggregate decision to `docs/superpowers/reports/evidence-review-acceptance/final-go-no-go.{md,json}`

- [ ] **Step 7: Perform and record the manual UI checklist**

Create or update the scenario observation files, then rerun acceptance:

```text
docs/superpowers/reports/evidence-review-acceptance/manual-checks/rulin-waishi-sample.json
docs/superpowers/reports/evidence-review-acceptance/manual-checks/sanguo-yanyi-sample.json
```

Verify these three routes for each sample book:

```text
/admin/review/<bookId>
/admin/review/<bookId>/relations
/admin/review/<bookId>/time
```

Record concrete observations only in the JSON files:

- persona x chapter page: claim detail panel opens, evidence highlight jumps to source, audit history is visible
- relation editor page: direction, effective interval, evidence link, and custom relation label are editable
- persona x time page: time-slice drilldown opens the shared detail panel and linked chapters are visible

If any observation file is missing, any required `checkKey` is absent, or any observation remains inconclusive, keep `passed=false`, keep the item blocking, rerun acceptance, and do not mark T22 complete.

- [ ] **Step 8: Run the final validation matrix**

Run:

```bash
pnpm test scripts/review-regression/acceptance
pnpm type-check
pnpm lint
```

Also re-run the full T21 regression command and confirm the referenced report paths are the same stable paths:

```bash
pnpm exec tsx scripts/review-regression/run-gold-set-regression.ts --fixture tests/fixtures/review-regression/rulin-waishi.fixture.json --report-dir docs/superpowers/reports/review-regression/rulin-waishi-sample
pnpm exec tsx scripts/review-regression/run-gold-set-regression.ts --fixture tests/fixtures/review-regression/sanguo-yanyi.fixture.json --report-dir docs/superpowers/reports/review-regression/sanguo-yanyi-sample
```

Expected: all commands pass, and the final acceptance report references those stable T21 report paths.

- [ ] **Step 9: Update the T22 task doc and runbook only after validation passes**

Append this concrete execution record shape to `docs/superpowers/tasks/2026-04-18-evidence-review/22-e2e-acceptance.md`:

```md
## Execution Record

### Completion - 2026-04-24

- Changed files: `src/server/modules/review/evidence-review/acceptance/**`, `scripts/review-regression/acceptance/run-e2e-acceptance.ts`, `docs/superpowers/reports/evidence-review-acceptance/**`, `docs/superpowers/tasks/2026-04-18-evidence-review/22-e2e-acceptance.md`, `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- Validation commands:
  - `pnpm exec vitest run src/server/modules/review/evidence-review/acceptance --coverage=false`
  - `pnpm exec vitest run scripts/review-regression/acceptance --coverage=false`
  - `pnpm test scripts/review-regression/acceptance`
  - `pnpm type-check`
  - `pnpm lint`
  - `pnpm exec tsx scripts/review-regression/acceptance/run-e2e-acceptance.ts --book all`
- Result: five loops have reproducible acceptance records for both sample books and the final go/no-go package is available under `docs/superpowers/reports/evidence-review-acceptance/`
- Follow-up risks: none if final decision is `GO`; otherwise list only explicit blocking items from `final-go-no-go.md`
```

Then mark the T22 checkbox in `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md` as complete and append the corresponding `### T22 Completion - 2026-04-24` entry in the runbook completion record.

- [ ] **Step 10: Commit the final T22 acceptance package**

```bash
git add \
  src/server/modules/review/evidence-review/acceptance \
  scripts/review-regression/acceptance/run-e2e-acceptance.ts \
  scripts/review-regression/acceptance/run-e2e-acceptance.test.ts \
  docs/superpowers/reports/evidence-review-acceptance \
  docs/superpowers/tasks/2026-04-18-evidence-review/22-e2e-acceptance.md \
  docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md
git commit -m "feat(review): complete t22 end-to-end acceptance"
```

## Self-Review

### Spec Coverage

- Acceptance report template, commands, inputs, outputs, risks, and release decision: Task 1 contracts + Task 5 report renderer + Task 6 final artifacts.
- Evidence loop, review loop, projection loop, knowledge loop, rebuild loop: Task 3 and Task 4 evaluators, Task 5 runner orchestration.
- `儒林外史` and `三国演义` acceptance samples: Task 1 scenario registry + Task 6 execution.
- T20/T21 references: Task 1 scenario registry + Task 5 runner referenced artifacts + Task 6 final validation.
- Blocking vs non-blocking risk classification: Task 1 contracts + Task 4 decision logic + Task 6 report close-out.

### Placeholder Scan

- No `TODO`, `TBD`, or “similar to Task N” placeholders remain.
- Every code-writing step contains concrete code.
- Every validation step contains exact commands and expected results.

### Type Consistency

- Loop keys are fixed to `EVIDENCE | REVIEW | PROJECTION | KNOWLEDGE | REBUILD` across contracts, evaluators, runner, and reports.
- Final decision values are fixed to `GO | NO_GO` across contracts, renderer, and CLI output.
- Scenario keys are fixed to `rulin-waishi-sample | sanguo-yanyi-sample` across scenario registry, CLI parsing, and report paths.
