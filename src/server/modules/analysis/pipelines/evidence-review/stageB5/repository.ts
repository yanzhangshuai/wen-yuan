import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import type {
  StageB5AliasClaimRow,
  StageB5EventClaimRow,
  StageB5IdentityResolutionClaimRow,
  StageB5PersonaCandidateRow,
  StageB5RelationClaimRow,
  StageB5RepositoryPayload,
  StageB5TimeClaimRow
} from "@/server/modules/analysis/pipelines/evidence-review/stageB5/types";

const READ_SOURCES: ["AI", "RULE"] = ["AI", "RULE"];
const IDENTITY_RESOLUTION_READ_SOURCES: ["AI"] = ["AI"];

interface ChapterRow {
  id: string;
  no: number;
}

type StageB5AliasClaimRecord = Omit<StageB5AliasClaimRow, "chapterNo"> & { createdAt: Date };
type StageB5EventClaimRecord = Omit<StageB5EventClaimRow, "chapterNo"> & { createdAt: Date };
type StageB5RelationClaimRecord = Omit<StageB5RelationClaimRow, "chapterNo"> & { createdAt: Date };
type StageB5TimeClaimRecord = Omit<StageB5TimeClaimRow, "chapterNo"> & { createdAt: Date };
type StageB5IdentityResolutionClaimRecord = Omit<StageB5IdentityResolutionClaimRow, "chapterNo"> & { createdAt: Date };

export interface StageB5RepositoryTransactionClient {
  chapter: {
    findMany(args: {
      where  : { bookId: string; id: { in: string[] } };
      select : { id: true; no: true };
      orderBy: { no: "asc" };
    }): Promise<ChapterRow[]>;
  };
  personaCandidate: {
    findMany(args: {
      where  : { bookId: string; runId: string };
      orderBy: { canonicalLabel: "asc" };
      select: {
        id                : true;
        bookId            : true;
        runId             : true;
        canonicalLabel    : true;
        firstSeenChapterNo: true;
        lastSeenChapterNo : true;
        mentionCount      : true;
        evidenceScore     : true;
      };
    }): Promise<StageB5PersonaCandidateRow[]>;
  };
  aliasClaim: {
    findMany(args: {
      where  : { bookId: string; runId: string; source: { in: typeof READ_SOURCES } };
      orderBy: Array<{ chapterId: "asc" } | { createdAt: "asc" }>;
      select: {
        id             : true;
        bookId         : true;
        chapterId      : true;
        runId          : true;
        aliasText      : true;
        claimKind      : true;
        evidenceSpanIds: true;
        confidence     : true;
        reviewState    : true;
        source         : true;
        reviewNote     : true;
        createdAt      : true;
      };
    }): Promise<StageB5AliasClaimRecord[]>;
  };
  eventClaim: {
    findMany(args: {
      where  : { bookId: string; runId: string; source: { in: typeof READ_SOURCES } };
      orderBy: Array<{ chapterId: "asc" } | { createdAt: "asc" }>;
      select: {
        id                       : true;
        bookId                   : true;
        chapterId                : true;
        runId                    : true;
        subjectPersonaCandidateId: true;
        objectPersonaCandidateId : true;
        predicate                : true;
        objectText               : true;
        locationText             : true;
        timeHintId               : true;
        eventCategory            : true;
        narrativeLens            : true;
        evidenceSpanIds          : true;
        confidence               : true;
        reviewState              : true;
        source                   : true;
        derivedFromClaimId       : true;
        reviewNote               : true;
        createdAt                : true;
      };
    }): Promise<StageB5EventClaimRecord[]>;
  };
  relationClaim: {
    findMany(args: {
      where  : { bookId: string; runId: string; source: { in: typeof READ_SOURCES } };
      orderBy: Array<{ chapterId: "asc" } | { createdAt: "asc" }>;
      select: {
        id                      : true;
        bookId                  : true;
        chapterId               : true;
        runId                   : true;
        sourcePersonaCandidateId: true;
        targetPersonaCandidateId: true;
        relationTypeKey         : true;
        relationLabel           : true;
        relationTypeSource      : true;
        direction               : true;
        effectiveChapterStart   : true;
        effectiveChapterEnd     : true;
        timeHintId              : true;
        evidenceSpanIds         : true;
        confidence              : true;
        reviewState             : true;
        source                  : true;
        derivedFromClaimId      : true;
        reviewNote              : true;
        createdAt               : true;
      };
    }): Promise<StageB5RelationClaimRecord[]>;
  };
  timeClaim: {
    findMany(args: {
      where  : { bookId: string; runId: string; source: { in: typeof READ_SOURCES } };
      orderBy: Array<{ chapterId: "asc" } | { createdAt: "asc" }>;
      select: {
        id                 : true;
        bookId             : true;
        chapterId          : true;
        runId              : true;
        rawTimeText        : true;
        timeType           : true;
        normalizedLabel    : true;
        relativeOrderWeight: true;
        chapterRangeStart  : true;
        chapterRangeEnd    : true;
        evidenceSpanIds    : true;
        confidence         : true;
        reviewState        : true;
        source             : true;
        derivedFromClaimId : true;
        reviewNote         : true;
        createdAt          : true;
      };
    }): Promise<StageB5TimeClaimRecord[]>;
  };
  identityResolutionClaim: {
    findMany(args: {
      where  : { bookId: string; runId: string; source: { in: typeof IDENTITY_RESOLUTION_READ_SOURCES } };
      orderBy: Array<{ chapterId: "asc" } | { createdAt: "asc" }>;
      select: {
        id                : true;
        bookId            : true;
        chapterId         : true;
        runId             : true;
        mentionId         : true;
        personaCandidateId: true;
        resolutionKind    : true;
        rationale         : true;
        evidenceSpanIds   : true;
        confidence        : true;
        reviewState       : true;
        source            : true;
        reviewNote        : true;
        createdAt         : true;
      };
    }): Promise<StageB5IdentityResolutionClaimRecord[]>;
  };
}

