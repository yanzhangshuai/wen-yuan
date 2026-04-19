import type { KnowledgeItem } from "@/generated/prisma/client";

import {
  knowledgeReviewStateSchema,
  knowledgeScopeSelectorSchema,
  type KnowledgeReviewState,
  type KnowledgeScopeSelector,
  type KnowledgeSource
} from "@/server/modules/knowledge-v2/base-types";
import {
  getKnowledgePayloadSchema,
  type KnownKnowledgeType
} from "@/server/modules/knowledge-v2/payload-schemas";

type KnowledgeWindowValue = Record<string, unknown> | null;

export interface CreateKnowledgeItemInput<TType extends KnownKnowledgeType = KnownKnowledgeType>
  extends KnowledgeScopeSelector {
  knowledgeType          : TType;
  payload                : unknown;
  source                 : KnowledgeSource;
  reviewState            : KnowledgeReviewState;
  confidence             : number | null;
  effectiveFrom          : KnowledgeWindowValue;
  effectiveTo            : KnowledgeWindowValue;
  promotedFromClaimId    : string | null;
  promotedFromClaimFamily: string | null;
  createdByUserId        : string | null;
  reviewedByUserId       : string | null;
  reviewedAt             : Date | null;
}

export interface CreateSupersedingKnowledgeItemInput {
  supersedesKnowledgeId  : string;
  payload                : unknown;
  source                 : KnowledgeSource;
  reviewState            : KnowledgeReviewState;
  confidence             : number | null;
  effectiveFrom          : KnowledgeWindowValue;
  effectiveTo            : KnowledgeWindowValue;
  promotedFromClaimId    : string | null;
  promotedFromClaimFamily: string | null;
  createdByUserId        : string | null;
  reviewedByUserId       : string | null;
  reviewedAt             : Date | null;
}

export interface ListKnowledgeItemsInput {
  scopeSelectors?: KnowledgeScopeSelector[];
  reviewStates?  : KnowledgeReviewState[];
  knowledgeTypes?: KnownKnowledgeType[];
}

export interface ReviewKnowledgeItemInput {
  knowledgeId     : string;
  reviewState     : KnowledgeReviewState;
  reviewedByUserId: string | null;
  reviewedAt      : Date | null;
}

export type ParsedKnowledgeItem<TType extends KnownKnowledgeType = KnownKnowledgeType> =
  Omit<KnowledgeItem, "knowledgeType" | "payload" | "reviewState"> & {
    knowledgeType: TType;
    payload      : unknown;
    reviewState  : KnowledgeReviewState;
  };

interface KnowledgeItemDelegate {
  create(args: { data: Record<string, unknown> }): Promise<KnowledgeItem>;
  findMany(args: {
    where?  : Record<string, unknown>;
    orderBy?: Array<Record<string, "asc" | "desc">>;
  }): Promise<KnowledgeItem[]>;
  findUnique(args: { where: { id: string } }): Promise<KnowledgeItem | null>;
  update(args: {
    where: { id: string };
    data : Record<string, unknown>;
  }): Promise<KnowledgeItem>;
}

export interface KnowledgeRepositoryTransactionClient {
  knowledgeItem: KnowledgeItemDelegate;
}

export interface KnowledgeRepositoryClient extends KnowledgeRepositoryTransactionClient {
  $transaction<T>(callback: (tx: KnowledgeRepositoryTransactionClient) => Promise<T>): Promise<T>;
}

export interface KnowledgeRepository {
  createKnowledgeItem<TType extends KnownKnowledgeType>(
    input: CreateKnowledgeItemInput<TType>
  ): Promise<ParsedKnowledgeItem<TType>>;
  listKnowledgeItems(input?: ListKnowledgeItemsInput): Promise<ParsedKnowledgeItem[]>;
  createSupersedingKnowledgeItem(
    input: CreateSupersedingKnowledgeItemInput
  ): Promise<ParsedKnowledgeItem>;
  reviewKnowledgeItem(input: ReviewKnowledgeItemInput): Promise<ParsedKnowledgeItem>;
}

function parseKnowledgeRecord(record: KnowledgeItem): ParsedKnowledgeItem {
  knowledgeScopeSelectorSchema.parse({
    scopeType: record.scopeType,
    scopeId  : record.scopeId
  });

  const knowledgeType = record.knowledgeType as KnownKnowledgeType;
  const payload = getKnowledgePayloadSchema(knowledgeType).parse(record.payload);
  const reviewState = knowledgeReviewStateSchema.parse(record.reviewState);

  return {
    ...record,
    knowledgeType,
    payload,
    reviewState
  };
}

