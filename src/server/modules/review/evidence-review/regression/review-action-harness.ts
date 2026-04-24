import { prisma } from "@/server/db/prisma";
import type {
  ManualOverrideFamily,
  ReviewableClaimFamily
} from "@/server/modules/analysis/claims/claim-schemas";
import { createProjectionBuilder, createProjectionRepository } from "@/server/modules/review/evidence-review/projections";
import {
  PROJECTION_FAMILY_VALUES,
  type ProjectionBuildResult,
  type ProjectionFamily,
  type ProjectionRebuildScope
} from "@/server/modules/review/evidence-review/projections/types";
import { createReviewAuditService } from "@/server/modules/review/evidence-review/review-audit-service";
import { createReviewMutationService } from "@/server/modules/review/evidence-review/review-mutation-service";

import {
  normalizeReviewRegressionSnippet,
  type ReviewRegressionActionScenario
} from "./contracts";
import type { ReviewRegressionSnapshotFixtureContext } from "./snapshot-repository";

type ReviewRegressionApplyAction = "ACCEPT" | "REJECT" | "DEFER";
type ReviewRegressionReviewAction = ReviewRegressionApplyAction
  | "CREATE_MANUAL_CLAIM"
  | "EDIT"
  | "RELINK_EVIDENCE"
  | "MERGE_PERSONA"
  | "SPLIT_PERSONA";

export interface ReviewRegressionActionResult {
  scenarioKey: string;
  passed     : boolean;
  message    : string;
  auditAction: string | null;
}

export interface ReviewRegressionActionHarnessResult {
  passed         : number;
  failed         : number;
  scenarioResults: ReviewRegressionActionResult[];
}

export type ReviewRegressionActionHarnessDelegate<TRow> = {
  findMany(args?: unknown): Promise<TRow[]>;
  findUnique?(args: unknown): Promise<TRow | null>;
  findFirst?(args: unknown): Promise<TRow | null>;
  create?(args: unknown): Promise<TRow>;
  update?(args: unknown): Promise<TRow>;
};

export type ReviewRegressionActionHarnessTransactionClient = {
  persona                : ReviewRegressionActionHarnessDelegate<PersonaRow>;
  personaAlias           : ReviewRegressionActionHarnessDelegate<PersonaAliasRow>;
  evidenceSpan           : ReviewRegressionActionHarnessDelegate<EvidenceSpanRow>;
  eventClaim             : ReviewRegressionActionHarnessDelegate<EventClaimRow>;
  relationClaim          : ReviewRegressionActionHarnessDelegate<RelationClaimRow>;
  timeClaim              : ReviewRegressionActionHarnessDelegate<TimeClaimRow>;
  identityResolutionClaim: ReviewRegressionActionHarnessDelegate<IdentityResolutionClaimRow>;
  aliasClaim?            : ReviewRegressionActionHarnessDelegate<Record<string, unknown>>;
  conflictFlag?          : ReviewRegressionActionHarnessDelegate<Record<string, unknown>>;
  $transaction?<T>(callback: (tx: ReviewRegressionActionHarnessTransactionClient) => Promise<T>): Promise<T>;
};

export type ReviewRegressionActionHarnessPrismaClient = ReviewRegressionActionHarnessTransactionClient & {
  $transaction<T>(callback: (tx: ReviewRegressionActionHarnessTransactionClient) => Promise<T>): Promise<T>;
};

export interface ReviewRegressionObservedAuditService {
  logClaimAction(input: { action: string; [key: string]: unknown }): Promise<unknown>;
  logPersonaAction(input: { action: string; [key: string]: unknown }): Promise<unknown>;
}

export interface ReviewRegressionObservedProjectionBuilder {
  rebuildProjection(scope: ProjectionRebuildScope): Promise<ProjectionBuildResult>;
}

export interface ReviewRegressionActionHarnessMutationService {
  applyClaimAction(input: {
    bookId     : string;
    claimKind  : ReviewableClaimFamily;
    claimId    : string;
    action     : ReviewRegressionApplyAction;
    actorUserId: string;
    note?      : string | null;
  }): Promise<unknown>;
  createManualClaim(input: {
    claimKind  : ManualOverrideFamily;
    actorUserId: string;
    note?      : string | null;
    draft      : Record<string, unknown>;
  }): Promise<unknown>;
  editClaim(input: {
    bookId     : string;
    claimKind  : ManualOverrideFamily;
    claimId    : string;
    actorUserId: string;
    note?      : string | null;
    draft      : Record<string, unknown>;
  }): Promise<unknown>;
  relinkEvidence(input: {
    bookId         : string;
    claimKind      : ManualOverrideFamily;
    claimId        : string;
    actorUserId    : string;
    note?          : string | null;
    evidenceSpanIds: string[];
  }): Promise<unknown>;
  mergePersona(input: {
    bookId             : string;
    sourcePersonaId    : string;
    targetPersonaId    : string;
    personaCandidateIds: string[];
    actorUserId        : string;
    note?              : string | null;
  }): Promise<unknown>;
  splitPersona(input: {
    bookId         : string;
    sourcePersonaId: string;
    splitTargets   : Array<{
      targetPersonaId?   : string;
      targetPersonaName? : string;
      personaCandidateIds: string[];
    }>;
    actorUserId: string;
    note?      : string | null;
  }): Promise<unknown>;
}