export interface StageB5RepositoryClient extends StageB5RepositoryTransactionClient {
  $transaction<T>(callback: (tx: StageB5RepositoryTransactionClient) => Promise<T>): Promise<T>;
}

type StageB5PrismaSource = PrismaClient | Prisma.TransactionClient;

function createPrismaTransactionClient(source: StageB5PrismaSource): StageB5RepositoryTransactionClient {
  return {
    chapter: {
      findMany: async (args) => await source.chapter.findMany(args)
    },
    personaCandidate: {
      findMany: async (args) => await source.personaCandidate.findMany(args)
    },
    aliasClaim: {
      findMany: async (args) => await source.aliasClaim.findMany(args)
    },
    eventClaim: {
      findMany: async (args) => await source.eventClaim.findMany(args)
    },
    relationClaim: {
      findMany: async (args) => await source.relationClaim.findMany(args)
    },
    timeClaim: {
      findMany: async (args) => await source.timeClaim.findMany(args)
    },
    identityResolutionClaim: {
      findMany: async (args) => await source.identityResolutionClaim.findMany(args)
    }
  };
}

function createPrismaRepositoryClient(client: PrismaClient): StageB5RepositoryClient {
  return {
    ...createPrismaTransactionClient(client),
    $transaction: async <T>(callback: (tx: StageB5RepositoryTransactionClient) => Promise<T>): Promise<T> =>
      await client.$transaction(async (tx) => callback(createPrismaTransactionClient(tx)))
  };
}

export interface StageB5BookRunScope {
  bookId: string;
  runId : string;
}

export interface StageB5Repository {
  loadConflictInputs(scope: StageB5BookRunScope): Promise<StageB5RepositoryPayload>;
  transaction<T>(work: (repository: StageB5Repository) => Promise<T>): Promise<T>;
}

function resolveRequiredChapterNo(chapterId: string, chapterNoById: Map<string, number>): number {
  const chapterNo = chapterNoById.get(chapterId);
  if (chapterNo === undefined) {
    throw new Error(`Missing chapter no for chapterId=${chapterId}`);
  }

  return chapterNo;
}

function resolveOptionalChapterNo(chapterId: string | null, chapterNoById: Map<string, number>): number | null {
  if (chapterId === null) {
    return null;
  }

  return chapterNoById.get(chapterId) ?? null;
}

