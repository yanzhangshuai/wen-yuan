import type { ClaimReviewState, ClaimSource } from "@/server/modules/analysis/claims/base-types";
import type {
  ClaimCreateDataByFamily,
  ClaimFamily,
  ReviewableClaimFamily
} from "@/server/modules/analysis/claims/claim-schemas";

export const CLAIM_STAGE_KEYS = Object.freeze([
  "stage_a_extraction",
  "stage_a_plus_knowledge_recall",
  "stage_b_identity_resolution",
  "stage_b5_conflict_detection",
  "stage_c_fact_attribution"
] as const);

export type ClaimStageKey = (typeof CLAIM_STAGE_KEYS)[number];

export interface ClaimWriteScope {
  bookId    : string;
  chapterId?: string | null;
  runId     : string;
  stageKey  : ClaimStageKey;
}

export interface ReplaceClaimFamilyScopeInput<TFamily extends ClaimFamily> {
  family: TFamily;
  scope : ClaimWriteScope;
  rows  : ClaimCreateDataByFamily[TFamily][];
}

export interface ReplaceClaimFamilyScopeResult {
  deletedCount: number;
  createdCount: number;
}

export interface ReviewableClaimSummary {
  id         : string;
  reviewState: ClaimReviewState;
  source     : ClaimSource;
}

export interface UpdateReviewableClaimReviewStateInput<TFamily extends ReviewableClaimFamily> {
  family          : TFamily;
  claimId         : string;
  reviewState     : ClaimReviewState;
  reviewedByUserId: string | null;
  reviewedAt      : Date | null;
  reviewNote      : string | null;
}

type DeleteWhere = Record<string, unknown>;

interface CreateManyDelegate<Row> {
  createMany(args: { data: Row[] }): Promise<{ count: number }>;
  deleteMany(args: { where: DeleteWhere }): Promise<{ count: number }>;
}

interface ReviewableClaimDelegate<Row> extends CreateManyDelegate<Row> {
  findUnique(args: {
    where : { id: string };
    select: { id: true; reviewState: true; source: true };
  }): Promise<ReviewableClaimSummary | null>;
  update(args: {
    where: { id: string };
    data : {
      reviewState     : ClaimReviewState;
      reviewedByUserId: string | null;
      reviewedAt      : Date | null;
      reviewNote      : string | null;
    };
  }): Promise<ReviewableClaimSummary>;
  create(args: { data: Row & { reviewedAt?: Date | null } }): Promise<{ id: string } & Row>;
}

export interface ClaimRepositoryTransactionClient {
  entityMention          : CreateManyDelegate<ClaimCreateDataByFamily["ENTITY_MENTION"]>;
  aliasClaim             : ReviewableClaimDelegate<ClaimCreateDataByFamily["ALIAS"]>;
  eventClaim             : ReviewableClaimDelegate<ClaimCreateDataByFamily["EVENT"]>;
  relationClaim          : ReviewableClaimDelegate<ClaimCreateDataByFamily["RELATION"]>;
  timeClaim              : ReviewableClaimDelegate<ClaimCreateDataByFamily["TIME"]>;
  identityResolutionClaim: ReviewableClaimDelegate<ClaimCreateDataByFamily["IDENTITY_RESOLUTION"]>;
  conflictFlag           : ReviewableClaimDelegate<ClaimCreateDataByFamily["CONFLICT_FLAG"]>;
}

export interface ClaimRepositoryClient extends ClaimRepositoryTransactionClient {
  $transaction<T>(callback: (tx: ClaimRepositoryTransactionClient) => Promise<T>): Promise<T>;
}

export interface ClaimRepository {
  transaction<T>(work: (repository: ClaimRepository) => Promise<T>): Promise<T>;
  replaceClaimFamilyScope<TFamily extends ClaimFamily>(
    input: ReplaceClaimFamilyScopeInput<TFamily>
  ): Promise<ReplaceClaimFamilyScopeResult>;
  findReviewableClaimSummary<TFamily extends ReviewableClaimFamily>(
    family: TFamily,
    claimId: string
  ): Promise<ReviewableClaimSummary | null>;
  updateReviewableClaimReviewState<TFamily extends ReviewableClaimFamily>(
    input: UpdateReviewableClaimReviewStateInput<TFamily>
  ): Promise<ReviewableClaimSummary>;
  createReviewableClaim<TFamily extends ReviewableClaimFamily>(
    family: TFamily,
    data: ClaimCreateDataByFamily[TFamily] & { reviewedAt?: Date | null }
  ): Promise<{ id: string } & ClaimCreateDataByFamily[TFamily]>;
}

export class ClaimRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClaimRepositoryError";
  }
}

function requireChapterScope(scope: ClaimWriteScope): string {
  if (scope.chapterId === null || scope.chapterId === undefined) {
    throw new ClaimRepositoryError(`Stage ${scope.stageKey} requires chapterId for this claim family`);
  }

  return scope.chapterId;
}

