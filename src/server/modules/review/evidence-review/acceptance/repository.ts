import { prisma } from "@/server/db/prisma";
import type { ClaimReviewState } from "@/server/modules/review/evidence-review/review-state";
import type { ReviewableClaimFamily } from "@/server/modules/analysis/claims/claim-schemas";
import { createKnowledgeRepository } from "@/server/modules/knowledge-v2/repository";
import { createRelationTypeCatalogLoader } from "@/server/modules/knowledge-v2/relation-types";
import {
  reviewQueryService,
  type GetReviewClaimDetailInput,
  type ReviewClaimDetailDto
} from "@/server/modules/review/evidence-review/review-query-service";

const ACCEPTANCE_CLAIM_FAMILIES: ReviewableClaimFamily[] = [
  "EVENT",
  "RELATION",
  "TIME",
  "IDENTITY_RESOLUTION"
];

const CLAIM_PAGE_SIZE = 200;

interface AcceptanceBookLookupRecord {
  id         : string;
  title      : string;
  bookTypeKey: string | null;
}

export interface AcceptanceClaimDetail {
  claimKind  : ReviewableClaimFamily;
  claimId    : string;
  reviewState: ClaimReviewState;
  evidence   : Array<{
    id         : string;
    chapterId  : string;
    quotedText : string;
    startOffset: number | null;
    endOffset  : number | null;
  }>;
}

export interface AcceptanceBookContext {
  book            : Pick<AcceptanceBookLookupRecord, "id" | "title">;
  claimDetails    : AcceptanceClaimDetail[];
  auditActions    : string[];
  projectionCounts: {
    personaChapterFacts: number;
    personaTimeFacts   : number;
    relationshipEdges  : number;
    timelineEvents     : number;
  };
  relationCatalogAvailable: boolean;
  routes                  : {
    personaChapter: string;
    relationEditor: string;
    personaTime   : string;
  };
}

interface AcceptanceClaimSummary {
  claimKind: ReviewableClaimFamily;
  claimId  : string;
}

interface AcceptanceBookLookup {
  findById(id: string): Promise<AcceptanceBookLookupRecord | null>;
  findByTitle(title: string): Promise<AcceptanceBookLookupRecord | null>;
}

interface AcceptanceReviewQuery {
  listReviewClaims(bookId: string): Promise<AcceptanceClaimSummary[]>;
  getClaimDetail(input: GetReviewClaimDetailInput): Promise<Pick<
    ReviewClaimDetailDto,
    "claim" | "evidence"
  > | null>;
}

interface AcceptanceAuditQuery {
  listActions(bookId: string): Promise<string[]>;
}

interface AcceptanceProjectionQuery {
  getCounts(bookId: string): Promise<AcceptanceBookContext["projectionCounts"]>;
}

interface AcceptanceRelationCatalog {
  hasEntry(bookId: string, bookTypeKey: string | null): Promise<boolean>;
}

export interface AcceptanceRepositoryDependencies {
  prismaClient?   : typeof prisma;
  bookLookup?     : AcceptanceBookLookup;
  reviewQuery?    : AcceptanceReviewQuery;
  auditQuery?     : AcceptanceAuditQuery;
  projectionQuery?: AcceptanceProjectionQuery;
  relationCatalog?: AcceptanceRelationCatalog;
}

type DefaultBookLookupRecord = {
  id      : string;
  title   : string;
  bookType: {
    key: string;
  } | null;
};

function buildReviewRoutes(bookId: string): AcceptanceBookContext["routes"] {
  return {
    personaChapter: `/admin/review/${bookId}`,
    relationEditor: `/admin/review/${bookId}/relations`,
    personaTime   : `/admin/review/${bookId}/time`
  };
}

function createDefaultBookLookup(prismaClient: typeof prisma): AcceptanceBookLookup {
  return {
    async findById(id: string) {
      const book = await prismaClient.book.findFirst({
        where: {
          id,
          deletedAt: null
        },
        select: {
          id      : true,
          title   : true,
          bookType: {
            select: {
              key: true
            }
          }
        }
      }) as DefaultBookLookupRecord | null;

      if (book === null) {
        return null;
      }

      return {
        id         : book.id,
        title      : book.title,
        bookTypeKey: book.bookType?.key ?? null
      };
    },

    async findByTitle(title: string) {
      const book = await prismaClient.book.findFirst({
        where: {
          title,
          deletedAt: null
        },
        select: {
          id      : true,
          title   : true,
          bookType: {
            select: {
              key: true
            }
          }
        }
      }) as DefaultBookLookupRecord | null;

      if (book === null) {
        return null;
      }

      return {
        id         : book.id,
        title      : book.title,
        bookTypeKey: book.bookType?.key ?? null
      };
    }
  };
}

/**
 * acceptance 只读取已审核通过的 claim，且要完整分页拉取，避免样本书 accepted claim 超过单页上限时静默漏检。
 */
