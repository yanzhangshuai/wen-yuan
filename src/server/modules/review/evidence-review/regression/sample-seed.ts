import { prisma } from "@/server/db/prisma";
import {
  AnalysisJobStatus,
  AnalysisStageRunStatus,
  AliasType,
  BioCategory,
  BookTypeCode,
  ChapterSegmentType,
  ChapterType,
  ClaimReviewState,
  ClaimSource,
  IdentityResolutionKind,
  NarrativeLens,
  PersonaCandidateStatus,
  RelationDirection,
  RelationTypeSource,
  TimeType
} from "@/generated/prisma/enums";
import {
  createProjectionBuilder,
  createProjectionRepository,
  type ProjectionBuildResult,
  type ProjectionRebuildScope
} from "@/server/modules/review/evidence-review/projections";

type SeedDeleteManyDelegate = {
  deleteMany(args: unknown): Promise<unknown>;
};

type SeedDeleteCreateManyDelegate = SeedDeleteManyDelegate & {
  createMany(args: { data: unknown[] }): Promise<unknown>;
};

type SeedUpsertDelegate = {
  upsert(args: unknown): Promise<Record<string, unknown>>;
};

type SeedBookRow = {
  id: string;
};

type SeedTransactionClient = {
  book: {
    findMany(args?: unknown): Promise<Array<{ id: string }>>;
    updateMany(args: unknown): Promise<unknown>;
    upsert(args: unknown): Promise<SeedBookRow>;
  };
  analysisRun     : SeedUpsertDelegate;
  analysisStageRun: SeedDeleteCreateManyDelegate;
  persona: {
    upsert(args: unknown): Promise<Record<string, unknown>>;
  };
  chapter                : SeedDeleteCreateManyDelegate;
  chapterSegment         : SeedDeleteCreateManyDelegate;
  evidenceSpan           : SeedDeleteCreateManyDelegate;
  personaAlias           : SeedDeleteCreateManyDelegate;
  personaCandidate       : SeedDeleteCreateManyDelegate;
  identityResolutionClaim: SeedDeleteCreateManyDelegate;
  eventClaim             : SeedDeleteCreateManyDelegate;
  relationClaim          : SeedDeleteCreateManyDelegate;
  timeClaim              : SeedDeleteCreateManyDelegate;
  conflictFlag           : SeedDeleteManyDelegate;
  personaChapterFact     : SeedDeleteManyDelegate;
  personaTimeFact        : SeedDeleteManyDelegate;
  relationshipEdge       : SeedDeleteManyDelegate;
  timelineEvent          : SeedDeleteManyDelegate;
  rebuildProjection?(
    scope: ProjectionRebuildScope
  ): Promise<ProjectionBuildResult>;
};

export type ReviewRegressionSampleSeedPrismaClient = SeedTransactionClient & {
  $transaction<T>(callback: (tx: SeedTransactionClient) => Promise<T>): Promise<T>;
};

export interface SeedReviewRegressionSamplesInput {
  prismaClient?: ReviewRegressionSampleSeedPrismaClient;
  now?         : () => Date;
}

export interface SeedReviewRegressionSamplesResult {
  books: Array<{
    bookId        : string;
    fixtureKey    : string;
    baselineRunId : string;
    candidateRunId: string;
  }>;
}

type SamplePersonaSeed = {
  id        : string;
  name      : string;
  aliases   : string[];
  chapterNos: number[];
};

type SampleAliasSeed = {
  id       : string;
  personaId: string;
  aliasText: string;
};

type SampleCandidateSeed = {
  id                : string;
  canonicalLabel    : string;
  firstSeenChapterNo: number | null;
  lastSeenChapterNo : number | null;
};

type SampleIdentityClaimSeed = {
  id                : string;
  chapterNo         : number | null;
  mentionId         : string;
  personaCandidateId: string;
  resolvedPersonaId : string;
  evidenceSpanIds   : string[];
  reviewState       : keyof typeof ClaimReviewState;
  rationale         : string;
};

type SampleEventClaimSeed = {
  id                       : string;
  chapterNo                : number;
  subjectPersonaCandidateId: string;
  predicate                : string;
  evidenceSpanIds          : string[];
  timeHintId               : string | null;
  eventCategory            : keyof typeof BioCategory;
};

type SampleRelationClaimSeed = {
  id                      : string;
  chapterNo               : number;
  sourcePersonaCandidateId: string;
  targetPersonaCandidateId: string;
  relationTypeKey         : string;
  relationLabel           : string;
  direction               : keyof typeof RelationDirection;
  effectiveChapterStart   : number | null;
  effectiveChapterEnd     : number | null;
  evidenceSpanIds         : string[];
  timeHintId              : string | null;
  relationTypeSource      : keyof typeof RelationTypeSource;
};

type SampleTimeClaimSeed = {
  id                 : string;
  chapterNo          : number;
  rawTimeText        : string;
  normalizedLabel    : string;
  relativeOrderWeight: number | null;
  chapterRangeStart  : number | null;
  chapterRangeEnd    : number | null;
  evidenceSpanIds    : string[];
  timeType           : keyof typeof TimeType;
};

type SampleEvidenceSpec = {
  id          : string;
  chapterNo   : number;
  segmentId   : string;
  segmentIndex: number;
  text        : string;
  snippet     : string;
};

type SampleBookSeed = {
  fixtureKey    : string;
  bookId        : string;
  title         : string;
  author        : string;
  typeCode      : keyof typeof BookTypeCode;
  baselineRunId : string;
  candidateRunId: string;
  actionRunId?  : string;
  chapters       : Array<{
    id     : string;
    no     : number;
    content: string;
  }>;
  evidenceSpecs : SampleEvidenceSpec[];
  personas      : SamplePersonaSeed[];
  personaAliases: SampleAliasSeed[];
  candidates    : SampleCandidateSeed[];
  identityClaims: SampleIdentityClaimSeed[];
  eventClaims   : SampleEventClaimSeed[];
  relationClaims: SampleRelationClaimSeed[];
  timeClaims    : SampleTimeClaimSeed[];
};

