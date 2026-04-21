import { prisma } from "@/server/db/prisma";
import {
  IdentityResolutionKind,
  type ClaimKind,
  type ReviewAction
} from "@/generated/prisma/enums";
import { createClaimRepository } from "@/server/modules/analysis/claims/claim-repository";
import type { ClaimRepository } from "@/server/modules/analysis/claims/claim-repository";
import { createManualOverrideService } from "@/server/modules/analysis/claims/manual-override";
import {
  toClaimCreateData,
  type ClaimCreateDataByFamily,
  type ManualOverrideFamily,
  type ReviewableClaimFamily,
  validateClaimDraftByFamily
} from "@/server/modules/analysis/claims/claim-schemas";
import { createProjectionBuilder, createProjectionRepository } from "@/server/modules/review/evidence-review/projections";
import type { ProjectionBuilder, ProjectionRebuildScope } from "@/server/modules/review/evidence-review/projections/types";
import { createReviewAuditService } from "@/server/modules/review/evidence-review/review-audit-service";
import type { LogClaimActionInput } from "@/server/modules/review/evidence-review/review-audit-service";
import { assertReviewStateTransition } from "@/server/modules/review/evidence-review/review-state";
import type { ClaimReviewState } from "@/server/modules/review/evidence-review/review-state";

const ACTION_TO_TARGET_STATE = Object.freeze({
  ACCEPT: "ACCEPTED",
  REJECT: "REJECTED",
  DEFER : "DEFERRED"
} as const);

type SupportedClaimAction = keyof typeof ACTION_TO_TARGET_STATE;

type ClaimProjectionContext = {
  chapterId          : string | null;
  timeLabel          : string | null;
  personaCandidateIds: readonly string[];
  explicitPersonaIds : readonly string[];
};

type AcceptedIdentityClaim = {
  id                : string;
  bookId            : string;
  chapterId         : string | null;
  mentionId         : string;
  personaCandidateId: string;
  evidenceSpanIds   : string[];
  runId             : string;
};

type ReviewMutationPrismaClient = {
  aliasClaim: {
    findUnique(args: {
      where : { id: string };
      select: {
        id                      : true;
        bookId                  : true;
        chapterId               : true;
        personaCandidateId      : true;
        targetPersonaCandidateId: true;
      };
    }): Promise<{
      id                      : string;
      bookId                  : string;
      chapterId               : string | null;
      personaCandidateId      : string | null;
      targetPersonaCandidateId: string | null;
    } | null>;
  };
  eventClaim: {
    findUnique(args: {
      where : { id: string };
      select: {
        id                       : true;
        bookId                   : true;
        chapterId                : true;
        subjectPersonaCandidateId: true;
        objectPersonaCandidateId : true;
      };
    }): Promise<{
      id                       : string;
      bookId                   : string;
      chapterId                : string;
      subjectPersonaCandidateId: string | null;
      objectPersonaCandidateId : string | null;
    } | null>;
  };
  relationClaim: {
    findUnique(args: {
      where : { id: string };
      select: {
        id                      : true;
        bookId                  : true;
        chapterId               : true;
        sourcePersonaCandidateId: true;
        targetPersonaCandidateId: true;
      };
    }): Promise<{
      id                      : string;
      bookId                  : string;
      chapterId               : string;
      sourcePersonaCandidateId: string | null;
      targetPersonaCandidateId: string | null;
    } | null>;
  };
  timeClaim: {
    findUnique(args: {
      where : { id: string };
      select: {
        id             : true;
        bookId         : true;
        chapterId      : true;
        normalizedLabel: true;
      };
    }): Promise<{
      id             : string;
      bookId         : string;
      chapterId      : string;
      normalizedLabel: string;
    } | null>;
  };
  identityResolutionClaim: {
    findUnique(args: {
      where : { id: string };
      select: {
        id                : true;
        bookId            : true;
        chapterId         : true;
        personaCandidateId: true;
        resolvedPersonaId : true;
      };
    }): Promise<{
      id                : string;
      bookId            : string;
      chapterId         : string | null;
      personaCandidateId: string | null;
      resolvedPersonaId : string | null;
    } | null>;
    findMany(args: {
      where: {
        bookId            : string;
        reviewState       : "ACCEPTED";
        personaCandidateId: { in: string[] };
        resolvedPersonaId : { not: null } | string;
      };
      select: {
        id?               : true;
        bookId?           : true;
        chapterId?        : true;
        mentionId?        : true;
        personaCandidateId: true;
        resolvedPersonaId : true;
        evidenceSpanIds?  : true;
        runId?            : true;
      };
    }): Promise<Array<{
      id                : string;
      bookId            : string;
      chapterId         : string | null;
      mentionId         : string;
      personaCandidateId: string | null;
      resolvedPersonaId : string | null;
      evidenceSpanIds   : string[];
      runId             : string;
    }>>;
  };
  conflictFlag: {
    findUnique(args: {
      where : { id: string };
      select: {
        id                        : true;
        bookId                    : true;
        chapterId                 : true;
        relatedPersonaCandidateIds: true;
      };
    }): Promise<{
      id                        : string;
      bookId                    : string;
      chapterId                 : string | null;
      relatedPersonaCandidateIds: string[];
    } | null>;
  };
  persona: {
    create(args: {
      data: {
        name        : string;
        recordSource: "MANUAL";
        confidence  : number;
        status      : "CONFIRMED";
      };
    }): Promise<{ id: string; name: string }>;
  };
};

type ReviewAuditService = {
  logClaimAction  : ReturnType<typeof createReviewAuditService>["logClaimAction"];
  logPersonaAction: ReturnType<typeof createReviewAuditService>["logPersonaAction"];
};
type ReviewProjectionBuilder = Pick<ProjectionBuilder, "rebuildProjection">;
type ReviewManualOverrideService = Pick<ReturnType<typeof createManualOverrideService>, "createManualOverride">;
type ManualClaimDraftInput<TFamily extends ManualOverrideFamily> = Omit<
  ClaimCreateDataByFamily[TFamily],
  | "source"
  | "reviewState"
  | "supersedesClaimId"
  | "derivedFromClaimId"
  | "createdByUserId"
  | "reviewedByUserId"
  | "reviewNote"