export interface ReviewRegressionActionHarnessMutationServiceFactoryInput {
  prismaClient     : ReviewRegressionActionHarnessTransactionClient;
  auditService     : ReviewRegressionObservedAuditService;
  projectionBuilder: ReviewRegressionObservedProjectionBuilder;
  now              : () => Date;
}

export interface RunReviewRegressionActionScenariosInput {
  context                : ReviewRegressionSnapshotFixtureContext;
  prismaClient?          : ReviewRegressionActionHarnessPrismaClient;
  actorUserId            : string;
  now?                   : () => Date;
  mutationServiceFactory?: (
    input: ReviewRegressionActionHarnessMutationServiceFactoryInput
  ) => ReviewRegressionActionHarnessMutationService;
}

type RunScenarioWithForcedRollbackInput = Omit<RunReviewRegressionActionScenariosInput, "prismaClient"> & {
  prismaClient: ReviewRegressionActionHarnessPrismaClient;
  scenario    : ReviewRegressionActionScenario;
};

type RunScenarioInsideTransactionInput = Omit<RunReviewRegressionActionScenariosInput, "prismaClient"> & {
  prismaClient: ReviewRegressionActionHarnessTransactionClient;
  scenario    : ReviewRegressionActionScenario;
  signals     : ObservedScenarioSignals;
};

type BaseClaimRow = {
  id             : string;
  bookId         : string;
  chapterId      : string | null;
  evidenceSpanIds: readonly string[];
  confidence     : number;
  runId          : string;
};

type PersonaRow = {
  id        : string;
  name      : string;
  aliases?  : readonly string[];
  deletedAt?: Date | null;
};

type PersonaAliasRow = {
  personaId: string;
  aliasText: string;
};

type EvidenceSpanRow = {
  id            : string;
  bookId        : string;
  chapterId     : string;
  quotedText    : string;
  normalizedText: string;
};

type EventClaimRow = BaseClaimRow & {
  chapterId                : string;
  subjectMentionId         : string | null;
  subjectPersonaCandidateId: string | null;
  predicate                : string;
  objectText               : string | null;
  objectPersonaCandidateId : string | null;
  locationText             : string | null;
  timeHintId               : string | null;
  eventCategory            : string;
  narrativeLens            : string;
};

type RelationClaimRow = BaseClaimRow & {
  chapterId               : string;
  sourceMentionId         : string | null;
  targetMentionId         : string | null;
  sourcePersonaCandidateId: string | null;
  targetPersonaCandidateId: string | null;
  relationTypeKey         : string;
  relationLabel           : string;
  relationTypeSource      : string;
  direction               : string;
  effectiveChapterStart   : number | null;
  effectiveChapterEnd     : number | null;
  timeHintId              : string | null;
};

type TimeClaimRow = BaseClaimRow & {
  chapterId          : string;
  rawTimeText        : string;
  timeType           : string;
  normalizedLabel    : string;
  relativeOrderWeight: number | null;
  chapterRangeStart  : number | null;
  chapterRangeEnd    : number | null;
};

type IdentityResolutionClaimRow = BaseClaimRow & {
  chapterId         : string | null;
  mentionId         : string;
  personaCandidateId: string | null;
  resolvedPersonaId : string | null;
  resolutionKind    : string;
  rationale         : string | null;
};

type ActionLookup = {
  personas                : PersonaRow[];
  personaAliases          : PersonaAliasRow[];
  evidenceSpans           : EvidenceSpanRow[];
  identityResolutionClaims: IdentityResolutionClaimRow[];
  eventClaims             : EventClaimRow[];
  relationClaims          : RelationClaimRow[];
  timeClaims              : TimeClaimRow[];
};

type ResolvedScenarioTarget = {
  claimKind?          : ReviewableClaimFamily;
  manualClaimKind?    : ManualOverrideFamily;
  claim?              : EventClaimRow | RelationClaimRow | TimeClaimRow | IdentityResolutionClaimRow;
  sourcePersona?      : PersonaRow;
  targetPersona?      : PersonaRow;
  targetPersonaName?  : string;
  personaCandidateIds?: string[];
  evidenceSpanIds     : string[];
};

type ObservedScenarioSignals = {
  auditActions      : ReviewRegressionReviewAction[];
  projectionFamilies: Set<ProjectionFamily>;
};

const ACTION_TO_MUTATION_ACTION = Object.freeze({
  ACCEPT_CLAIM: "ACCEPT",
  REJECT_CLAIM: "REJECT",
  DEFER_CLAIM : "DEFER"
} as const);

