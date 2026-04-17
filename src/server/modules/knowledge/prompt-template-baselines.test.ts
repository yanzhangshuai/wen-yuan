import { describe, expect, it } from "vitest";

import {
  PROMPT_TEMPLATE_BASELINES
} from "@/server/modules/knowledge/prompt-template-baselines";
import {
  PROMPT_TEMPLATE_METADATA,
  PROMPT_TEMPLATE_ORDER,
  getPromptTemplateMetadata
} from "@/lib/prompt-template-metadata";

describe("prompt template baselines", () => {
  it("keeps metadata order and baseline coverage aligned for all prompt slugs", () => {
    expect(PROMPT_TEMPLATE_BASELINES.map((item) => item.slug)).toEqual(PROMPT_TEMPLATE_ORDER);

    for (const baseline of PROMPT_TEMPLATE_BASELINES) {
      const metadata = PROMPT_TEMPLATE_METADATA[baseline.slug];

      expect(metadata).toBeDefined();
      expect(baseline.name).toBe(metadata.name);
      expect(baseline.description).toBe(metadata.description);
      expect(baseline.codeRef).toBe(metadata.codeRef);
      expect(baseline.systemPrompt.trim().length).toBeGreaterThan(0);
      expect(baseline.userPrompt.length).toBeGreaterThan(50);
    }
  });

  it("exposes metadata lookups for known slugs and returns null for unknown slugs", () => {
    expect(getPromptTemplateMetadata("CHAPTER_VALIDATION")).toEqual(
      PROMPT_TEMPLATE_METADATA.CHAPTER_VALIDATION
    );
    expect(getPromptTemplateMetadata("UNKNOWN_TEMPLATE")).toBeNull();
  });

  it("keeps representative placeholders available in baseline prompts", () => {
    const chapterAnalysis = PROMPT_TEMPLATE_BASELINES.find((item) => item.slug === "CHAPTER_ANALYSIS");
    const titleArbitration = PROMPT_TEMPLATE_BASELINES.find((item) => item.slug === "TITLE_ARBITRATION");
    const entityResolution = PROMPT_TEMPLATE_BASELINES.find((item) => item.slug === "ENTITY_RESOLUTION");

    expect(chapterAnalysis?.userPrompt).toContain("{analysisRules}");
    expect(chapterAnalysis?.userPrompt).toContain("{knownEntities}");
    expect(titleArbitration?.userPrompt).toContain("{terms}");
    expect(entityResolution?.userPrompt).toContain("{candidateGroups}");
  });

  it("exposes Stage A/B/C baselines with required placeholders and enum mentions", () => {
    const stageA = PROMPT_TEMPLATE_BASELINES.find((item) => item.slug === "STAGE_A_EXTRACT_MENTIONS");
    const stageB = PROMPT_TEMPLATE_BASELINES.find((item) => item.slug === "STAGE_B_RESOLVE_ENTITIES");
    const stageC = PROMPT_TEMPLATE_BASELINES.find((item) => item.slug === "STAGE_C_ATTRIBUTE_EVENT");

    expect(stageA?.userPrompt).toContain("{chapterNo}");
    expect(stageA?.userPrompt).toContain("{chapterText}");
    expect(stageA?.userPrompt).toContain("{regionMap}");
    expect(stageA?.userPrompt).toContain("{bookTypeSpecialRules}");
    expect(stageA?.userPrompt).toContain("{bookTypeFewShots}");
    expect(stageA?.userPrompt).toContain("suspectedResolvesTo");
    expect(stageA?.userPrompt).toContain("identityClaim");

    expect(stageB?.userPrompt).toContain("{candidateGroups}");
    expect(stageB?.userPrompt).toContain("{aliasEntries}");
    expect(stageB?.userPrompt).toContain("MERGE");
    expect(stageB?.userPrompt).toContain("KEEP_SEPARATE");

    expect(stageC?.userPrompt).toContain("{resolvedPersonas}");
    expect(stageC?.userPrompt).toContain("{mentions}");
    expect(stageC?.userPrompt).toContain("narrativeLens");
  });
});