function toKnowledgeCreateData<TType extends KnownKnowledgeType>(
  input: CreateKnowledgeItemInput<TType>,
  version = 1,
  supersedesKnowledgeId: string | null = null
) {
  knowledgeScopeSelectorSchema.parse({
    scopeType: input.scopeType,
    scopeId  : input.scopeId
  });
  const reviewState = knowledgeReviewStateSchema.parse(input.reviewState);
  const payload = getKnowledgePayloadSchema(input.knowledgeType).parse(input.payload);

  return {
    scopeType              : input.scopeType,
    scopeId                : input.scopeId,
    knowledgeType          : input.knowledgeType,
    payload,
    source                 : input.source,
    reviewState,
    confidence             : input.confidence,
    effectiveFrom          : input.effectiveFrom,
    effectiveTo            : input.effectiveTo,
    promotedFromClaimId    : input.promotedFromClaimId,
    promotedFromClaimFamily: input.promotedFromClaimFamily,
    supersedesKnowledgeId,
    version,
    createdByUserId        : input.createdByUserId,
    reviewedByUserId       : input.reviewedByUserId,
    reviewedAt             : input.reviewedAt
  };
}

function buildKnowledgeListWhere(input: ListKnowledgeItemsInput): Record<string, unknown> {
  const where: Record<string, unknown> = {};

  if (input.reviewStates && input.reviewStates.length > 0) {
    where.reviewState = {
      in: input.reviewStates.map((reviewState) => knowledgeReviewStateSchema.parse(reviewState))
    };
  }

  if (input.knowledgeTypes && input.knowledgeTypes.length > 0) {
    where.knowledgeType = { in: input.knowledgeTypes };
  }

  if (input.scopeSelectors && input.scopeSelectors.length > 0) {
    where.OR = input.scopeSelectors.map((selector) => knowledgeScopeSelectorSchema.parse(selector));
  }

  return where;
}

export function createKnowledgeRepository(
  client: KnowledgeRepositoryClient
): KnowledgeRepository {
  return {
    async createKnowledgeItem<TType extends KnownKnowledgeType>(
      input: CreateKnowledgeItemInput<TType>
    ) {
      const created = await client.knowledgeItem.create({
        data: toKnowledgeCreateData(input)
      });

      return parseKnowledgeRecord(created) as ParsedKnowledgeItem<TType>;
    },

    async listKnowledgeItems(input: ListKnowledgeItemsInput = {}) {
      const items = await client.knowledgeItem.findMany({
        where  : buildKnowledgeListWhere(input),
        orderBy: [
          { createdAt: "asc" },
          { version: "asc" }
        ]
      });

      return items.map((item) => parseKnowledgeRecord(item));
    },

    async createSupersedingKnowledgeItem(input: CreateSupersedingKnowledgeItemInput) {
      return client.$transaction(async (tx) => {
        const previousRecord = await tx.knowledgeItem.findUnique({
          where: { id: input.supersedesKnowledgeId }
        });

        if (!previousRecord) {
          throw new Error(`Knowledge item ${input.supersedesKnowledgeId} was not found`);
        }

        const previous = parseKnowledgeRecord(previousRecord);

        // supersede 只替换内容与审核元数据，scope/type 必须继承旧版本，避免调用方错误改链。
        const created = await tx.knowledgeItem.create({
          data: toKnowledgeCreateData({
            scopeType              : previous.scopeType,
            scopeId                : previous.scopeId,
            knowledgeType          : previous.knowledgeType,
            payload                : input.payload,
            source                 : input.source,
            reviewState            : input.reviewState,
            confidence             : input.confidence,
            effectiveFrom          : input.effectiveFrom,
            effectiveTo            : input.effectiveTo,
            promotedFromClaimId    : input.promotedFromClaimId,
            promotedFromClaimFamily: input.promotedFromClaimFamily,
            createdByUserId        : input.createdByUserId,
            reviewedByUserId       : input.reviewedByUserId,
            reviewedAt             : input.reviewedAt
          }, previous.version + 1, previous.id)
        });

        return parseKnowledgeRecord(created);
      });
    },

    async reviewKnowledgeItem(input: ReviewKnowledgeItemInput) {
      const updated = await client.knowledgeItem.update({
        where: { id: input.knowledgeId },
        data : {
          reviewState     : knowledgeReviewStateSchema.parse(input.reviewState),
          reviewedByUserId: input.reviewedByUserId,
          reviewedAt      : input.reviewedAt
        }
      });

      return parseKnowledgeRecord(updated);
    }
  };
}