function createDefaultReviewQuery(): AcceptanceReviewQuery {
  return {
    async listReviewClaims(bookId: string) {
      const items: AcceptanceClaimSummary[] = [];
      let offset = 0;

      while (true) {
        const page = await reviewQueryService.listClaims({
          bookId,
          claimKinds  : ACCEPTANCE_CLAIM_FAMILIES,
          reviewStates: ["ACCEPTED"],
          limit       : CLAIM_PAGE_SIZE,
          offset
        });

        items.push(...page.items.map((item) => ({
          claimKind: item.claimKind,
          claimId  : item.claimId
        })));

        offset += page.items.length;

        if (page.items.length === 0 || items.length >= page.total) {
          return items;
        }
      }
    },

    async getClaimDetail(input: GetReviewClaimDetailInput) {
      return reviewQueryService.getClaimDetail(input);
    }
  };
}

function createDefaultAuditQuery(prismaClient: typeof prisma): AcceptanceAuditQuery {
  return {
    async listActions(bookId: string) {
      const rows = await prismaClient.reviewAuditLog.findMany({
        where  : { bookId },
        orderBy: [
          { createdAt: "asc" },
          { id: "asc" }
        ],
        select: {
          action: true
        }
      });

      return rows.map((row) => row.action);
    }
  };
}

function createDefaultProjectionQuery(prismaClient: typeof prisma): AcceptanceProjectionQuery {
  return {
    async getCounts(bookId: string) {
      const [
        personaChapterFacts,
        personaTimeFacts,
        relationshipEdges,
        timelineEvents
      ] = await Promise.all([
        prismaClient.personaChapterFact.count({ where: { bookId } }),
        prismaClient.personaTimeFact.count({ where: { bookId } }),
        prismaClient.relationshipEdge.count({ where: { bookId } }),
        prismaClient.timelineEvent.count({ where: { bookId } })
      ]);

      return {
        personaChapterFacts,
        personaTimeFacts,
        relationshipEdges,
        timelineEvents
      };
    }
  };
}

function createDefaultRelationCatalog(prismaClient: typeof prisma): AcceptanceRelationCatalog {
  const loader = createRelationTypeCatalogLoader({
    knowledgeRepository: createKnowledgeRepository(prismaClient as never)
  });

  return {
    async hasEntry(bookId: string, bookTypeKey: string | null) {
      try {
        const catalog = await loader.load({
          bookId,
          bookTypeKey,
          runId: null,
          mode : "REVIEW"
        });

        return catalog.activeEntries.length > 0;
      } catch {
        return false;
      }
    }
  };
}

/**
 * acceptance repository 聚合当前样本书的审核上下文。
 * 它故意只暴露 loop evaluator 真正需要的最小快照，避免 runner 重新耦合 review UI DTO。
 */
export function createAcceptanceRepository(
  dependencies: AcceptanceRepositoryDependencies = {}
) {
  const prismaClient = dependencies.prismaClient ?? prisma;
  const bookLookup = dependencies.bookLookup ?? createDefaultBookLookup(prismaClient);
  const reviewQuery = dependencies.reviewQuery ?? createDefaultReviewQuery();
  const auditQuery = dependencies.auditQuery ?? createDefaultAuditQuery(prismaClient);
  const projectionQuery = dependencies.projectionQuery ?? createDefaultProjectionQuery(prismaClient);
  const relationCatalog = dependencies.relationCatalog ?? createDefaultRelationCatalog(prismaClient);

  return {
    async loadBookContext(input: {
      scenarioKey: string;
      bookId?    : string;
      bookTitle  : string;
    }): Promise<AcceptanceBookContext> {
      const book = typeof input.bookId === "string" && input.bookId.trim().length > 0
        ? await bookLookup.findById(input.bookId)
        : await bookLookup.findByTitle(input.bookTitle);

      if (book === null) {
        const lookupKey = input.bookId ?? input.bookTitle;
        throw new Error(`Acceptance book not found: ${lookupKey}`);
      }

      const claimRows = await reviewQuery.listReviewClaims(book.id);
      const claimDetails = await Promise.all(claimRows.map(async (row) => {
        const detail = await reviewQuery.getClaimDetail({
          bookId   : book.id,
          claimKind: row.claimKind,
          claimId  : row.claimId
        });

        if (detail === null) {
          throw new Error(
            `Acceptance claim detail not found: ${row.claimKind}:${row.claimId} (${input.scenarioKey})`
          );
        }

        return {
          claimKind  : row.claimKind,
          claimId    : row.claimId,
          reviewState: detail.claim.reviewState,
          evidence   : detail.evidence.map((item) => ({
            id         : item.id,
            chapterId  : item.chapterId,
            quotedText : item.quotedText,
            startOffset: item.startOffset,
            endOffset  : item.endOffset
          }))
        };
      }));

      return {
        book: {
          id   : book.id,
          title: book.title
        },
        claimDetails,
        auditActions            : await auditQuery.listActions(book.id),
        projectionCounts        : await projectionQuery.getCounts(book.id),
        relationCatalogAvailable: await relationCatalog.hasEntry(book.id, book.bookTypeKey),
        routes                  : buildReviewRoutes(book.id)
      };
    }
  };
}