const CLAIM_KIND_TO_REVIEWABLE_FAMILY = Object.freeze({
  EVENT   : "EVENT",
  RELATION: "RELATION",
  TIME    : "TIME",
  IDENTITY: "IDENTITY_RESOLUTION"
} as const);

const EMPTY_PROJECTION_BUILD_RESULT: ProjectionBuildResult = Object.freeze({
  counts         : { deleted: 0, created: 0 },
  rebuiltFamilies: [],
  skipped        : {
    unmappedPersonaCandidateIds : [],
    ambiguousPersonaCandidateIds: []
  }
});

export class ReviewRegressionRollbackError extends Error {
  readonly scenarioResult: ReviewRegressionActionResult;

  constructor(scenarioResult: ReviewRegressionActionResult) {
    super("review regression scenario forced rollback");
    this.name = "ReviewRegressionRollbackError";
    this.scenarioResult = scenarioResult;
  }
}

export async function runReviewRegressionActionScenarios(
  input: RunReviewRegressionActionScenariosInput
): Promise<ReviewRegressionActionHarnessResult> {
  const scenarioResults: ReviewRegressionActionResult[] = [];
  const prismaClient = input.prismaClient ?? (prisma as unknown as ReviewRegressionActionHarnessPrismaClient);

  for (const scenario of input.context.fixture.reviewActions) {
    scenarioResults.push(await runScenarioWithForcedRollback({
      ...input,
      prismaClient,
      scenario
    }));
  }

  return {
    passed: scenarioResults.filter((result) => result.passed).length,
    failed: scenarioResults.filter((result) => !result.passed).length,
    scenarioResults
  };
}

async function runScenarioWithForcedRollback(
  input: RunScenarioWithForcedRollbackInput
): Promise<ReviewRegressionActionResult> {
  try {
    await input.prismaClient.$transaction(async (tx) => {
      const txClient = wrapTransactionClient(tx);
      const signals: ObservedScenarioSignals = {
        auditActions      : [],
        projectionFamilies: new Set()
      };
      const scenarioResult = await runScenarioInsideTransaction({
        ...input,
        prismaClient: txClient,
        signals
      });

      throw new ReviewRegressionRollbackError(scenarioResult);
    });
  } catch (error) {
    if (error instanceof ReviewRegressionRollbackError) {
      return error.scenarioResult;
    }

    return {
      scenarioKey: input.scenario.scenarioKey,
      passed     : false,
      message    : `Transaction failed for scenario ${input.scenario.scenarioKey}: ${toErrorMessage(error)}`,
      auditAction: null
    };
  }

  return {
    scenarioKey: input.scenario.scenarioKey,
    passed     : false,
    message    : `Scenario ${input.scenario.scenarioKey} completed without forced rollback`,
    auditAction: null
  };
}

async function runScenarioInsideTransaction(
  input: RunScenarioInsideTransactionInput
): Promise<ReviewRegressionActionResult> {
  const auditService = createObservedAuditService(
    input.prismaClient,
    input.signals,
    input.mutationServiceFactory === undefined
  );
  const projectionBuilder = createObservedProjectionBuilder(
    input.prismaClient,
    input.signals,
    input.mutationServiceFactory === undefined
  );
  const mutationService = (
    input.mutationServiceFactory ?? defaultMutationServiceFactory
  )({
    prismaClient: input.prismaClient,
    auditService,
    projectionBuilder,
    now         : input.now ?? (() => new Date())
  });

  try {
    const lookup = await loadActionLookup(input.prismaClient, input.context);
    const target = resolveScenarioTarget(input.context, lookup, input.scenario);
    await dispatchScenarioMutation({
      scenario   : input.scenario,
      target,
      actorUserId: input.actorUserId,
      mutationService
    });
  } catch (error) {
    return {
      scenarioKey: input.scenario.scenarioKey,
      passed     : false,
      message    : toErrorMessage(error),
      auditAction: getObservedAuditAction(input.signals)
    };
  }

  return evaluateScenarioSignals(input.scenario, input.signals);
}

function defaultMutationServiceFactory(
  input: ReviewRegressionActionHarnessMutationServiceFactoryInput
): ReviewRegressionActionHarnessMutationService {
  return createReviewMutationService({
    prismaClient     : input.prismaClient as never,
    auditService     : input.auditService as never,
    projectionBuilder: input.projectionBuilder,
    now              : input.now
  }) as unknown as ReviewRegressionActionHarnessMutationService;
}

function wrapTransactionClient(
  tx: ReviewRegressionActionHarnessTransactionClient
): ReviewRegressionActionHarnessPrismaClient {
  const proxy = new Proxy(tx as object, {
    get(target, property, receiver): unknown {
      if (property === "$transaction") {
        return async <T>(callback: (nestedTx: ReviewRegressionActionHarnessTransactionClient) => Promise<T>) =>
          callback(proxy);
      }

      return Reflect.get(target, property, receiver) as unknown;
    }
  }) as ReviewRegressionActionHarnessPrismaClient;

  return proxy;
}