export const RULIN_BOOK_ID = "10000000-0000-4000-8000-000000000001";
export const SANGUO_BOOK_ID = "10000000-0000-4000-8000-000000000002";
export const RULIN_BASELINE_RUN_ID = "1a000000-0000-4000-8000-000000000001";
export const RULIN_CANDIDATE_RUN_ID = "1a000000-0000-4000-8000-000000000002";
const RULIN_ACTION_RUN_ID = "1a000000-0000-4000-8000-000000000099";
export const SANGUO_BASELINE_RUN_ID = "2a000000-0000-4000-8000-000000000001";
export const SANGUO_CANDIDATE_RUN_ID = "2a000000-0000-4000-8000-000000000002";

const SAMPLE_BOOKS: readonly SampleBookSeed[] = [
  buildRulinWaishiSample(),
  buildSanguoYanyiSample()
];

export async function seedReviewRegressionSamples(
  input: SeedReviewRegressionSamplesInput = {}
): Promise<SeedReviewRegressionSamplesResult> {
  const prismaClient =
    input.prismaClient ?? (prisma as unknown as ReviewRegressionSampleSeedPrismaClient);
  const seededAt = (input.now ?? (() => new Date()))();

  return prismaClient.$transaction(async (tx) => {
    const books: SeedReviewRegressionSamplesResult["books"] = [];

    for (const sample of SAMPLE_BOOKS) {
      await softDeleteConflictingBooks(tx, sample, seededAt);
      await upsertSampleBook(tx, sample);
      await upsertSampleRuns(tx, sample);
      await replaceSampleStageRuns(tx, sample);
      await upsertSamplePersonas(tx, sample.personas);
      await clearBookScopedRows(tx, sample.bookId);
      await insertBookScopedRows(tx, sample);
      await rebuildSampleProjection(tx, sample.bookId);
      books.push({
        bookId        : sample.bookId,
        fixtureKey    : sample.fixtureKey,
        baselineRunId : sample.baselineRunId,
        candidateRunId: sample.candidateRunId
      });
    }

    return { books };
  });
}

async function softDeleteConflictingBooks(
  tx: SeedTransactionClient,
  sample: SampleBookSeed,
  deletedAt: Date
): Promise<void> {
  const conflicts = await tx.book.findMany({
    where: {
      title    : sample.title,
      author   : sample.author,
      deletedAt: null
    }
  });
  const conflictIds = conflicts
    .map((book) => book.id)
    .filter((bookId) => bookId !== sample.bookId);

  if (conflictIds.length === 0) {
    return;
  }

  await tx.book.updateMany({
    where: { id: { in: conflictIds } },
    data : { deletedAt }
  });
}

async function upsertSampleBook(
  tx: SeedTransactionClient,
  sample: SampleBookSeed
): Promise<void> {
  await tx.book.upsert({
    where : { id: sample.bookId },
    update: {
      id           : sample.bookId,
      title        : sample.title,
      author       : sample.author,
      typeCode     : BookTypeCode[sample.typeCode],
      deletedAt    : null,
      status       : "COMPLETED",
      parseProgress: 100,
      parseStage   : "REVIEW_REGRESSION_SAMPLE"
    },
    create: {
      id           : sample.bookId,
      title        : sample.title,
      author       : sample.author,
      typeCode     : BookTypeCode[sample.typeCode],
      deletedAt    : null,
      status       : "COMPLETED",
      parseProgress: 100,
      parseStage   : "REVIEW_REGRESSION_SAMPLE"
    }
  });
}

async function upsertSamplePersonas(
  tx: SeedTransactionClient,
  personas: readonly SamplePersonaSeed[]
): Promise<void> {
  for (const persona of personas) {
    await tx.persona.upsert({
      where : { id: persona.id },
      update: {
        id       : persona.id,
        name     : persona.name,
        aliases  : persona.aliases,
        deletedAt: null
      },
      create: {
        id     : persona.id,
        name   : persona.name,
        aliases: persona.aliases
      }
    });
  }
}

async function upsertSampleRuns(
  tx: SeedTransactionClient,
  sample: SampleBookSeed
): Promise<void> {
  for (const runId of [sample.baselineRunId, sample.candidateRunId]) {
    await tx.analysisRun.upsert({
      where : { id: runId },
      update: {
        id             : runId,
        bookId         : sample.bookId,
        trigger        : "REVIEW_REGRESSION_SAMPLE",
        scope          : "FULL_BOOK",
        status         : AnalysisJobStatus.SUCCEEDED,
        currentStageKey: "stage_a_extraction"
      },
      create: {
        id             : runId,
        bookId         : sample.bookId,
        trigger        : "REVIEW_REGRESSION_SAMPLE",
        scope          : "FULL_BOOK",
        status         : AnalysisJobStatus.SUCCEEDED,
        currentStageKey: "stage_a_extraction"
      }
    });
  }
}

async function replaceSampleStageRuns(
  tx: SeedTransactionClient,
  sample: SampleBookSeed
): Promise<void> {
  await tx.analysisStageRun.deleteMany({
    where: { runId: { in: [sample.baselineRunId, sample.candidateRunId] } }
  });

  const chapterNos = sample.chapters.map((chapter) => chapter.no);
  const chapterStartNo = Math.min(...chapterNos);
  const chapterEndNo = Math.max(...chapterNos);

  await tx.analysisStageRun.createMany({
    data: [sample.baselineRunId, sample.candidateRunId].map((runId) => ({
      runId,
      bookId  : sample.bookId,
      stageKey: "stage_a_extraction",
      status  : AnalysisStageRunStatus.SUCCEEDED,
      attempt : 1,
      chapterStartNo,
      chapterEndNo
    }))
  });
}

