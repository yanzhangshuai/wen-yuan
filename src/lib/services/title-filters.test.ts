import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  batchGenericTitleAction,
  createGenericTitle,
  deleteGenericTitle,
  fetchGenericTitles,
  pollTitleFilterGenerationJob,
  previewGenericTitleGenerationPrompt,
  reviewGeneratedGenericTitles,
  testGenericTitle,
  updateGenericTitle
} from "@/lib/services/title-filters";

const hoisted = vi.hoisted(() => ({
  clientFetchMock : vi.fn(),
  clientMutateMock: vi.fn()
}));

vi.mock("@/lib/client-api", () => ({
  clientFetch : hoisted.clientFetchMock,
  clientMutate: hoisted.clientMutateMock
}));

describe("title-filters service", () => {
  beforeEach(() => {
    hoisted.clientFetchMock.mockReset();
    hoisted.clientMutateMock.mockReset();
  });

  it("posts batch generic title actions and returns affected count", async () => {
    hoisted.clientFetchMock.mockResolvedValueOnce({ count: 2 });

    await expect(batchGenericTitleAction({
      action    : "changeBookType",
      ids       : ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"],
      bookTypeId: "33333333-3333-4333-8333-333333333333"
    })).resolves.toEqual({ count: 2 });

    expect(hoisted.clientFetchMock).toHaveBeenCalledWith("/api/admin/knowledge/title-filters/batch", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({
        action    : "changeBookType",
        ids       : ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"],
        bookTypeId: "33333333-3333-4333-8333-333333333333"
      })
    });
    expect(hoisted.clientMutateMock).not.toHaveBeenCalled();
  });

  it("uses title filter endpoints and async generation payloads", async () => {
    hoisted.clientFetchMock
      .mockResolvedValueOnce([{ id: "title-1" }])
      .mockResolvedValueOnce({ id: "title-2" })
      .mockResolvedValueOnce({ title: "先生", genre: "武侠", result: "generic", reason: "命中泛称", tier: "DEFAULT" })
      .mockResolvedValueOnce({ systemPrompt: "system", userPrompt: "user" })
      .mockResolvedValueOnce({ jobId: "job-title-1" })
      .mockResolvedValueOnce({
        jobId : "job-title-1",
        status: "done",
        step  : "生成完成",
        result: {
          targetCount      : 20,
          referenceBookType: null,
          systemPrompt     : "system",
          userPrompt       : "user",
          candidates       : [],
          skipped          : 0,
          rawContent       : "[]",
          model            : { id: "model-1", provider: "qwen", modelName: "qwen-max" }
        },
        error: null
      });
    hoisted.clientMutateMock.mockResolvedValue(undefined);

    await fetchGenericTitles({ tier: "DEFAULT", q: "先生" });
    await createGenericTitle({
      title         : "先生",
      tier          : "DEFAULT",
      exemptInGenres: ["wuxia"],
      description   : "多数场景为泛称",
      source        : "LLM_SUGGESTED"
    });
    await updateGenericTitle("title-2", {
      tier          : "SAFETY",
      exemptInGenres: [],
      description   : "绝对泛称",
      isActive      : false
    });
    await deleteGenericTitle("title-2");
    await testGenericTitle("先生", "wuxia");
    await previewGenericTitleGenerationPrompt({
      targetCount           : 20,
      additionalInstructions: "优先补充武侠称谓",
      referenceBookTypeId   : "11111111-1111-4111-8111-111111111111"
    });
    await reviewGeneratedGenericTitles({
      targetCount           : 20,
      additionalInstructions: "优先补充武侠称谓",
      referenceBookTypeId   : "11111111-1111-4111-8111-111111111111",
      modelId               : "22222222-2222-4222-8222-222222222222"
    });
    await pollTitleFilterGenerationJob("job-title-1");

    expect(hoisted.clientFetchMock).toHaveBeenNthCalledWith(1, "/api/admin/knowledge/title-filters?tier=DEFAULT&q=%E5%85%88%E7%94%9F");
    expect(hoisted.clientFetchMock).toHaveBeenNthCalledWith(2, "/api/admin/knowledge/title-filters", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({
        title         : "先生",
        tier          : "DEFAULT",
        exemptInGenres: ["wuxia"],
        description   : "多数场景为泛称",
        source        : "LLM_SUGGESTED"
      })
    });
    expect(hoisted.clientMutateMock).toHaveBeenNthCalledWith(1, "/api/admin/knowledge/title-filters/title-2", {
      method : "PATCH",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({
        tier          : "SAFETY",
        exemptInGenres: [],
        description   : "绝对泛称",
        isActive      : false
      })
    });
    expect(hoisted.clientMutateMock).toHaveBeenNthCalledWith(2, "/api/admin/knowledge/title-filters/title-2", {
      method: "DELETE"
    });
    expect(hoisted.clientFetchMock).toHaveBeenNthCalledWith(3, "/api/admin/knowledge/title-filters/test", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ title: "先生", genreKey: "wuxia" })
    });
    expect(hoisted.clientFetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/admin/knowledge/title-filters/generate/preview-prompt?targetCount=20&additionalInstructions=%E4%BC%98%E5%85%88%E8%A1%A5%E5%85%85%E6%AD%A6%E4%BE%A0%E7%A7%B0%E8%B0%93&referenceBookTypeId=11111111-1111-4111-8111-111111111111"
    );
    expect(hoisted.clientFetchMock).toHaveBeenNthCalledWith(5, "/api/admin/knowledge/title-filters/generate", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({
        targetCount           : 20,
        additionalInstructions: "优先补充武侠称谓",
        referenceBookTypeId   : "11111111-1111-4111-8111-111111111111",
        modelId               : "22222222-2222-4222-8222-222222222222"
      })
    });
    expect(hoisted.clientFetchMock).toHaveBeenNthCalledWith(6, "/api/admin/knowledge/title-filters/generate?jobId=job-title-1");
  });
});