function createObservedAuditService(
  prismaClient: ReviewRegressionActionHarnessTransactionClient,
  signals: ObservedScenarioSignals,
  forwardToDb: boolean
): ReviewRegressionObservedAuditService {
  const realAuditService = forwardToDb
    ? createReviewAuditService(prismaClient as never)
    : null;

  return {
    async logClaimAction(auditInput) {
      signals.auditActions.push(toReviewAction(auditInput.action));
      if (realAuditService === null) return undefined;

      return realAuditService.logClaimAction(auditInput as never);
    },
    async logPersonaAction(auditInput) {
      signals.auditActions.push(toReviewAction(auditInput.action));
      if (realAuditService === null) return undefined;

      return realAuditService.logPersonaAction(auditInput as never);
    }
  };
}

function createObservedProjectionBuilder(
  prismaClient: ReviewRegressionActionHarnessTransactionClient,
  signals: ObservedScenarioSignals,
  forwardToDb: boolean
): ReviewRegressionObservedProjectionBuilder {
  const realProjectionBuilder = forwardToDb
    ? createProjectionBuilder({ repository: createProjectionRepository(prismaClient as never) })
    : null;

  return {
    async rebuildProjection(scope) {
      recordProjectionFamilies(signals, scope);
      if (realProjectionBuilder === null) return buildSkippedProjectionResult(scope);

      return realProjectionBuilder.rebuildProjection(scope);
    }
  };
}

/**
 * 回归 harness 在事务内强制回滚时，不需要真的写 projection 表。
 * 这里仍返回与真实 builder 一致的结构，避免 mutation service 因类型或调用约定分叉。
 */
function buildSkippedProjectionResult(scope: ProjectionRebuildScope): ProjectionBuildResult {
  return {
    ...EMPTY_PROJECTION_BUILD_RESULT,
    rebuiltFamilies: scope.projectionFamilies ?? PROJECTION_FAMILY_VALUES
  };
}

async function loadActionLookup(
  prismaClient: ReviewRegressionActionHarnessTransactionClient,
  context: ReviewRegressionSnapshotFixtureContext
): Promise<ActionLookup> {
  const chapterIds = context.chapters.map((chapter) => chapter.id);

  const [
    personas,
    personaAliases,
    evidenceSpans,
    identityResolutionClaims,
    eventClaims,
    relationClaims,
    timeClaims
  ] = await Promise.all([
    prismaClient.persona.findMany({
      where : { deletedAt: null },
      select: { id: true, name: true, aliases: true, deletedAt: true }
    }),
    prismaClient.personaAlias.findMany({
      where : { bookId: context.book.id },
      select: { personaId: true, aliasText: true }
    }),
    prismaClient.evidenceSpan.findMany({
      where : { bookId: context.book.id, chapterId: { in: chapterIds } },
      select: { id: true, bookId: true, chapterId: true, quotedText: true, normalizedText: true }
    }),
    prismaClient.identityResolutionClaim.findMany({
      where : { bookId: context.book.id, chapterId: { in: chapterIds } },
      select: {
        id                : true,
        bookId            : true,
        chapterId         : true,
        mentionId         : true,
        personaCandidateId: true,
        resolvedPersonaId : true,
        resolutionKind    : true,
        rationale         : true,
        evidenceSpanIds   : true,
        confidence        : true,
        reviewState       : true,
        source            : true,
        runId             : true
      }
    }),
    prismaClient.eventClaim.findMany({
      where : { bookId: context.book.id, chapterId: { in: chapterIds } },
      select: {
        id                       : true,
        bookId                   : true,
        chapterId                : true,
        subjectMentionId         : true,
        subjectPersonaCandidateId: true,
        predicate                : true,
        objectText               : true,
        objectPersonaCandidateId : true,
        locationText             : true,
        timeHintId               : true,
        eventCategory            : true,
        narrativeLens            : true,
        evidenceSpanIds          : true,
        confidence               : true,
        reviewState              : true,
        source                   : true,
        runId                    : true
      }
    }),
    prismaClient.relationClaim.findMany({
      where : { bookId: context.book.id, chapterId: { in: chapterIds } },
      select: {
        id                      : true,
        bookId                  : true,
        chapterId               : true,
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
        timeHintId              : true,
        evidenceSpanIds         : true,
        confidence              : true,
        reviewState             : true,
        source                  : true,
        runId                   : true
      }
    }),
    prismaClient.timeClaim.findMany({
      where : { bookId: context.book.id, chapterId: { in: chapterIds } },
      select: {
        id                 : true,
        bookId             : true,
        chapterId          : true,
        rawTimeText        : true,
        timeType           : true,
        normalizedLabel    : true,
        relativeOrderWeight: true,
        chapterRangeStart  : true,
        chapterRangeEnd    : true,
        evidenceSpanIds    : true,
        confidence         : true,
        reviewState        : true,
        source             : true,
        runId              : true
      }
    })
  ]);

  return {
    personas,
    personaAliases,
    evidenceSpans,
    identityResolutionClaims,
    eventClaims,
    relationClaims,
    timeClaims
  };
}