>;
type EditableClaimRowByFamily = {
  [TFamily in ManualOverrideFamily]: { id: string } & ManualClaimDraftInput<TFamily>;
};

export interface ApplyClaimActionInput {
  bookId     : string;
  claimKind  : ReviewableClaimFamily;
  claimId    : string;
  action     : SupportedClaimAction;
  actorUserId: string;
  note?      : string | null;
}

export interface CreateManualClaimInput<TFamily extends ManualOverrideFamily = ManualOverrideFamily> {
  claimKind  : TFamily;
  actorUserId: string;
  note?      : string | null;
  draft      : ManualClaimDraftInput<TFamily>;
}

export interface EditClaimInput<TFamily extends ManualOverrideFamily = ManualOverrideFamily> {
  bookId     : string;
  claimKind  : TFamily;
  claimId    : string;
  actorUserId: string;
  note?      : string | null;
  draft      : ManualClaimDraftInput<TFamily>;
}

export interface RelinkEvidenceInput<TFamily extends ManualOverrideFamily = ManualOverrideFamily> {
  bookId         : string;
  claimKind      : TFamily;
  claimId        : string;
  actorUserId    : string;
  note?          : string | null;
  evidenceSpanIds: string[];
}

export interface MergePersonaInput {
  bookId             : string;
  sourcePersonaId    : string;
  targetPersonaId    : string;
  personaCandidateIds: string[];
  actorUserId        : string;
  note?              : string | null;
}

export interface SplitPersonaTargetInput {
  targetPersonaId?   : string;
  targetPersonaName? : string;
  personaCandidateIds: string[];
}

export interface SplitPersonaInput {
  bookId         : string;
  sourcePersonaId: string;
  splitTargets   : SplitPersonaTargetInput[];
  actorUserId    : string;
  note?          : string | null;
}

export interface SplitPersonaResult {
  createdPersonaIds: string[];
}

export interface ReviewMutationDependencies {
  prismaClient?         : ReviewMutationPrismaClient;
  claimRepository?      : ClaimRepository;
  projectionBuilder?    : ReviewProjectionBuilder;
  auditService?         : Partial<ReviewAuditService>;
  manualOverrideService?: ReviewManualOverrideService;
  now?                  : () => Date;
}

type RequiredReviewMutationDependencies = {
  prismaClient         : ReviewMutationPrismaClient;
  claimRepository      : ClaimRepository;
  projectionBuilder    : ReviewProjectionBuilder;
  auditService         : ReviewAuditService;
  manualOverrideService: ReviewManualOverrideService;
  now                  : () => Date;
};

function normalizeActorUserId(actorUserId: string): string {
  const normalized = actorUserId.trim();
  if (normalized.length === 0) {
    throw new Error("review mutation actorUserId is required");
  }
  return normalized;
}

function toUniqueSortedIds(values: readonly (string | null | undefined)[]): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))
  ).sort();
}

function toPrismaClaimKind(claimKind: ReviewableClaimFamily): ClaimKind {
  return claimKind as ClaimKind;
}

function resolveTargetReviewState(action: SupportedClaimAction): ClaimReviewState {
  return ACTION_TO_TARGET_STATE[action];
}

/**
 * 根据 claim family 读取最小必要字段，后续用于 Stage D 的 persona/time/chapter scope 解析。
 */
async function loadClaimProjectionContext(
  prismaClient: ReviewMutationPrismaClient,
  input: { bookId: string; claimKind: ReviewableClaimFamily; claimId: string }
): Promise<ClaimProjectionContext | null> {
  switch (input.claimKind) {
    case "ALIAS": {
      const claim = await prismaClient.aliasClaim.findUnique({
        where : { id: input.claimId },
        select: {
          id                      : true,
          bookId                  : true,
          chapterId               : true,
          personaCandidateId      : true,
          targetPersonaCandidateId: true
        }
      });
      if (claim === null || claim.bookId !== input.bookId) return null;
      return {
        chapterId          : claim.chapterId,
        timeLabel          : null,
        personaCandidateIds: toUniqueSortedIds([
          claim.personaCandidateId,
          claim.targetPersonaCandidateId
        ]),
        explicitPersonaIds: []
      };
    }

    case "EVENT": {
      const claim = await prismaClient.eventClaim.findUnique({
        where : { id: input.claimId },
        select: {
          id                       : true,
          bookId                   : true,
          chapterId                : true,
          subjectPersonaCandidateId: true,
          objectPersonaCandidateId : true
        }
      });
      if (claim === null || claim.bookId !== input.bookId) return null;
      return {
        chapterId          : claim.chapterId,
        timeLabel          : null,
        personaCandidateIds: toUniqueSortedIds([
          claim.subjectPersonaCandidateId,
          claim.objectPersonaCandidateId
        ]),
        explicitPersonaIds: []
      };
    }

    case "RELATION": {
      const claim = await prismaClient.relationClaim.findUnique({
        where : { id: input.claimId },
        select: {
          id                      : true,
          bookId                  : true,
          chapterId               : true,
          sourcePersonaCandidateId: true,
          targetPersonaCandidateId: true
        }
      });
      if (claim === null || claim.bookId !== input.bookId) return null;
      return {
        chapterId          : claim.chapterId,
        timeLabel          : null,
        personaCandidateIds: toUniqueSortedIds([
          claim.sourcePersonaCandidateId,
          claim.targetPersonaCandidateId
        ]),
        explicitPersonaIds: []
      };
    }

    case "TIME": {
      const claim = await prismaClient.timeClaim.findUnique({
        where : { id: input.claimId },
        select: {
          id             : true,
          bookId         : true,
          chapterId      : true,
          normalizedLabel: true
        }
      });
      if (claim === null || claim.bookId !== input.bookId) return null;
      return {
        chapterId          : claim.chapterId,
        timeLabel          : claim.normalizedLabel,
        personaCandidateIds: [],
        explicitPersonaIds : []
      };
    }

    case "IDENTITY_RESOLUTION": {
      const claim = await prismaClient.identityResolutionClaim.findUnique({
        where : { id: input.claimId },
        select: {
          id                : true,
          bookId            : true,
          chapterId         : true,
          personaCandidateId: true,
          resolvedPersonaId : true
        }
      });
      if (claim === null || claim.bookId !== input.bookId) return null;
      return {
        chapterId          : claim.chapterId,
        timeLabel          : null,
        personaCandidateIds: toUniqueSortedIds([claim.personaCandidateId]),
        explicitPersonaIds : toUniqueSortedIds([claim.resolvedPersonaId])
      };
    }

    case "CONFLICT_FLAG": {
      const claim = await prismaClient.conflictFlag.findUnique({
        where : { id: input.claimId },
        select: {
          id                        : true,
          bookId                    : true,
          chapterId                 : true,
          relatedPersonaCandidateIds: true
        }
      });
      if (claim === null || claim.bookId !== input.bookId) return null;
      return {
        chapterId          : claim.chapterId,
        timeLabel          : null,
        personaCandidateIds: toUniqueSortedIds(claim.relatedPersonaCandidateIds),
        explicitPersonaIds : []
      };
    }
  }
}

