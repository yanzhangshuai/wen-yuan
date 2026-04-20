import { prisma } from "@/server/db/prisma";
import type {
  StageBAliasClaimRow,
  StageBMentionRow,
  StageBPersonaCandidateSeed
} from "@/server/modules/analysis/pipelines/evidence-review/stageB/types";

const STAGE_B_READ_SOURCES = ["AI", "RULE"] as const;

interface StageBMentionRecord extends Omit<StageBMentionRow, "chapterNo"> {
  createdAt: Date;
}

interface StageBMentionDelegate {
  findMany(args: {
    where: {
      bookId: string;
      runId : string;
      source: { in: readonly ["AI", "RULE"] };
    };
    orderBy: { createdAt: "asc" };
    select : {
      id                 : true;
      bookId             : true;
      chapterId          : true;
      runId              : true;
      surfaceText        : true;
      mentionKind        : true;
      identityClaim      : true;
      aliasTypeHint      : true;
      suspectedResolvesTo: true;
      evidenceSpanId     : true;
      confidence         : true;
      source             : true;
      createdAt          : true;
    };
  }): Promise<StageBMentionRecord[]>;
}

interface StageBChapterDelegate {
  findMany(args: {
    where: {
      bookId: string;
      id    : { in: string[] };
    };
    select : {
      id: true;
      no: true;
    };
    orderBy: { no: "asc" };
  }): Promise<Array<{ id: string; no: number }>>;
}

interface StageBAliasClaimDelegate {
  findMany(args: {
    where: {
      bookId: string;
      runId : string;
      source: { in: readonly ["AI", "RULE"] };
    };
    orderBy: Array<{ chapterId: "asc" } | { createdAt: "asc" }>;
    select : Record<keyof StageBAliasClaimRow, true>;
  }): Promise<StageBAliasClaimRow[]>;
}

interface StageBPersonaCandidateCreateData {
  bookId            : string;
  canonicalLabel    : string;
  candidateStatus   : StageBPersonaCandidateSeed["candidateStatus"];
  firstSeenChapterNo: number | null;
  lastSeenChapterNo : number | null;
  mentionCount      : number;
  evidenceScore     : number;
  runId             : string;
}

interface StageBPersonaCandidateDelegate {
  deleteMany(args: {
    where: {
      bookId: string;
      runId : string;
    };
  }): Promise<{ count: number }>;
  create(args: {
    data  : StageBPersonaCandidateCreateData;
    select: { id: true };
  }): Promise<{ id: string }>;
}

export interface StageBRepositoryTransactionClient {
  entityMention   : StageBMentionDelegate;
  chapter         : StageBChapterDelegate;
  aliasClaim      : StageBAliasClaimDelegate;
  personaCandidate: StageBPersonaCandidateDelegate;
}

export interface StageBRepositoryClient extends StageBRepositoryTransactionClient {
  $transaction<T>(callback: (tx: StageBRepositoryTransactionClient) => Promise<T>): Promise<T>;
}

export interface StageBBookRunScope {
  bookId: string;
  runId : string;
}

export interface StageBCreatePersonaCandidateInput extends StageBPersonaCandidateSeed {
  bookId: string;
  runId : string;
}

export interface StageBRepository {
  listStageBMentions(scope: StageBBookRunScope): Promise<StageBMentionRow[]>;
  listStageBAliasClaims(scope: StageBBookRunScope): Promise<StageBAliasClaimRow[]>;
  clearPersonaCandidatesForRun(scope: StageBBookRunScope): Promise<void>;
  createPersonaCandidate(input: StageBCreatePersonaCandidateInput): Promise<{ id: string }>;
  transaction<T>(work: (repository: StageBRepository) => Promise<T>): Promise<T>;
}

