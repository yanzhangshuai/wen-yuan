# T12 Review API Mutations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This task is executed inline on `dev_2`; do not create a new branch and do not start T13.

**Goal:** Build claim-first admin review APIs for list/detail/query and claim mutations, including accept/reject/defer, manual edits, manual claim creation, persona merge/split, evidence relinking, audit logging, and projection-scoped rebuilds.

**Architecture:** T12 adds a dedicated review API layer on top of claim tables, review state, manual-override lineage, and Stage D projections. Query endpoints read stable review DTOs from claim tables plus evidence, audit, and projection context; mutation endpoints never overwrite AI claim rows or projection tables directly, and instead transition review state or create `MANUAL` claims, write `review_audit_logs`, then trigger only the affected Stage D rebuild scopes.

**Tech Stack:** TypeScript strict, Prisma 7/PostgreSQL, Zod, Next.js App Router route handlers, Vitest, existing `claim-repository`, `manual-override`, `review-state`, and `projection-builder`.

---

## Source Of Truth

- Architecture spec: `docs/superpowers/specs/2026-04-18-evidence-review-architecture-rewrite-design.md` §5.3, §6, §7.7, §8, §9.6, §11, §15
- Task doc: `docs/superpowers/tasks/2026-04-18-evidence-review/12-review-api-mutations.md`
- Runbook: `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
- Review state helper: `src/server/modules/review/evidence-review/review-state.ts`
- Stage D builder: `src/server/modules/review/evidence-review/projections/projection-builder.ts`
- Manual override service: `src/server/modules/analysis/claims/manual-override.ts`
- Claim contracts: `src/server/modules/analysis/claims/claim-schemas.ts`, `src/server/modules/analysis/claims/base-types.ts`, `src/server/modules/analysis/claims/claim-repository.ts`
- Auth chain: `src/server/modules/auth/constants.ts`, `src/server/modules/auth/token.ts`, `src/server/modules/auth/index.ts`, `src/server/modules/auth/edge-token.ts`, `middleware.ts`, `src/app/api/auth/login/route.ts`
- Prisma models/enums: `ReviewAction`, `ReviewAuditLog`, `AliasClaim`, `EventClaim`, `RelationClaim`, `TimeClaim`, `IdentityResolutionClaim`, `ConflictFlag` in `prisma/schema.prisma`

## Execution Rules

- Follow strict TDD for every task: write the test first, run RED, implement the minimum code, run GREEN.
- Keep claim-first truth. Do not read legacy `Profile / BiographyRecord / Relationship` as mutation truth.
- Do not mutate projection rows directly. All projection changes must come from `createProjectionBuilder(...).rebuildProjection(...)`.
- Do not overwrite AI claim rows during edit, manual correction, or evidence relinking. Those operations must create `MANUAL` claims and preserve lineage with `supersedesClaimId` and `derivedFromClaimId`.
- `relationTypeKey` remains a string column and route DTO field. Do not introduce a database enum for custom relation keys.
- `DEFERRED` is already part of review state. T12 must add `ReviewAction.DEFER` to Prisma enum usage so audit logs can record defer actions explicitly.
- Treat `actorUserId` as required at the review mutation service boundary. The database column may stay nullable for additive migration safety, but T12 route handlers must never write audit rows without a concrete authenticated admin user id.
- Persona merge/split must be implemented as manual `IDENTITY_RESOLUTION` claim truth changes. Updating legacy `personas` rows alone is not sufficient.
- Stage D scope rules from T11 are binding:
  - `CHAPTER` can rebuild `persona_chapter_facts` and `timeline_events`
  - `TIME_SLICE` can rebuild `persona_time_facts` and `timeline_events`
  - `RELATION_EDGE` can rebuild `relationship_edges` only
  - `PERSONA` can rebuild all projection families for one final persona
- Prefer `PERSONA` rebuild scope whenever final persona ids are known. Use `CHAPTER` or `TIME_SLICE` only as fallback for unresolved claims. Reserve `RELATION_EDGE` for relation-only refinements that do not affect chapter/time counts.
- Perform one T12 commit after final validation, because the Superpowers flow has been committing one task at a time.

## File Structure

- Modify `prisma/schema.prisma`
  - Add `ReviewAction.DEFER`.
- Create `prisma/migrations/20260421103000_review_action_defer/migration.sql`
  - Additive enum migration only.
- Modify `src/server/modules/auth/constants.ts`
  - Extend `AuthTokenPayload` with `userId`.
- Modify `src/server/modules/auth/token.ts`
  - Sign and verify `userId` in admin tokens.
- Modify `src/server/modules/auth/index.ts`
  - Propagate `userId` through `getAuthContext`, add `requireAdminActorUserId`, and update `issueAuthToken` call contract.
- Modify `src/server/modules/auth/edge-token.ts`
  - Keep edge helper aligned with token payload shape.
- Modify `src/server/modules/auth/token.test.ts`
- Modify `src/server/modules/auth/index.test.ts`
- Modify `middleware.ts`
  - Inject `x-auth-user-id` from verified admin token instead of empty string.
- Modify `src/middleware.test.ts`
- Modify `src/app/api/auth/login/route.ts`
  - Sign tokens with both `user.id` and `user.name`.
- Modify `src/app/api/auth/login/route.test.ts`
- Create `src/server/modules/review/evidence-review/review-api-schemas.ts`
  - Route/query/body DTO schemas for T12-T16.
- Create `src/server/modules/review/evidence-review/review-api-schemas.test.ts`
- Create `src/server/modules/review/evidence-review/review-audit-service.ts`
  - Audit write/list service over `review_audit_logs`.
- Create `src/server/modules/review/evidence-review/review-audit-service.test.ts`
- Create `src/server/modules/review/evidence-review/review-query-service.ts`
  - Claim list/detail read service for matrix/relation/evidence UIs.
- Create `src/server/modules/review/evidence-review/review-query-service.test.ts`
- Create `src/server/modules/review/evidence-review/review-mutation-service.ts`
  - Claim actions, manual claim flows, evidence relink, persona merge/split, and scoped projection rebuild orchestration.
- Create `src/server/modules/review/evidence-review/review-mutation-service.test.ts`
- Create `src/app/api/admin/review/claims/route.ts`
  - `GET` list claims, `POST` create standalone manual claim.
- Create `src/app/api/admin/review/claims/route.test.ts`
- Create `src/app/api/admin/review/claims/[claimKind]/[claimId]/route.ts`
  - `GET` detail claim.
- Create `src/app/api/admin/review/claims/[claimKind]/[claimId]/route.test.ts`
- Create `src/app/api/admin/review/claims/[claimKind]/[claimId]/actions/route.ts`
  - `POST` accept/reject/defer/edit/relinkEvidence against one existing claim.
- Create `src/app/api/admin/review/claims/[claimKind]/[claimId]/actions/route.test.ts`
- Create `src/app/api/admin/review/personas/merge/route.ts`
- Create `src/app/api/admin/review/personas/merge/route.test.ts`
- Create `src/app/api/admin/review/personas/split/route.ts`
- Create `src/app/api/admin/review/personas/split/route.test.ts`
- Modify `docs/superpowers/tasks/2026-04-18-evidence-review/12-review-api-mutations.md`
  - Record execution notes after implementation passes.
- Modify `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`
  - Mark T12 complete only after validation passes.

## Modeling Decisions

- Review API `claimKind` path values must align with existing claim families: `ALIAS`, `EVENT`, `RELATION`, `TIME`, `IDENTITY_RESOLUTION`, `CONFLICT_FLAG`.
- `GET /api/admin/review/claims` is the stable list endpoint for T13-T16. It returns normalized summary DTOs, not raw table rows.
- `POST /api/admin/review/claims` is reserved for standalone `MANUAL` claim creation with no original claim to supersede.
- `POST /api/admin/review/claims/[claimKind]/[claimId]/actions` handles only actions against an existing claim: `ACCEPT`, `REJECT`, `DEFER`, `EDIT`, and `RELINK_EVIDENCE`.
- `EDIT` and `RELINK_EVIDENCE` are both implemented as manual override flows:
  - mark the original claim as `EDITED`
  - create a new `MANUAL` claim with `supersedesClaimId` and `derivedFromClaimId` pointing to the original claim
  - audit the action with both before/after snapshots
- `CREATE_MANUAL_CLAIM` does not mutate any original AI/RULE claim. It inserts one new accepted `MANUAL` claim and audits that insertion.
- `mergePersona` and `splitPersona` act on selected `personaCandidateIds`, not chapter-number heuristics. The service resolves the current accepted identity claims for those candidates, writes manual identity-resolution overrides, and rebuilds affected persona projections.
- The legacy `personas` table is supporting directory data only. T12 may create a new `Persona` row for split targets when the user requests a new persona id/name, but the authoritative assignment remains the manual identity-resolution claims.
- Review query service should merge family-specific Prisma reads in TypeScript. Do not introduce a SQL union view or generic polymorphic claim table in T12.
- `conflictState` in list/detail DTOs is normalized as:
  - `ACTIVE` when at least one non-rejected conflict flag references the claim
  - `NONE` otherwise
- Audit detail should show the nearest original AI/RULE basis for a manual claim by walking `derivedFromClaimId` until a non-`MANUAL` source is found.

---

### Task 1: Auth Actor Identity, ReviewAction.DEFER, And Review API DTO Foundations

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260421103000_review_action_defer/migration.sql`
- Modify: `src/server/modules/auth/constants.ts`
- Modify: `src/server/modules/auth/token.ts`
- Modify: `src/server/modules/auth/index.ts`
- Modify: `src/server/modules/auth/edge-token.ts`
- Modify: `middleware.ts`
- Modify: `src/app/api/auth/login/route.ts`
- Create: `src/server/modules/review/evidence-review/review-api-schemas.ts`
- Test: `src/server/modules/auth/token.test.ts`
- Test: `src/server/modules/auth/index.test.ts`
- Test: `src/middleware.test.ts`
- Test: `src/app/api/auth/login/route.test.ts`
- Test: `src/server/modules/review/evidence-review/review-api-schemas.test.ts`