async function resolvePersonaIdsByAcceptedIdentityMapping(
  prismaClient: ReviewMutationPrismaClient,
  input: {
    bookId             : string;
    personaCandidateIds: readonly string[];
  }
): Promise<string[]> {
  if (input.personaCandidateIds.length === 0) {
    return [];
  }

  const rows = await prismaClient.identityResolutionClaim.findMany({
    where: {
      bookId            : input.bookId,
      reviewState       : "ACCEPTED",
      personaCandidateId: { in: [...input.personaCandidateIds] },
      resolvedPersonaId : { not: null }
    },
    select: {
      personaCandidateId: true,
      resolvedPersonaId : true
    }
  });

  const resolvedPersonaIdsByCandidateId = new Map<string, Set<string>>();
  for (const row of rows) {
    if (row.personaCandidateId === null || row.resolvedPersonaId === null) continue;

    const resolvedPersonaIds =
      resolvedPersonaIdsByCandidateId.get(row.personaCandidateId) ?? new Set<string>();
    resolvedPersonaIds.add(row.resolvedPersonaId);
    resolvedPersonaIdsByCandidateId.set(row.personaCandidateId, resolvedPersonaIds);
  }

  const personaIds: string[] = [];
  for (const resolvedPersonaIds of resolvedPersonaIdsByCandidateId.values()) {
    if (resolvedPersonaIds.size !== 1) continue;
    personaIds.push(...resolvedPersonaIds);
  }

  return toUniqueSortedIds(personaIds);
}

/**
 * merge/split 不能直接改 persona 目录真相，必须定位当前已接受的 identity claims，再为这些 claim 写 manual override。
 */
async function loadAcceptedIdentityClaimsForCandidates(
  prismaClient: ReviewMutationPrismaClient,
  input: {
    bookId             : string;
    sourcePersonaId    : string;
    personaCandidateIds: readonly string[];
  }
): Promise<AcceptedIdentityClaim[]> {
  const personaCandidateIds = toUniqueSortedIds(input.personaCandidateIds);
  if (personaCandidateIds.length === 0) {
    return [];
  }

  const rows = await prismaClient.identityResolutionClaim.findMany({
    where: {
      bookId            : input.bookId,
      reviewState       : "ACCEPTED",
      personaCandidateId: { in: personaCandidateIds },
      resolvedPersonaId : input.sourcePersonaId
    },
    select: {
      id                : true,
      bookId            : true,
      chapterId         : true,
      mentionId         : true,
      personaCandidateId: true,
      resolvedPersonaId : true,
      evidenceSpanIds   : true,
      runId             : true
    }
  });

  const claims = rows
    .filter((row): row is AcceptedIdentityClaim & { resolvedPersonaId: string } => (
      row.personaCandidateId !== null && row.resolvedPersonaId === input.sourcePersonaId
    ))
    .map((row) => ({
      id                : row.id,
      bookId            : row.bookId,
      chapterId         : row.chapterId,
      mentionId         : row.mentionId,
      personaCandidateId: row.personaCandidateId,
      evidenceSpanIds   : row.evidenceSpanIds,
      runId             : row.runId
    }));

  const matchedCandidateIds = new Set(claims.map((claim) => claim.personaCandidateId));
  const missingCandidateIds = personaCandidateIds.filter((candidateId) => !matchedCandidateIds.has(candidateId));
  if (missingCandidateIds.length > 0) {
    throw new Error(
      `Accepted identity claims not found for source persona ${input.sourcePersonaId}: ${missingCandidateIds.join(", ")}`
    );
  }

  return claims;
}

function collectEvidenceSpanIdsFromIdentityClaims(claims: readonly AcceptedIdentityClaim[]): string[] {
  return toUniqueSortedIds(claims.flatMap((claim) => claim.evidenceSpanIds));
}