function mapAliasClaimRows(
  rows: StageB5AliasClaimRecord[],
  chapterNoById: Map<string, number>
): StageB5AliasClaimRow[] {
  return rows.map(({ createdAt: _createdAt, ...row }) => ({
    ...row,
    chapterNo: resolveOptionalChapterNo(row.chapterId, chapterNoById)
  }));
}

function mapEventClaimRows(
  rows: StageB5EventClaimRecord[],
  chapterNoById: Map<string, number>
): StageB5EventClaimRow[] {
  return rows.map(({ createdAt: _createdAt, ...row }) => ({
    ...row,
    chapterNo: resolveRequiredChapterNo(row.chapterId, chapterNoById)
  }));
}

function mapRelationClaimRows(
  rows: StageB5RelationClaimRecord[],
  chapterNoById: Map<string, number>
): StageB5RelationClaimRow[] {
  return rows.map(({ createdAt: _createdAt, ...row }) => ({
    ...row,
    chapterNo: resolveRequiredChapterNo(row.chapterId, chapterNoById)
  }));
}

function mapTimeClaimRows(
  rows: StageB5TimeClaimRecord[],
  chapterNoById: Map<string, number>
): StageB5TimeClaimRow[] {
  return rows.map(({ createdAt: _createdAt, ...row }) => ({
    ...row,
    chapterNo: resolveRequiredChapterNo(row.chapterId, chapterNoById)
  }));
}

function mapIdentityResolutionClaimRows(
  rows: StageB5IdentityResolutionClaimRecord[],
  chapterNoById: Map<string, number>
): StageB5IdentityResolutionClaimRow[] {
  return rows.map(({ createdAt: _createdAt, ...row }) => ({
    ...row,
    chapterNo: resolveOptionalChapterNo(row.chapterId, chapterNoById)
  }));
}

function collectChapterIds(rows: Array<{ chapterId: string | null }>): string[] {
  return Array.from(new Set(
    rows
      .map((row) => row.chapterId)
      .filter((chapterId): chapterId is string => chapterId !== null)
  ));
}

