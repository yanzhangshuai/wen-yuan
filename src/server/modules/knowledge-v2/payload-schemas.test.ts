import { describe, expect, it } from "vitest";

import {
  getKnowledgePayloadSchema,
  parseKnowledgePayload
} from "@/server/modules/knowledge-v2/payload-schemas";

describe("knowledge-v2 payload schemas", () => {
  it("parses alias equivalence rules", () => {
    const parsed = parseKnowledgePayload("alias equivalence rule", {
      canonicalName : "范进",
      aliasTexts    : ["范老爷", "范贤婿"],
      aliasTypeHints: ["TITLE", "NICKNAME"],
      note          : "同一人物的高频称呼"
    });

    expect(parsed.aliasTexts).toEqual(["范老爷", "范贤婿"]);
  });

  it("keeps relationTypeKey open for taxonomy rules", () => {
    const parsed = parseKnowledgePayload("relation taxonomy rule", {
      relationTypeKey   : "political_patron_of",
      displayLabel      : "政治庇护",
      direction         : "FORWARD",
      relationTypeSource: "CUSTOM",
      aliasLabels       : ["依附", "门生"]
    });

    expect(parsed.relationTypeKey).toBe("political_patron_of");
  });

  it("treats negative knowledge as first class", () => {
    const parsed = parseKnowledgePayload("relation negative rule", {
      relationTypeKey: "sworn_brother",
      blockedLabels  : ["结义兄弟"],
      denyDirection  : "BIDIRECTIONAL",
      reason         : "本书将此称谓用于夸饰，不应直接落正式关系"
    });

    expect(parsed.blockedLabels).toContain("结义兄弟");
  });

  it("rejects unknown knowledge types", () => {
    expect(() => getKnowledgePayloadSchema("imaginary rule")).toThrowError(
      "Unsupported knowledge type: imaginary rule"
    );
  });
});
