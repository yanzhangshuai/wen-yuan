import { z } from "zod";

import { relationDirectionSchema } from "@/server/modules/analysis/claims/base-types";
import { knowledgeScopeTypeSchema } from "@/server/modules/knowledge-v2/base-types";
import type {
  KnowledgePromotionTargetReviewState,
  PromoteReviewedClaimInput
} from "@/server/modules/knowledge-v2/promotion";

const trimmedNonEmptyString = z.string().trim().min(1);

const relationTypePromotionSchema = z.object({
  claimId          : trimmedNonEmptyString,
  actorUserId      : trimmedNonEmptyString,
  scopeType        : knowledgeScopeTypeSchema,
  scopeId          : trimmedNonEmptyString.nullable(),
  relationTypeKey  : trimmedNonEmptyString,
  defaultLabel     : trimmedNonEmptyString,
  direction        : relationDirectionSchema,
  aliasLabels      : z.array(trimmedNonEmptyString).default([]),
  observedLabels   : z.array(trimmedNonEmptyString).default([]),
  targetReviewState: z.enum(["PENDING", "VERIFIED"]).default("VERIFIED")
});

type RelationTypePromotionInput = z.input<typeof relationTypePromotionSchema>;

interface RelationTypeKnowledgePromotion {
  promoteReviewedClaim(input: PromoteReviewedClaimInput): Promise<{ id: string }>;
}

export function createRelationTypePromotionService(dependencies: {
  knowledgePromotion: RelationTypeKnowledgePromotion;
}) {
  return {
    async promoteAcceptedRelation(rawInput: RelationTypePromotionInput) {
      const input = relationTypePromotionSchema.parse(rawInput);

      const taxonomy = await dependencies.knowledgePromotion.promoteReviewedClaim({
        claimFamily  : "RELATION",
        claimId      : input.claimId,
        knowledgeType: "relation taxonomy rule",
        scopeType    : input.scopeType,
        scopeId      : input.scopeId,
        payload      : {
          relationTypeKey   : input.relationTypeKey,
          displayLabel      : input.defaultLabel,
          direction         : input.direction,
          relationTypeSource: "CUSTOM",
          aliasLabels       : input.aliasLabels
        },
        actorUserId          : input.actorUserId,
        targetReviewState    : input.targetReviewState as KnowledgePromotionTargetReviewState,
        supersedesKnowledgeId: null
      });

      const mappingKnowledgeIds: string[] = [];
      const dedupedObservedLabels = Array.from(new Set(
        input.observedLabels.map((value) => value.trim())
      ));

      for (const observedLabel of dedupedObservedLabels) {
        if (observedLabel === input.defaultLabel) {
          continue;
        }

        const mapping = await dependencies.knowledgePromotion.promoteReviewedClaim({
          claimFamily  : "RELATION",
          claimId      : input.claimId,
          knowledgeType: "relation label mapping rule",
          scopeType    : input.scopeType,
          scopeId      : input.scopeId,
          payload      : {
            relationTypeKey   : input.relationTypeKey,
            observedLabel,
            normalizedLabel   : input.defaultLabel,
            relationTypeSource: "NORMALIZED_FROM_CUSTOM"
          },
          actorUserId          : input.actorUserId,
          targetReviewState    : input.targetReviewState as KnowledgePromotionTargetReviewState,
          supersedesKnowledgeId: null
        });

        mappingKnowledgeIds.push(mapping.id);
      }

      return {
        taxonomyKnowledgeId: taxonomy.id,
        mappingKnowledgeIds
      };
    }
  };
}
