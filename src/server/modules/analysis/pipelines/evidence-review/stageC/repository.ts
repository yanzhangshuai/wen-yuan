import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import type {
  StageCConflictFlagRow,
  StageCEventClaimRow,
  StageCPersonaCandidateRow,
  StageCRelationClaimRow,
  StageCRepositoryPayload,
  StageCTimeClaimRow
} from "@/server/modules/analysis/pipelines/evidence-review/stageC/types";

const READ_SOURCES: ["AI", "RULE"] = ["AI", "RULE"];
const CONFLICT_FLAG_READ_SOURCES: ["RULE"] = ["RULE"];

interface ChapterRow {
  id: string;
  no: number;
}

type StageCEventClaimRecord = Omit<StageCEventClaimRow, "chapterNo"> & { createdAt: Date };
type StageCRelationClaimRecord = Omit<StageCRelationClaimRow, "chapterNo"> & { createdAt: Date };
type StageCTimeClaimRecord = Omit<StageCTimeClaimRow, "chapterNo"> & { createdAt: Date };
type StageCConflictFlagRecord = StageCConflictFlagRow & { createdAt: Date };

export interface StageCRepositoryTransactionClient {
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
    }): Promise<StageCPersonaCandidateRow[]>;
  };
  eventClaim: {
    findMany(args: {
      where: {
        bookId            : string;
        runId             : string;
        source            : { in: typeof READ_SOURCES };
        derivedFromClaimId: null;
      };
      orderBy: Array<{ chapterId: "asc" } | { createdAt: "asc" }>;
      select: {
        id                       : true;
        bookId                   : true;
        chapterId                : true;
        runId                    : true;
        subjectMentionId         : true;
        subjectPersonaCandidateId: true;
        predicate                : true;
        objectText               : true;
        objectPersonaCandidateId : true;
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
    }): Promise<StageCEventClaimRecord[]>;
  };
  relationClaim: {
    findMany(args: {
      where: {
        bookId            : string;
        runId             : string;
        source            : { in: typeof READ_SOURCES };
        derivedFromClaimId: null;
      };
      orderBy: Array<{ chapterId: "asc" } | { createdAt: "asc" }>;
      select: {
        id                      : true;
        bookId                  : true;
        chapterId               : true;
        runId                   : true;
        sourceMentionId         : true;
        targetMentionId         : true;
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
    }): Promise<StageCRelationClaimRecord[]>;
  };
  timeClaim: {
    findMany(args: {
      where: {
        bookId            : string;
        runId             : string;
        source            : { in: typeof READ_SOURCES };
        derivedFromClaimId: null;
      };
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
    }): Promise<StageCTimeClaimRecord[]>;
  };
  conflictFlag: {
    findMany(args: {
      where  : { bookId: string; runId: string; source: { in: typeof CONFLICT_FLAG_READ_SOURCES } };
      orderBy: Array<{ chapterId: "asc" } | { createdAt: "asc" }>;
      select: {
        id                        : true;
        bookId                    : true;
        chapterId                 : true;
        runId                     : true;
        conflictType              : true;
        severity                  : true;
        relatedClaimKind          : true;
        relatedClaimIds           : true;
        relatedPersonaCandidateIds: true;
        relatedChapterIds         : true;
        evidenceSpanIds           : true;
        reviewState               : true;
        source                    : true;
        createdAt                 : true;
      };
    }): Promise<StageCConflictFlagRecord[]>;
  };
}

export interface StageCRepositoryClient extends StageCRepositoryTransactionClient {
  $transaction<T>(callback: (tx: StageCRepositoryTransactionClient) => Promise<T>): Promise<T>;
}

type StageCPrismaSource = PrismaClient | Prisma.TransactionClient;

function createPrismaTransactionClient(source: StageCPrismaSource): StageCRepositoryTransactionClient {
  return {
    chapter: {
      findMany: async (args) => await source.chapter.findMany(args)
    },
    personaCandidate: {
      findMany: async (args) => await source.personaCandidate.findMany(args)
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
    conflictFlag: {
      findMany: async (args) => await source.conflictFlag.findMany(args)
    }
  };
}

function createPrismaRepositoryClient(client: PrismaClient): StageCRepositoryClient {
  return {
    ...createPrismaTransactionClient(client),
    $transaction: async <T>(callback: (tx: StageCRepositoryTransactionClient) => Promise<T>): Promise<T> =>
      await client.$transaction(async (tx) => callback(createPrismaTransactionClient(tx)))
  };
}

export interface StageCBookRunScope {
  bookId: string;
  runId : string;
}

export interface StageCRepository {
  loadFactAttributionInputs(scope: StageCBookRunScope): Promise<StageCRepositoryPayload>;
  transaction<T>(work: (repository: StageCRepository) => Promise<T>): Promise<T>;
}

function resolveRequiredChapterNo(chapterId: string, chapterNoById: Map<string, number>): number {
  const chapterNo = chapterNoById.get(chapterId);
  if (chapterNo === undefined) {
    throw new Error(`Missing chapter no for chapterId=${chapterId}`);
  }

  return chapterNo;
}

function mapEventClaimRows(
  rows: StageCEventClaimRecord[],
  chapterNoById: Map<string, number>
): StageCEventClaimRow[] {
  return rows.map(({ createdAt: _createdAt, ...row }) => ({
    ...row,
    chapterNo: resolveRequiredChapterNo(row.chapterId, chapterNoById)
  }));
}

function mapRelationClaimRows(
  rows: StageCRelationClaimRecord[],
  chapterNoById: Map<string, number>
): StageCRelationClaimRow[] {
  return rows.map(({ createdAt: _createdAt, ...row }) => ({
    ...row,
    chapterNo: resolveRequiredChapterNo(row.chapterId, chapterNoById)
  }));
}

function mapTimeClaimRows(
  rows: StageCTimeClaimRecord[],
  chapterNoById: Map<string, number>
): StageCTimeClaimRow[] {
  return rows.map(({ createdAt: _createdAt, ...row }) => ({
    ...row,
    chapterNo: resolveRequiredChapterNo(row.chapterId, chapterNoById)
  }));
}

function mapConflictFlagRows(rows: StageCConflictFlagRecord[]): StageCConflictFlagRow[] {
  return rows.map(({ createdAt: _createdAt, ...row }) => row);
}

function collectChapterIds(rows: Array<{ chapterId: string }>): string[] {
  return Array.from(new Set(rows.map((row) => row.chapterId)));
}

function createMethods(tx: StageCRepositoryTransactionClient): Omit<StageCRepository, "transaction"> {
  return {
    async loadFactAttributionInputs(scope: StageCBookRunScope): Promise<StageCRepositoryPayload> {
      const [
        personaCandidates,
        eventClaims,
        relationClaims,
        timeClaims,
        conflictFlags
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
        tx.eventClaim.findMany({
          where: {
            bookId            : scope.bookId,
            runId             : scope.runId,
            source            : { in: READ_SOURCES },
            derivedFromClaimId: null
          },
          orderBy: [{ chapterId: "asc" }, { createdAt: "asc" }],
          select : {
            id                       : true,
            bookId                   : true,
            chapterId                : true,
            runId                    : true,
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
            derivedFromClaimId       : true,
            reviewNote               : true,
            createdAt                : true
          }
        }),
        tx.relationClaim.findMany({
          where: {
            bookId            : scope.bookId,
            runId             : scope.runId,
            source            : { in: READ_SOURCES },
            derivedFromClaimId: null
          },
          orderBy: [{ chapterId: "asc" }, { createdAt: "asc" }],
          select : {
            id                      : true,
            bookId                  : true,
            chapterId               : true,
            runId                   : true,
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
            derivedFromClaimId      : true,
            reviewNote              : true,
            createdAt               : true
          }
        }),
        tx.timeClaim.findMany({
          where: {
            bookId            : scope.bookId,
            runId             : scope.runId,
            source            : { in: READ_SOURCES },
            derivedFromClaimId: null
          },
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
        tx.conflictFlag.findMany({
          where  : { bookId: scope.bookId, runId: scope.runId, source: { in: CONFLICT_FLAG_READ_SOURCES } },
          orderBy: [{ chapterId: "asc" }, { createdAt: "asc" }],
          select : {
            id                        : true,
            bookId                    : true,
            chapterId                 : true,
            runId                     : true,
            conflictType              : true,
            severity                  : true,
            relatedClaimKind          : true,
            relatedClaimIds           : true,
            relatedPersonaCandidateIds: true,
            relatedChapterIds         : true,
            evidenceSpanIds           : true,
            reviewState               : true,
            source                    : true,
            createdAt                 : true
          }
        })
      ]);

      const chapterIds = Array.from(new Set([
        ...collectChapterIds(eventClaims),
        ...collectChapterIds(relationClaims),
        ...collectChapterIds(timeClaims)
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
        eventClaims   : mapEventClaimRows(eventClaims, chapterNoById),
        relationClaims: mapRelationClaimRows(relationClaims, chapterNoById),
        timeClaims    : mapTimeClaimRows(timeClaims, chapterNoById),
        conflictFlags : mapConflictFlagRows(conflictFlags)
      };
    }
  };
}

function createRepositoryFromTransaction(tx: StageCRepositoryTransactionClient): StageCRepository {
  const methods = createMethods(tx);

  return {
    ...methods,
    transaction: async <T>(work: (repository: StageCRepository) => Promise<T>): Promise<T> =>
      work(createRepositoryFromTransaction(tx))
  };
}

function hasTransaction(client: StageCRepositoryClient | StageCRepositoryTransactionClient): client is StageCRepositoryClient {
  return "$transaction" in client;
}

/**
 * Creates the Stage C read repository for deterministic fact attribution.
 * It reads only root claims so reruns never feed previously derived Stage C rows
 * back into the attribution step.
 */
export function createStageCRepository(
  client: StageCRepositoryClient | StageCRepositoryTransactionClient = createPrismaRepositoryClient(prisma)
): StageCRepository {
  const methods = createMethods(client);

  if (!hasTransaction(client)) {
    return {
      ...methods,
      transaction: async <T>(work: (repository: StageCRepository) => Promise<T>): Promise<T> =>
        work(createRepositoryFromTransaction(client))
    };
  }

  return {
    ...methods,
    transaction: async <T>(work: (repository: StageCRepository) => Promise<T>): Promise<T> =>
      client.$transaction(async (tx) => work(createRepositoryFromTransaction(tx)))
  };
}

export const stageCRepository = createStageCRepository();