- [x] **Step 1: Write failing auth and schema tests**

Add these cases:

```ts
// src/server/modules/auth/token.test.ts
it("issues and verifies admin token payload with userId", async () => {
  process.env.JWT_SECRET = testSecret;

  const issuedAt = 1_700_000_000;
  const token = await issueAuthToken({ userId: "8f8b7b8e-17aa-4ae5-91a1-2c6e8dfd7f89", name: "管理员" }, issuedAt);
  const payload = await verifyAuthToken(token, issuedAt + 1);

  expect(payload).toEqual({
    role  : AppRole.ADMIN,
    userId: "8f8b7b8e-17aa-4ae5-91a1-2c6e8dfd7f89",
    name  : "管理员",
    iat   : issuedAt,
    exp   : issuedAt + AUTH_TOKEN_TTL_SECONDS
  });
});

// src/server/modules/auth/index.test.ts
it("resolves admin userId from cookie token when middleware headers are missing", async () => {
  process.env.JWT_SECRET = testSecret;
  const token = await issueAuthToken({ userId: "user-1", name: "管理员" }, 1_700_000_000);

  await expect(getAuthContext(new Headers({ cookie: `token=${token}` }))).resolves.toEqual({
    userId         : "user-1",
    role           : AppRole.ADMIN,
    name           : "管理员",
    isAuthenticated: true
  });
});

it("throws when authenticated admin context has no actor user id", () => {
  expect(() => requireAdminActorUserId({
    userId         : null,
    role           : AppRole.ADMIN,
    name           : "管理员",
    isAuthenticated: true
  })).toThrow("Authenticated admin context is missing userId");
});

// src/middleware.test.ts
it("injects admin user id into forwarded headers", async () => {
  process.env.JWT_SECRET = testJwtSecret;
  const token = await issueAuthToken({ userId: "user-1", name: "管理员" }, 1_700_000_000);
  const request = new NextRequest("http://localhost/admin/model", {
    headers: { cookie: `${AUTH_COOKIE_NAME}=${token}` }
  });

  const response = await middleware(request);

  expect(response.headers.get("x-middleware-request-x-auth-role")).toBe(AppRole.ADMIN);
  expect(response.headers.get("x-middleware-request-x-auth-user-id")).toBe("user-1");
});

// src/app/api/auth/login/route.test.ts
it("signs login token with authenticated admin id and name", async () => {
  authenticateAdminMock.mockResolvedValue({
    id      : "user-1",
    username: "admin",
    email   : "admin@example.com",
    name    : "管理员",
    role    : AppRole.ADMIN
  });
  issueAuthTokenMock.mockReturnValue("signed-token");

  const { POST } = await import("@/app/api/auth/login/route");
  await POST(new Request("http://localhost/api/auth/login", {
    method : "POST",
    headers: { "content-type": "application/json", origin: "http://localhost" },
    body   : JSON.stringify({ identifier: "admin", password: "secret-123", redirect: "/admin" })
  }));

  expect(issueAuthTokenMock).toHaveBeenCalledWith({ userId: "user-1", name: "管理员" });
});

// src/server/modules/review/evidence-review/review-api-schemas.test.ts
it("accepts DEFER in claim action request schema", () => {
  expect(() => reviewClaimActionRequestSchema.parse({
    action: "DEFER",
    note  : "need more evidence"
  })).not.toThrow();
});

it("accepts merge and split persona payloads keyed by personaCandidateIds", () => {
  expect(reviewMergePersonasRequestSchema.parse({
    bookId          : BOOK_ID,
    sourcePersonaId : SOURCE_PERSONA_ID,
    targetPersonaId : TARGET_PERSONA_ID,
    personaCandidateIds: [CANDIDATE_ID_1, CANDIDATE_ID_2],
    note            : "same person"
  })).toMatchObject({ sourcePersonaId: SOURCE_PERSONA_ID });

  expect(reviewSplitPersonaRequestSchema.parse({
    bookId         : BOOK_ID,
    sourcePersonaId: SOURCE_PERSONA_ID,
    splitTargets   : [{
      targetPersonaName  : "新角色",
      personaCandidateIds: [CANDIDATE_ID_3]
    }],
    note           : "separate identities"
  })).toMatchObject({ sourcePersonaId: SOURCE_PERSONA_ID });
});
```

- [x] **Step 2: Run auth and schema tests to verify RED**

Run:

```bash
pnpm exec vitest run \
  src/server/modules/auth/token.test.ts \
  src/server/modules/auth/index.test.ts \
  src/middleware.test.ts \
  src/app/api/auth/login/route.test.ts \
  src/server/modules/review/evidence-review/review-api-schemas.test.ts \
  --coverage=false
```

Expected: fail because `AuthTokenPayload` has no `userId`, middleware still injects an empty user id, the login route still signs name-only tokens, and `review-api-schemas.ts` does not exist.

- [x] **Step 3: Implement token userId propagation and admin actor guard**

Apply these minimal changes:

```ts
// src/server/modules/auth/constants.ts
export interface AuthTokenPayload {
  role  : AuthRole;
  userId: string;
  name  : string;
  iat   : number;
  exp   : number;
}

// src/server/modules/auth/token.ts
export async function issueAuthToken(
  input: { userId: string; name: string },
  now = Math.floor(Date.now() / 1000)
): Promise<string> {
  return new SignJWT({
    role  : AUTH_ADMIN_ROLE,
    userId: input.userId,
    name  : input.name
  })
    .setProtectedHeader({ alg: JWT_ALGORITHM, typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(now + AUTH_TOKEN_TTL_SECONDS)
    .sign(getJwtSecretBytes());
}

export async function verifyAuthToken(
  token: string,
  now = Math.floor(Date.now() / 1000)
): Promise<AuthTokenPayload | null> {
  const { payload } = await jwtVerify(token, getJwtSecretBytes(), {
    algorithms : [JWT_ALGORITHM],
    currentDate: new Date(now * 1000)
  });

  if (payload.role !== AUTH_ADMIN_ROLE) return null;
  if (typeof payload.userId !== "string" || payload.userId.length === 0) return null;
  if (typeof payload.iat !== "number" || typeof payload.exp !== "number") return null;

  return {
    role  : AUTH_ADMIN_ROLE,
    userId: payload.userId,
    name  : typeof payload.name === "string" ? payload.name : "",
    iat   : payload.iat,
    exp   : payload.exp
  };
}

// src/server/modules/auth/index.ts
export function requireAdminActorUserId(auth: AuthContext): string {
  requireAdmin(auth);
  if (auth.userId === null || auth.userId.trim().length === 0) {
    throw new AuthError(ERROR_CODES.AUTH_UNAUTHORIZED, "Authenticated admin context is missing userId");
  }

  return auth.userId;
}

export async function issueAuthToken(
  input: { userId: string; name: string },
  now = Math.floor(Date.now() / 1000)
): Promise<string> {
  return issueAuthTokenWithJose(input, now);
}

// middleware.ts
export async function buildInjectedHeaders(
  requestHeaders: Headers,
  role: MiddlewareAuthRole,
  currentPath: string,
  userId: string | null
): Promise<Headers> {
  const headers = new Headers(requestHeaders);
  headers.set("x-auth-role", role);
  headers.set("x-auth-user-id", userId ?? "");
  headers.set("x-auth-current-path", currentPath);
  return headers;
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const payload = token ? await verifyAuthTokenForEdge(token) : null;
  const role = payload ? AUTH_ADMIN_ROLE : AUTH_VIEWER_ROLE;
  const requestHeaders = await buildInjectedHeaders(request.headers, role, currentPath, payload?.userId ?? null);
  // keep the rest unchanged
}

// src/app/api/auth/login/route.ts
const token = await issueAuthToken({ userId: user.id, name: user.name });
```