function resolveScenarioTarget(
  context: ReviewRegressionSnapshotFixtureContext,
  lookup: ActionLookup,
  scenario: ReviewRegressionActionScenario
): ResolvedScenarioTarget {
  if (scenario.action === "MERGE_PERSONA" || scenario.action === "SPLIT_PERSONA") {
    return resolvePersonaActionTarget(context, lookup, scenario);
  }

  const claimKind = resolveClaimFamily(scenario);
  const claim = resolveTargetClaim(context, lookup, scenario, claimKind);
  if (claim === null) {
    throw new Error(`Target claim not found for scenario ${scenario.scenarioKey}`);
  }

  return {
    claimKind,
    manualClaimKind: toManualClaimKind(claimKind),
    claim,
    evidenceSpanIds: [...claim.evidenceSpanIds]
  };
}

function resolvePersonaActionTarget(
  context: ReviewRegressionSnapshotFixtureContext,
  lookup: ActionLookup,
  scenario: ReviewRegressionActionScenario
): ResolvedScenarioTarget {
  const pair = scenario.target.pair;
  if (pair === undefined) {
    throw new Error(`Persona action scenario ${scenario.scenarioKey} requires source and target personas`);
  }

  const sourcePersonas = findPersonasByName(lookup, pair.sourcePersonaName);
  if (sourcePersonas.length === 0) {
    throw new Error(`Target claim not found for scenario ${scenario.scenarioKey}`);
  }

  const identityClaim = resolveIdentityTargetClaim(context, lookup, scenario, sourcePersonas);
  if (identityClaim === null) {
    throw new Error(`Target claim not found for scenario ${scenario.scenarioKey}`);
  }

  const candidateId = identityClaim.personaCandidateId;
  const personaCandidateIds = candidateId === null ? [] : [candidateId];
  const sourcePersona = identityClaim.resolvedPersonaId === null
    ? sourcePersonas[0] ?? null
    : findPersonaById(lookup, identityClaim.resolvedPersonaId);
  const targetPersona = findPersonasByName(lookup, pair.targetPersonaName)[0] ?? null;

  if (scenario.action === "MERGE_PERSONA" && targetPersona === null) {
    throw new Error(`Target claim not found for scenario ${scenario.scenarioKey}`);
  }

  return {
    claimKind        : "IDENTITY_RESOLUTION",
    manualClaimKind  : "IDENTITY_RESOLUTION",
    claim            : identityClaim,
    sourcePersona    : sourcePersona ?? undefined,
    targetPersona    : targetPersona ?? undefined,
    targetPersonaName: pair.targetPersonaName,
    personaCandidateIds,
    evidenceSpanIds  : [...identityClaim.evidenceSpanIds]
  };
}

function resolveTargetClaim(
  context: ReviewRegressionSnapshotFixtureContext,
  lookup: ActionLookup,
  scenario: ReviewRegressionActionScenario,
  claimKind: ReviewableClaimFamily
): EventClaimRow | RelationClaimRow | TimeClaimRow | IdentityResolutionClaimRow | null {
  switch (claimKind) {
    case "EVENT":
      return findBestClaim(lookup.eventClaims, context, lookup, scenario, (claim) =>
        eventClaimMatchesTarget(claim, lookup, scenario));
    case "RELATION":
      return findBestClaim(lookup.relationClaims, context, lookup, scenario, (claim) =>
        relationClaimMatchesTarget(claim, lookup, scenario));
    case "TIME":
      return findBestClaim(lookup.timeClaims, context, lookup, scenario, () => true);
    case "IDENTITY_RESOLUTION": {
      const sourcePersonas = scenario.target.personaName === undefined
        ? null
        : findPersonasByName(lookup, scenario.target.personaName);
      return resolveIdentityTargetClaim(context, lookup, scenario, sourcePersonas);
    }
    case "ALIAS":
    case "CONFLICT_FLAG":
      return null;
  }
}

function resolveIdentityTargetClaim(
  context: ReviewRegressionSnapshotFixtureContext,
  lookup: ActionLookup,
  scenario: ReviewRegressionActionScenario,
  sourcePersonas: readonly PersonaRow[] | null
): IdentityResolutionClaimRow | null {
  if (sourcePersonas !== null && sourcePersonas.length === 0) {
    return null;
  }

  const sourcePersonaIds = new Set((sourcePersonas ?? []).map((persona) => persona.id));

  return findBestClaim(lookup.identityResolutionClaims, context, lookup, scenario, (claim) => {
    if (sourcePersonas === null) return true;

    return claim.resolvedPersonaId !== null && sourcePersonaIds.has(claim.resolvedPersonaId);
  });
}