function buildClaimProjectionContextFromDraft<TFamily extends ManualOverrideFamily>(
  claimKind: TFamily,
  draft: ManualClaimDraftInput<TFamily>
): ClaimProjectionContext {
  switch (claimKind) {
    case "ALIAS": {
      const aliasDraft = draft as ManualClaimDraftInput<"ALIAS">;
      return {
        chapterId          : aliasDraft.chapterId,
        timeLabel          : null,
        personaCandidateIds: toUniqueSortedIds([
          aliasDraft.personaCandidateId,
          aliasDraft.targetPersonaCandidateId
        ]),
        explicitPersonaIds: []
      };
    }

    case "EVENT": {
      const eventDraft = draft as ManualClaimDraftInput<"EVENT">;
      return {
        chapterId          : eventDraft.chapterId,
        timeLabel          : null,
        personaCandidateIds: toUniqueSortedIds([
          eventDraft.subjectPersonaCandidateId,
          eventDraft.objectPersonaCandidateId
        ]),
        explicitPersonaIds: []
      };
    }

    case "RELATION": {
      const relationDraft = draft as ManualClaimDraftInput<"RELATION">;
      return {
        chapterId          : relationDraft.chapterId,
        timeLabel          : null,
        personaCandidateIds: toUniqueSortedIds([
          relationDraft.sourcePersonaCandidateId,
          relationDraft.targetPersonaCandidateId
        ]),
        explicitPersonaIds: []
      };
    }

    case "TIME": {
      const timeDraft = draft as ManualClaimDraftInput<"TIME">;
      return {
        chapterId          : timeDraft.chapterId,
        timeLabel          : timeDraft.normalizedLabel,
        personaCandidateIds: [],
        explicitPersonaIds : []
      };
    }

    case "IDENTITY_RESOLUTION": {
      const identityDraft = draft as ManualClaimDraftInput<"IDENTITY_RESOLUTION">;
      return {
        chapterId          : identityDraft.chapterId,
        timeLabel          : null,
        personaCandidateIds: toUniqueSortedIds([identityDraft.personaCandidateId]),
        explicitPersonaIds : toUniqueSortedIds([identityDraft.resolvedPersonaId])
      };
    }
  }
}

async function resolveProjectionScopesForContext(
  prismaClient: ReviewMutationPrismaClient,
  input: {
    bookId   : string;
    claimKind: ReviewableClaimFamily;
    context  : ClaimProjectionContext;
  }
): Promise<ProjectionRebuildScope[]> {
  const personaIds = toUniqueSortedIds([
    ...input.context.explicitPersonaIds,
    ...(await resolvePersonaIdsByAcceptedIdentityMapping(prismaClient, {
      bookId             : input.bookId,
      personaCandidateIds: input.context.personaCandidateIds
    }))
  ]);

  if (personaIds.length > 0) {
    return personaIds.map((personaId) => ({
      kind  : "PERSONA" as const,
      bookId: input.bookId,
      personaId
    }));
  }

  if (input.claimKind === "TIME" && input.context.timeLabel !== null) {
    return [{
      kind     : "TIME_SLICE",
      bookId   : input.bookId,
      timeLabel: input.context.timeLabel
    }];
  }

  if (input.context.chapterId !== null) {
    return [{
      kind     : "CHAPTER",
      bookId   : input.bookId,
      chapterId: input.context.chapterId
    }];
  }

  return [];
}

/**
 * 优先 PERSONA；仅当 persona 无法确定时按 TIME claim -> TIME_SLICE，再回退到 CHAPTER。
 */
async function resolveProjectionScopesForClaimAction(
  prismaClient: ReviewMutationPrismaClient,
  input: {
    bookId   : string;
    claimKind: ReviewableClaimFamily;
    claimId  : string;
  }
): Promise<ProjectionRebuildScope[]> {
  const context = await loadClaimProjectionContext(prismaClient, input);
  if (context === null) {
    return [];
  }

  return resolveProjectionScopesForContext(prismaClient, {
    bookId   : input.bookId,
    claimKind: input.claimKind,
    context
  });
}

async function resolveProjectionScopesForClaimPayload<TFamily extends ManualOverrideFamily>(
  prismaClient: ReviewMutationPrismaClient,
  input: {
    bookId   : string;
    claimKind: TFamily;
    draft    : ManualClaimDraftInput<TFamily>;
  }
): Promise<ProjectionRebuildScope[]> {
  return resolveProjectionScopesForContext(prismaClient, {
    bookId   : input.bookId,
    claimKind: input.claimKind,
    context  : buildClaimProjectionContextFromDraft(input.claimKind, input.draft)
  });
}

function buildProjectionFamiliesKey(projectionFamilies?: readonly string[]): string {
  return projectionFamilies === undefined ? "*" : [...projectionFamilies].sort().join(",");
}

function buildProjectionScopeKey(scope: ProjectionRebuildScope): string {
  const projectionFamiliesKey = buildProjectionFamiliesKey(scope.projectionFamilies);

  switch (scope.kind) {
    case "FULL_BOOK":
      return `${scope.kind}:${scope.bookId}:${projectionFamiliesKey}`;
    case "PERSONA":
      return `${scope.kind}:${scope.bookId}:${scope.personaId}:${projectionFamiliesKey}`;
    case "TIME_SLICE":
      return `${scope.kind}:${scope.bookId}:${scope.timeLabel}:${projectionFamiliesKey}`;
    case "CHAPTER":
      return `${scope.kind}:${scope.bookId}:${scope.chapterId}:${projectionFamiliesKey}`;
    case "RELATION_EDGE":
      return [
        scope.kind,
        scope.bookId,
        scope.sourcePersonaId,
        scope.targetPersonaId,
        scope.relationTypeKey ?? "*",
        projectionFamiliesKey
      ].join(":");
    case "PROJECTION_ONLY":
      return `${scope.kind}:${scope.bookId}:${projectionFamiliesKey}`;
  }
}

async function rebuildProjectionScopes(
  projectionBuilder: ReviewProjectionBuilder,
  scopes: readonly ProjectionRebuildScope[]
): Promise<void> {
  const uniqueScopes = new Map<string, ProjectionRebuildScope>();

  for (const scope of scopes) {
    uniqueScopes.set(buildProjectionScopeKey(scope), scope);
  }

  for (const scope of uniqueScopes.values()) {
    await projectionBuilder.rebuildProjection(scope);
  }
}

function validateAcceptedManualDraft<TFamily extends ManualOverrideFamily>(input: {
  claimKind         : TFamily;
  actorUserId       : string;
  note?             : string | null;
  draft             : ManualClaimDraftInput<TFamily>;
  supersedesClaimId : string | null;
  derivedFromClaimId: string | null;
}) {
  return validateClaimDraftByFamily(input.claimKind, {
    claimFamily       : input.claimKind,
    ...input.draft,
    source            : "MANUAL",
    reviewState       : "ACCEPTED",
    supersedesClaimId : input.supersedesClaimId,
    derivedFromClaimId: input.derivedFromClaimId,
    createdByUserId   : input.actorUserId,
    reviewedByUserId  : input.actorUserId,
    reviewNote        : input.note ?? null
  });
}