- [x] **Step 4: Re-run auth tests and verify GREEN**

Run:

```bash
pnpm exec vitest run \
  src/server/modules/auth/token.test.ts \
  src/server/modules/auth/index.test.ts \
  src/middleware.test.ts \
  src/app/api/auth/login/route.test.ts \
  --coverage=false
```

Expected: pass.

- [x] **Step 5: Implement `ReviewAction.DEFER`, migration, and review API schemas**

Add the enum and DTO layer:

```prisma
// prisma/schema.prisma
enum ReviewAction {
  ACCEPT
  REJECT
  DEFER
  EDIT
  CREATE_MANUAL_CLAIM
  MERGE_PERSONA
  SPLIT_PERSONA
  CHANGE_RELATION_TYPE
  CHANGE_RELATION_INTERVAL
  RELINK_EVIDENCE

  @@map("review_action")
}
```

```sql
-- prisma/migrations/20260421103000_review_action_defer/migration.sql
ALTER TYPE "review_action" ADD VALUE IF NOT EXISTS 'DEFER';
```

```ts
// src/server/modules/review/evidence-review/review-api-schemas.ts
export const reviewClaimKindSchema = z.enum([
  "ALIAS",
  "EVENT",
  "RELATION",
  "TIME",
  "IDENTITY_RESOLUTION",
  "CONFLICT_FLAG"
] as const);

export const reviewClaimActionRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.enum(["ACCEPT", "REJECT", "DEFER"] as const),
    note  : z.string().trim().min(1).max(2000).nullable().optional()
  }),
  z.object({
    action: z.literal("EDIT"),
    note  : z.string().trim().min(1).max(2000).nullable().optional(),
    draft : z.record(z.string(), z.unknown())
  }),
  z.object({
    action         : z.literal("RELINK_EVIDENCE"),
    note           : z.string().trim().min(1).max(2000).nullable().optional(),
    evidenceSpanIds: z.array(z.string().uuid()).min(1)
  })
]);

export const reviewCreateManualClaimRequestSchema = z.object({
  claimKind: reviewClaimKindSchema.exclude(["CONFLICT_FLAG"]),
  note     : z.string().trim().min(1).max(2000).nullable().optional(),
  draft    : z.record(z.string(), z.unknown())
});

export const reviewMergePersonasRequestSchema = z.object({
  bookId             : z.string().uuid(),
  sourcePersonaId    : z.string().uuid(),
  targetPersonaId    : z.string().uuid(),
  personaCandidateIds: z.array(z.string().uuid()).min(1),
  note               : z.string().trim().min(1).max(2000).nullable().optional()
});

export const reviewSplitPersonasRequestSchema = z.object({
  bookId         : z.string().uuid(),
  sourcePersonaId: z.string().uuid(),
  splitTargets   : z.array(z.object({
    targetPersonaId    : z.string().uuid().optional(),
    targetPersonaName  : z.string().trim().min(1).max(120).optional(),
    personaCandidateIds: z.array(z.string().uuid()).min(1)
  })).min(1),
  note           : z.string().trim().min(1).max(2000).nullable().optional()
}).superRefine((value, ctx) => {
  for (const [index, target] of value.splitTargets.entries()) {
    if (!target.targetPersonaId && !target.targetPersonaName) {
      ctx.addIssue({
        code   : z.ZodIssueCode.custom,
        path   : ["splitTargets", index],
        message: "Each split target requires targetPersonaId or targetPersonaName"
      });
    }
  }
});
```

- [x] **Step 6: Validate migration and schema layer**

Run:

```bash
pnpm prisma validate --schema prisma/schema.prisma
pnpm prisma:generate
pnpm exec vitest run src/server/modules/review/evidence-review/review-api-schemas.test.ts --coverage=false
```

Expected: all commands succeed.

---

### Task 2: Review Audit Service

**Files:**
- Create: `src/server/modules/review/evidence-review/review-audit-service.ts`
- Test: `src/server/modules/review/evidence-review/review-audit-service.test.ts`

- [x] **Step 1: Write failing audit service tests**

Create tests covering both write and read contracts:

```ts
it("writes claim audit logs with explicit DEFER action and actor user id", async () => {
  const reviewAuditLog = { create: vi.fn().mockResolvedValue({ id: "audit-1" }) };
  const service = createReviewAuditService({ reviewAuditLog } as never);

  await service.logClaimAction({
    bookId      : BOOK_ID,
    claimKind   : "EVENT",
    claimId     : CLAIM_ID,
    actorUserId : USER_ID,
    action      : "DEFER",
    beforeState : { reviewState: "PENDING" },
    afterState  : { reviewState: "DEFERRED" },
    note        : "wait for human review",
    evidenceSpanIds: [EVIDENCE_ID_1, EVIDENCE_ID_2]
  });

  expect(reviewAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({
      action     : "DEFER",
      actorUserId: USER_ID,
      claimKind  : "EVENT",
      claimId    : CLAIM_ID
    })
  }));
});

it("rejects audit writes when actorUserId is blank", async () => {
  const service = createReviewAuditService({ reviewAuditLog: { create: vi.fn() } } as never);

  await expect(service.logPersonaAction({
    bookId      : BOOK_ID,
    personaId   : PERSONA_ID,
    actorUserId : "   ",
    action      : "MERGE_PERSONA",
    beforeState : { sourcePersonaId: PERSONA_ID },
    afterState  : { targetPersonaId: TARGET_PERSONA_ID }
  })).rejects.toThrow("actorUserId is required");
});

it("lists audit history newest-first for claim detail panels", async () => {
  const reviewAuditLog = {
    findMany: vi.fn().mockResolvedValue([
      { id: "audit-2", action: "EDIT", createdAt: new Date("2026-04-21T10:00:00Z") },
      { id: "audit-1", action: "ACCEPT", createdAt: new Date("2026-04-21T09:00:00Z") }
    ])
  };
  const service = createReviewAuditService({ reviewAuditLog } as never);

  const result = await service.listAuditTrail({ claimKind: "EVENT", claimId: CLAIM_ID });

  expect(result.map((entry) => entry.id)).toEqual(["audit-2", "audit-1"]);
});
```

- [x] **Step 2: Run audit tests and verify RED**

Run:

```bash
pnpm exec vitest run src/server/modules/review/evidence-review/review-audit-service.test.ts --coverage=false
```

Expected: fail because the audit service does not exist.

- [x] **Step 3: Implement the review audit service**

Create a small service around `review_audit_logs`:

```ts
// src/server/modules/review/evidence-review/review-audit-service.ts
import { prisma } from "@/server/db/prisma";
import type { ClaimKind, ReviewAction } from "@/generated/prisma/enums";

export interface LogClaimActionInput {
  bookId         : string;
  claimKind      : ClaimKind;
  claimId        : string;
  actorUserId    : string;
  action         : ReviewAction;
  beforeState    : Record<string, unknown> | null;
  afterState     : Record<string, unknown> | null;
  note?          : string | null;
  evidenceSpanIds?: string[];
  personaId?     : string | null;
}

export interface LogPersonaActionInput {
  bookId         : string;
  personaId      : string;
  actorUserId    : string;
  action         : ReviewAction;
  beforeState    : Record<string, unknown> | null;
  afterState     : Record<string, unknown> | null;
  note?          : string | null;
  evidenceSpanIds?: string[];
  claimKind?     : ClaimKind | null;
  claimId?       : string | null;
}

function requireActorUserId(actorUserId: string): string {
  const trimmed = actorUserId.trim();
  if (trimmed.length === 0) {
    throw new Error("review audit actorUserId is required");
  }

  return trimmed;
}

export function createReviewAuditService(prismaClient = prisma) {
  return {
    async logClaimAction(input: LogClaimActionInput) {
      return prismaClient.reviewAuditLog.create({
        data: {
          bookId         : input.bookId,
          claimKind      : input.claimKind,
          claimId        : input.claimId,
          personaId      : input.personaId ?? null,
          action         : input.action,
          actorUserId    : requireActorUserId(input.actorUserId),
          beforeState    : input.beforeState ?? null,
          afterState     : input.afterState ?? null,
          note           : input.note ?? null,
          evidenceSpanIds: Array.from(new Set(input.evidenceSpanIds ?? [])).sort()
        }
      });
    },
    async logPersonaAction(input: LogPersonaActionInput) {
      return prismaClient.reviewAuditLog.create({
        data: {
          bookId         : input.bookId,
          claimKind      : input.claimKind ?? null,
          claimId        : input.claimId ?? null,
          personaId      : input.personaId,
          action         : input.action,
          actorUserId    : requireActorUserId(input.actorUserId),
          beforeState    : input.beforeState ?? null,
          afterState     : input.afterState ?? null,
          note           : input.note ?? null,
          evidenceSpanIds: Array.from(new Set(input.evidenceSpanIds ?? [])).sort()
        }
      });
    },
    async listAuditTrail(input: { claimKind?: ClaimKind; claimId?: string; personaId?: string }) {
      return prismaClient.reviewAuditLog.findMany({
        where  : {
          ...(input.claimKind ? { claimKind: input.claimKind } : {}),
          ...(input.claimId ? { claimId: input.claimId } : {}),
          ...(input.personaId ? { personaId: input.personaId } : {})
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }]
      });
    }
  };
}
```

