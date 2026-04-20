import { describe, expect, it } from "vitest";

import {
  buildRelationTypeCatalog,
  findRelationNegativeRule,
  suggestRelationTypeByLabel
} from "@/server/modules/knowledge-v2/relation-types/catalog";

describe("relation type catalog", () => {
  it("merges presets with higher-scope custom taxonomy rules", () => {
    const catalog = buildRelationTypeCatalog({
      items: [
        {
          id           : "knowledge-1",
          scopeType    : "BOOK",
          scopeId      : "book-1",
          knowledgeType: "relation taxonomy rule",
          reviewState  : "VERIFIED",
          confidence   : 0.93,
          payload      : {
            relationTypeKey   : "political_patron_of",
            displayLabel      : "政治庇护",
            direction         : "FORWARD",
            relationTypeSource: "CUSTOM",
            aliasLabels       : ["依附", "门下"]
          }
        }
      ] as never
    });

    expect(catalog.entriesByKey["political_patron_of"]?.defaultLabel).toBe("政治庇护");
    expect(catalog.activeEntries.some((entry) => entry.relationTypeKey === "teacher_of")).toBe(true);
  });

  it("suppresses active entries when a higher-precedence taxonomy rule is disabled", () => {
    const catalog = buildRelationTypeCatalog({
      items: [
        {
          id           : "knowledge-2",
          scopeType    : "BOOK",
          scopeId      : "book-1",
          knowledgeType: "relation taxonomy rule",
          reviewState  : "DISABLED",
          confidence   : null,
          payload      : {
            relationTypeKey   : "teacher_of",
            displayLabel      : "师徒",
            direction         : "FORWARD",
            relationTypeSource: "PRESET",
            aliasLabels       : []
          }
        }
      ] as never
    });

    expect(catalog.entriesByKey["teacher_of"]?.enabled).toBe(false);
    expect(catalog.activeEntries.some((entry) => entry.relationTypeKey === "teacher_of")).toBe(false);
    expect(catalog.disabledEntries.map((entry) => entry.relationTypeKey)).toContain("teacher_of");
  });

  it("suggests a normalized relation type by mapping while preserving the observed label", () => {
    const catalog = buildRelationTypeCatalog({
      items: [
        {
          id           : "knowledge-3",
          scopeType    : "BOOK",
          scopeId      : "book-1",
          knowledgeType: "relation label mapping rule",
          reviewState  : "VERIFIED",
          confidence   : 0.88,
          payload      : {
            relationTypeKey   : "political_patron_of",
            observedLabel     : "门生",
            normalizedLabel   : "政治庇护",
            relationTypeSource: "NORMALIZED_FROM_CUSTOM"
          }
        }
      ] as never
    });

    const suggestion = suggestRelationTypeByLabel({
      catalog,
      relationLabel: "门生",
      direction    : "FORWARD"
    });

    expect(suggestion?.relationTypeKey).toBe("political_patron_of");
    expect(suggestion?.matchedLabel).toBe("门生");
    expect(suggestion?.normalizedLabel).toBe("政治庇护");
  });

  it("finds negative rules by label and direction", () => {
    const catalog = buildRelationTypeCatalog({
      items: [
        {
          id           : "knowledge-4",
          scopeType    : "BOOK",
          scopeId      : "book-1",
          knowledgeType: "relation negative rule",
          reviewState  : "VERIFIED",
          confidence   : 0.92,
          payload      : {
            relationTypeKey: "sworn_brother",
            blockedLabels  : ["兄弟相称"],
            denyDirection  : "BIDIRECTIONAL",
            reason         : "上下文仅为客套称呼"
          }
        }
      ] as never
    });

    const negative = findRelationNegativeRule({
      catalog,
      relationLabel: "兄弟相称",
      direction    : "BIDIRECTIONAL"
    });

    expect(negative?.reason).toContain("客套称呼");
  });
});