function createMethods(tx: StageB5RepositoryTransactionClient): Omit<StageB5Repository, "transaction"> {
  return {
    async loadConflictInputs(scope: StageB5BookRunScope): Promise<StageB5RepositoryPayload> {
      const [
        personaCandidates,
        aliasClaims,
        eventClaims,
        relationClaims,
        timeClaims,
        identityResolutionClaims
      ] = await Promise.all([
        tx.personaCandidate.findMany({
          where  : { bookId: scope.bookId, runId: scope.runId },
          orderBy: { canonicalLabel: "asc" },
          select : {
            id                : true,
            bookId            : true,
            runId             : true,
            canonicalLabel    : true,
            firstSeenChapterNo: true,
            lastSeenChapterNo : true,
            mentionCount      : true,
            evidenceScore     : true
          }
        }),
        tx.aliasClaim.findMany({
          where  : { bookId: scope.bookId, runId: scope.runId, source: { in: READ_SOURCES } },
          orderBy: [{ chapterId: "asc" }, { createdAt: "asc" }],
          select : {
            id             : true,
            bookId         : true,
            chapterId      : true,
            runId          : true,
            aliasText      : true,
            claimKind      : true,
            evidenceSpanIds: true,
            confidence     : true,
            reviewState    : true,
            source         : true,
            reviewNote     : true,
            createdAt      : true
          }
        }),
        tx.eventClaim.findMany({
          where  : { bookId: scope.bookId, runId: scope.runId, source: { in: READ_SOURCES } },
          orderBy: [{ chapterId: "asc" }, { createdAt: "asc" }],
          select : {
            id                       : true,
            bookId                   : true,
            chapterId                : true,
            runId                    : true,
            subjectPersonaCandidateId: true,
            objectPersonaCandidateId : true,
            predicate                : true,
            objectText               : true,
            locationText             : true,
            timeHintId               : true,
            eventCategory            : true,
            narrativeLens            : true,
            evidenceSpanIds          : true,
            confidence               : true,
            reviewState              : true,
            source                   : true,
            derivedFromClaimId       : true,
            reviewNote               : true,
            createdAt                : true
          }
        }),
        tx.relationClaim.findMany({
          where  : { bookId: scope.bookId, runId: scope.runId, source: { in: READ_SOURCES } },
          orderBy: [{ chapterId: "asc" }, { createdAt: "asc" }],
          select : {
            id                      : true,
            bookId                  : true,
            chapterId               : true,
            runId                   : true,
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
            derivedFromClaimId      : true,
            reviewNote              : true,
            createdAt               : true
          }
        }),
        tx.timeClaim.findMany({
          where  : { bookId: scope.bookId, runId: scope.runId, source: { in: READ_SOURCES } },
          orderBy: [{ chapterId: "asc" }, { createdAt: "asc" }],
          select : {
            id                 : true,
            bookId             : true,
            chapterId          : true,
            runId              : true,
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
            derivedFromClaimId : true,
            reviewNote         : true,
            createdAt          : true
          }
        }),
        tx.identityResolutionClaim.findMany({
          where: {
            bookId: scope.bookId,
            runId : scope.runId,
            source: { in: IDENTITY_RESOLUTION_READ_SOURCES }
          },
          orderBy: [{ chapterId: "asc" }, { createdAt: "asc" }],
          select : {
            id                : true,
            bookId            : true,
            chapterId         : true,
            runId             : true,
            mentionId         : true,
            personaCandidateId: true,
            resolutionKind    : true,
            rationale         : true,
            evidenceSpanIds   : true,
            confidence        : true,
            reviewState       : true,
            source            : true,
            reviewNote        : true,
            createdAt         : true
          }
        })
      ]);

      const chapterIds = Array.from(new Set([
        ...collectChapterIds(aliasClaims),
        ...collectChapterIds(eventClaims),
        ...collectChapterIds(relationClaims),
        ...collectChapterIds(timeClaims),
        ...collectChapterIds(identityResolutionClaims)
      ]));
      const chapterRows = chapterIds.length === 0
        ? []
        : await tx.chapter.findMany({
          where  : { bookId: scope.bookId, id: { in: chapterIds } },
          select : { id: true, no: true },
          orderBy: { no: "asc" }
        });
      const chapterNoById = new Map(chapterRows.map((row) => [row.id, row.no]));

      return {
        personaCandidates,
        aliasClaims             : mapAliasClaimRows(aliasClaims, chapterNoById),
        eventClaims             : mapEventClaimRows(eventClaims, chapterNoById),
        relationClaims          : mapRelationClaimRows(relationClaims, chapterNoById),
        timeClaims              : mapTimeClaimRows(timeClaims, chapterNoById),
        identityResolutionClaims: mapIdentityResolutionClaimRows(identityResolutionClaims, chapterNoById)
      };
    }
  };
}

function createRepositoryFromTransaction(tx: StageB5RepositoryTransactionClient): StageB5Repository {
  const methods = createMethods(tx);

  return {
    ...methods,
    transaction: async <T>(work: (repository: StageB5Repository) => Promise<T>): Promise<T> =>
      work(createRepositoryFromTransaction(tx))
  };
}

function hasTransaction(client: StageB5RepositoryClient | StageB5RepositoryTransactionClient): client is StageB5RepositoryClient {
  return "$transaction" in client;
}

/**
 * Creates the Stage B.5 read repository for whole-book conflict detection.
 * The repository is read-only here; later persistence stays in a separate module.
 */
export function createStageB5Repository(
  client: StageB5RepositoryClient | StageB5RepositoryTransactionClient = createPrismaRepositoryClient(prisma)
): StageB5Repository {
  const methods = createMethods(client);

  if (!hasTransaction(client)) {
    return {
      ...methods,
      transaction: async <T>(work: (repository: StageB5Repository) => Promise<T>): Promise<T> =>
        work(createRepositoryFromTransaction(client))
    };
  }

  return {
    ...methods,
    transaction: async <T>(work: (repository: StageB5Repository) => Promise<T>): Promise<T> =>
      client.$transaction(async (tx) => work(createRepositoryFromTransaction(tx)))
  };
}

export const stageB5Repository = createStageB5Repository();