- [x] **Step 4: Re-run audit tests and verify GREEN**

Run:

```bash
pnpm exec vitest run src/server/modules/review/evidence-review/review-audit-service.test.ts --coverage=false
```

Expected: pass.

---

### Task 3: Review Query Service

**Files:**
- Create: `src/server/modules/review/evidence-review/review-query-service.ts`
- Test: `src/server/modules/review/evidence-review/review-query-service.test.ts`

- [x] **Step 1: Write failing query service tests**

Create summary/detail tests that prove the query layer is UI-ready:

```ts
it("lists review claims filtered by persona, chapter, kind, state, and active conflict state", async () => {
  const service = createReviewQueryService(createPrismaMock({
    eventClaims: [
      eventClaim({
        id                     : EVENT_ID_1,
        chapterId              : CHAPTER_ID_1,
        subjectPersonaCandidateId: CANDIDATE_ID_1,
        reviewState            : "PENDING"
      }),
      eventClaim({
        id                     : EVENT_ID_2,
        chapterId              : CHAPTER_ID_2,
        subjectPersonaCandidateId: CANDIDATE_ID_2,
        reviewState            : "ACCEPTED"
      })
    ],
    identityResolutionClaims: [
      identityClaim({ personaCandidateId: CANDIDATE_ID_1, resolvedPersonaId: PERSONA_ID_1, reviewState: "ACCEPTED" })
    ],
    conflictFlags: [
      conflictFlag({ relatedClaimIds: [EVENT_ID_1], reviewState: "CONFLICTED" })
    ]
  }));

  const result = await service.listClaims({
    bookId       : BOOK_ID,
    personaId    : PERSONA_ID_1,
    chapterId    : CHAPTER_ID_1,
    claimKinds   : ["EVENT"],
    reviewStates : ["PENDING"],
    conflictState: "ACTIVE"
  });

  expect(result.items).toEqual([
    expect.objectContaining({
      claimKind    : "EVENT",
      claimId      : EVENT_ID_1,
      chapterId    : CHAPTER_ID_1,
      reviewState  : "PENDING",
      conflictState: "ACTIVE"
    })
  ]);
});

it("returns claim detail with evidence, source basis, projection summary, and audit history", async () => {
  const service = createReviewQueryService(createPrismaMock({
    eventClaims: [eventClaim({
      id               : EVENT_ID_1,
      evidenceSpanIds  : [EVIDENCE_ID_1],
      derivedFromClaimId: EVENT_ID_AI
    })],
    auditLogs: [
      auditLog({ id: "audit-2", claimId: EVENT_ID_1, action: "EDIT" }),
      auditLog({ id: "audit-1", claimId: EVENT_ID_1, action: "ACCEPT" })
    ],
    evidenceSpans: [evidenceSpan({ id: EVIDENCE_ID_1, quotedText: "范进去应考" })],
    personaChapterFacts: [personaChapterFact({ personaId: PERSONA_ID_1, chapterId: CHAPTER_ID_1 })]
  }));

  const detail = await service.getClaimDetail({
    bookId   : BOOK_ID,
    claimKind: "EVENT",
    claimId  : EVENT_ID_1
  });

  expect(detail).toMatchObject({
    claim: expect.objectContaining({ id: EVENT_ID_1, claimKind: "EVENT" }),
    evidence: [expect.objectContaining({ id: EVIDENCE_ID_1, quotedText: "范进去应考" })],
    auditHistory: [
      expect.objectContaining({ id: "audit-2", action: "EDIT" }),
      expect.objectContaining({ id: "audit-1", action: "ACCEPT" })
    ]
  });
});
```

- [x] **Step 2: Run query tests and verify RED**

Run:

```bash
pnpm exec vitest run src/server/modules/review/evidence-review/review-query-service.test.ts --coverage=false
```

Expected: fail because the query service does not exist.

- [x] **Step 3: Implement the normalized claim query service**

Implement one service with list/detail methods:

```ts
// src/server/modules/review/evidence-review/review-query-service.ts
export interface ListReviewClaimsInput {
  bookId        : string;
  claimKinds?   : ReviewableClaimFamily[];
  reviewStates? : ClaimReviewState[];
  sources?      : ClaimSource[];
  personaId?    : string;
  chapterId?    : string;
  timeLabel?    : string;
  conflictState?: "ACTIVE" | "NONE";
  limit?        : number;
  offset?       : number;
}

export function createReviewQueryService(prismaClient = prisma) {
  async function listClaims(input: ListReviewClaimsInput) {
    const claimKinds = input.claimKinds ?? REVIEWABLE_CLAIM_FAMILY_VALUES;
    const baseRows = await loadClaimRowsByFamilies(prismaClient, claimKinds, input);
    const conflictStateByClaimId = await loadConflictStateMap(prismaClient, baseRows.map((row) => row.id));
    const personaIdByCandidateId = await loadAcceptedPersonaMap(prismaClient, input.bookId, baseRows);

    const filtered = baseRows
      .map((row) => toClaimListItem(row, {
        conflictStateByClaimId,
        personaIdByCandidateId
      }))
      .filter((row) => applyPersonaAndConflictFilters(row, input))
      .sort(compareNewestFirst);

    return {
      items: filtered.slice(input.offset ?? 0, (input.offset ?? 0) + (input.limit ?? 100)),
      total: filtered.length
    };
  }

  async function getClaimDetail(input: { bookId: string; claimKind: ReviewableClaimFamily; claimId: string }) {
    const claim = await loadSingleClaim(prismaClient, input);
    if (claim === null) return null;

    const evidence = await prismaClient.evidenceSpan.findMany({
      where  : { id: { in: claim.evidenceSpanIds } },
      orderBy: [{ chapterId: "asc" }, { startOffset: "asc" }]
    });
    const auditHistory = await createReviewAuditService(prismaClient).listAuditTrail({
      claimKind: claim.claimKind,
      claimId  : claim.id
    });
    const basisClaim = await findBasisClaim(prismaClient, claim);
    const projectionSummary = await loadProjectionSummary(prismaClient, claim);

    return {
      claim,
      evidence,
      basisClaim,
      projectionSummary,
      auditHistory
    };
  }

  return { listClaims, getClaimDetail };
}
```

- [x] **Step 4: Re-run query tests and verify GREEN**

Run:

```bash
pnpm exec vitest run src/server/modules/review/evidence-review/review-query-service.test.ts --coverage=false
```

Expected: pass.

---

### Task 4: Mutation Service For Accept, Reject, And Defer

**Files:**
- Create: `src/server/modules/review/evidence-review/review-mutation-service.ts`
- Test: `src/server/modules/review/evidence-review/review-mutation-service.test.ts`

- [x] **Step 1: Write failing mutation tests for review-state transitions and scoped rebuilds**

Start with the state-transition path before manual overrides:

```ts
it("accepts an event claim, writes audit, and rebuilds affected persona scope", async () => {
  const claimRepository = createClaimRepositoryMock({
    summary: { id: EVENT_ID_1, reviewState: "PENDING", source: "AI" }
  });
  const projectionBuilder = { rebuildProjection: vi.fn().mockResolvedValue(undefined) };
  const auditService = { logClaimAction: vi.fn().mockResolvedValue(undefined) };
  const service = createReviewMutationService({
    prismaClient      : createPrismaMockWithAcceptedPersona(EVENT_ID_1, PERSONA_ID_1),
    claimRepository,
    projectionBuilder,
    auditService
  });

  await service.applyClaimAction({
    bookId      : BOOK_ID,
    claimKind   : "EVENT",
    claimId     : EVENT_ID_1,
    action      : "ACCEPT",
    actorUserId : USER_ID,
    note        : "confirmed"
  });

  expect(claimRepository.updateReviewableClaimReviewState).toHaveBeenCalledWith(expect.objectContaining({
    family      : "EVENT",
    claimId     : EVENT_ID_1,
    reviewState : "ACCEPTED",
    reviewedByUserId: USER_ID
  }));
  expect(auditService.logClaimAction).toHaveBeenCalledWith(expect.objectContaining({
    action     : "ACCEPT",
    actorUserId: USER_ID
  }));
  expect(projectionBuilder.rebuildProjection).toHaveBeenCalledWith({
    kind    : "PERSONA",
    bookId  : BOOK_ID,
    personaId: PERSONA_ID_1
  });
});

it("defers a time claim and falls back to time-slice rebuild when persona is unresolved", async () => {
  const service = createReviewMutationService({
    prismaClient      : createPrismaMockWithTimeClaim({ claimId: TIME_ID_1, normalizedLabel: "官渡之战前后" }),
    claimRepository   : createClaimRepositoryMock({ summary: { id: TIME_ID_1, reviewState: "PENDING", source: "AI" } }),
    projectionBuilder : { rebuildProjection: vi.fn().mockResolvedValue(undefined) },
    auditService      : { logClaimAction: vi.fn().mockResolvedValue(undefined) }
  });

  await service.applyClaimAction({
    bookId      : BOOK_ID,
    claimKind   : "TIME",
    claimId     : TIME_ID_1,
    action      : "DEFER",
    actorUserId : USER_ID,
    note        : "needs chronology review"
  });

  expect(service.dependencies.projectionBuilder.rebuildProjection).toHaveBeenCalledWith({
    kind     : "TIME_SLICE",
    bookId   : BOOK_ID,
    timeLabel: "官渡之战前后"
  });
});

it("rejects illegal review-state transitions before writing audit rows", async () => {
  const claimRepository = createClaimRepositoryMock({
    summary: { id: EVENT_ID_1, reviewState: "REJECTED", source: "AI" }
  });
  const auditService = { logClaimAction: vi.fn() };
  const service = createReviewMutationService({
    prismaClient      : createPrismaMock(),
    claimRepository,
    projectionBuilder : { rebuildProjection: vi.fn() },
    auditService
  });

  await expect(service.applyClaimAction({
    bookId      : BOOK_ID,
    claimKind   : "EVENT",
    claimId     : EVENT_ID_1,
    action      : "ACCEPT",
    actorUserId : USER_ID
  })).rejects.toThrow("cannot transition");

  expect(auditService.logClaimAction).not.toHaveBeenCalled();
});
```

- [x] **Step 2: Run mutation tests and verify RED**

Run:

```bash
pnpm exec vitest run src/server/modules/review/evidence-review/review-mutation-service.test.ts --coverage=false
```

Expected: fail because the mutation service does not exist.

- [x] **Step 3: Implement transition mutations and rebuild scope resolution**

Create the first slice of the mutation service:

```ts
// src/server/modules/review/evidence-review/review-mutation-service.ts
const ACTION_TO_TARGET_STATE = {
  ACCEPT: "ACCEPTED",
  REJECT: "REJECTED",
  DEFER : "DEFERRED"
} as const;

export function createReviewMutationService(dependencies: ReviewMutationDependencies) {
  async function applyClaimAction(input: ApplyClaimActionInput) {
    return dependencies.claimRepository.transaction(async (claimRepository) => {
      const summary = await claimRepository.findReviewableClaimSummary(input.claimKind, input.claimId);
      if (summary === null) {
        throw new Error(`Reviewable claim ${input.claimKind}:${input.claimId} not found`);
      }

      const nextState = ACTION_TO_TARGET_STATE[input.action];
      assertReviewStateTransition(summary.reviewState, nextState);

      const reviewedAt = new Date();
      await claimRepository.updateReviewableClaimReviewState({
        family          : input.claimKind,
        claimId         : input.claimId,
        reviewState     : nextState,
        reviewedByUserId: input.actorUserId,
        reviewedAt,
        reviewNote      : input.note ?? null
      });

      await dependencies.auditService.logClaimAction({
        bookId      : input.bookId,
        claimKind   : toPrismaClaimKind(input.claimKind),
        claimId     : input.claimId,
        actorUserId : input.actorUserId,
        action      : input.action,
        beforeState : { reviewState: summary.reviewState, source: summary.source },
        afterState  : { reviewState: nextState },
        note        : input.note ?? null
      });

      for (const scope of await resolveProjectionScopesForClaimAction(dependencies.prismaClient, {
        bookId   : input.bookId,
        claimKind: input.claimKind,
        claimId  : input.claimId
      })) {
        await dependencies.projectionBuilder.rebuildProjection(scope);
      }
    });
  }

  return {
    dependencies,
    applyClaimAction
  };
}
```

- [x] **Step 4: Re-run mutation tests and verify GREEN for transition actions**

Run:

```bash
pnpm exec vitest run src/server/modules/review/evidence-review/review-mutation-service.test.ts --coverage=false
```

Expected: the accept/reject/defer tests pass. The edit/manual/merge/split tests are still pending and may be skipped or absent at this point.

---

### Task 5: Edit, CreateManualClaim, And RelinkEvidence

**Files:**
- Modify: `src/server/modules/review/evidence-review/review-mutation-service.ts`
- Test: `src/server/modules/review/evidence-review/review-mutation-service.test.ts`

- [x] **Step 1: Write failing tests for manual override flows**

Add these mutation cases:

```ts
it("edits an event claim by creating an accepted MANUAL override and marking the original as EDITED", async () => {
  const createManualOverride = vi.fn().mockResolvedValue({
    originalClaimId: EVENT_ID_1,
    manualClaimId  : MANUAL_EVENT_ID
  });
  const service = createReviewMutationService({
    prismaClient      : createPrismaMockWithEventClaim(eventClaim({ id: EVENT_ID_1 })),
    claimRepository   : createClaimRepositoryMock({ summary: { id: EVENT_ID_1, reviewState: "PENDING", source: "AI" } }),
    projectionBuilder : { rebuildProjection: vi.fn().mockResolvedValue(undefined) },
    auditService      : { logClaimAction: vi.fn().mockResolvedValue(undefined) },
    manualOverrideService: { createManualOverride }
  });

  await service.editClaim({
    bookId      : BOOK_ID,
    claimKind   : "EVENT",
    claimId     : EVENT_ID_1,
    actorUserId : USER_ID,
    note        : "fix predicate",
    draft       : {
      bookId                  : BOOK_ID,
      chapterId               : CHAPTER_ID_1,
      confidence              : 1,
      predicate               : "中举",
      objectText              : null,
      objectPersonaCandidateId: null,
      locationText            : null,
      timeHintId              : null,
      eventCategory           : BioCategory.OTHER,
      narrativeLens           : NarrativeLens.DIRECT,
      evidenceSpanIds         : [EVIDENCE_ID_1]
    }
  });

  expect(createManualOverride).toHaveBeenCalledWith(expect.objectContaining({
    family      : "EVENT",
    originalClaimId: EVENT_ID_1,
    actorUserId : USER_ID
  }));
});

it("creates standalone accepted MANUAL relation claims with custom relationTypeKey strings", async () => {
  const claimRepository = createClaimRepositoryMock({
    createResult: { id: MANUAL_RELATION_ID }
  });
  const service = createReviewMutationService({
    prismaClient      : createPrismaMock(),
    claimRepository,
    projectionBuilder : { rebuildProjection: vi.fn().mockResolvedValue(undefined) },
    auditService      : { logClaimAction: vi.fn().mockResolvedValue(undefined) }
  });

  await service.createManualClaim({
    claimKind   : "RELATION",
    actorUserId : USER_ID,
    note        : "作品自定义关系",
    draft       : {
      bookId                 : BOOK_ID,
      chapterId              : CHAPTER_ID_1,
      confidence             : 1,
      sourcePersonaCandidateId: CANDIDATE_ID_1,
      targetPersonaCandidateId: CANDIDATE_ID_2,
      relationTypeKey        : "mentor_of",
      relationLabel          : "提携",
      relationTypeSource     : "CUSTOM",
      direction              : "FORWARD",
      effectiveChapterStart  : 1,
      effectiveChapterEnd    : 3,
      timeHintId             : null,
      evidenceSpanIds        : [EVIDENCE_ID_1]
    }
  });

  expect(claimRepository.createReviewableClaim).toHaveBeenCalledWith("RELATION", expect.objectContaining({
    source          : "MANUAL",
    reviewState     : "ACCEPTED",
    relationTypeKey : "mentor_of",
    createdByUserId : USER_ID,
    reviewedByUserId: USER_ID
  }));
});

it("relinks evidence by cloning the original claim into a MANUAL override instead of mutating AI evidence", async () => {
  const createManualOverride = vi.fn().mockResolvedValue({
    originalClaimId: RELATION_ID_1,
    manualClaimId  : MANUAL_RELATION_ID
  });
  const service = createReviewMutationService({
    prismaClient      : createPrismaMockWithRelationClaim(relationClaim({ id: RELATION_ID_1, evidenceSpanIds: [EVIDENCE_ID_OLD] })),
    claimRepository   : createClaimRepositoryMock({ summary: { id: RELATION_ID_1, reviewState: "ACCEPTED", source: "AI" } }),
    projectionBuilder : { rebuildProjection: vi.fn().mockResolvedValue(undefined) },
    auditService      : { logClaimAction: vi.fn().mockResolvedValue(undefined) },
    manualOverrideService: { createManualOverride }
  });

  await service.relinkEvidence({
    bookId         : BOOK_ID,
    claimKind      : "RELATION",
    claimId        : RELATION_ID_1,
    actorUserId    : USER_ID,
    note           : "more precise evidence",
    evidenceSpanIds: [EVIDENCE_ID_NEW]
  });

  expect(createManualOverride).toHaveBeenCalledWith(expect.objectContaining({
    family: "RELATION",
    draft : expect.objectContaining({
      evidenceSpanIds: [EVIDENCE_ID_NEW]
    })
  }));
});
```