function buildBaseScopeWhere(scope: ClaimWriteScope, requireChapterId = false): DeleteWhere {
  const where: DeleteWhere = {
    bookId: scope.bookId,
    runId : scope.runId
  };

  if (requireChapterId) {
    where.chapterId = requireChapterScope(scope);
  } else if (scope.chapterId !== undefined) {
    where.chapterId = scope.chapterId;
  }

  return where;
}

function buildReplacementWhere(family: ClaimFamily, scope: ClaimWriteScope): DeleteWhere {
  switch (family) {
    case "ENTITY_MENTION":
      if (scope.stageKey === "stage_a_extraction") {
        return {
          ...buildBaseScopeWhere(scope, true),
          source: "AI"
        };
      }

      if (scope.stageKey === "stage_a_plus_knowledge_recall") {
        return {
          ...buildBaseScopeWhere(scope, true),
          source: "RULE"
        };
      }

      throw new ClaimRepositoryError(
        `Stage ${scope.stageKey} cannot replace claim family ${family}`
      );

    case "ALIAS":
      if (scope.stageKey === "stage_a_extraction") {
        return {
          ...buildBaseScopeWhere(scope, true),
          source            : "AI",
          derivedFromClaimId: null
        };
      }

      if (scope.stageKey === "stage_a_plus_knowledge_recall") {
        return {
          ...buildBaseScopeWhere(scope, true),
          source: "RULE"
        };
      }

      throw new ClaimRepositoryError(`Stage ${scope.stageKey} cannot replace claim family ${family}`);

    case "EVENT":
      if (scope.stageKey === "stage_a_extraction") {
        return {
          ...buildBaseScopeWhere(scope, true),
          source            : "AI",
          derivedFromClaimId: null
        };
      }

      if (scope.stageKey === "stage_a_plus_knowledge_recall") {
        return {
          ...buildBaseScopeWhere(scope, true),
          source: "RULE"
        };
      }

      if (scope.stageKey === "stage_c_fact_attribution") {
        return {
          ...buildBaseScopeWhere(scope, true),
          source            : "AI",
          derivedFromClaimId: { not: null }
        };
      }

      throw new ClaimRepositoryError(`Stage ${scope.stageKey} cannot replace claim family ${family}`);

    case "RELATION":
      if (scope.stageKey === "stage_a_extraction") {
        return {
          ...buildBaseScopeWhere(scope, true),
          source            : "AI",
          derivedFromClaimId: null
        };
      }

      if (scope.stageKey === "stage_a_plus_knowledge_recall") {
        return {
          ...buildBaseScopeWhere(scope, true),
          source: "RULE"
        };
      }

      if (scope.stageKey === "stage_c_fact_attribution") {
        return {
          ...buildBaseScopeWhere(scope, true),
          source            : "AI",
          derivedFromClaimId: { not: null }
        };
      }

      throw new ClaimRepositoryError(`Stage ${scope.stageKey} cannot replace claim family ${family}`);

    case "TIME":
      if (scope.stageKey === "stage_a_extraction") {
        return {
          ...buildBaseScopeWhere(scope, true),
          source            : "AI",
          derivedFromClaimId: null
        };
      }

      if (scope.stageKey === "stage_a_plus_knowledge_recall") {
        return {
          ...buildBaseScopeWhere(scope, true),
          source: "RULE"
        };
      }

      if (scope.stageKey === "stage_c_fact_attribution") {
        return {
          ...buildBaseScopeWhere(scope, true),
          source            : "AI",
          derivedFromClaimId: { not: null }
        };
      }

      throw new ClaimRepositoryError(`Stage ${scope.stageKey} cannot replace claim family ${family}`);

    case "IDENTITY_RESOLUTION":
      if (scope.stageKey !== "stage_b_identity_resolution") {
        throw new ClaimRepositoryError(
          `Stage ${scope.stageKey} cannot replace claim family ${family}`
        );
      }

      return {
        ...buildBaseScopeWhere(scope),
        source: "AI"
      };

    case "CONFLICT_FLAG":
      if (scope.stageKey !== "stage_b5_conflict_detection") {
        throw new ClaimRepositoryError(
          `Stage ${scope.stageKey} cannot replace claim family ${family}`
        );
      }

      return {
        ...buildBaseScopeWhere(scope),
        source: "RULE"
      };
  }
}

