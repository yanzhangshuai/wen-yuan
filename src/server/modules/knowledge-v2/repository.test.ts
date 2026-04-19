import { describe, expect, it, vi } from "vitest";

import { getRuntimeReviewStates } from "@/server/modules/knowledge-v2/base-types";
import {
  getKnowledgePayloadSchema,
  parseKnowledgePayload
} from "@/server/modules/knowledge-v2/payload-schemas";
import {
  createKnowledgeRepository,
  type KnowledgeRepositoryClient,
  type KnowledgeRepositoryTransactionClient
} from "@/server/modules/knowledge-v2/repository";

function createPrismaMock() {
  const knowledgeItemCreate = vi.fn().mockResolvedValue({
    id           : "knowledge-1",
    scopeType    : "BOOK",
    scopeId      : "book-1",
    knowledgeType: "alias equivalence rule",
    payload      : {
      canonicalName : "范进",
      aliasTexts    : ["范老爷"],
      aliasTypeHints: ["TITLE"],
      note          : null
    },
    source                 : "MANUAL_ENTRY",
    reviewState            : "VERIFIED",
    confidence             : 0.92,
    effectiveFrom          : null,
    effectiveTo            : null,
    promotedFromClaimId    : null,
    promotedFromClaimFamily: null,
    supersedesKnowledgeId  : null,
    version                : 1,
    createdByUserId        : "user-1",
    reviewedByUserId       : "user-1",
    reviewedAt             : new Date("2026-04-19T10:00:00.000Z"),
    createdAt              : new Date("2026-04-19T10:00:00.000Z"),
    updatedAt              : new Date("2026-04-19T10:00:00.000Z")
  });

  const knowledgeItemFindMany = vi.fn().mockResolvedValue([]);
  const knowledgeItemFindUnique = vi.fn();
  const knowledgeItemUpdate = vi.fn().mockResolvedValue({
    id           : "knowledge-1",
    scopeType    : "BOOK",
    scopeId      : "book-1",
    knowledgeType: "alias equivalence rule",
    payload      : {
      canonicalName : "范进",
      aliasTexts    : ["范老爷"],
      aliasTypeHints: ["TITLE"],
      note          : null
    },
    source                 : "MANUAL_ENTRY",
    reviewState            : "DISABLED",
    confidence             : 0.92,
    effectiveFrom          : null,
    effectiveTo            : null,
    promotedFromClaimId    : null,
    promotedFromClaimFamily: null,
    supersedesKnowledgeId  : null,
    version                : 1,
    createdByUserId        : "user-1",
    reviewedByUserId       : "user-2",
    reviewedAt             : new Date("2026-04-19T12:00:00.000Z"),
    createdAt              : new Date("2026-04-19T10:00:00.000Z"),
    updatedAt              : new Date("2026-04-19T12:00:00.000Z")
  });

  const prisma: KnowledgeRepositoryClient = {
    knowledgeItem: {
      create    : knowledgeItemCreate,
      findMany  : knowledgeItemFindMany,
      findUnique: knowledgeItemFindUnique,
      update    : knowledgeItemUpdate
    },
    $transaction: async <T>(callback: (tx: KnowledgeRepositoryTransactionClient) => Promise<T>) => callback(prisma)
  };

  return {
    prisma,
    knowledgeItemCreate,
    knowledgeItemFindMany,
    knowledgeItemFindUnique,
    knowledgeItemUpdate
  };
}