- [x] **Step 2: Run mutation tests to verify RED for override flows**

Run:

```bash
pnpm exec vitest run src/server/modules/review/evidence-review/review-mutation-service.test.ts --coverage=false
```

Expected: fail because `editClaim`, `createManualClaim`, and `relinkEvidence` do not exist yet.

- [x] **Step 3: Implement manual claim creation and evidence relink behavior**

Extend the mutation service with manual flows:

```ts
// src/server/modules/review/evidence-review/review-mutation-service.ts
async function createManualClaim(input: CreateManualClaimInput) {
  const reviewedAt = new Date();
  const validated = validateClaimDraftByFamily(input.claimKind, {
    claimFamily       : input.claimKind,
    ...input.draft,
    source            : "MANUAL",
    reviewState       : "ACCEPTED",
    supersedesClaimId : null,
    derivedFromClaimId: null,
    createdByUserId   : input.actorUserId,
    reviewedByUserId  : input.actorUserId,
    reviewNote        : input.note ?? null
  });

  const created = await dependencies.claimRepository.createReviewableClaim(input.claimKind, {
    ...toClaimCreateData(validated),
    reviewedAt
  });

  await dependencies.auditService.logClaimAction({
    bookId      : validated.bookId,
    claimKind   : toPrismaClaimKind(input.claimKind),
    claimId     : created.id,
    actorUserId : input.actorUserId,
    action      : "CREATE_MANUAL_CLAIM",
    beforeState : null,
    afterState  : { reviewState: "ACCEPTED", source: "MANUAL" },
    note        : input.note ?? null,
    evidenceSpanIds: validated.evidenceSpanIds
  });

  await rebuildScopesForClaimPayload(validated);

  return created;
}

async function editClaim(input: EditClaimInput) {
  const result = await dependencies.manualOverrideService.createManualOverride({
    family         : input.claimKind,
    originalClaimId: input.claimId,
    actorUserId    : input.actorUserId,
    reviewNote     : input.note ?? null,
    draft          : input.draft
  });

  await dependencies.auditService.logClaimAction({
    bookId      : input.bookId,
    claimKind   : toPrismaClaimKind(input.claimKind),
    claimId     : input.claimId,
    actorUserId : input.actorUserId,
    action      : "EDIT",
    beforeState : { claimId: input.claimId },
    afterState  : { manualClaimId: result.manualClaimId, reviewState: "ACCEPTED", source: "MANUAL" },
    note        : input.note ?? null
  });

  await rebuildScopesForClaimIds(input.bookId, input.claimKind, [input.claimId, result.manualClaimId]);
  return result;
}

async function relinkEvidence(input: RelinkEvidenceInput) {
  const original = await loadEditableClaimOrThrow(dependencies.prismaClient, input.claimKind, input.claimId);
  return editClaim({
    ...input,
    draft: {
      ...toManualOverrideDraft(original),
      evidenceSpanIds: input.evidenceSpanIds
    }
  });
}
```

- [x] **Step 4: Re-run mutation tests and verify GREEN for override flows**

Run:

```bash
pnpm exec vitest run src/server/modules/review/evidence-review/review-mutation-service.test.ts --coverage=false
```

Expected: edit/manual/relink tests pass.

---

### Task 6: Persona Merge And Split Through Identity-Resolution Claims

**Files:**
- Modify: `src/server/modules/review/evidence-review/review-mutation-service.ts`
- Test: `src/server/modules/review/evidence-review/review-mutation-service.test.ts`

- [x] **Step 1: Write failing tests for mergePersona and splitPersona**

Add persona-level mutation cases:

```ts
it("merges persona candidates by writing MANUAL identity-resolution overrides instead of mutating legacy truth only", async () => {
  const createManualOverride = vi.fn()
    .mockResolvedValueOnce({ originalClaimId: IDENTITY_ID_1, manualClaimId: MANUAL_IDENTITY_ID_1 })
    .mockResolvedValueOnce({ originalClaimId: IDENTITY_ID_2, manualClaimId: MANUAL_IDENTITY_ID_2 });
  const projectionBuilder = { rebuildProjection: vi.fn().mockResolvedValue(undefined) };
  const auditService = { logPersonaAction: vi.fn().mockResolvedValue(undefined) };
  const service = createReviewMutationService({
    prismaClient: createPrismaMockWithIdentityClaims([
      identityClaim({
        id               : IDENTITY_ID_1,
        personaCandidateId: CANDIDATE_ID_1,
        resolvedPersonaId : SOURCE_PERSONA_ID
      }),
      identityClaim({
        id               : IDENTITY_ID_2,
        personaCandidateId: CANDIDATE_ID_2,
        resolvedPersonaId : SOURCE_PERSONA_ID
      })
    ]),
    claimRepository     : createClaimRepositoryMock(),
    projectionBuilder,
    auditService,
    manualOverrideService: { createManualOverride }
  });

  await service.mergePersona({
    bookId             : BOOK_ID,
    sourcePersonaId    : SOURCE_PERSONA_ID,
    targetPersonaId    : TARGET_PERSONA_ID,
    personaCandidateIds: [CANDIDATE_ID_1, CANDIDATE_ID_2],
    actorUserId        : USER_ID,
    note               : "same historical person"
  });

  expect(createManualOverride).toHaveBeenCalledTimes(2);
  expect(auditService.logPersonaAction).toHaveBeenCalledWith(expect.objectContaining({
    action     : "MERGE_PERSONA",
    personaId  : TARGET_PERSONA_ID,
    actorUserId: USER_ID
  }));
  expect(projectionBuilder.rebuildProjection).toHaveBeenCalledWith({
    kind    : "PERSONA",
    bookId  : BOOK_ID,
    personaId: SOURCE_PERSONA_ID
  });
  expect(projectionBuilder.rebuildProjection).toHaveBeenCalledWith({
    kind    : "PERSONA",
    bookId  : BOOK_ID,
    personaId: TARGET_PERSONA_ID
  });
});

it("splits selected candidates into a new persona row and writes MANUAL identity claims to the new persona id", async () => {
  const personaCreate = vi.fn().mockResolvedValue({ id: NEW_PERSONA_ID, name: "新角色" });
  const createManualOverride = vi.fn().mockResolvedValue({
    originalClaimId: IDENTITY_ID_3,
    manualClaimId  : MANUAL_IDENTITY_ID_3
  });
  const service = createReviewMutationService({
    prismaClient: createPrismaMockWithIdentityClaims([
      identityClaim({
        id               : IDENTITY_ID_3,
        personaCandidateId: CANDIDATE_ID_3,
        resolvedPersonaId : SOURCE_PERSONA_ID
      })
    ], { personaCreate }),
    claimRepository     : createClaimRepositoryMock(),
    projectionBuilder   : { rebuildProjection: vi.fn().mockResolvedValue(undefined) },
    auditService        : { logPersonaAction: vi.fn().mockResolvedValue(undefined) },
    manualOverrideService: { createManualOverride }
  });

  const result = await service.splitPersona({
    bookId         : BOOK_ID,
    sourcePersonaId: SOURCE_PERSONA_ID,
    splitTargets   : [{
      targetPersonaName  : "新角色",
      personaCandidateIds: [CANDIDATE_ID_3]
    }],
    actorUserId    : USER_ID,
    note           : "different person after all"
  });

  expect(personaCreate).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({
      name        : "新角色",
      recordSource: "MANUAL"
    })
  }));
  expect(result.createdPersonaIds).toEqual([NEW_PERSONA_ID]);
  expect(createManualOverride).toHaveBeenCalledWith(expect.objectContaining({
    draft: expect.objectContaining({
      resolvedPersonaId: NEW_PERSONA_ID
    })
  }));
});
```