async function clearBookScopedRows(tx: SeedTransactionClient, bookId: string): Promise<void> {
  await tx.timelineEvent.deleteMany({ where: { bookId } });
  await tx.relationshipEdge.deleteMany({ where: { bookId } });
  await tx.personaTimeFact.deleteMany({ where: { bookId } });
  await tx.personaChapterFact.deleteMany({ where: { bookId } });
  await tx.conflictFlag.deleteMany({ where: { bookId } });
  await tx.timeClaim.deleteMany({ where: { bookId } });
  await tx.relationClaim.deleteMany({ where: { bookId } });
  await tx.eventClaim.deleteMany({ where: { bookId } });
  await tx.identityResolutionClaim.deleteMany({ where: { bookId } });
  await tx.personaAlias.deleteMany({ where: { bookId } });
  await tx.personaCandidate.deleteMany({ where: { bookId } });
  await tx.evidenceSpan.deleteMany({ where: { bookId } });
  await tx.chapterSegment.deleteMany({ where: { bookId } });
  await tx.chapter.deleteMany({ where: { bookId } });
}

async function insertBookScopedRows(
  tx: SeedTransactionClient,
  sample: SampleBookSeed
): Promise<void> {
  const chapterIdByNo = new Map(sample.chapters.map((chapter) => [chapter.no, chapter.id]));
  const segments = sample.evidenceSpecs.map((spec) => ({
    id            : spec.segmentId,
    bookId        : sample.bookId,
    chapterId     : requireChapterId(chapterIdByNo, sample, spec.chapterNo),
    runId         : sample.baselineRunId,
    segmentIndex  : spec.segmentIndex,
    segmentType   : ChapterSegmentType.NARRATIVE,
    startOffset   : 0,
    endOffset     : spec.text.length,
    text          : spec.text,
    normalizedText: spec.text,
    confidence    : 1,
    speakerHint   : null
  }));
  const evidenceSpans = sample.evidenceSpecs.map((spec) => ({
    id                 : spec.id,
    bookId             : sample.bookId,
    chapterId          : requireChapterId(chapterIdByNo, sample, spec.chapterNo),
    segmentId          : spec.segmentId,
    startOffset        : resolveSnippetOffset(spec.text, spec.snippet),
    endOffset          : resolveSnippetOffset(spec.text, spec.snippet) + spec.snippet.length,
    quotedText         : spec.snippet,
    normalizedText     : spec.snippet,
    speakerHint        : null,
    narrativeRegionType: "NARRATION",
    createdByRunId     : sample.baselineRunId
  }));
  const candidateTimeIdByBaselineId = new Map(
    sample.timeClaims.map((claim) => [claim.id, buildCandidateCloneId(claim.id)])
  );
  const acceptedIdentityClaims = sample.identityClaims.filter((claim) => claim.reviewState === "ACCEPTED");
  const actionIdentityClaims = sample.identityClaims.filter((claim) => claim.reviewState !== "ACCEPTED");

  await tx.chapter.createMany({
    data: sample.chapters.map((chapter) => ({
      id         : chapter.id,
      bookId     : sample.bookId,
      type       : ChapterType.CHAPTER,
      no         : chapter.no,
      unit       : "回",
      noText     : formatChineseChapterTitle(chapter.no),
      title      : formatChineseChapterTitle(chapter.no),
      content    : chapter.content,
      parseStatus: "SUCCEEDED",
      isAbstract : false
    }))
  });
  await tx.chapterSegment.createMany({ data: segments });
  await tx.evidenceSpan.createMany({ data: evidenceSpans });
  await tx.personaAlias.createMany({
    data: sample.personaAliases.map((alias) => ({
      id           : alias.id,
      bookId       : sample.bookId,
      personaId    : alias.personaId,
      aliasText    : alias.aliasText,
      aliasType    : AliasType.NICKNAME,
      sourceClaimId: null
    }))
  });
  await tx.personaCandidate.createMany({
    data: sample.candidates.map((candidate) => ({
      id                : candidate.id,
      bookId            : sample.bookId,
      canonicalLabel    : candidate.canonicalLabel,
      candidateStatus   : PersonaCandidateStatus.CONFIRMED,
      firstSeenChapterNo: candidate.firstSeenChapterNo,
      lastSeenChapterNo : candidate.lastSeenChapterNo,
      mentionCount      : 1,
      evidenceScore     : 1,
      runId             : sample.baselineRunId
    }))
  });
  await tx.identityResolutionClaim.createMany({
    data: [
      ...acceptedIdentityClaims.map((claim) => ({
        id                : claim.id,
        bookId            : sample.bookId,
        chapterId         : claim.chapterNo === null ? null : requireChapterId(chapterIdByNo, sample, claim.chapterNo),
        mentionId         : claim.mentionId,
        personaCandidateId: claim.personaCandidateId,
        resolvedPersonaId : claim.resolvedPersonaId,
        resolutionKind    : IdentityResolutionKind.RESOLVES_TO,
        rationale         : claim.rationale,
        evidenceSpanIds   : claim.evidenceSpanIds,
        confidence        : 0.98,
        reviewState       : ClaimReviewState.ACCEPTED,
        source            : ClaimSource.AI,
        runId             : sample.baselineRunId
      })),
      ...acceptedIdentityClaims.map((claim) => ({
        id                : buildCandidateCloneId(claim.id),
        bookId            : sample.bookId,
        chapterId         : claim.chapterNo === null ? null : requireChapterId(chapterIdByNo, sample, claim.chapterNo),
        mentionId         : claim.mentionId,
        personaCandidateId: claim.personaCandidateId,
        resolvedPersonaId : claim.resolvedPersonaId,
        resolutionKind    : IdentityResolutionKind.RESOLVES_TO,
        rationale         : claim.rationale,
        evidenceSpanIds   : claim.evidenceSpanIds,
        confidence        : 0.62,
        reviewState       : ClaimReviewState.PENDING,
        source            : ClaimSource.AI,
        runId             : sample.candidateRunId
      })),
      ...actionIdentityClaims.map((claim) => ({
        id                : claim.id,
        bookId            : sample.bookId,
        chapterId         : claim.chapterNo === null ? null : requireChapterId(chapterIdByNo, sample, claim.chapterNo),
        mentionId         : claim.mentionId,
        personaCandidateId: claim.personaCandidateId,
        resolvedPersonaId : claim.resolvedPersonaId,
        resolutionKind    : IdentityResolutionKind.RESOLVES_TO,
        rationale         : claim.rationale,
        evidenceSpanIds   : claim.evidenceSpanIds,
        confidence        : 0.62,
        reviewState       : ClaimReviewState[claim.reviewState],
        source            : ClaimSource.AI,
        runId             : requireActionRunId(sample, claim.id)
      }))
    ]
  });
  await tx.timeClaim.createMany({
    data: [
      ...sample.timeClaims.map((claim) => ({
        id                 : claim.id,
        bookId             : sample.bookId,
        chapterId          : requireChapterId(chapterIdByNo, sample, claim.chapterNo),
        rawTimeText        : claim.rawTimeText,
        timeType           : TimeType[claim.timeType],
        normalizedLabel    : claim.normalizedLabel,
        relativeOrderWeight: claim.relativeOrderWeight,
        chapterRangeStart  : claim.chapterRangeStart,
        chapterRangeEnd    : claim.chapterRangeEnd,
        evidenceSpanIds    : claim.evidenceSpanIds,
        confidence         : 0.95,
        reviewState        : ClaimReviewState.ACCEPTED,
        source             : ClaimSource.AI,
        runId              : sample.baselineRunId
      })),
      ...sample.timeClaims.map((claim) => ({
        id                 : requireCandidateCloneId(candidateTimeIdByBaselineId, claim.id),
        bookId             : sample.bookId,
        chapterId          : requireChapterId(chapterIdByNo, sample, claim.chapterNo),
        rawTimeText        : claim.rawTimeText,
        timeType           : TimeType[claim.timeType],
        normalizedLabel    : claim.normalizedLabel,
        relativeOrderWeight: claim.relativeOrderWeight,
        chapterRangeStart  : claim.chapterRangeStart,
        chapterRangeEnd    : claim.chapterRangeEnd,
        evidenceSpanIds    : claim.evidenceSpanIds,
        confidence         : 0.72,
        reviewState        : ClaimReviewState.PENDING,
        source             : ClaimSource.AI,
        runId              : sample.candidateRunId
      }))
    ]
  });
  await tx.eventClaim.createMany({
    data: [
      ...sample.eventClaims.map((claim) => ({
        id                       : claim.id,
        bookId                   : sample.bookId,
        chapterId                : requireChapterId(chapterIdByNo, sample, claim.chapterNo),
        subjectMentionId         : null,
        subjectPersonaCandidateId: claim.subjectPersonaCandidateId,
        predicate                : claim.predicate,
        objectText               : null,
        objectPersonaCandidateId : null,
        locationText             : null,
        timeHintId               : claim.timeHintId,
        eventCategory            : BioCategory[claim.eventCategory],
        narrativeLens            : NarrativeLens.SELF,
        evidenceSpanIds          : claim.evidenceSpanIds,
        confidence               : 0.95,
        reviewState              : ClaimReviewState.ACCEPTED,
        source                   : ClaimSource.AI,
        runId                    : sample.baselineRunId
      })),
      ...sample.eventClaims.map((claim) => ({
        id                       : buildCandidateCloneId(claim.id),
        bookId                   : sample.bookId,
        chapterId                : requireChapterId(chapterIdByNo, sample, claim.chapterNo),
        subjectMentionId         : null,
        subjectPersonaCandidateId: claim.subjectPersonaCandidateId,
        predicate                : claim.predicate,
        objectText               : null,
        objectPersonaCandidateId : null,
        locationText             : null,
        timeHintId               : claim.timeHintId === null
          ? null
          : requireCandidateCloneId(candidateTimeIdByBaselineId, claim.timeHintId),
        eventCategory  : BioCategory[claim.eventCategory],
        narrativeLens  : NarrativeLens.SELF,
        evidenceSpanIds: claim.evidenceSpanIds,
        confidence     : 0.73,
        reviewState    : ClaimReviewState.PENDING,
        source         : ClaimSource.AI,
        runId          : sample.candidateRunId
      }))
    ]
  });
  await tx.relationClaim.createMany({
    data: [
      ...sample.relationClaims.map((claim) => ({
        id                      : claim.id,
        bookId                  : sample.bookId,
        chapterId               : requireChapterId(chapterIdByNo, sample, claim.chapterNo),
        sourceMentionId         : null,
        targetMentionId         : null,
        sourcePersonaCandidateId: claim.sourcePersonaCandidateId,
        targetPersonaCandidateId: claim.targetPersonaCandidateId,
        relationTypeKey         : claim.relationTypeKey,
        relationLabel           : claim.relationLabel,
        relationTypeSource      : RelationTypeSource[claim.relationTypeSource],
        direction               : RelationDirection[claim.direction],
        effectiveChapterStart   : claim.effectiveChapterStart,
        effectiveChapterEnd     : claim.effectiveChapterEnd,
        timeHintId              : claim.timeHintId,
        evidenceSpanIds         : claim.evidenceSpanIds,
        confidence              : 0.94,
        reviewState             : ClaimReviewState.ACCEPTED,
        source                  : ClaimSource.AI,
        runId                   : sample.baselineRunId
      })),
      ...sample.relationClaims.map((claim) => ({
        id                      : buildCandidateCloneId(claim.id),
        bookId                  : sample.bookId,
        chapterId               : requireChapterId(chapterIdByNo, sample, claim.chapterNo),
        sourceMentionId         : null,
        targetMentionId         : null,
        sourcePersonaCandidateId: claim.sourcePersonaCandidateId,
        targetPersonaCandidateId: claim.targetPersonaCandidateId,
        relationTypeKey         : claim.relationTypeKey,
        relationLabel           : claim.relationLabel,
        relationTypeSource      : RelationTypeSource[claim.relationTypeSource],
        direction               : RelationDirection[claim.direction],
        effectiveChapterStart   : claim.effectiveChapterStart,
        effectiveChapterEnd     : claim.effectiveChapterEnd,
        timeHintId              : claim.timeHintId === null
          ? null
          : requireCandidateCloneId(candidateTimeIdByBaselineId, claim.timeHintId),
        evidenceSpanIds: claim.evidenceSpanIds,
        confidence     : 0.71,
        reviewState    : ClaimReviewState.PENDING,
        source         : ClaimSource.AI,
        runId          : sample.candidateRunId
      }))
    ]
  });
}

