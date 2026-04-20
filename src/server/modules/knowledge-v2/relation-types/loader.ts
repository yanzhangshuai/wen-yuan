import type { KnowledgeScopeSelector } from "@/server/modules/knowledge-v2/base-types";
import type { KnowledgeRepository } from "@/server/modules/knowledge-v2/repository";

import { buildRelationTypeCatalog } from "@/server/modules/knowledge-v2/relation-types/catalog";

export const RELATION_KNOWLEDGE_TYPES = [
  "relation taxonomy rule",
  "relation label mapping rule",
  "relation negative rule"
] as const;

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

export function createRelationTypeCatalogLoader(dependencies: {
  knowledgeRepository: Pick<KnowledgeRepository, "listKnowledgeItems">;
}) {
  return {
    async load(input: {
      bookId     : string;
      bookTypeKey: string | null;
      runId      : string | null;
      mode       : "RUNTIME" | "REVIEW";
    }) {
      const reviewStates = input.mode === "REVIEW"
        ? ["VERIFIED", "PENDING", "DISABLED"] as const
        : ["VERIFIED", "PENDING"] as const;

      const items = await dependencies.knowledgeRepository.listKnowledgeItems({
        scopeSelectors: buildScopeChain(input),
        reviewStates  : [...reviewStates],
        knowledgeTypes: [...RELATION_KNOWLEDGE_TYPES]
      });

      return buildRelationTypeCatalog({ items });
    }
  };
}