- [x] **Step 2: Run mutation tests to verify RED for merge/split**

Run:

```bash
pnpm exec vitest run src/server/modules/review/evidence-review/review-mutation-service.test.ts --coverage=false
```

Expected: fail because `mergePersona` and `splitPersona` do not exist yet.

- [x] **Step 3: Implement merge/split via manual identity-resolution claims**

Extend the mutation service without depending on legacy persona truth:

```ts
// src/server/modules/review/evidence-review/review-mutation-service.ts
async function mergePersona(input: MergePersonaInput) {
  const identityClaims = await loadAcceptedIdentityClaimsForCandidates(
    dependencies.prismaClient,
    input.bookId,
    input.sourcePersonaId,
    input.personaCandidateIds
  );

  for (const claim of identityClaims) {
    await dependencies.manualOverrideService.createManualOverride({
      family         : "IDENTITY_RESOLUTION",
      originalClaimId: claim.id,
      actorUserId    : input.actorUserId,
      reviewNote     : input.note ?? null,
      draft          : {
        bookId            : claim.bookId,
        chapterId         : claim.chapterId,
        confidence        : 1,
        mentionId         : claim.mentionId,
        personaCandidateId: claim.personaCandidateId,
        resolvedPersonaId : input.targetPersonaId,
        resolutionKind    : IdentityResolutionKind.MERGE_INTO,
        rationale         : input.note ?? null,
        evidenceSpanIds   : claim.evidenceSpanIds
      }
    });
  }

  await dependencies.auditService.logPersonaAction({
    bookId      : input.bookId,
    personaId   : input.targetPersonaId,
    actorUserId : input.actorUserId,
    action      : "MERGE_PERSONA",
    beforeState : { sourcePersonaId: input.sourcePersonaId, personaCandidateIds: input.personaCandidateIds },
    afterState  : { targetPersonaId: input.targetPersonaId },
    note        : input.note ?? null
  });

  await dependencies.projectionBuilder.rebuildProjection({
    kind    : "PERSONA",
    bookId  : input.bookId,
    personaId: input.sourcePersonaId
  });
  await dependencies.projectionBuilder.rebuildProjection({
    kind    : "PERSONA",
    bookId  : input.bookId,
    personaId: input.targetPersonaId
  });
}

async function splitPersona(input: SplitPersonaInput) {
  const createdPersonaIds: string[] = [];

  for (const target of input.splitTargets) {
    const targetPersonaId = target.targetPersonaId ?? (
      await dependencies.prismaClient.persona.create({
        data: {
          name        : target.targetPersonaName!,
          recordSource: "MANUAL",
          confidence  : 1,
          status      : "CONFIRMED"
        }
      })
    ).id;

    if (!target.targetPersonaId) createdPersonaIds.push(targetPersonaId);

    const identityClaims = await loadAcceptedIdentityClaimsForCandidates(
      dependencies.prismaClient,
      input.bookId,
      input.sourcePersonaId,
      target.personaCandidateIds
    );

    for (const claim of identityClaims) {
      await dependencies.manualOverrideService.createManualOverride({
        family         : "IDENTITY_RESOLUTION",
        originalClaimId: claim.id,
        actorUserId    : input.actorUserId,
        reviewNote     : input.note ?? null,
        draft          : {
          bookId            : claim.bookId,
          chapterId         : claim.chapterId,
          confidence        : 1,
          mentionId         : claim.mentionId,
          personaCandidateId: claim.personaCandidateId,
          resolvedPersonaId : targetPersonaId,
          resolutionKind    : IdentityResolutionKind.SPLIT_FROM,
          rationale         : input.note ?? null,
          evidenceSpanIds   : claim.evidenceSpanIds
        }
      });
    }

    await dependencies.projectionBuilder.rebuildProjection({
      kind    : "PERSONA",
      bookId  : input.bookId,
      personaId: targetPersonaId
    });
  }

  await dependencies.projectionBuilder.rebuildProjection({
    kind    : "PERSONA",
    bookId  : input.bookId,
    personaId: input.sourcePersonaId
  });

  await dependencies.auditService.logPersonaAction({
    bookId      : input.bookId,
    personaId   : input.sourcePersonaId,
    actorUserId : input.actorUserId,
    action      : "SPLIT_PERSONA",
    beforeState : { sourcePersonaId: input.sourcePersonaId },
    afterState  : { splitTargets: input.splitTargets, createdPersonaIds },
    note        : input.note ?? null
  });

  return { createdPersonaIds };
}
```

- [x] **Step 4: Re-run mutation tests and verify GREEN for merge/split**

Run:

```bash
pnpm exec vitest run src/server/modules/review/evidence-review/review-mutation-service.test.ts --coverage=false
```

Expected: merge/split tests pass.

---

### Task 7: Admin Review Routes, Route Tests, And Final Validation

**Files:**
- Create: `src/app/api/admin/review/claims/route.ts`
- Create: `src/app/api/admin/review/claims/route.test.ts`
- Create: `src/app/api/admin/review/claims/[claimKind]/[claimId]/route.ts`
- Create: `src/app/api/admin/review/claims/[claimKind]/[claimId]/route.test.ts`
- Create: `src/app/api/admin/review/claims/[claimKind]/[claimId]/actions/route.ts`
- Create: `src/app/api/admin/review/claims/[claimKind]/[claimId]/actions/route.test.ts`
- Create: `src/app/api/admin/review/personas/merge/route.ts`
- Create: `src/app/api/admin/review/personas/merge/route.test.ts`
- Create: `src/app/api/admin/review/personas/split/route.ts`
- Create: `src/app/api/admin/review/personas/split/route.test.ts`
- Modify: `docs/superpowers/tasks/2026-04-18-evidence-review/12-review-api-mutations.md`
- Modify: `docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md`

- [x] **Step 1: Write failing route tests**

Add route-level cases that prove auth, DTO parsing, and service dispatch:

```ts
// src/app/api/admin/review/claims/route.test.ts
it("GET lists review claims for admins", async () => {
  headersMock.mockResolvedValue(new Headers({
    "x-auth-role"   : AppRole.ADMIN,
    "x-auth-user-id": "user-1"
  }));
  listClaimsMock.mockResolvedValue({ items: [{ claimId: EVENT_ID_1 }], total: 1 });

  const { GET } = await import("./route");
  const response = await GET(new Request(`http://localhost/api/admin/review/claims?bookId=${BOOK_ID}`));

  expect(response.status).toBe(200);
  expect(listClaimsMock).toHaveBeenCalledOnce();
});

it("POST creates a standalone manual claim and requires actor user id", async () => {
  headersMock.mockResolvedValue(new Headers({
    "x-auth-role"   : AppRole.ADMIN,
    "x-auth-user-id": "user-1"
  }));
  createManualClaimMock.mockResolvedValue({ id: MANUAL_RELATION_ID });

  const { POST } = await import("./route");
  const response = await POST(new Request("http://localhost/api/admin/review/claims", {
    method : "POST",
    headers: { "content-type": "application/json" },
    body   : JSON.stringify({
      claimKind: "RELATION",
      note     : "manual add",
      draft    : MANUAL_RELATION_DRAFT
    })
  }));

  expect(response.status).toBe(200);
  expect(createManualClaimMock).toHaveBeenCalledWith(expect.objectContaining({
    actorUserId: "user-1"
  }));
});

// src/app/api/admin/review/claims/[claimKind]/[claimId]/actions/route.test.ts
it("dispatches DEFER action to the mutation service", async () => {
  headersMock.mockResolvedValue(new Headers({
    "x-auth-role"   : AppRole.ADMIN,
    "x-auth-user-id": "user-1"
  }));
  applyClaimActionMock.mockResolvedValue(undefined);

  const { POST } = await import("./route");
  const response = await POST(new Request("http://localhost/api/admin/review/claims/EVENT/event-1/actions", {
    method : "POST",
    headers: { "content-type": "application/json" },
    body   : JSON.stringify({ action: "DEFER", note: "hold" })
  }), {
    params: Promise.resolve({ claimKind: "EVENT", claimId: "event-1" })
  });

  expect(response.status).toBe(200);
  expect(applyClaimActionMock).toHaveBeenCalledWith(expect.objectContaining({
    claimKind  : "EVENT",
    claimId    : "event-1",
    action     : "DEFER",
    actorUserId: "user-1"
  }));
});

