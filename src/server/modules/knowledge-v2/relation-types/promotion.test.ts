import { describe, expect, it, vi } from "vitest";

import { createRelationTypePromotionService } from "@/server/modules/knowledge-v2/relation-types/promotion";

describe("relation-type promotion service", () => {
  it("promotes an accepted relation claim into taxonomy knowledge and mapping knowledge", async () => {
    const promotion = {
      promoteReviewedClaim: vi
        .fn()
        .mockResolvedValueOnce({ id: "knowledge-taxonomy-1" })
        .mockResolvedValueOnce({ id: "knowledge-mapping-1" })
    };
    const service = createRelationTypePromotionService({ knowledgePromotion: promotion as never });

    const result = await service.promoteAcceptedRelation({
      claimId        : "claim-1",
      actorUserId    : "user-1",
      scopeType      : "BOOK",
      scopeId        : "book-1",
      relationTypeKey: "political_patron_of",
      defaultLabel   : "政治庇护",
      direction      : "FORWARD",
      aliasLabels    : ["依附"],
      observedLabels : ["门生"]
    });

    expect(result.taxonomyKnowledgeId).toBe("knowledge-taxonomy-1");
    expect(result.mappingKnowledgeIds).toEqual(["knowledge-mapping-1"]);
  });

  it("skips mapping promotion when observed labels are empty or equal to the default label", async () => {
    const promotion = {
      promoteReviewedClaim: vi.fn().mockResolvedValue({ id: "knowledge-taxonomy-2" })
    };
    const service = createRelationTypePromotionService({ knowledgePromotion: promotion as never });

    const result = await service.promoteAcceptedRelation({
      claimId        : "claim-2",
      actorUserId    : "user-1",
      scopeType      : "BOOK",
      scopeId        : "book-1",
      relationTypeKey: "political_patron_of",
      defaultLabel   : "政治庇护",
      direction      : "FORWARD",
      aliasLabels    : [],
      observedLabels : ["政治庇护"]
    });

    expect(result.mappingKnowledgeIds).toEqual([]);
    expect(promotion.promoteReviewedClaim).toHaveBeenCalledTimes(1);
  });
});