function findBestClaim<TClaim extends BaseClaimRow>(
  claims: readonly TClaim[],
  context: ReviewRegressionSnapshotFixtureContext,
  lookup: ActionLookup,
  scenario: ReviewRegressionActionScenario,
  predicate: (claim: TClaim) => boolean
): TClaim | null {
  const chapterId = scenario.target.chapterNo === undefined
    ? null
    : context.chapters.find((chapter) => chapter.no === scenario.target.chapterNo)?.id;

  const matches = claims.filter((claim) => {
    if (chapterId !== null && claim.chapterId !== chapterId) return false;
    if (!claimEvidenceMatches(lookup, claim, scenario.target.evidenceSnippet)) return false;

    return predicate(claim);
  });

  return sortClaims(matches)[0] ?? null;
}

function eventClaimMatchesTarget(
  claim: EventClaimRow,
  lookup: ActionLookup,
  scenario: ReviewRegressionActionScenario
): boolean {
  if (scenario.target.personaName === undefined) return true;

  const personas = findPersonasByName(lookup, scenario.target.personaName);
  if (personas.length === 0) return false;

  const candidateIds = getPersonaCandidateIdsForPersonas(lookup, personas);
  return includesString(candidateIds, claim.subjectPersonaCandidateId)
    || includesString(candidateIds, claim.objectPersonaCandidateId);
}

function relationClaimMatchesTarget(
  claim: RelationClaimRow,
  lookup: ActionLookup,
  scenario: ReviewRegressionActionScenario
): boolean {
  const pair = scenario.target.pair;
  if (pair === undefined) return true;
  if (pair.relationTypeKey !== undefined && pair.relationTypeKey !== claim.relationTypeKey) return false;

  const sourcePersonas = findPersonasByName(lookup, pair.sourcePersonaName);
  const targetPersonas = findPersonasByName(lookup, pair.targetPersonaName);
  if (sourcePersonas.length === 0 || targetPersonas.length === 0) return false;

  return includesString(
    getPersonaCandidateIdsForPersonas(lookup, sourcePersonas),
    claim.sourcePersonaCandidateId
  ) && includesString(
    getPersonaCandidateIdsForPersonas(lookup, targetPersonas),
    claim.targetPersonaCandidateId
  );
}

async function dispatchScenarioMutation(input: {
  scenario       : ReviewRegressionActionScenario;
  target         : ResolvedScenarioTarget;
  actorUserId    : string;
  mutationService: ReviewRegressionActionHarnessMutationService;
}): Promise<void> {
  switch (input.scenario.action) {
    case "ACCEPT_CLAIM":
    case "REJECT_CLAIM":
    case "DEFER_CLAIM":
      await input.mutationService.applyClaimAction({
        bookId     : requireClaim(input.target).bookId,
        claimKind  : requireClaimKind(input.target),
        claimId    : requireClaim(input.target).id,
        action     : ACTION_TO_MUTATION_ACTION[input.scenario.action],
        actorUserId: input.actorUserId,
        note       : `review regression: ${input.scenario.scenarioKey}`
      });
      return;

    case "EDIT_CLAIM":
      await input.mutationService.editClaim({
        bookId     : requireClaim(input.target).bookId,
        claimKind  : requireManualClaimKind(input.target),
        claimId    : requireClaim(input.target).id,
        actorUserId: input.actorUserId,
        note       : `review regression: ${input.scenario.scenarioKey}`,
        draft      : buildManualDraft(requireManualClaimKind(input.target), requireClaim(input.target))
      });
      return;

    case "CREATE_MANUAL_CLAIM":
      await input.mutationService.createManualClaim({
        claimKind  : requireManualClaimKind(input.target),
        actorUserId: input.actorUserId,
        note       : `review regression: ${input.scenario.scenarioKey}`,
        draft      : buildManualDraft(requireManualClaimKind(input.target), requireClaim(input.target))
      });
      return;

    case "RELINK_EVIDENCE":
      await input.mutationService.relinkEvidence({
        bookId         : requireClaim(input.target).bookId,
        claimKind      : requireManualClaimKind(input.target),
        claimId        : requireClaim(input.target).id,
        actorUserId    : input.actorUserId,
        note           : `review regression: ${input.scenario.scenarioKey}`,
        evidenceSpanIds: input.target.evidenceSpanIds
      });
      return;

    case "MERGE_PERSONA":
      await input.mutationService.mergePersona({
        bookId: requirePersona(input.target.sourcePersona, "source").id === ""
          ? requireClaim(input.target).bookId
          : requireClaim(input.target).bookId,
        sourcePersonaId    : requirePersona(input.target.sourcePersona, "source").id,
        targetPersonaId    : requirePersona(input.target.targetPersona, "target").id,
        personaCandidateIds: input.target.personaCandidateIds ?? [],
        actorUserId        : input.actorUserId,
        note               : `review regression: ${input.scenario.scenarioKey}`
      });
      return;

    case "SPLIT_PERSONA": {
      const targetPersonaName = input.target.targetPersonaName;
      await input.mutationService.splitPersona({
        bookId         : requireClaim(input.target).bookId,
        sourcePersonaId: requirePersona(input.target.sourcePersona, "source").id,
        splitTargets   : [{
          ...(input.target.targetPersona !== undefined
            ? { targetPersonaId: input.target.targetPersona.id }
            : { targetPersonaName: targetPersonaName ?? `${input.scenario.scenarioKey}-split` }),
          personaCandidateIds: input.target.personaCandidateIds ?? []
        }],
        actorUserId: input.actorUserId,
        note       : `review regression: ${input.scenario.scenarioKey}`
      });
    }
  }
}