// src/app/api/admin/review/personas/merge/route.test.ts
it("dispatches merge persona review mutation for admins", async () => {
  headersMock.mockResolvedValue(new Headers({
    "x-auth-role"   : AppRole.ADMIN,
    "x-auth-user-id": "user-1"
  }));
  mergePersonaMock.mockResolvedValue(undefined);

  const { POST } = await import("./route");
  const response = await POST(new Request("http://localhost/api/admin/review/personas/merge", {
    method : "POST",
    headers: { "content-type": "application/json" },
    body   : JSON.stringify({
      bookId             : BOOK_ID,
      sourcePersonaId    : SOURCE_PERSONA_ID,
      targetPersonaId    : TARGET_PERSONA_ID,
      personaCandidateIds: [CANDIDATE_ID_1]
    })
  }));

  expect(response.status).toBe(200);
  expect(mergePersonaMock).toHaveBeenCalledWith(expect.objectContaining({
    actorUserId: "user-1"
  }));
});
```

- [x] **Step 2: Run route tests and verify RED**

Run:

```bash
pnpm exec vitest run \
  src/app/api/admin/review/claims/route.test.ts \
  src/app/api/admin/review/claims/[claimKind]/[claimId]/route.test.ts \
  src/app/api/admin/review/claims/[claimKind]/[claimId]/actions/route.test.ts \
  src/app/api/admin/review/personas/merge/route.test.ts \
  src/app/api/admin/review/personas/split/route.test.ts \
  --coverage=false
```

Expected: fail because the new routes do not exist.

- [x] **Step 3: Implement the admin review routes**

Follow the existing admin route pattern:

```ts
// src/app/api/admin/review/claims/route.ts
export async function GET(request: Request): Promise<Response> {
  const auth = await getAuthContext(await headers());
  requireAdmin(auth);

  const query = reviewClaimListQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
  const result = await createReviewQueryService().listClaims(query);

  return okJson({
    path     : "/api/admin/review/claims",
    code     : "REVIEW_CLAIMS_LISTED",
    message  : "审核 claim 列表获取成功",
    data     : result
  });
}

export async function POST(request: Request): Promise<Response> {
  const auth = await getAuthContext(await headers());
  const actorUserId = requireAdminActorUserId(auth);
  const body = reviewCreateManualClaimRequestSchema.parse(await request.json());

  const created = await createReviewMutationService().createManualClaim({
    claimKind  : body.claimKind,
    draft      : body.draft,
    note       : body.note ?? null,
    actorUserId
  });

  return okJson({
    path    : "/api/admin/review/claims",
    code    : "REVIEW_MANUAL_CLAIM_CREATED",
    message : "人工 claim 创建成功",
    data    : created
  });
}

// src/app/api/admin/review/claims/[claimKind]/[claimId]/actions/route.ts
export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const auth = await getAuthContext(await headers());
  const actorUserId = requireAdminActorUserId(auth);
  const params = reviewClaimRouteParamsSchema.parse(await context.params);
  const body = reviewClaimActionRequestSchema.parse(await request.json());
  const service = createReviewMutationService();

  if (body.action === "EDIT") {
    await service.editClaim({ ...params, bookId: body.draft.bookId, draft: body.draft, note: body.note ?? null, actorUserId });
  } else if (body.action === "RELINK_EVIDENCE") {
    await service.relinkEvidence({ ...params, bookId: body.bookId, evidenceSpanIds: body.evidenceSpanIds, note: body.note ?? null, actorUserId });
  } else {
    await service.applyClaimAction({ ...params, bookId: body.bookId, action: body.action, note: body.note ?? null, actorUserId });
  }

  return okJson({
    path   : `/api/admin/review/claims/${params.claimKind}/${params.claimId}/actions`,
    code   : "REVIEW_CLAIM_ACTION_APPLIED",
    message: "审核动作已执行",
    data   : { claimKind: params.claimKind, claimId: params.claimId, action: body.action }
  });
}
```

- [x] **Step 4: Re-run route tests and verify GREEN**

Run:

```bash
pnpm exec vitest run \
  src/app/api/admin/review/claims/route.test.ts \
  src/app/api/admin/review/claims/[claimKind]/[claimId]/route.test.ts \
  src/app/api/admin/review/claims/[claimKind]/[claimId]/actions/route.test.ts \
  src/app/api/admin/review/personas/merge/route.test.ts \
  src/app/api/admin/review/personas/split/route.test.ts \
  --coverage=false
```

Expected: pass.

- [x] **Step 5: Run full T12 validation**

Run:

```bash
pnpm prisma validate --schema prisma/schema.prisma
pnpm prisma:generate
pnpm exec vitest run \
  src/server/modules/auth/token.test.ts \
  src/server/modules/auth/index.test.ts \
  src/middleware.test.ts \
  src/app/api/auth/login/route.test.ts \
  src/server/modules/review/evidence-review/review-api-schemas.test.ts \
  src/server/modules/review/evidence-review/review-audit-service.test.ts \
  src/server/modules/review/evidence-review/review-query-service.test.ts \
  src/server/modules/review/evidence-review/review-mutation-service.test.ts \
  src/app/api/admin/review/claims/route.test.ts \
  src/app/api/admin/review/claims/[claimKind]/[claimId]/route.test.ts \
  src/app/api/admin/review/claims/[claimKind]/[claimId]/actions/route.test.ts \
  src/app/api/admin/review/personas/merge/route.test.ts \
  src/app/api/admin/review/personas/split/route.test.ts \
  --coverage=false
pnpm lint
pnpm type-check
```

Expected: all commands succeed.

- [ ] **Step 6: Record task completion and commit**

Update the task doc and runbook only after validation passes:

```md
<!-- docs/superpowers/tasks/2026-04-18-evidence-review/12-review-api-mutations.md -->
## Execution Record

- 2026-04-21: Implemented claim-first review list/detail APIs, mutation service, audit service, admin routes, auth actor propagation, and scoped projection rebuild hooks. Validation passed with Vitest, Prisma validate/generate, lint, and type-check.
```

```md
<!-- docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md -->
- [x] T12: `docs/superpowers/tasks/2026-04-18-evidence-review/12-review-api-mutations.md`
```

Then commit:

```bash
git add prisma/schema.prisma prisma/migrations/20260421103000_review_action_defer \
  src/server/modules/auth/constants.ts src/server/modules/auth/token.ts src/server/modules/auth/index.ts src/server/modules/auth/edge-token.ts \
  src/server/modules/auth/token.test.ts src/server/modules/auth/index.test.ts middleware.ts src/middleware.test.ts \
  src/app/api/auth/login/route.ts src/app/api/auth/login/route.test.ts \
  src/server/modules/review/evidence-review/review-api-schemas.ts src/server/modules/review/evidence-review/review-api-schemas.test.ts \
  src/server/modules/review/evidence-review/review-audit-service.ts src/server/modules/review/evidence-review/review-audit-service.test.ts \
  src/server/modules/review/evidence-review/review-query-service.ts src/server/modules/review/evidence-review/review-query-service.test.ts \
  src/server/modules/review/evidence-review/review-mutation-service.ts src/server/modules/review/evidence-review/review-mutation-service.test.ts \
  src/app/api/admin/review/claims/route.ts src/app/api/admin/review/claims/route.test.ts \
  src/app/api/admin/review/claims/[claimKind]/[claimId]/route.ts src/app/api/admin/review/claims/[claimKind]/[claimId]/route.test.ts \
  src/app/api/admin/review/claims/[claimKind]/[claimId]/actions/route.ts src/app/api/admin/review/claims/[claimKind]/[claimId]/actions/route.test.ts \
  src/app/api/admin/review/personas/merge/route.ts src/app/api/admin/review/personas/merge/route.test.ts \
  src/app/api/admin/review/personas/split/route.ts src/app/api/admin/review/personas/split/route.test.ts \
  docs/superpowers/tasks/2026-04-18-evidence-review/12-review-api-mutations.md \
  docs/superpowers/plans/2026-04-18-evidence-review-superpowers-only-runbook.md
git commit -m "feat: add claim-first review mutation APIs"
```

2026-04-21 update: task doc and runbook completion records are now updated, but the commit remains intentionally deferred until you explicitly request a T12 commit.

---

## Coverage Check

- T12 task requirement `accept / reject / defer / edit / createManualClaim / mergePersona / splitPersona / relinkEvidence`: covered by Tasks 4-6 and route Task 7.
- T12 requirement `every mutation writes review_audit_logs`: covered by Task 2 and used in Tasks 4-6.
- T12 requirement `only affected projection rebuild slices`: covered by Task 4 rules and reused in Tasks 5-6.
- T12 requirement `stable DTOs for T13-T16`: covered by Task 1 schemas and Task 3 query service.
- T12 stop condition `audit identity/user attribution unavailable`: explicitly addressed in Task 1 via token/middleware/auth chain repair.
- Additional architecture risk discovered during planning `merge/split cannot rely on legacy persona truth`: explicitly addressed in Task 6.