function createMethods(tx: StageBRepositoryTransactionClient): Omit<StageBRepository, "transaction"> {
  return {
    async listStageBMentions(scope: StageBBookRunScope): Promise<StageBMentionRow[]> {
      const mentions = await tx.entityMention.findMany({
        where: {
          bookId: scope.bookId,
          runId : scope.runId,
          source: { in: STAGE_B_READ_SOURCES }
        },
        orderBy: { createdAt: "asc" },
        select : {
          id                 : true,
          bookId             : true,
          chapterId          : true,
          runId              : true,
          surfaceText        : true,
          mentionKind        : true,
          identityClaim      : true,
          aliasTypeHint      : true,
          suspectedResolvesTo: true,
          evidenceSpanId     : true,
          confidence         : true,
          source             : true,
          createdAt          : true
        }
      });

      if (mentions.length === 0) {
        return [];
      }

      const chapterRows = await tx.chapter.findMany({
        where: {
          bookId: scope.bookId,
          id    : { in: Array.from(new Set(mentions.map((row) => row.chapterId))) }
        },
        select : { id: true, no: true },
        orderBy: { no: "asc" }
      });
      const chapterNoById = new Map(chapterRows.map((row) => [row.id, row.no]));

      return mentions
        .map((row) => {
          const chapterNo = chapterNoById.get(row.chapterId);
          if (chapterNo === undefined) {
            throw new Error(`Missing chapter no for chapterId=${row.chapterId}`);
          }

          return {
            id                 : row.id,
            bookId             : row.bookId,
            chapterId          : row.chapterId,
            chapterNo,
            runId              : row.runId,
            surfaceText        : row.surfaceText,
            mentionKind        : row.mentionKind,
            identityClaim      : row.identityClaim,
            aliasTypeHint      : row.aliasTypeHint,
            suspectedResolvesTo: row.suspectedResolvesTo,
            evidenceSpanId     : row.evidenceSpanId,
            confidence         : row.confidence,
            source             : row.source,
            createdAt          : row.createdAt
          };
        })
        .sort((left, right) => {
          if (left.chapterNo !== right.chapterNo) {
            return left.chapterNo - right.chapterNo;
          }

          return left.createdAt.getTime() - right.createdAt.getTime();
        })
        .map(({ createdAt: _createdAt, ...row }) => row);
    },

    listStageBAliasClaims(scope: StageBBookRunScope): Promise<StageBAliasClaimRow[]> {
      return tx.aliasClaim.findMany({
        where: {
          bookId: scope.bookId,
          runId : scope.runId,
          source: { in: STAGE_B_READ_SOURCES }
        },
        orderBy: [{ chapterId: "asc" }, { createdAt: "asc" }],
        select : {
          id             : true,
          bookId         : true,
          chapterId      : true,
          runId          : true,
          aliasText      : true,
          aliasType      : true,
          claimKind      : true,
          evidenceSpanIds: true,
          confidence     : true,
          reviewState    : true,
          source         : true,
          reviewNote     : true
        }
      });
    },

    async clearPersonaCandidatesForRun(scope: StageBBookRunScope): Promise<void> {
      await tx.personaCandidate.deleteMany({
        where: {
          bookId: scope.bookId,
          runId : scope.runId
        }
      });
    },

    createPersonaCandidate(input: StageBCreatePersonaCandidateInput): Promise<{ id: string }> {
      return tx.personaCandidate.create({
        data: {
          bookId            : input.bookId,
          runId             : input.runId,
          canonicalLabel    : input.canonicalLabel,
          candidateStatus   : input.candidateStatus,
          firstSeenChapterNo: input.firstSeenChapterNo,
          lastSeenChapterNo : input.lastSeenChapterNo,
          mentionCount      : input.mentionCount,
          evidenceScore     : input.evidenceScore
        },
        select: { id: true }
      });
    }
  };
}

function createStageBRepositoryFromTransaction(tx: StageBRepositoryTransactionClient): StageBRepository {
  const methods = createMethods(tx);

  return {
    ...methods,
    transaction: async <T>(work: (repository: StageBRepository) => Promise<T>): Promise<T> =>
      work(createStageBRepositoryFromTransaction(tx))
  };
}

function hasTransaction(client: StageBRepositoryClient | StageBRepositoryTransactionClient): client is StageBRepositoryClient {
  return "$transaction" in client;
}

export function createStageBRepository(
  client: StageBRepositoryClient | StageBRepositoryTransactionClient =
    prisma as unknown as StageBRepositoryClient
): StageBRepository {
  const methods = createMethods(client);

  if (!hasTransaction(client)) {
    return {
      ...methods,
      transaction: async <T>(work: (repository: StageBRepository) => Promise<T>): Promise<T> =>
        work(createStageBRepositoryFromTransaction(client))
    };
  }

  return {
    ...methods,
    transaction: async <T>(work: (repository: StageBRepository) => Promise<T>): Promise<T> =>
      client.$transaction(async (tx) => work(createStageBRepositoryFromTransaction(tx)))
  };
}

export const stageBRepository = createStageBRepository();