function assertDraftBookId(expectedBookId: string, actualBookId: string): void {
  if (expectedBookId !== actualBookId) {
    throw new Error(
      `Claim draft bookId ${actualBookId} does not match route bookId ${expectedBookId}`
    );
  }
}

type EditableClaimLoaderPrismaClient = {
  aliasClaim             : { findUnique(args: unknown): Promise<EditableClaimRowByFamily["ALIAS"] | null> };
  eventClaim             : { findUnique(args: unknown): Promise<EditableClaimRowByFamily["EVENT"] | null> };
  relationClaim          : { findUnique(args: unknown): Promise<EditableClaimRowByFamily["RELATION"] | null> };
  timeClaim              : { findUnique(args: unknown): Promise<EditableClaimRowByFamily["TIME"] | null> };
  identityResolutionClaim: {
    findUnique(args: unknown): Promise<EditableClaimRowByFamily["IDENTITY_RESOLUTION"] | null>;
  };
};

function toEditableClaimLoaderPrismaClient(
  prismaClient: ReviewMutationPrismaClient
): EditableClaimLoaderPrismaClient {
  return prismaClient as unknown as EditableClaimLoaderPrismaClient;
}

function toEditableAliasClaimDraft(
  claim: EditableClaimRowByFamily["ALIAS"]
): ManualClaimDraftInput<"ALIAS"> {
  const { id: _id, ...draft } = claim;
  return draft;
}

function toEditableEventClaimDraft(
  claim: EditableClaimRowByFamily["EVENT"]
): ManualClaimDraftInput<"EVENT"> {
  const { id: _id, ...draft } = claim;
  return draft;
}

function toEditableRelationClaimDraft(
  claim: EditableClaimRowByFamily["RELATION"]
): ManualClaimDraftInput<"RELATION"> {
  const { id: _id, ...draft } = claim;
  return draft;
}

function toEditableTimeClaimDraft(
  claim: EditableClaimRowByFamily["TIME"]
): ManualClaimDraftInput<"TIME"> {
  const { id: _id, ...draft } = claim;
  return draft;
}

function toEditableIdentityClaimDraft(
  claim: EditableClaimRowByFamily["IDENTITY_RESOLUTION"]
): ManualClaimDraftInput<"IDENTITY_RESOLUTION"> {
  const { id: _id, ...draft } = claim;
  return draft;
}

function throwEditableClaimNotFound(
  claimKind: ManualOverrideFamily,
  claimId: string
): never {
  throw new Error(`Editable claim ${claimKind}:${claimId} not found`);
}

/**
 * relink 需要读取原 claim 的业务字段来克隆 manual override，这里按 family 分开隔离 Prisma 全字段查询，
 * 避免泛型索引退化成 impossible intersection。
 */
async function loadEditableAliasClaimOrThrow(
  prismaClient: ReviewMutationPrismaClient,
  input: { bookId: string; claimId: string }
): Promise<ManualClaimDraftInput<"ALIAS">> {
  const claim = await toEditableClaimLoaderPrismaClient(prismaClient).aliasClaim.findUnique({
    where : { id: input.claimId },
    select: {
      id                      : true,
      bookId                  : true,
      chapterId               : true,
      confidence              : true,
      runId                   : true,
      evidenceSpanIds         : true,
      aliasText               : true,
      aliasType               : true,
      personaCandidateId      : true,
      targetPersonaCandidateId: true,
      claimKind               : true
    }
  });

  if (claim === null || claim.bookId !== input.bookId) {
    throwEditableClaimNotFound("ALIAS", input.claimId);
  }

  return toEditableAliasClaimDraft(claim);
}

async function loadEditableEventClaimOrThrow(
  prismaClient: ReviewMutationPrismaClient,
  input: { bookId: string; claimId: string }
): Promise<ManualClaimDraftInput<"EVENT">> {
  const claim = await toEditableClaimLoaderPrismaClient(prismaClient).eventClaim.findUnique({
    where : { id: input.claimId },
    select: {
      id                       : true,
      bookId                   : true,
      chapterId                : true,
      confidence               : true,
      runId                    : true,
      evidenceSpanIds          : true,
      subjectMentionId         : true,
      subjectPersonaCandidateId: true,
      predicate                : true,
      objectText               : true,
      objectPersonaCandidateId : true,
      locationText             : true,
      timeHintId               : true,
      eventCategory            : true,
      narrativeLens            : true
    }
  });

  if (claim === null || claim.bookId !== input.bookId) {
    throwEditableClaimNotFound("EVENT", input.claimId);
  }

  return toEditableEventClaimDraft(claim);
}

async function loadEditableRelationClaimOrThrow(
  prismaClient: ReviewMutationPrismaClient,
  input: { bookId: string; claimId: string }
): Promise<ManualClaimDraftInput<"RELATION">> {
  const claim = await toEditableClaimLoaderPrismaClient(prismaClient).relationClaim.findUnique({
    where : { id: input.claimId },
    select: {
      id                      : true,
      bookId                  : true,
      chapterId               : true,
      confidence              : true,
      runId                   : true,
      evidenceSpanIds         : true,
      sourceMentionId         : true,
      targetMentionId         : true,
      sourcePersonaCandidateId: true,
      targetPersonaCandidateId: true,
      relationTypeKey         : true,
      relationLabel           : true,
      relationTypeSource      : true,
      direction               : true,
      effectiveChapterStart   : true,
      effectiveChapterEnd     : true,
      timeHintId              : true
    }
  });

  if (claim === null || claim.bookId !== input.bookId) {
    throwEditableClaimNotFound("RELATION", input.claimId);
  }

  return toEditableRelationClaimDraft(claim);
}