async function rebuildSampleProjection(
  tx: SeedTransactionClient,
  bookId: string
): Promise<void> {
  const scope: ProjectionRebuildScope = { kind: "FULL_BOOK", bookId };

  if (typeof tx.rebuildProjection === "function") {
    await tx.rebuildProjection(scope);
    return;
  }

  await createProjectionBuilder({
    repository: createProjectionRepository(tx as never)
  }).rebuildProjection(scope);
}

function requireChapterId(
  chapterIdByNo: ReadonlyMap<number, string>,
  sample: SampleBookSeed,
  chapterNo: number
): string {
  const chapterId = chapterIdByNo.get(chapterNo);
  if (chapterId === undefined) {
    throw new Error(`Missing chapter ${chapterNo} for sample ${sample.fixtureKey}`);
  }
  return chapterId;
}

function requireActionRunId(sample: SampleBookSeed, claimId: string): string {
  if (sample.actionRunId === undefined) {
    throw new Error(`Sample ${sample.fixtureKey} is missing actionRunId for pending claim ${claimId}`);
  }

  return sample.actionRunId;
}

function buildCandidateCloneId(id: string): string {
  if (id.length === 0 || id[0]?.toLowerCase() === "f") {
    throw new Error(`Cannot derive deterministic candidate clone id from ${id}`);
  }

  return `f${id.slice(1)}`;
}

