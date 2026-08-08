import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildExtractionUserPrompt, extractSlice } from "./extractor.ts";
import { callIdentityLlm } from "@/server/modules/identity/llm.ts";

vi.mock("@/server/modules/identity/llm.ts", () => ({ callIdentityLlm: vi.fn() }));
const mockCall = vi.mocked(callIdentityLlm);

const baseInput = {
  bookId               : "book-1",
  jobId                : "job-1",
  sliceText            : "范进中举后高兴疯了，周学道拔范进中了秀才。",
  chapterNos           : [3],
  bookSummary          : "儒林外史摘要",
  skills               : [],
  relationshipTypeCodes: ["师生", "父子"]
};

beforeEach(() => {
  mockCall.mockReset();
});

describe("buildExtractionUserPrompt", () => {
  it("包含正文/摘要/关系码，不含登记表（v6 提取无全局身份注入）", () => {
    const prompt = buildExtractionUserPrompt({ sliceText: "正文", bookSummary: "摘要", skills: ["skill1"], relationshipTypeCodes: ["师生"] });
    expect(prompt).toContain("正文");
    expect(prompt).toContain("摘要");
    expect(prompt).toContain("师生");
    expect(prompt).not.toContain("登记表");
  });
});

describe("extractSlice", () => {
  it("LLM 输出 → 组装 slice + 护栏 → 返回 facts", async () => {
    mockCall.mockResolvedValue({
      data: {
        entities: [
          { canonical: "范进", type: "PERSON", aliases: ["范老爷"] },
          { canonical: "周进", type: "PERSON", aliases: ["周学道"] }
        ],
        relations: [{ typeCode: "师生", sourceCanonical: "范进", targetCanonical: "周进", evidence: "周学道拔范进中了秀才" }],
        bioFacts : [{ category: "EXAM", subjectCanonical: "范进", summary: "中举", evidence: "范进中举" }]
      }
    });

    const result = await extractSlice(baseInput);
    expect(result.slice.chapterNos).toEqual([3]);
    expect(result.facts).toHaveLength(2); // 1 relation + 1 bioFact
  });

  it("非法关系码被护栏丢弃", async () => {
    mockCall.mockResolvedValue({
      data: {
        entities: [
          { canonical: "范进", type: "PERSON" },
          { canonical: "周进", type: "PERSON" }
        ],
        relations: [{ typeCode: "师徒", sourceCanonical: "范进", targetCanonical: "周进", evidence: "周学道拔范进中了秀才" }],
        bioFacts : []
      }
    });
    const result = await extractSlice(baseInput);
    expect(result.facts).toHaveLength(0);
    expect(result.dropRecords[0].reason).toBe("invalid_code");
  });
});