async function loadEditableTimeClaimOrThrow(
  prismaClient: ReviewMutationPrismaClient,
  input: { bookId: string; claimId: string }
): Promise<ManualClaimDraftInput<"TIME">> {
  const claim = await toEditableClaimLoaderPrismaClient(prismaClient).timeClaim.findUnique({
    where : { id: input.claimId },
    select: {
      id                 : true,
      bookId             : true,
      chapterId          : true,
      confidence         : true,
      runId              : true,
      evidenceSpanIds    : true,
      rawTimeText        : true,
      timeType           : true,
      normalizedLabel    : true,
      relativeOrderWeight: true,
      chapterRangeStart  : true,
      chapterRangeEnd    : true
    }
  });

  if (claim === null || claim.bookId !== input.bookId) {
    throwEditableClaimNotFound("TIME", input.claimId);
  }

  return toEditableTimeClaimDraft(claim);
}

async function loadEditableIdentityClaimOrThrow(
  prismaClient: ReviewMutationPrismaClient,
  input: { bookId: string; claimId: string }
): Promise<ManualClaimDraftInput<"IDENTITY_RESOLUTION">> {
  const claim = await toEditableClaimLoaderPrismaClient(prismaClient).identityResolutionClaim.findUnique({
    where : { id: input.claimId },
    select: {
      id                : true,
      bookId            : true,
      chapterId         : true,
      confidence        : true,
      runId             : true,
      evidenceSpanIds   : true,
      mentionId         : true,
      personaCandidateId: true,
      resolvedPersonaId : true,
      resolutionKind    : true,
      rationale         : true
    }
  });

  if (claim === null || claim.bookId !== input.bookId) {
    throwEditableClaimNotFound("IDENTITY_RESOLUTION", input.claimId);
  }

  return toEditableIdentityClaimDraft(claim);
}

function buildAuditPayload(
  input: ApplyClaimActionInput,
  beforeState: { reviewState: ClaimReviewState; source: string },
  afterReviewState: ClaimReviewState
): LogClaimActionInput {
  return {
    bookId     : input.bookId,
    claimKind  : toPrismaClaimKind(input.claimKind),
    claimId    : input.claimId,
    actorUserId: input.actorUserId,
    action     : input.action,
    beforeState: { reviewState: beforeState.reviewState, source: beforeState.source },
    afterState : { reviewState: afterReviewState },
    note       : input.note ?? null
  };
}

function buildPersonaAuditPayload(input: {
  bookId     : string;
  personaId  : string;
  actorUserId: string;
  action     : ReviewAction;
  beforeState: Record<string, unknown> | null;
  afterState : Record<string, unknown> | null;
  note?      : string | null;
  claims     : readonly AcceptedIdentityClaim[];
}) {
  return {
    bookId         : input.bookId,
    personaId      : input.personaId,
    actorUserId    : input.actorUserId,
    action         : input.action,
    beforeState    : input.beforeState,
    afterState     : input.afterState,
    note           : input.note ?? null,
    evidenceSpanIds: collectEvidenceSpanIdsFromIdentityClaims(input.claims)
  };
}

function resolveDependencies(
  input: ReviewMutationDependencies
): RequiredReviewMutationDependencies {
  const prismaClient = input.prismaClient ?? (prisma as unknown as ReviewMutationPrismaClient);
  const claimRepository = input.claimRepository ?? createClaimRepository(prismaClient as never);
  const defaultAuditService = createReviewAuditService(prismaClient as never);
  const logClaimAction: ReviewAuditService["logClaimAction"] = async (auditInput) => {
    if (input.auditService?.logClaimAction) {
      return input.auditService.logClaimAction(auditInput);
    }

    return defaultAuditService.logClaimAction(auditInput);
  };
  const logPersonaAction: ReviewAuditService["logPersonaAction"] = async (auditInput) => {
    if (input.auditService?.logPersonaAction) {
      return input.auditService.logPersonaAction(auditInput);
    }

    return defaultAuditService.logPersonaAction(auditInput);
  };

  return {
    prismaClient,
    claimRepository,
    projectionBuilder:
      input.projectionBuilder
      ?? createProjectionBuilder({ repository: createProjectionRepository(prismaClient as never) }),
    auditService: {
      logClaimAction,
      logPersonaAction
    },
    manualOverrideService: input.manualOverrideService ?? createManualOverrideService(claimRepository),
    now                  : input.now ?? (() => new Date())
  };
}

/**
 * Claim action 的最小 mutation 服务：
 * 只处理 ACCEPT / REJECT / DEFER，统一执行状态机校验、审计写入和 Stage D scoped rebuild。
 */