function requireCandidateCloneId(
  candidateIdByBaselineId: ReadonlyMap<string, string>,
  baselineId: string
): string {
  const candidateId = candidateIdByBaselineId.get(baselineId);
  if (candidateId === undefined) {
    throw new Error(`Missing candidate clone id for ${baselineId}`);
  }

  return candidateId;
}

function resolveSnippetOffset(text: string, snippet: string): number {
  const offset = text.indexOf(snippet);
  if (offset === -1) {
    throw new Error(`Snippet not found in segment text: ${snippet}`);
  }
  return offset;
}

function buildRulinWaishiSample(): SampleBookSeed {
  const personas = {
    fanJin  : "11000000-0000-4000-8000-000000000001",
    huTuhu  : "11000000-0000-4000-8000-000000000002",
    zhang   : "11000000-0000-4000-8000-000000000003",
    fanLaoYe: "11000000-0000-4000-8000-000000000004"
  } as const;
  const chapters = {
    chapter3: "12000000-0000-4000-8000-000000000003",
    chapter4: "12000000-0000-4000-8000-000000000004"
  } as const;
  const segments = {
    idFanJin     : "13000000-0000-4000-8000-000000000001",
    eventFanJin  : "13000000-0000-4000-8000-000000000002",
    relationHu   : "13000000-0000-4000-8000-000000000003",
    relationZhang: "13000000-0000-4000-8000-000000000004",
    timeFanJin   : "13000000-0000-4000-8000-000000000005"
  } as const;
  const evidence = {
    idFanJin     : "14000000-0000-4000-8000-000000000001",
    eventFanJin  : "14000000-0000-4000-8000-000000000002",
    relationHu   : "14000000-0000-4000-8000-000000000003",
    relationZhang: "14000000-0000-4000-8000-000000000004",
    timeFanJin   : "14000000-0000-4000-8000-000000000005"
  } as const;
  const candidates = {
    fanJin  : "15000000-0000-4000-8000-000000000001",
    huTuhu  : "15000000-0000-4000-8000-000000000002",
    zhang   : "15000000-0000-4000-8000-000000000003",
    fanLaoYe: "15000000-0000-4000-8000-000000000004"
  } as const;
  const claims = {
    idFanJinAccepted  : "16000000-0000-4000-8000-000000000001",
    idHuAccepted      : "16000000-0000-4000-8000-000000000002",
    idZhangAccepted   : "16000000-0000-4000-8000-000000000003",
    idFanLaoYeAccepted: "16000000-0000-4000-8000-000000000004",
    idFanLaoYePending : "16000000-0000-4000-8000-000000000005",
    eventFanJin       : "17000000-0000-4000-8000-000000000001",
    relationHu        : "18000000-0000-4000-8000-000000000001",
    relationZhang     : "18000000-0000-4000-8000-000000000002",
    timeFanJin        : "19000000-0000-4000-8000-000000000001"
  } as const;

  return {
    fixtureKey    : "rulin-waishi-sample",
    bookId        : RULIN_BOOK_ID,
    title         : "儒林外史",
    author        : "吴敬梓",
    typeCode      : "CLASSICAL_NOVEL",
    baselineRunId : RULIN_BASELINE_RUN_ID,
    candidateRunId: RULIN_CANDIDATE_RUN_ID,
    actionRunId   : RULIN_ACTION_RUN_ID,
    chapters      : [
      {
        id     : chapters.chapter3,
        no     : 3,
        content: [
          "众人忽然都称范进作老爷。",
          "中举报到，众人改口称老爷。",
          "胡屠户认范进为女婿。",
          "张乡绅赠银并攀谈。",
          "中举之后众人改口。"
        ].join("\n")
      },
      {
        id     : chapters.chapter4,
        no     : 4,
        content: "第四回延续范进中举后的余波。"
      }
    ],
    evidenceSpecs: [
      {
        id          : evidence.idFanJin,
        chapterNo   : 3,
        segmentId   : segments.idFanJin,
        segmentIndex: 0,
        text        : "众人忽然都称范进作老爷。",
        snippet     : "众人忽然都称范进作老爷"
      },
      {
        id          : evidence.eventFanJin,
        chapterNo   : 3,
        segmentId   : segments.eventFanJin,
        segmentIndex: 1,
        text        : "中举报到，众人改口称老爷。",
        snippet     : "中举报到，众人改口称老爷"
      },
      {
        id          : evidence.relationHu,
        chapterNo   : 3,
        segmentId   : segments.relationHu,
        segmentIndex: 2,
        text        : "胡屠户认范进为女婿。",
        snippet     : "胡屠户认范进为女婿"
      },
      {
        id          : evidence.relationZhang,
        chapterNo   : 3,
        segmentId   : segments.relationZhang,
        segmentIndex: 3,
        text        : "张乡绅赠银并攀谈。",
        snippet     : "张乡绅赠银并攀谈"
      },
      {
        id          : evidence.timeFanJin,
        chapterNo   : 3,
        segmentId   : segments.timeFanJin,
        segmentIndex: 4,
        text        : "中举之后众人改口。",
        snippet     : "中举之后众人改口"
      }
    ],
    personas: [
      { id: personas.fanJin, name: "范进", aliases: ["范举人"], chapterNos: [3, 4] },
      { id: personas.huTuhu, name: "胡屠户", aliases: ["胡老爹"], chapterNos: [3] },
      { id: personas.zhang, name: "张乡绅", aliases: [], chapterNos: [3] },
      { id: personas.fanLaoYe, name: "范老爷", aliases: [], chapterNos: [3] }
    ],
    personaAliases: [
      { id: "1b000000-0000-4000-8000-000000000001", personaId: personas.fanJin, aliasText: "范老爷" },
      { id: "1b000000-0000-4000-8000-000000000002", personaId: personas.huTuhu, aliasText: "胡老爹" }
    ],
    candidates: [
      { id: candidates.fanJin, canonicalLabel: "范进", firstSeenChapterNo: 3, lastSeenChapterNo: 4 },
      { id: candidates.huTuhu, canonicalLabel: "胡屠户", firstSeenChapterNo: 3, lastSeenChapterNo: 3 },
      { id: candidates.zhang, canonicalLabel: "张乡绅", firstSeenChapterNo: 3, lastSeenChapterNo: 3 },
      { id: candidates.fanLaoYe, canonicalLabel: "范老爷", firstSeenChapterNo: 3, lastSeenChapterNo: 3 }
    ],
    identityClaims: [
      {
        id                : claims.idFanJinAccepted,
        chapterNo         : 3,
        mentionId         : "1c000000-0000-4000-8000-000000000001",
        personaCandidateId: candidates.fanJin,
        resolvedPersonaId : personas.fanJin,
        evidenceSpanIds   : [evidence.eventFanJin],
        reviewState       : "ACCEPTED",
        rationale         : "范进中举后的称谓仍指向范进"
      },
      {
        id                : claims.idHuAccepted,
        chapterNo         : 3,
        mentionId         : "1c000000-0000-4000-8000-000000000002",
        personaCandidateId: candidates.huTuhu,
        resolvedPersonaId : personas.huTuhu,
        evidenceSpanIds   : [evidence.relationHu],
        reviewState       : "ACCEPTED",
        rationale         : "胡屠户身份明确"
      },
      {
        id                : claims.idZhangAccepted,
        chapterNo         : 3,
        mentionId         : "1c000000-0000-4000-8000-000000000003",
        personaCandidateId: candidates.zhang,
        resolvedPersonaId : personas.zhang,
        evidenceSpanIds   : [evidence.relationZhang],
        reviewState       : "ACCEPTED",
        rationale         : "张乡绅身份明确"
      },
      {
        id                : claims.idFanLaoYeAccepted,
        chapterNo         : null,
        mentionId         : "1c000000-0000-4000-8000-000000000004",
        personaCandidateId: candidates.fanLaoYe,
        resolvedPersonaId : personas.fanLaoYe,
        evidenceSpanIds   : [evidence.idFanJin],
        reviewState       : "ACCEPTED",
        rationale         : "保留误建人物样本，供合并场景回归"
      },
      {
        id                : claims.idFanLaoYePending,
        chapterNo         : 3,
        mentionId         : "1c000000-0000-4000-8000-000000000005",
        personaCandidateId: candidates.fanLaoYe,
        resolvedPersonaId : personas.fanLaoYe,
        evidenceSpanIds   : [evidence.idFanJin],
        reviewState       : "PENDING",
        rationale         : "称谓变化被错误解析为新人物"
      }
    ],
    eventClaims: [{
      id                       : claims.eventFanJin,
      chapterNo                : 3,
      subjectPersonaCandidateId: candidates.fanJin,
      predicate                : "中举后社会身份骤变",
      evidenceSpanIds          : [evidence.eventFanJin],
      timeHintId               : claims.timeFanJin,
      eventCategory            : "EVENT"
    }],
    relationClaims: [
      {
        id                      : claims.relationHu,
        chapterNo               : 3,
        sourcePersonaCandidateId: candidates.huTuhu,
        targetPersonaCandidateId: candidates.fanJin,
        relationTypeKey         : "father_in_law_of",
        relationLabel           : "岳父",
        direction               : "FORWARD",
        effectiveChapterStart   : 3,
        effectiveChapterEnd     : 4,
        evidenceSpanIds         : [evidence.relationHu],
        timeHintId              : null,
        relationTypeSource      : "PRESET"
      },
      {
        id                      : claims.relationZhang,
        chapterNo               : 3,
        sourcePersonaCandidateId: candidates.zhang,
        targetPersonaCandidateId: candidates.fanJin,
        relationTypeKey         : "patron_of",
        relationLabel           : "拉拢",
        direction               : "FORWARD",
        effectiveChapterStart   : 3,
        effectiveChapterEnd     : 4,
        evidenceSpanIds         : [evidence.relationZhang],
        timeHintId              : null,
        relationTypeSource      : "CUSTOM"
      }
    ],
    timeClaims: [{
      id                 : claims.timeFanJin,
      chapterNo          : 3,
      rawTimeText        : "中举之后",
      normalizedLabel    : "范进中举后",
      relativeOrderWeight: 300,
      chapterRangeStart  : 3,
      chapterRangeEnd    : 4,
      evidenceSpanIds    : [evidence.timeFanJin],
      timeType           : "RELATIVE_PHASE"
    }]
  };
}