function evaluateScenarioSignals(
  scenario: ReviewRegressionActionScenario,
  signals: ObservedScenarioSignals
): ReviewRegressionActionResult {
  const auditAction = getObservedAuditAction(signals);
  if (!signals.auditActions.includes(toReviewAction(scenario.expected.auditAction))) {
    return {
      scenarioKey: scenario.scenarioKey,
      passed     : false,
      message    : `Expected audit action ${scenario.expected.auditAction} was not emitted`,
      auditAction
    };
  }

  const missingProjectionFamilies = scenario.expected.projectionFamilies.filter(
    (family) => !signals.projectionFamilies.has(family)
  );
  if (missingProjectionFamilies.length > 0) {
    return {
      scenarioKey: scenario.scenarioKey,
      passed     : false,
      message    : `Expected projection families were not requested: ${missingProjectionFamilies.join(", ")}`,
      auditAction
    };
  }

  return {
    scenarioKey: scenario.scenarioKey,
    passed     : true,
    message    : "passed",
    auditAction
  };
}

function buildManualDraft(
  claimKind: ManualOverrideFamily,
  claim: EventClaimRow | RelationClaimRow | TimeClaimRow | IdentityResolutionClaimRow
): Record<string, unknown> {
  switch (claimKind) {
    case "EVENT": {
      const eventClaim = claim as EventClaimRow;
      return {
        bookId                   : eventClaim.bookId,
        chapterId                : eventClaim.chapterId,
        confidence               : 1,
        runId                    : eventClaim.runId,
        subjectMentionId         : eventClaim.subjectMentionId,
        subjectPersonaCandidateId: eventClaim.subjectPersonaCandidateId,
        predicate                : eventClaim.predicate,
        objectText               : eventClaim.objectText,
        objectPersonaCandidateId : eventClaim.objectPersonaCandidateId,
        locationText             : eventClaim.locationText,
        timeHintId               : eventClaim.timeHintId,
        eventCategory            : eventClaim.eventCategory,
        narrativeLens            : eventClaim.narrativeLens,
        evidenceSpanIds          : [...eventClaim.evidenceSpanIds]
      };
    }

    case "RELATION": {
      const relationClaim = claim as RelationClaimRow;
      return {
        bookId                  : relationClaim.bookId,
        chapterId               : relationClaim.chapterId,
        confidence              : 1,
        runId                   : relationClaim.runId,
        sourceMentionId         : relationClaim.sourceMentionId,
        targetMentionId         : relationClaim.targetMentionId,
        sourcePersonaCandidateId: relationClaim.sourcePersonaCandidateId,
        targetPersonaCandidateId: relationClaim.targetPersonaCandidateId,
        relationTypeKey         : relationClaim.relationTypeKey,
        relationLabel           : relationClaim.relationLabel,
        relationTypeSource      : relationClaim.relationTypeSource,
        direction               : relationClaim.direction,
        effectiveChapterStart   : relationClaim.effectiveChapterStart,
        effectiveChapterEnd     : relationClaim.effectiveChapterEnd,
        timeHintId              : relationClaim.timeHintId,
        evidenceSpanIds         : [...relationClaim.evidenceSpanIds]
      };
    }

    case "TIME": {
      const timeClaim = claim as TimeClaimRow;
      return {
        bookId             : timeClaim.bookId,
        chapterId          : timeClaim.chapterId,
        confidence         : 1,
        runId              : timeClaim.runId,
        rawTimeText        : timeClaim.rawTimeText,
        timeType           : timeClaim.timeType,
        normalizedLabel    : timeClaim.normalizedLabel,
        relativeOrderWeight: timeClaim.relativeOrderWeight,
        chapterRangeStart  : timeClaim.chapterRangeStart,
        chapterRangeEnd    : timeClaim.chapterRangeEnd,
        evidenceSpanIds    : [...timeClaim.evidenceSpanIds]
      };
    }

    case "IDENTITY_RESOLUTION": {
      const identityClaim = claim as IdentityResolutionClaimRow;
      return {
        bookId            : identityClaim.bookId,
        chapterId         : identityClaim.chapterId,
        confidence        : 1,
        runId             : identityClaim.runId,
        mentionId         : identityClaim.mentionId,
        personaCandidateId: identityClaim.personaCandidateId,
        resolvedPersonaId : identityClaim.resolvedPersonaId,
        resolutionKind    : identityClaim.resolutionKind,
        rationale         : identityClaim.rationale,
        evidenceSpanIds   : [...identityClaim.evidenceSpanIds]
      };
    }

    case "ALIAS":
      throw new Error("ALIAS review regression actions are not supported by the fixture contract");
  }
}