export function createReviewMutationService(input: ReviewMutationDependencies = {}) {
  const dependencies = resolveDependencies(input);

  async function applyClaimAction(inputData: ApplyClaimActionInput): Promise<void> {
    const actorUserId = normalizeActorUserId(inputData.actorUserId);

    await dependencies.claimRepository.transaction(async (claimRepository) => {
      const summary = await claimRepository.findReviewableClaimSummary(
        inputData.claimKind,
        inputData.claimId
      );

      if (summary === null) {
        throw new Error(`Reviewable claim ${inputData.claimKind}:${inputData.claimId} not found`);
      }

      const projectionContext = await loadClaimProjectionContext(dependencies.prismaClient, {
        bookId   : inputData.bookId,
        claimKind: inputData.claimKind,
        claimId  : inputData.claimId
      });
      if (projectionContext === null) {
        throw new Error(`Reviewable claim ${inputData.claimKind}:${inputData.claimId} not found`);
      }

      const targetReviewState = resolveTargetReviewState(inputData.action);
      assertReviewStateTransition(summary.reviewState, targetReviewState);

      await claimRepository.updateReviewableClaimReviewState({
        family          : inputData.claimKind,
        claimId         : inputData.claimId,
        reviewState     : targetReviewState,
        reviewedByUserId: actorUserId,
        reviewedAt      : dependencies.now(),
        reviewNote      : inputData.note ?? null
      });

      await dependencies.auditService.logClaimAction(buildAuditPayload(
        { ...inputData, actorUserId },
        summary,
        targetReviewState
      ));

      const scopes = await resolveProjectionScopesForClaimAction(dependencies.prismaClient, {
        bookId   : inputData.bookId,
        claimKind: inputData.claimKind,
        claimId  : inputData.claimId
      });

      await rebuildProjectionScopes(dependencies.projectionBuilder, scopes);
    });
  }

  async function createManualClaim<TFamily extends ManualOverrideFamily>(
    inputData: CreateManualClaimInput<TFamily>
  ) {
    const actorUserId = normalizeActorUserId(inputData.actorUserId);

    const validated = validateAcceptedManualDraft({
      claimKind         : inputData.claimKind,
      actorUserId,
      note              : inputData.note,
      draft             : inputData.draft,
      supersedesClaimId : null,
      derivedFromClaimId: null
    });
    const reviewedAt = dependencies.now();

    const created = await dependencies.claimRepository.createReviewableClaim(inputData.claimKind, {
      ...toClaimCreateData(validated),
      reviewedAt
    });

    await dependencies.auditService.logClaimAction({
      bookId         : validated.bookId,
      claimKind      : toPrismaClaimKind(inputData.claimKind),
      claimId        : created.id,
      actorUserId,
      action         : "CREATE_MANUAL_CLAIM",
      beforeState    : null,
      afterState     : { reviewState: "ACCEPTED", source: "MANUAL" },
      note           : inputData.note ?? null,
      evidenceSpanIds: validated.evidenceSpanIds
    });

    const scopes = await resolveProjectionScopesForClaimPayload(dependencies.prismaClient, {
      bookId   : validated.bookId,
      claimKind: inputData.claimKind,
      draft    : toClaimCreateData(validated)
    });
    await rebuildProjectionScopes(dependencies.projectionBuilder, scopes);

    return created;
  }

  async function createManualOverrideMutation<TFamily extends ManualOverrideFamily>(
    inputData: EditClaimInput<TFamily>,
    action: "EDIT" | "RELINK_EVIDENCE"
  ) {
    const actorUserId = normalizeActorUserId(inputData.actorUserId);

    const validated = validateAcceptedManualDraft({
      claimKind         : inputData.claimKind,
      actorUserId,
      note              : inputData.note,
      draft             : inputData.draft,
      supersedesClaimId : inputData.claimId,
      derivedFromClaimId: inputData.claimId
    });
    assertDraftBookId(inputData.bookId, validated.bookId);

    const result = await dependencies.manualOverrideService.createManualOverride({
      family         : inputData.claimKind,
      originalClaimId: inputData.claimId,
      actorUserId,
      reviewNote     : inputData.note ?? null,
      draft          : inputData.draft
    });

    await dependencies.auditService.logClaimAction({
      bookId     : inputData.bookId,
      claimKind  : toPrismaClaimKind(inputData.claimKind),
      claimId    : inputData.claimId,
      actorUserId,
      action,
      beforeState: { claimId: inputData.claimId },
      afterState : {
        manualClaimId: result.manualClaimId,
        reviewState  : "ACCEPTED",
        source       : "MANUAL"
      },
      note           : inputData.note ?? null,
      evidenceSpanIds: validated.evidenceSpanIds
    });

    const scopes = [
      ...(await resolveProjectionScopesForClaimAction(dependencies.prismaClient, {
        bookId   : inputData.bookId,
        claimKind: inputData.claimKind,
        claimId  : inputData.claimId
      })),
      ...(await resolveProjectionScopesForClaimPayload(dependencies.prismaClient, {
        bookId   : validated.bookId,
        claimKind: inputData.claimKind,
        draft    : toClaimCreateData(validated)
      }))
    ];
    await rebuildProjectionScopes(dependencies.projectionBuilder, scopes);

    return result;
  }

  async function editClaim<TFamily extends ManualOverrideFamily>(inputData: EditClaimInput<TFamily>) {
    return createManualOverrideMutation(inputData, "EDIT");
  }

  async function relinkEvidence<TFamily extends ManualOverrideFamily>(
    inputData: RelinkEvidenceInput<TFamily>
  ) {
    switch (inputData.claimKind) {
      case "ALIAS": {
        const draft = await loadEditableAliasClaimOrThrow(dependencies.prismaClient, inputData);
        return createManualOverrideMutation({
          bookId     : inputData.bookId,
          claimKind  : "ALIAS",
          claimId    : inputData.claimId,
          actorUserId: inputData.actorUserId,
          note       : inputData.note ?? null,
          draft      : {
            ...draft,
            evidenceSpanIds: inputData.evidenceSpanIds
          }
        }, "RELINK_EVIDENCE");
      }

      case "EVENT": {
        const draft = await loadEditableEventClaimOrThrow(dependencies.prismaClient, inputData);
        return createManualOverrideMutation({
          bookId     : inputData.bookId,
          claimKind  : "EVENT",
          claimId    : inputData.claimId,
          actorUserId: inputData.actorUserId,
          note       : inputData.note ?? null,
          draft      : {
            ...draft,
            evidenceSpanIds: inputData.evidenceSpanIds
          }
        }, "RELINK_EVIDENCE");
      }

      case "RELATION": {
        const draft = await loadEditableRelationClaimOrThrow(dependencies.prismaClient, inputData);
        return createManualOverrideMutation({
          bookId     : inputData.bookId,
          claimKind  : "RELATION",
          claimId    : inputData.claimId,
          actorUserId: inputData.actorUserId,
          note       : inputData.note ?? null,
          draft      : {
            ...draft,
            evidenceSpanIds: inputData.evidenceSpanIds
          }
        }, "RELINK_EVIDENCE");
      }

      case "TIME": {
        const draft = await loadEditableTimeClaimOrThrow(dependencies.prismaClient, inputData);
        return createManualOverrideMutation({
          bookId     : inputData.bookId,
          claimKind  : "TIME",
          claimId    : inputData.claimId,
          actorUserId: inputData.actorUserId,
          note       : inputData.note ?? null,
          draft      : {
            ...draft,
            evidenceSpanIds: inputData.evidenceSpanIds
          }
        }, "RELINK_EVIDENCE");
      }

      case "IDENTITY_RESOLUTION": {
        const draft = await loadEditableIdentityClaimOrThrow(dependencies.prismaClient, inputData);
        return createManualOverrideMutation({
          bookId     : inputData.bookId,
          claimKind  : "IDENTITY_RESOLUTION",
          claimId    : inputData.claimId,
          actorUserId: inputData.actorUserId,
          note       : inputData.note ?? null,
          draft      : {
            ...draft,
            evidenceSpanIds: inputData.evidenceSpanIds
          }
        }, "RELINK_EVIDENCE");
      }
    }
  }

  async function mergePersona(inputData: MergePersonaInput): Promise<void> {
    const actorUserId = normalizeActorUserId(inputData.actorUserId);
    const identityClaims = await loadAcceptedIdentityClaimsForCandidates(dependencies.prismaClient, {
      bookId             : inputData.bookId,
      sourcePersonaId    : inputData.sourcePersonaId,
      personaCandidateIds: inputData.personaCandidateIds
    });

    for (const claim of identityClaims) {
      await dependencies.manualOverrideService.createManualOverride({
        family         : "IDENTITY_RESOLUTION",
        originalClaimId: claim.id,
        actorUserId,
        reviewNote     : inputData.note ?? null,
        draft          : {
          bookId            : claim.bookId,
          chapterId         : claim.chapterId,
          confidence        : 1,
          mentionId         : claim.mentionId,
          personaCandidateId: claim.personaCandidateId,
          resolvedPersonaId : inputData.targetPersonaId,
          resolutionKind    : IdentityResolutionKind.MERGE_INTO,
          rationale         : inputData.note ?? null,
          evidenceSpanIds   : claim.evidenceSpanIds,
          runId             : claim.runId
        }
      });
    }

    await dependencies.auditService.logPersonaAction(buildPersonaAuditPayload({
      bookId     : inputData.bookId,
      personaId  : inputData.targetPersonaId,
      actorUserId,
      action     : "MERGE_PERSONA",
      beforeState: {
        sourcePersonaId    : inputData.sourcePersonaId,
        personaCandidateIds: toUniqueSortedIds(inputData.personaCandidateIds)
      },
      afterState: { targetPersonaId: inputData.targetPersonaId },
      note      : inputData.note ?? null,
      claims    : identityClaims
    }));

    await rebuildProjectionScopes(dependencies.projectionBuilder, [
      {
        kind     : "PERSONA",
        bookId   : inputData.bookId,
        personaId: inputData.sourcePersonaId
      },
      {
        kind     : "PERSONA",
        bookId   : inputData.bookId,
        personaId: inputData.targetPersonaId
      }
    ]);
  }

  async function splitPersona(inputData: SplitPersonaInput): Promise<SplitPersonaResult> {
    const actorUserId = normalizeActorUserId(inputData.actorUserId);
    const createdPersonaIds: string[] = [];
    const allTouchedClaims: AcceptedIdentityClaim[] = [];
    const projectionScopes: ProjectionRebuildScope[] = [];

    for (const target of inputData.splitTargets) {
      if (target.targetPersonaId === undefined && target.targetPersonaName === undefined) {
        throw new Error("split target requires targetPersonaId or targetPersonaName");
      }

      const targetPersonaId =
        target.targetPersonaId
        ?? (await dependencies.prismaClient.persona.create({
          data: {
            name        : target.targetPersonaName ?? "",
            recordSource: "MANUAL",
            confidence  : 1,
            status      : "CONFIRMED"
          }
        })).id;

      if (target.targetPersonaId === undefined) {
        createdPersonaIds.push(targetPersonaId);
      }

      const identityClaims = await loadAcceptedIdentityClaimsForCandidates(dependencies.prismaClient, {
        bookId             : inputData.bookId,
        sourcePersonaId    : inputData.sourcePersonaId,
        personaCandidateIds: target.personaCandidateIds
      });
      allTouchedClaims.push(...identityClaims);

      for (const claim of identityClaims) {
        await dependencies.manualOverrideService.createManualOverride({
          family         : "IDENTITY_RESOLUTION",
          originalClaimId: claim.id,
          actorUserId,
          reviewNote     : inputData.note ?? null,
          draft          : {
            bookId            : claim.bookId,
            chapterId         : claim.chapterId,
            confidence        : 1,
            mentionId         : claim.mentionId,
            personaCandidateId: claim.personaCandidateId,
            resolvedPersonaId : targetPersonaId,
            resolutionKind    : IdentityResolutionKind.SPLIT_FROM,
            rationale         : inputData.note ?? null,
            evidenceSpanIds   : claim.evidenceSpanIds,
            runId             : claim.runId
          }
        });
      }

      projectionScopes.push({
        kind     : "PERSONA",
        bookId   : inputData.bookId,
        personaId: targetPersonaId
      });
    }

    projectionScopes.push({
      kind     : "PERSONA",
      bookId   : inputData.bookId,
      personaId: inputData.sourcePersonaId
    });

    await rebuildProjectionScopes(dependencies.projectionBuilder, projectionScopes);

    await dependencies.auditService.logPersonaAction(buildPersonaAuditPayload({
      bookId     : inputData.bookId,
      personaId  : inputData.sourcePersonaId,
      actorUserId,
      action     : "SPLIT_PERSONA",
      beforeState: { sourcePersonaId: inputData.sourcePersonaId },
      afterState : {
        splitTargets: inputData.splitTargets.map((target) => ({
          ...(target.targetPersonaId ? { targetPersonaId: target.targetPersonaId } : {}),
          ...(target.targetPersonaName ? { targetPersonaName: target.targetPersonaName } : {}),
          personaCandidateIds: toUniqueSortedIds(target.personaCandidateIds)
        })),
        createdPersonaIds: toUniqueSortedIds(createdPersonaIds)
      },
      note  : inputData.note ?? null,
      claims: allTouchedClaims
    }));

    return { createdPersonaIds: toUniqueSortedIds(createdPersonaIds) };
  }

  return {
    dependencies,
    applyClaimAction,
    createManualClaim,
    editClaim,
    relinkEvidence,
    mergePersona,
    splitPersona
  };
}