function buildSanguoYanyiSample(): SampleBookSeed {
  const personas = {
    liuBei    : "21000000-0000-4000-8000-000000000001",
    caoCao    : "21000000-0000-4000-8000-000000000002",
    zhugeLiang: "21000000-0000-4000-8000-000000000003"
  } as const;
  const candidates = {
    liuBei    : "22000000-0000-4000-8000-000000000001",
    caoCao    : "22000000-0000-4000-8000-000000000002",
    zhugeLiang: "22000000-0000-4000-8000-000000000003"
  } as const;
  const claims = {
    idLiuBei      : "23000000-0000-4000-8000-000000000001",
    idCaoCao      : "23000000-0000-4000-8000-000000000002",
    idZhugeLiang  : "23000000-0000-4000-8000-000000000003",
    eventLiuBei   : "24000000-0000-4000-8000-000000000001",
    eventZhuge    : "24000000-0000-4000-8000-000000000002",
    relationGuest : "25000000-0000-4000-8000-000000000001",
    relationRival : "25000000-0000-4000-8000-000000000002",
    relationPatron: "25000000-0000-4000-8000-000000000003",
    timeLiuBei    : "26000000-0000-4000-8000-000000000001",
    timeZhuge     : "26000000-0000-4000-8000-000000000002"
  } as const;
  const evidence = {
    eventLiuBei   : "27000000-0000-4000-8000-000000000001",
    relationGuest : "27000000-0000-4000-8000-000000000002",
    relationRival : "27000000-0000-4000-8000-000000000003",
    relationPatron: "27000000-0000-4000-8000-000000000004",
    timeLiuBei    : "27000000-0000-4000-8000-000000000005",
    timeZhuge     : "27000000-0000-4000-8000-000000000006",
    eventZhuge    : "27000000-0000-4000-8000-000000000007"
  } as const;
  const chapterIds = new Map<number, string>();
  for (let chapterNo = 21; chapterNo <= 43; chapterNo += 1) {
    chapterIds.set(
      chapterNo,
      `28000000-0000-4000-8000-${chapterNo.toString().padStart(12, "0")}`
    );
  }

  const chapters = Array.from({ length: 23 }, (_, index) => {
    const chapterNo = 21 + index;
    const chapterId = chapterIds.get(chapterNo);
    if (chapterId === undefined) {
      throw new Error(`Missing chapter id for ${chapterNo}`);
    }

    const contentByChapterNo: Record<number, string> = {
      21: [
        "玄德闻雷失箸以掩饰惊惧。",
        "玄德寄身曹操篱下。",
        "不数日曹操军至。"
      ].join("\n"),
      24: "刘备脱离曹操后分庭抗礼。",
      37: [
        "玄德三顾草庐请孔明。",
        "三顾之后。",
        "孔明出山辅佐刘备。"
      ].join("\n"),
      38: "孔明既出，刘备势成。",
      43: "第四十三回收束赤壁前夕形势。"
    };

    return {
      id     : chapterId,
      no     : chapterNo,
      content: contentByChapterNo[chapterNo] ?? `${formatChineseChapterTitle(chapterNo)}样本占位内容。`
    };
  });

  return {
    fixtureKey    : "sanguo-yanyi-sample",
    bookId        : SANGUO_BOOK_ID,
    title         : "三国演义",
    author        : "罗贯中",
    typeCode      : "HISTORICAL_NOVEL",
    baselineRunId : SANGUO_BASELINE_RUN_ID,
    candidateRunId: SANGUO_CANDIDATE_RUN_ID,
    chapters,
    evidenceSpecs : [
      {
        id          : evidence.eventLiuBei,
        chapterNo   : 21,
        segmentId   : "29000000-0000-4000-8000-000000000001",
        segmentIndex: 0,
        text        : "玄德闻雷失箸以掩饰惊惧。",
        snippet     : "玄德闻雷失箸以掩饰惊惧"
      },
      {
        id          : evidence.relationGuest,
        chapterNo   : 21,
        segmentId   : "29000000-0000-4000-8000-000000000002",
        segmentIndex: 1,
        text        : "玄德寄身曹操篱下。",
        snippet     : "玄德寄身曹操篱下"
      },
      {
        id          : evidence.timeLiuBei,
        chapterNo   : 21,
        segmentId   : "29000000-0000-4000-8000-000000000003",
        segmentIndex: 2,
        text        : "不数日曹操军至。",
        snippet     : "不数日曹操军至"
      },
      {
        id          : evidence.relationRival,
        chapterNo   : 24,
        segmentId   : "29000000-0000-4000-8000-000000000004",
        segmentIndex: 0,
        text        : "刘备脱离曹操后分庭抗礼。",
        snippet     : "刘备脱离曹操后分庭抗礼"
      },
      {
        id          : evidence.relationPatron,
        chapterNo   : 37,
        segmentId   : "29000000-0000-4000-8000-000000000005",
        segmentIndex: 0,
        text        : "玄德三顾草庐请孔明。",
        snippet     : "玄德三顾草庐请孔明"
      },
      {
        id          : evidence.timeZhuge,
        chapterNo   : 37,
        segmentId   : "29000000-0000-4000-8000-000000000006",
        segmentIndex: 1,
        text        : "三顾之后。",
        snippet     : "三顾之后"
      },
      {
        id          : evidence.eventZhuge,
        chapterNo   : 37,
        segmentId   : "29000000-0000-4000-8000-000000000007",
        segmentIndex: 2,
        text        : "孔明出山辅佐刘备。",
        snippet     : "孔明出山辅佐刘备"
      }
    ],
    personas: [
      { id: personas.liuBei, name: "刘备", aliases: ["玄德"], chapterNos: [21, 24, 37] },
      { id: personas.caoCao, name: "曹操", aliases: ["孟德"], chapterNos: [21, 24] },
      { id: personas.zhugeLiang, name: "诸葛亮", aliases: ["孔明"], chapterNos: [37, 38] }
    ],
    personaAliases: [
      { id: "2b000000-0000-4000-8000-000000000001", personaId: personas.liuBei, aliasText: "玄德" },
      { id: "2b000000-0000-4000-8000-000000000002", personaId: personas.caoCao, aliasText: "孟德" },
      { id: "2b000000-0000-4000-8000-000000000003", personaId: personas.zhugeLiang, aliasText: "孔明" }
    ],
    candidates: [
      { id: candidates.liuBei, canonicalLabel: "刘备", firstSeenChapterNo: 21, lastSeenChapterNo: 37 },
      { id: candidates.caoCao, canonicalLabel: "曹操", firstSeenChapterNo: 21, lastSeenChapterNo: 24 },
      { id: candidates.zhugeLiang, canonicalLabel: "诸葛亮", firstSeenChapterNo: 37, lastSeenChapterNo: 38 }
    ],
    identityClaims: [
      {
        id                : claims.idLiuBei,
        chapterNo         : 21,
        mentionId         : "2c000000-0000-4000-8000-000000000001",
        personaCandidateId: candidates.liuBei,
        resolvedPersonaId : personas.liuBei,
        evidenceSpanIds   : [evidence.eventLiuBei],
        reviewState       : "ACCEPTED",
        rationale         : "玄德即刘备"
      },
      {
        id                : claims.idCaoCao,
        chapterNo         : 21,
        mentionId         : "2c000000-0000-4000-8000-000000000002",
        personaCandidateId: candidates.caoCao,
        resolvedPersonaId : personas.caoCao,
        evidenceSpanIds   : [evidence.relationGuest],
        reviewState       : "ACCEPTED",
        rationale         : "孟德即曹操"
      },
      {
        id                : claims.idZhugeLiang,
        chapterNo         : 37,
        mentionId         : "2c000000-0000-4000-8000-000000000003",
        personaCandidateId: candidates.zhugeLiang,
        resolvedPersonaId : personas.zhugeLiang,
        evidenceSpanIds   : [evidence.relationPatron],
        reviewState       : "ACCEPTED",
        rationale         : "孔明即诸葛亮"
      }
    ],
    eventClaims: [
      {
        id                       : claims.eventLiuBei,
        chapterNo                : 21,
        subjectPersonaCandidateId: candidates.liuBei,
        predicate                : "青梅煮酒时隐藏志向",
        evidenceSpanIds          : [evidence.eventLiuBei],
        timeHintId               : claims.timeLiuBei,
        eventCategory            : "EVENT"
      },
      {
        id                       : claims.eventZhuge,
        chapterNo                : 37,
        subjectPersonaCandidateId: candidates.zhugeLiang,
        predicate                : "三顾茅庐后出山辅佐",
        evidenceSpanIds          : [evidence.eventZhuge],
        timeHintId               : claims.timeZhuge,
        eventCategory            : "EVENT"
      }
    ],
    relationClaims: [
      {
        id                      : claims.relationGuest,
        chapterNo               : 21,
        sourcePersonaCandidateId: candidates.liuBei,
        targetPersonaCandidateId: candidates.caoCao,
        relationTypeKey         : "guest_of",
        relationLabel           : "暂附",
        direction               : "FORWARD",
        effectiveChapterStart   : 21,
        effectiveChapterEnd     : 22,
        evidenceSpanIds         : [evidence.relationGuest],
        timeHintId              : null,
        relationTypeSource      : "PRESET"
      },
      {
        id                      : claims.relationRival,
        chapterNo               : 24,
        sourcePersonaCandidateId: candidates.liuBei,
        targetPersonaCandidateId: candidates.caoCao,
        relationTypeKey         : "rival_of",
        relationLabel           : "敌对",
        direction               : "BIDIRECTIONAL",
        effectiveChapterStart   : 24,
        effectiveChapterEnd     : 43,
        evidenceSpanIds         : [evidence.relationRival],
        timeHintId              : null,
        relationTypeSource      : "PRESET"
      },
      {
        id                      : claims.relationPatron,
        chapterNo               : 37,
        sourcePersonaCandidateId: candidates.liuBei,
        targetPersonaCandidateId: candidates.zhugeLiang,
        relationTypeKey         : "political_patron_of",
        relationLabel           : "礼聘",
        direction               : "FORWARD",
        effectiveChapterStart   : 37,
        effectiveChapterEnd     : 38,
        evidenceSpanIds         : [evidence.relationPatron],
        timeHintId              : null,
        relationTypeSource      : "PRESET"
      }
    ],
    timeClaims: [
      {
        id                 : claims.timeLiuBei,
        chapterNo          : 21,
        rawTimeText        : "不数日",
        normalizedLabel    : "徐州事变后不久",
        relativeOrderWeight: null,
        chapterRangeStart  : 21,
        chapterRangeEnd    : 22,
        evidenceSpanIds    : [evidence.timeLiuBei],
        timeType           : "RELATIVE_PHASE"
      },
      {
        id                 : claims.timeZhuge,
        chapterNo          : 37,
        rawTimeText        : "三顾之后",
        normalizedLabel    : "三顾茅庐后",
        relativeOrderWeight: 370,
        chapterRangeStart  : 37,
        chapterRangeEnd    : 38,
        evidenceSpanIds    : [evidence.timeZhuge],
        timeType           : "NAMED_EVENT"
      }
    ]
  };
}

function formatChineseChapterTitle(chapterNo: number): string {
  return `第${toChineseNumber(chapterNo)}回`;
}

function toChineseNumber(value: number): string {
  const digits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  if (value < 10) {
    return digits[value] ?? String(value);
  }
  if (value < 20) {
    const ones = value % 10;
    return ones === 0 ? "十" : `十${digits[ones]}`;
  }
  if (value < 100) {
    const tens = Math.floor(value / 10);
    const ones = value % 10;
    return ones === 0 ? `${digits[tens]}十` : `${digits[tens]}十${digits[ones]}`;
  }
  return String(value);
}
