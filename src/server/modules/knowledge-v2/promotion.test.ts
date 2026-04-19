import { describe, expect, it, vi } from "vitest";

import { createKnowledgePromotionService } from "@/server/modules/knowledge-v2/promotion";

describe("knowledge-v2 promotion service", () => {
  it("promotes accepted claims into verified knowledge", async () => {
    const claimLookup = {
      findPromotableClaim: vi.fn().mockResolvedValue({
        id         : "claim-1",
        family     : "RELATION",
        reviewState: "ACCEPTED",
        bookId     : "book-1",
        chapterId  : "chapter-1",
        runId      : "run-1"
      })
    };
    const knowledgeRepository = {
      createKnowledgeItem: vi.fn().mockResolvedValue({
        id         : "knowledge-1",
        version    : 1,
        reviewState: "VERIFIED"
      }),
      createSupersedingKnowledgeItem: vi.fn()
    };

    const service = createKnowledgePromotionService({
      claimLookup,
      knowledgeRepository
    } as never);

    const result = await service.promoteReviewedClaim({
      claimFamily  : "RELATION",
      claimId      : "claim-1",
      knowledgeType: "relation taxonomy rule",
      scopeType    : "BOOK",
      scopeId      : null,
      payload      : {
        relationTypeKey   : "political_patron_of",
        displayLabel      : "政治庇护",
        direction         : "FORWARD",
        relationTypeSource: "CUSTOM",
        aliasLabels       : ["门生", "依附"]
      },
      actorUserId          : "user-1",
      targetReviewState    : "VERIFIED",
      supersedesKnowledgeId: null
    });

    expect(result.version).toBe(1);
    expect(knowledgeRepository.createKnowledgeItem).toHaveBeenCalledWith(expect.objectContaining({
      scopeType              : "BOOK",
      scopeId                : "book-1",
      promotedFromClaimId    : "claim-1",
      promotedFromClaimFamily: "RELATION"
    }));
  });

  it("rejects non-accepted claims", async () => {
    const claimLookup = {
      findPromotableClaim: vi.fn().mockResolvedValue({
        id         : "claim-2",
        family     : "RELATION",
        reviewState: "PENDING",
        bookId     : "book-1",
        chapterId  : "chapter-1",
        runId      : "run-1"
      })
    };
    const service = createKnowledgePromotionService({
      claimLookup,
      knowledgeRepository: {
        createKnowledgeItem           : vi.fn(),
        createSupersedingKnowledgeItem: vi.fn()
      }
    } as never);

    await expect(() => service.promoteReviewedClaim({
      claimFamily  : "RELATION",
      claimId      : "claim-2",
      knowledgeType: "relation taxonomy rule",
      scopeType    : "BOOK",
      scopeId      : null,
      payload      : {
        relationTypeKey   : "political_patron_of",
        displayLabel      : "政治庇护",
        direction         : "FORWARD",
        relationTypeSource: "CUSTOM",
        aliasLabels       : []
      },
      actorUserId          : "user-1",
      targetReviewState    : "VERIFIED",
      supersedesKnowledgeId: null
    })).rejects.toThrowError("Claim claim-2 is not promotable because reviewState=PENDING");
  });

  it("rejects missing claims", async () => {
    const claimLookup = {
      findPromotableClaim: vi.fn().mockResolvedValue(null)
    };
    const service = createKnowledgePromotionService({
      claimLookup,
      knowledgeRepository: {
        createKnowledgeItem           : vi.fn(),
        createSupersedingKnowledgeItem: vi.fn()
      }
    } as never);

    await expect(() => service.promoteReviewedClaim({
      claimFamily  : "TIME",
      claimId      : "claim-404",
      knowledgeType: "time normalization rule",
      scopeType    : "BOOK",
      scopeId      : null,
      payload      : {
        rawTimeText     : "次日",
        normalizedLabel : "次日",
        window          : null,
        confidencePolicy: null
      },
      actorUserId          : "user-1",
      targetReviewState    : "VERIFIED",
      supersedesKnowledgeId: null
    })).rejects.toThrowError("Claim claim-404 was not found in family TIME");
  });

  it("rejects claim family mismatches", async () => {
    const claimLookup = {
      findPromotableClaim: vi.fn().mockResolvedValue({
        id         : "claim-4",
        family     : "ALIAS",
        reviewState: "ACCEPTED",
        bookId     : "book-1",
        chapterId  : "chapter-1",
        runId      : "run-1"
      })
    };
    const service = createKnowledgePromotionService({
      claimLookup,
      knowledgeRepository: {
        createKnowledgeItem           : vi.fn(),
        createSupersedingKnowledgeItem: vi.fn()
      }
    } as never);

    await expect(() => service.promoteReviewedClaim({
      claimFamily  : "RELATION",
      claimId      : "claim-4",
      knowledgeType: "relation taxonomy rule",
      scopeType    : "BOOK",
      scopeId      : null,
      payload      : {
        relationTypeKey   : "political_patron_of",
        displayLabel      : "政治庇护",
        direction         : "FORWARD",
        relationTypeSource: "CUSTOM",
        aliasLabels       : []
      },
      actorUserId          : "user-1",
      targetReviewState    : "VERIFIED",
      supersedesKnowledgeId: null
    })).rejects.toThrowError("Claim claim-4 belongs to family ALIAS, expected RELATION");
  });

  it("requires explicit scopeId for book-type promotions", async () => {
    const claimLookup = {
      findPromotableClaim: vi.fn().mockResolvedValue({
        id         : "claim-5",
        family     : "ALIAS",
        reviewState: "ACCEPTED",
        bookId     : "book-1",
        chapterId  : "chapter-1",
        runId      : "run-1"
      })
    };
    const service = createKnowledgePromotionService({
      claimLookup,
      knowledgeRepository: {
        createKnowledgeItem           : vi.fn(),
        createSupersedingKnowledgeItem: vi.fn()
      }
    } as never);

    await expect(() => service.promoteReviewedClaim({
      claimFamily  : "ALIAS",
      claimId      : "claim-5",
      knowledgeType: "alias equivalence rule",
      scopeType    : "BOOK_TYPE",
      scopeId      : null,
      payload      : {
        canonicalName : "范进",
        aliasTexts    : ["范老爷"],
        aliasTypeHints: ["TITLE"],
        note          : null
      },
      actorUserId          : "user-1",
      targetReviewState    : "VERIFIED",
      supersedesKnowledgeId: null
    })).rejects.toThrowError("BOOK_TYPE promotion requires explicit scopeId");
  });

  it("can create pending run-scoped knowledge without review audit fields", async () => {
    const claimLookup = {
      findPromotableClaim: vi.fn().mockResolvedValue({
        id         : "claim-6",
        family     : "TIME",
        reviewState: "ACCEPTED",
        bookId     : "book-1",
        chapterId  : "chapter-1",
        runId      : "run-1"
      })
    };
    const knowledgeRepository = {
      createKnowledgeItem: vi.fn().mockResolvedValue({
        id         : "knowledge-6",
        version    : 1,
        reviewState: "PENDING"
      }),
      createSupersedingKnowledgeItem: vi.fn()
    };

    const service = createKnowledgePromotionService({
      claimLookup,
      knowledgeRepository
    } as never);

    await service.promoteReviewedClaim({
      claimFamily  : "TIME",
      claimId      : "claim-6",
      knowledgeType: "time normalization rule",
      scopeType    : "RUN",
      scopeId      : null,
      payload      : {
        rawTimeText     : "次日",
        normalizedLabel : "次日",
        window          : null,
        confidencePolicy: null
      },
      actorUserId          : "user-1",
      targetReviewState    : "PENDING",
      supersedesKnowledgeId: null
    });

    expect(knowledgeRepository.createKnowledgeItem).toHaveBeenCalledWith(expect.objectContaining({
      scopeType       : "RUN",
      scopeId         : "run-1",
      reviewState     : "PENDING",
      reviewedByUserId: null,
      reviewedAt      : null
    }));
  });

  it("creates a superseding version when requested", async () => {
    const claimLookup = {
      findPromotableClaim: vi.fn().mockResolvedValue({
        id         : "claim-3",
        family     : "ALIAS",
        reviewState: "ACCEPTED",
        bookId     : "book-1",
        chapterId  : "chapter-1",
        runId      : "run-1"
      })
    };
    const knowledgeRepository = {
      createKnowledgeItem           : vi.fn(),
      createSupersedingKnowledgeItem: vi.fn().mockResolvedValue({
        id     : "knowledge-2",
        version: 2
      })
    };

    const service = createKnowledgePromotionService({
      claimLookup,
      knowledgeRepository
    } as never);

    const result = await service.promoteReviewedClaim({
      claimFamily  : "ALIAS",
      claimId      : "claim-3",
      knowledgeType: "alias equivalence rule",
      scopeType    : "BOOK",
      scopeId      : null,
      payload      : {
        canonicalName : "范进",
        aliasTexts    : ["范老爷", "范贤婿"],
        aliasTypeHints: ["TITLE", "NICKNAME"],
        note          : null
      },
      actorUserId          : "user-1",
      targetReviewState    : "VERIFIED",
      supersedesKnowledgeId: "knowledge-1"
    });

    expect(result.version).toBe(2);
    expect(knowledgeRepository.createSupersedingKnowledgeItem).toHaveBeenCalledOnce();
  });
});