describe("knowledge-v2 repository", () => {
  it("creates validated knowledge rows", async () => {
    const { prisma, knowledgeItemCreate } = createPrismaMock();
    const repository = createKnowledgeRepository(prisma);

    const created = await repository.createKnowledgeItem({
      scopeType    : "BOOK",
      scopeId      : "book-1",
      knowledgeType: "alias equivalence rule",
      payload      : {
        canonicalName : "范进",
        aliasTexts    : ["范老爷"],
        aliasTypeHints: ["TITLE"],
        note          : null
      },
      source                 : "MANUAL_ENTRY",
      reviewState            : "VERIFIED",
      confidence             : 0.92,
      effectiveFrom          : null,
      effectiveTo            : null,
      promotedFromClaimId    : null,
      promotedFromClaimFamily: null,
      createdByUserId        : "user-1",
      reviewedByUserId       : "user-1",
      reviewedAt             : new Date("2026-04-19T10:00:00.000Z")
    });

    expect(knowledgeItemCreate).toHaveBeenCalledOnce();
    expect(created.version).toBe(1);
  });

  it("lists knowledge by scope and review state", async () => {
    const { prisma, knowledgeItemFindMany } = createPrismaMock();
    knowledgeItemFindMany.mockResolvedValueOnce([
      {
        id           : "knowledge-1",
        scopeType    : "GLOBAL",
        scopeId      : null,
        knowledgeType: "relation negative rule",
        payload      : {
          relationTypeKey: "sworn_brother",
          blockedLabels  : ["结义兄弟"],
          denyDirection  : "BIDIRECTIONAL",
          reason         : "测试"
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
        updatedAt              : new Date("2026-04-19T10:00:00.000Z")
      }
    ]);

    const repository = createKnowledgeRepository(prisma);
    const items = await repository.listKnowledgeItems({
      scopeSelectors: [{ scopeType: "GLOBAL", scopeId: null }],
      reviewStates  : ["VERIFIED"]
    });

    expect(items).toHaveLength(1);
    expect(items[0].knowledgeType).toBe("relation negative rule");
  });

  it("passes knowledge type filters through to list queries", async () => {
    const { prisma, knowledgeItemFindMany } = createPrismaMock();
    const repository = createKnowledgeRepository(prisma);

    await repository.listKnowledgeItems({
      knowledgeTypes: ["alias equivalence rule"]
    });

    expect(knowledgeItemFindMany).toHaveBeenCalledWith({
      where: {
        knowledgeType: {
          in: ["alias equivalence rule"]
        }
      },
      orderBy: [
        { createdAt: "asc" },
        { version: "asc" }
      ]
    });
  });

  it("creates superseding versions by incrementing version", async () => {
    const { prisma, knowledgeItemFindUnique, knowledgeItemCreate } = createPrismaMock();
    knowledgeItemFindUnique.mockResolvedValueOnce({
      id           : "knowledge-1",
      scopeType    : "BOOK",
      scopeId      : "book-1",
      knowledgeType: "alias equivalence rule",
      payload      : {
        canonicalName : "范进",
        aliasTexts    : ["范老爷"],
        aliasTypeHints: ["TITLE"],
        note          : null
      },
      source                 : "MANUAL_ENTRY",
      reviewState            : "VERIFIED",
      confidence             : 0.92,
      effectiveFrom          : null,
      effectiveTo            : null,
      promotedFromClaimId    : null,
      promotedFromClaimFamily: null,
      supersedesKnowledgeId  : null,
      version                : 1,
      createdByUserId        : "user-1",
      reviewedByUserId       : "user-1",
      reviewedAt             : new Date("2026-04-19T10:00:00.000Z"),
      createdAt              : new Date("2026-04-19T10:00:00.000Z"),
      updatedAt              : new Date("2026-04-19T10:00:00.000Z")
    });
    knowledgeItemCreate.mockResolvedValueOnce({
      id           : "knowledge-2",
      scopeType    : "BOOK",
      scopeId      : "book-1",
      knowledgeType: "alias equivalence rule",
      payload      : {
        canonicalName : "范进",
        aliasTexts    : ["范老爷", "范贤婿"],
        aliasTypeHints: ["TITLE", "NICKNAME"],
        note          : null
      },
      source                 : "MANUAL_ENTRY",
      reviewState            : "VERIFIED",
      confidence             : 0.95,
      effectiveFrom          : null,
      effectiveTo            : null,
      promotedFromClaimId    : null,
      promotedFromClaimFamily: null,
      supersedesKnowledgeId  : "knowledge-1",
      version                : 2,
      createdByUserId        : "user-1",
      reviewedByUserId       : "user-1",
      reviewedAt             : new Date("2026-04-19T11:00:00.000Z"),
      createdAt              : new Date("2026-04-19T11:00:00.000Z"),
      updatedAt              : new Date("2026-04-19T11:00:00.000Z")
    });

    const repository = createKnowledgeRepository(prisma);
    const created = await repository.createSupersedingKnowledgeItem({
      supersedesKnowledgeId: "knowledge-1",
      payload              : {
        canonicalName : "范进",
        aliasTexts    : ["范老爷", "范贤婿"],
        aliasTypeHints: ["TITLE", "NICKNAME"],
        note          : null
      },
      source                 : "MANUAL_ENTRY",
      reviewState            : "VERIFIED",
      confidence             : 0.95,
      effectiveFrom          : null,
      effectiveTo            : null,
      promotedFromClaimId    : null,
      promotedFromClaimFamily: null,
      createdByUserId        : "user-1",
      reviewedByUserId       : "user-1",
      reviewedAt             : new Date("2026-04-19T11:00:00.000Z")
    });

    expect(created.version).toBe(2);
    expect(created.supersedesKnowledgeId).toBe("knowledge-1");
  });

  it("throws when the superseded knowledge row does not exist", async () => {
    const { prisma, knowledgeItemFindUnique } = createPrismaMock();
    knowledgeItemFindUnique.mockResolvedValueOnce(null);
    const repository = createKnowledgeRepository(prisma);

    await expect(repository.createSupersedingKnowledgeItem({
      supersedesKnowledgeId: "missing-knowledge",
      payload              : {
        canonicalName : "范进",
        aliasTexts    : ["范老爷"],
        aliasTypeHints: ["TITLE"],
        note          : null
      },
      source                 : "MANUAL_ENTRY",
      reviewState            : "VERIFIED",
      confidence             : 0.95,
      effectiveFrom          : null,
      effectiveTo            : null,
      promotedFromClaimId    : null,
      promotedFromClaimFamily: null,
      createdByUserId        : "user-1",
      reviewedByUserId       : "user-1",
      reviewedAt             : new Date("2026-04-19T11:00:00.000Z")
    })).rejects.toThrow("Knowledge item missing-knowledge was not found");
  });

  it("updates knowledge review state", async () => {
    const { prisma, knowledgeItemUpdate } = createPrismaMock();
    const repository = createKnowledgeRepository(prisma);

    const updated = await repository.reviewKnowledgeItem({
      knowledgeId     : "knowledge-1",
      reviewState     : "DISABLED",
      reviewedByUserId: "user-2",
      reviewedAt      : new Date("2026-04-19T12:00:00.000Z")
    });

    expect(knowledgeItemUpdate).toHaveBeenCalledOnce();
    expect(updated.reviewState).toBe("DISABLED");
  });

  it("rejects GLOBAL writes that still carry scopeId", async () => {
    const { prisma } = createPrismaMock();
    const repository = createKnowledgeRepository(prisma);

    await expect(repository.createKnowledgeItem({
      scopeType    : "GLOBAL",
      scopeId      : "should-not-exist",
      knowledgeType: "alias equivalence rule",
      payload      : {
        canonicalName : "范进",
        aliasTexts    : ["范老爷"],
        aliasTypeHints: ["TITLE"],
        note          : null
      },
      source                 : "MANUAL_ENTRY",
      reviewState            : "VERIFIED",
      confidence             : 0.92,
      effectiveFrom          : null,
      effectiveTo            : null,
      promotedFromClaimId    : null,
      promotedFromClaimFamily: null,
      createdByUserId        : "user-1",
      reviewedByUserId       : "user-1",
      reviewedAt             : new Date("2026-04-19T10:00:00.000Z")
    })).rejects.toThrow("GLOBAL scope must not define scopeId");
  });

  it("rejects non-global scope selectors without scopeId", async () => {
    const { prisma } = createPrismaMock();
    const repository = createKnowledgeRepository(prisma);

    await expect(repository.listKnowledgeItems({
      scopeSelectors: [{ scopeType: "BOOK", scopeId: null }]
    })).rejects.toThrow("BOOK scope requires scopeId");
  });

  it("returns runtime visibility states for strict and preview modes", () => {
    expect(getRuntimeReviewStates("VERIFIED_ONLY")).toEqual(["VERIFIED"]);
    expect(getRuntimeReviewStates("INCLUDE_PENDING")).toEqual(["VERIFIED", "PENDING"]);
  });

  it("parses payloads from the registry", () => {
    const payload = parseKnowledgePayload("prompt extraction hint", {
      stageKey: "stage_a_extraction",
      hintType: "STYLE",
      content : "保留字号与称谓",
      priority: 1
    });

    expect(payload).toEqual({
      stageKey: "stage_a_extraction",
      hintType: "STYLE",
      content : "保留字号与称谓",
      priority: 1
    });
    expect(getKnowledgePayloadSchema("name lexicon rule").parse({
      terms : ["范进", "周进"],
      bucket: "PERSON_NAME",
      note  : null
    })).toEqual({
      terms : ["范进", "周进"],
      bucket: "PERSON_NAME",
      note  : null
    });
  });

  it("rejects unsupported payload schema lookups", () => {
    expect(() => getKnowledgePayloadSchema("unsupported knowledge type")).toThrow(
      "Unsupported knowledge type: unsupported knowledge type"
    );
  });
});