function getCreateManyDelegate<TFamily extends ClaimFamily>(
  tx: ClaimRepositoryTransactionClient,
  family: TFamily
): CreateManyDelegate<ClaimCreateDataByFamily[TFamily]> {
  switch (family) {
    case "ENTITY_MENTION":
      return tx.entityMention as CreateManyDelegate<ClaimCreateDataByFamily[TFamily]>;
    case "ALIAS":
      return tx.aliasClaim as CreateManyDelegate<ClaimCreateDataByFamily[TFamily]>;
    case "EVENT":
      return tx.eventClaim as CreateManyDelegate<ClaimCreateDataByFamily[TFamily]>;
    case "RELATION":
      return tx.relationClaim as CreateManyDelegate<ClaimCreateDataByFamily[TFamily]>;
    case "TIME":
      return tx.timeClaim as CreateManyDelegate<ClaimCreateDataByFamily[TFamily]>;
    case "IDENTITY_RESOLUTION":
      return tx.identityResolutionClaim as CreateManyDelegate<ClaimCreateDataByFamily[TFamily]>;
    case "CONFLICT_FLAG":
      return tx.conflictFlag as CreateManyDelegate<ClaimCreateDataByFamily[TFamily]>;
  }
}

function getReviewableDelegate<TFamily extends ReviewableClaimFamily>(
  tx: ClaimRepositoryTransactionClient,
  family: TFamily
): ReviewableClaimDelegate<ClaimCreateDataByFamily[TFamily]> {
  switch (family) {
    case "ALIAS":
      return tx.aliasClaim as ReviewableClaimDelegate<ClaimCreateDataByFamily[TFamily]>;
    case "EVENT":
      return tx.eventClaim as ReviewableClaimDelegate<ClaimCreateDataByFamily[TFamily]>;
    case "RELATION":
      return tx.relationClaim as ReviewableClaimDelegate<ClaimCreateDataByFamily[TFamily]>;
    case "TIME":
      return tx.timeClaim as ReviewableClaimDelegate<ClaimCreateDataByFamily[TFamily]>;
    case "IDENTITY_RESOLUTION":
      return tx.identityResolutionClaim as ReviewableClaimDelegate<ClaimCreateDataByFamily[TFamily]>;
    case "CONFLICT_FLAG":
      return tx.conflictFlag as ReviewableClaimDelegate<ClaimCreateDataByFamily[TFamily]>;
  }
}

function createMethods(tx: ClaimRepositoryTransactionClient): Omit<ClaimRepository, "transaction"> {
  return {
    async replaceClaimFamilyScope<TFamily extends ClaimFamily>(
      input: ReplaceClaimFamilyScopeInput<TFamily>
    ): Promise<ReplaceClaimFamilyScopeResult> {
      const delegate = getCreateManyDelegate(tx, input.family);
      const where = buildReplacementWhere(input.family, input.scope);
      const deleted = await delegate.deleteMany({ where });

      if (input.rows.length === 0) {
        return {
          deletedCount: deleted.count,
          createdCount: 0
        };
      }

      const created = await delegate.createMany({ data: input.rows });

      return {
        deletedCount: deleted.count,
        createdCount: created.count
      };
    },

    findReviewableClaimSummary<TFamily extends ReviewableClaimFamily>(
      family: TFamily,
      claimId: string
    ): Promise<ReviewableClaimSummary | null> {
      return getReviewableDelegate(tx, family).findUnique({
        where : { id: claimId },
        select: { id: true, reviewState: true, source: true }
      });
    },

    updateReviewableClaimReviewState<TFamily extends ReviewableClaimFamily>(
      input: UpdateReviewableClaimReviewStateInput<TFamily>
    ): Promise<ReviewableClaimSummary> {
      return getReviewableDelegate(tx, input.family).update({
        where: { id: input.claimId },
        data : {
          reviewState     : input.reviewState,
          reviewedByUserId: input.reviewedByUserId,
          reviewedAt      : input.reviewedAt,
          reviewNote      : input.reviewNote
        }
      });
    },

    createReviewableClaim<TFamily extends ReviewableClaimFamily>(
      family: TFamily,
      data: ClaimCreateDataByFamily[TFamily] & { reviewedAt?: Date | null }
    ): Promise<{ id: string } & ClaimCreateDataByFamily[TFamily]> {
      return getReviewableDelegate(tx, family).create({ data });
    }
  };
}

function createClaimRepositoryFromTransaction(tx: ClaimRepositoryTransactionClient): ClaimRepository {
  const methods = createMethods(tx);

  return {
    ...methods,
    transaction: async <T>(work: (repository: ClaimRepository) => Promise<T>): Promise<T> =>
      work(createClaimRepositoryFromTransaction(tx))
  };
}

export function createClaimRepository(prisma: ClaimRepositoryClient): ClaimRepository {
  const methods = createMethods(prisma);

  return {
    ...methods,
    transaction: async <T>(work: (repository: ClaimRepository) => Promise<T>): Promise<T> =>
      prisma.$transaction(async (tx) => work(createClaimRepositoryFromTransaction(tx)))
  };
}

// 供已在事务内部的代码（如 sequential-review-output）直接使用，
// 避免用 ClaimRepositoryClient 强转（ClaimRepositoryClient 含 $transaction，在嵌套事务中不应调用）。
export function createClaimRepositoryForTransaction(
  tx: ClaimRepositoryTransactionClient
): ClaimRepository {
  return createClaimRepositoryFromTransaction(tx);
}