function resolveClaimFamily(scenario: ReviewRegressionActionScenario): ReviewableClaimFamily {
  const claimKind = scenario.target.claimKind;
  if (claimKind === undefined) {
    throw new Error(`Claim action scenario ${scenario.scenarioKey} requires target.claimKind`);
  }

  return CLAIM_KIND_TO_REVIEWABLE_FAMILY[claimKind];
}

function toManualClaimKind(claimKind: ReviewableClaimFamily): ManualOverrideFamily {
  if (claimKind === "CONFLICT_FLAG") {
    throw new Error("CONFLICT_FLAG does not support manual review regression actions");
  }

  return claimKind;
}

function requireClaimKind(target: ResolvedScenarioTarget): ReviewableClaimFamily {
  if (target.claimKind === undefined) {
    throw new Error("resolved scenario target is missing claim kind");
  }

  return target.claimKind;
}

function requireManualClaimKind(target: ResolvedScenarioTarget): ManualOverrideFamily {
  if (target.manualClaimKind === undefined) {
    throw new Error("resolved scenario target is missing manual claim kind");
  }

  return target.manualClaimKind;
}

function requireClaim(
  target: ResolvedScenarioTarget
): EventClaimRow | RelationClaimRow | TimeClaimRow | IdentityResolutionClaimRow {
  if (target.claim === undefined) {
    throw new Error("resolved scenario target is missing claim row");
  }

  return target.claim;
}

function requirePersona(persona: PersonaRow | undefined, role: string): PersonaRow {
  if (persona === undefined) {
    throw new Error(`resolved scenario target is missing ${role} persona`);
  }

  return persona;
}

function findPersonasByName(lookup: ActionLookup, personaName: string): PersonaRow[] {
  const normalizedName = personaName.trim();
  const aliasPersonaIds = new Set(
    lookup.personaAliases
      .filter((alias) => alias.aliasText === normalizedName)
      .map((alias) => alias.personaId)
  );

  return lookup.personas
    .filter((persona) => (
      persona.name === normalizedName
      || persona.aliases?.includes(normalizedName) === true
      || aliasPersonaIds.has(persona.id)
    ))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function findPersonaById(lookup: ActionLookup, personaId: string): PersonaRow | null {
  return lookup.personas.find((persona) => persona.id === personaId) ?? null;
}

function getPersonaCandidateIds(lookup: ActionLookup, personaId: string): string[] {
  return Array.from(new Set(lookup.identityResolutionClaims
    .filter((claim) => claim.resolvedPersonaId === personaId && claim.personaCandidateId !== null)
    .map((claim) => claim.personaCandidateId as string)))
    .sort();
}

function getPersonaCandidateIdsForPersonas(
  lookup: ActionLookup,
  personas: readonly PersonaRow[]
): string[] {
  return Array.from(new Set(personas.flatMap((persona) => getPersonaCandidateIds(lookup, persona.id))))
    .sort();
}

function claimEvidenceMatches(
  lookup: ActionLookup,
  claim: BaseClaimRow,
  evidenceSnippet?: string
): boolean {
  if (evidenceSnippet === undefined) return true;

  const normalizedSnippet = normalizeReviewRegressionSnippet(evidenceSnippet);
  return claim.evidenceSpanIds.some((evidenceSpanId) => {
    const evidenceSpan = lookup.evidenceSpans.find((span) => span.id === evidenceSpanId);
    if (evidenceSpan === undefined) return false;

    return normalizeReviewRegressionSnippet(evidenceSpan.quotedText).includes(normalizedSnippet)
      || normalizeReviewRegressionSnippet(evidenceSpan.normalizedText).includes(normalizedSnippet);
  });
}

function recordProjectionFamilies(
  signals: ObservedScenarioSignals,
  scope: ProjectionRebuildScope
): void {
  const projectionFamilies = "projectionFamilies" in scope && scope.projectionFamilies !== undefined
    ? scope.projectionFamilies
    : PROJECTION_FAMILY_VALUES;

  for (const projectionFamily of projectionFamilies) {
    signals.projectionFamilies.add(projectionFamily);
  }
}

function getObservedAuditAction(signals: ObservedScenarioSignals): string | null {
  return signals.auditActions[0] ?? null;
}

function toReviewAction(action: string): ReviewRegressionReviewAction {
  return action as ReviewRegressionReviewAction;
}

function includesString(values: readonly string[], value: string | null): boolean {
  return value !== null && values.includes(value);
}

function sortClaims<TClaim extends BaseClaimRow>(claims: readonly TClaim[]): TClaim[] {
  return [...claims].sort((left, right) => left.id.localeCompare(right.id));
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
