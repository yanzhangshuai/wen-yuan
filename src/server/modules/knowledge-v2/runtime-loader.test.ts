import { describe, expect, it, vi } from "vitest";

import { createRuntimeKnowledgeLoader } from "@/server/modules/knowledge-v2/runtime-loader";

function buildKnowledge(overrides: Record<string, unknown>) {
  return {
    id           : "knowledge-1",
    scopeType    : "GLOBAL",
    scopeId      : null,
    knowledgeType: "alias equivalence rule",
    payload      : {
      canonicalName : "范进",
      aliasTexts    : ["范老爷"],
      aliasTypeHints: ["TITLE"],
      note          : null
    },
    source                 : "SYSTEM_PRESET",
    reviewState            : "VERIFIED",
    confidence             : null,
    effectiveFrom          : null,
    effectiveTo            : null,
    promotedFromClaimId    : null,
    promotedFromClaimFamily: null,
    supersedesKnowledgeId  : null,
    version                : 1,
    createdByUserId        : null,
    reviewedByUserId       : "admin-1",
    reviewedAt             : new Date("2026-04-19T10:00:00.000Z"),
    createdAt              : new Date("2026-04-19T10:00:00.000Z"),
    updatedAt              : new Date("2026-04-19T10:00:00.000Z"),
    ...overrides
  };
}

describe("knowledge-v2 runtime loader", () => {
  it("keeps strict runtime verified while returning pending candidates separately", async () => {
    const repository = {
      listKnowledgeItems: vi.fn().mockResolvedValue([
        buildKnowledge({ id: "verified-1" }),
        buildKnowledge({
          id                   : "pending-2",
          reviewState          : "PENDING",
          supersedesKnowledgeId: "verified-1",
          version              : 2
        })
      ])
    };

    const loader = createRuntimeKnowledgeLoader(repository);
    const bundle = await loader.load({
      bookId     : "book-1",
      bookTypeKey: "CLASSICAL_NOVEL",
      runId      : "run-1",
      visibility : "INCLUDE_PENDING"
    });

    expect(bundle.verifiedItems.map((item) => item.id)).toEqual(["verified-1"]);
    expect(bundle.pendingItems.map((item) => item.id)).toEqual(["pending-2"]);
  });

  it("applies scope precedence as GLOBAL -> BOOK_TYPE -> BOOK -> RUN", async () => {
    const repository = {
      listKnowledgeItems: vi.fn().mockResolvedValue([
        buildKnowledge({
          id       : "book-1",
          scopeType: "BOOK",
          scopeId  : "book-1"
        }),
        buildKnowledge({
          id       : "global-1",
          scopeType: "GLOBAL",
          scopeId  : null
        }),
        buildKnowledge({
          id       : "book-type-1",
          scopeType: "BOOK_TYPE",
          scopeId  : "HISTORICAL_NOVEL"
        }),
        buildKnowledge({
          id       : "run-1",
          scopeType: "RUN",
          scopeId  : "run-1"
        })
      ])
    };

    const loader = createRuntimeKnowledgeLoader(repository);
    const bundle = await loader.load({
      bookId     : "book-1",
      bookTypeKey: "HISTORICAL_NOVEL",
      runId      : "run-1",
      visibility : "VERIFIED_ONLY"
    });

    expect(bundle.scopeChain).toEqual([
      { scopeType: "GLOBAL", scopeId: null },
      { scopeType: "BOOK_TYPE", scopeId: "HISTORICAL_NOVEL" },
      { scopeType: "BOOK", scopeId: "book-1" },
      { scopeType: "RUN", scopeId: "run-1" }
    ]);
    expect(bundle.verifiedItems.map((item) => item.id)).toEqual([
      "global-1",
      "book-type-1",
      "book-1",
      "run-1"
    ]);
  });

  it("orders same-scope knowledge by version", async () => {
    const repository = {
      listKnowledgeItems: vi.fn().mockResolvedValue([
        buildKnowledge({
          id     : "global-v2",
          version: 2
        }),
        buildKnowledge({
          id     : "global-v1",
          version: 1
        })
      ])
    };

    const loader = createRuntimeKnowledgeLoader(repository);
    const bundle = await loader.load({
      bookId     : "book-1",
      bookTypeKey: null,
      runId      : null,
      visibility : "VERIFIED_ONLY"
    });

    expect(bundle.verifiedItems.map((item) => item.id)).toEqual([
      "global-v1",
      "global-v2"
    ]);
  });

  it("keeps negative knowledge in dedicated type buckets", async () => {
    const repository = {
      listKnowledgeItems: vi.fn().mockResolvedValue([
        buildKnowledge({
          id           : "neg-1",
          knowledgeType: "relation negative rule",
          payload      : {
            relationTypeKey: "sworn_brother",
            blockedLabels  : ["结义兄弟"],
            denyDirection  : "BIDIRECTIONAL",
            reason         : "测试"
          }
        })
      ])
    };

    const loader = createRuntimeKnowledgeLoader(repository);
    const bundle = await loader.load({
      bookId     : "book-1",
      bookTypeKey: null,
      runId      : null,
      visibility : "VERIFIED_ONLY"
    });

    expect(bundle.byType["relation negative rule"]).toHaveLength(1);
  });
});
