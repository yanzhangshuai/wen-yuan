import { describe, expect, it } from "vitest";

import {
  parseRelationCatalogEntry,
  parseRelationNormalizationSuggestion
} from "@/server/modules/knowledge-v2/relation-types/contracts";

describe("relation-types contracts", () => {
  it("keeps relationTypeKey as an open string", () => {
    const parsed = parseRelationCatalogEntry({
      relationTypeKey   : "political_patron_of",
      defaultLabel      : "政治庇护",
      direction         : "FORWARD",
      relationTypeSource: "CUSTOM",
      aliasLabels       : ["门生", "依附"],
      scopeType         : "BOOK",
      scopeId           : "book-1",
      reviewState       : "VERIFIED",
      systemPreset      : false,
      enabled           : true,
      knowledgeItemId   : "knowledge-1"
    });

    expect(parsed.relationTypeKey).toBe("political_patron_of");
  });

  it("rejects blank display labels and blank aliases", () => {
    expect(() => parseRelationCatalogEntry({
      relationTypeKey   : "teacher_of",
      defaultLabel      : " ",
      direction         : "FORWARD",
      relationTypeSource: "PRESET",
      aliasLabels       : ["师徒", " "],
      scopeType         : "GLOBAL",
      scopeId           : null,
      reviewState       : "VERIFIED",
      systemPreset      : true,
      enabled           : true,
      knowledgeItemId   : null
    })).toThrow();
  });

  it("keeps normalization suggestions serializable for Stage A+ and review APIs", () => {
    const parsed = parseRelationNormalizationSuggestion({
      relationTypeKey   : "teacher_of",
      matchedLabel      : "师生",
      normalizedLabel   : "师徒",
      direction         : "FORWARD",
      relationTypeSource: "PRESET",
      confidence        : 0.91,
      reviewState       : "VERIFIED",
      knowledgeItemId   : "knowledge-2"
    });

    expect(parsed.normalizedLabel).toBe("师徒");
  });
});
