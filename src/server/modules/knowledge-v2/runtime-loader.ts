import {
  getRuntimeReviewStates,
  type KnowledgeScopeSelector,
  type RuntimeVisibilityMode
} from "@/server/modules/knowledge-v2/base-types";
import {
  KNOWN_KNOWLEDGE_TYPES,
  type KnownKnowledgeType
} from "@/server/modules/knowledge-v2/payload-schemas";
import type {
  KnowledgeRepository,
  ParsedKnowledgeItem
} from "@/server/modules/knowledge-v2/repository";

export type RuntimeKnowledgeItem = ParsedKnowledgeItem;

export interface RuntimeKnowledgeRepository
  extends Pick<KnowledgeRepository, "listKnowledgeItems"> {}

export interface RuntimeKnowledgeBundle {
  scopeChain   : KnowledgeScopeSelector[];
  verifiedItems: RuntimeKnowledgeItem[];
  pendingItems : RuntimeKnowledgeItem[];
  byType       : Record<KnownKnowledgeType, RuntimeKnowledgeItem[]>;
}

const SCOPE_ORDER: Record<RuntimeKnowledgeItem["scopeType"], number> = {
  GLOBAL   : 0,
  BOOK_TYPE: 1,
  BOOK     : 2,
  RUN      : 3
};

function buildScopeChain(input: {
  bookId     : string;
  bookTypeKey: string | null;
  runId      : string | null;
}): KnowledgeScopeSelector[] {
  return [
    { scopeType: "GLOBAL", scopeId: null },
    ...(input.bookTypeKey
      ? [{ scopeType: "BOOK_TYPE" as const, scopeId: input.bookTypeKey }]
      : []),
    { scopeType: "BOOK", scopeId: input.bookId },
    ...(input.runId
      ? [{ scopeType: "RUN" as const, scopeId: input.runId }]
      : [])
  ];
}

function createEmptyBuckets(): Record<KnownKnowledgeType, RuntimeKnowledgeItem[]> {
  return KNOWN_KNOWLEDGE_TYPES.reduce<Record<KnownKnowledgeType, RuntimeKnowledgeItem[]>>(
    (buckets, knowledgeType) => {
      buckets[knowledgeType] = [];
      return buckets;
    },
    {} as Record<KnownKnowledgeType, RuntimeKnowledgeItem[]>
  );
}

/**
 * supersede 只屏蔽当前可见集合里的旧版本，避免 PENDING 草稿错误遮蔽 VERIFIED 运行时规则。
 */
function suppressSupersededVisibleItems(items: RuntimeKnowledgeItem[]): RuntimeKnowledgeItem[] {
  const visibleIds = new Set(items.map((item) => item.id));
  const supersededIds = new Set(
    items
      .map((item) => item.supersedesKnowledgeId)
      .filter((supersededId): supersededId is string => supersededId !== null && visibleIds.has(supersededId))
  );

  return items.filter((item) => !supersededIds.has(item.id));
}

function sortByScopePrecedence(items: RuntimeKnowledgeItem[]): RuntimeKnowledgeItem[] {
  return [...items].sort((left, right) => {
    const scopeDelta = SCOPE_ORDER[left.scopeType] - SCOPE_ORDER[right.scopeType];

    if (scopeDelta !== 0) {
      return scopeDelta;
    }

    return left.version - right.version;
  });
}

function groupByKnowledgeType(items: RuntimeKnowledgeItem[]): Record<KnownKnowledgeType, RuntimeKnowledgeItem[]> {
  const buckets = createEmptyBuckets();

  items.forEach((item) => {
    buckets[item.knowledgeType].push(item);
  });

  return buckets;
}

export function createRuntimeKnowledgeLoader(
  repository: RuntimeKnowledgeRepository
) {
  return {
    async load(input: {
      bookId     : string;
      bookTypeKey: string | null;
      runId      : string | null;
      visibility : RuntimeVisibilityMode;
    }): Promise<RuntimeKnowledgeBundle> {
      const scopeChain = buildScopeChain(input);
      const allVisibleItems = await repository.listKnowledgeItems({
        scopeSelectors: scopeChain,
        reviewStates  : getRuntimeReviewStates(input.visibility)
      });

      const verifiedItems = sortByScopePrecedence(suppressSupersededVisibleItems(
        allVisibleItems.filter((item) => item.reviewState === "VERIFIED")
      ));
      const pendingItems = input.visibility === "INCLUDE_PENDING"
        ? sortByScopePrecedence(suppressSupersededVisibleItems(
          allVisibleItems.filter((item) => item.reviewState === "PENDING")
        ))
        : [];

      return {
        scopeChain,
        verifiedItems,
        pendingItems,
        byType: groupByKnowledgeType([...verifiedItems, ...pendingItems])
      };
    }
  };
}
