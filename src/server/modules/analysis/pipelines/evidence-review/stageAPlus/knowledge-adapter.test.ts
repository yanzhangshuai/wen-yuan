import { describe, expect, it } from "vitest";

import { compileStageAPlusKnowledge } from "@/server/modules/analysis/pipelines/evidence-review/stageAPlus/knowledge-adapter";
import type { RuntimeKnowledgeItem } from "@/server/modules/knowledge-v2/runtime-loader";

function buildItem(overrides: Partial<RuntimeKnowledgeItem> = {}): RuntimeKnowledgeItem {
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
    reviewedByUserId       : null,
    reviewedAt             : null,
    createdAt              : new Date("2026-04-19T00:00:00.000Z"),
    updatedAt              : new Date("2026-04-19T00:00:00.000Z"),
    ...overrides
  };
}

describe("Stage A+ knowledge adapter", () => {
  it("compiles verified and pending alias rules with different weights", () => {
    const compiled = compileStageAPlusKnowledge({
      scopeChain   : [{ scopeType: "GLOBAL", scopeId: null }],
      verifiedItems: [buildItem({ id: "verified-alias", reviewState: "VERIFIED" })],
      pendingItems : [buildItem({ id: "pending-alias", reviewState: "PENDING", confidence: 0.8 })],
      byType       : {} as never
    });

    expect(compiled.aliasEquivalenceRules).toHaveLength(2);
    expect(compiled.aliasEquivalenceRules.find((rule) => rule.id === "verified-alias")?.confidence)
      .toBeGreaterThan(compiled.aliasEquivalenceRules.find((rule) => rule.id === "pending-alias")?.confidence ?? 1);
    expect(compiled.aliasEquivalenceRules.find((rule) => rule.id === "pending-alias")?.reviewState)
      .toBe("PENDING");
  });

  it("retains negative alias and relation rules as first-class compiled rules", () => {
    const compiled = compileStageAPlusKnowledge({
      scopeChain   : [{ scopeType: "GLOBAL", scopeId: null }],
      verifiedItems: [
        buildItem({
          id           : "alias-negative",
          knowledgeType: "alias negative rule",
          payload      : {
            aliasText            : "牛布衣",
            blockedCanonicalNames: ["牛浦郎"],
            reason               : "冒名不是同人别名"
          }
        }),
        buildItem({
          id           : "relation-negative",
          knowledgeType: "relation negative rule",
          payload      : {
            relationTypeKey: "sworn_brother",
            blockedLabels  : ["结义兄弟"],
            denyDirection  : "BIDIRECTIONAL",
            reason         : "本书中该称谓为夸饰"
          }
        })
      ],
      pendingItems: [],
      byType      : {} as never
    });

    expect(compiled.aliasNegativeRules[0]).toMatchObject({
      id       : "alias-negative",
      aliasText: "牛布衣"
    });
    expect(compiled.relationNegativeRules[0]).toMatchObject({
      id             : "relation-negative",
      relationTypeKey: "sworn_brother"
    });
  });

  it("compiles relation taxonomy aliases and observed-label mappings", () => {
    const compiled = compileStageAPlusKnowledge({
      scopeChain   : [{ scopeType: "GLOBAL", scopeId: null }],
      verifiedItems: [
        buildItem({
          id           : "taxonomy",
          knowledgeType: "relation taxonomy rule",
          payload      : {
            relationTypeKey   : "teacher_of",
            displayLabel      : "师生",
            direction         : "FORWARD",
            relationTypeSource: "PRESET",
            aliasLabels       : ["门生", "老师"]
          }
        }),
        buildItem({
          id           : "mapping",
          knowledgeType: "relation label mapping rule",
          payload      : {
            relationTypeKey   : "political_patron_of",
            observedLabel     : "提携",
            normalizedLabel   : "政治庇护",
            relationTypeSource: "NORMALIZED_FROM_CUSTOM"
          }
        })
      ],
      pendingItems: [],
      byType      : {} as never
    });

    expect(compiled.relationTaxonomyRules[0].aliasLabels).toContain("门生");
    expect(compiled.relationMappings[0].relationTypeKey).toBe("political_patron_of");
  });
});
