import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminModelItem } from "@/lib/services/models";
import {
  batchRejectEntries,
  batchVerifyEntries,
  createEntry,
  createKnowledgePack,
  deleteEntry,
  deleteKnowledgePack,
  fetchEntries,
  fetchGenerationBooks,
  fetchGenerationModels,
  fetchKnowledgePack,
  fetchKnowledgePacks,
  generateEntries,
  getExportUrl,
  importEntries,
  previewGenerateEntriesPrompt,
  rejectEntry,
  reviewGenerateEntries,
  updateEntry,
  updateKnowledgePack,
  verifyEntry
} from "@/lib/services/knowledge";

const hoisted = vi.hoisted(() => ({
  clientFetchMock : vi.fn(),
  clientMutateMock: vi.fn(),
  fetchModelsMock : vi.fn(),
  fetchMock       : vi.fn()
}));

vi.mock("@/lib/client-api", () => ({
  clientFetch : hoisted.clientFetchMock,
  clientMutate: hoisted.clientMutateMock
}));

vi.mock("@/lib/services/models", () => ({
  fetchModels: hoisted.fetchModelsMock
}));

function buildModel(overrides: Partial<AdminModelItem> = {}): AdminModelItem {
  return {
    id             : overrides.id ?? "model-1",
    provider       : overrides.provider ?? "qwen",
    name           : overrides.name ?? "Qwen Plus",
    providerModelId: overrides.providerModelId ?? "qwen-plus",
    aliasKey       : overrides.aliasKey ?? null,
    baseUrl        : overrides.baseUrl ?? "https://example.com",
    apiKeyMasked   : overrides.apiKeyMasked ?? "sk-***",
    isConfigured   : overrides.isConfigured ?? true,
    performance    : overrides.performance ?? {
      callCount          : 0,
      successRate        : null,
      avgLatencyMs       : null,
      avgPromptTokens    : null,
      avgCompletionTokens: null,
      ratings            : {
        speed    : 0,
        stability: 0,
        cost     : 0
      }
    },
    isEnabled: overrides.isEnabled ?? true,
    isDefault: overrides.isDefault ?? false,
    updatedAt: overrides.updatedAt ?? "2026-04-11T00:00:00.000Z"
  };
}

describe("knowledge service", () => {
  beforeEach(() => {
    hoisted.clientFetchMock.mockReset();
    hoisted.clientMutateMock.mockReset();
    hoisted.fetchModelsMock.mockReset();
    hoisted.fetchMock.mockReset();
    vi.stubGlobal("fetch", hoisted.fetchMock);
  });

  it("fetchGenerationModels keeps enabled models even when isConfigured is false", async () => {
    hoisted.fetchModelsMock.mockResolvedValueOnce([
      buildModel({ id: "enabled-unconfigured", isEnabled: true, isConfigured: false, isDefault: true }),
      buildModel({ id: "enabled-configured", isEnabled: true, isConfigured: true }),
      buildModel({ id: "disabled", isEnabled: false, isConfigured: true })
    ]);

    const models = await fetchGenerationModels();

    expect(models).toEqual([
      {
        id             : "enabled-unconfigured",
        name           : "Qwen Plus",
        provider       : "qwen",
        providerModelId: "qwen-plus",
        isDefault      : true
      },
      {
        id             : "enabled-configured",
        name           : "Qwen Plus",
        provider       : "qwen",
        providerModelId: "qwen-plus",
        isDefault      : false
      }
    ]);
  });

  it("fetchGenerationBooks maps /api/books to generation options", async () => {
    hoisted.clientFetchMock.mockResolvedValueOnce([
      { id: "book-1", title: "儒林外史", author: "吴敬梓" },
      { id: "book-2", title: "三国演义", author: null }
    ]);

    const books = await fetchGenerationBooks();

    expect(hoisted.clientFetchMock).toHaveBeenCalledWith("/api/books", {
      cache: "no-store"
    });
    expect(books).toEqual([
      { id: "book-1", title: "儒林外史", author: "吴敬梓" },
      { id: "book-2", title: "三国演义", author: null }
    ]);
  });

  it("fetchKnowledgePacks appends query params and fetchKnowledgePack uses detail endpoint", async () => {
    hoisted.clientFetchMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ id: "pack-1" });

    await fetchKnowledgePacks({ bookTypeId: "classic", scope: "GENRE" });
    await fetchKnowledgePack("pack-1");

    expect(hoisted.clientFetchMock).toHaveBeenNthCalledWith(1, "/api/admin/knowledge/alias-packs?bookTypeId=classic&scope=GENRE");
    expect(hoisted.clientFetchMock).toHaveBeenNthCalledWith(2, "/api/admin/knowledge/alias-packs/pack-1");
  });

  it("create/update/delete knowledge packs send expected requests", async () => {
    hoisted.clientFetchMock.mockResolvedValueOnce({ id: "pack-1" });
    hoisted.clientMutateMock.mockResolvedValue(undefined);

    await createKnowledgePack({ name: "人物包", scope: "GENRE", description: "说明" });
    await updateKnowledgePack("pack-1", { name: "人物包v2", isActive: true });
    await deleteKnowledgePack("pack-1");

    expect(hoisted.clientFetchMock).toHaveBeenCalledWith("/api/admin/knowledge/alias-packs", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ name: "人物包", scope: "GENRE", description: "说明" })
    });
    expect(hoisted.clientMutateMock).toHaveBeenNthCalledWith(1, "/api/admin/knowledge/alias-packs/pack-1", {
      method : "PATCH",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ name: "人物包v2", isActive: true })
    });
    expect(hoisted.clientMutateMock).toHaveBeenNthCalledWith(2, "/api/admin/knowledge/alias-packs/pack-1", { method: "DELETE" });
  });

  it("preview/generate/review endpoints build correct payloads", async () => {
    hoisted.clientFetchMock
      .mockResolvedValueOnce({ packId: "pack-1" })
      .mockResolvedValueOnce({ created: 1 })
      .mockResolvedValueOnce({ candidates: [] });

    await previewGenerateEntriesPrompt("pack-1", {
      targetCount           : 80,
      additionalInstructions: "优先主角",
      bookId                : "book-1"
    });
    await generateEntries("pack-1", { targetCount: 20, modelId: "model-1" });
    await reviewGenerateEntries("pack-1", { targetCount: 20, modelId: "model-2" });

    expect(hoisted.clientFetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/admin/knowledge/alias-packs/pack-1/generate/preview-prompt?targetCount=80&additionalInstructions=%E4%BC%98%E5%85%88%E4%B8%BB%E8%A7%92&bookId=book-1"
    );
    expect(hoisted.clientFetchMock).toHaveBeenNthCalledWith(2, "/api/admin/knowledge/alias-packs/pack-1/generate", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ targetCount: 20, modelId: "model-1" })
    });
    expect(hoisted.clientFetchMock).toHaveBeenNthCalledWith(3, "/api/admin/knowledge/alias-packs/pack-1/generate", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ targetCount: 20, modelId: "model-2", dryRun: true })
    });
  });

  it("fetchEntries parses pagination and handles fallback + error branch", async () => {
    hoisted.fetchMock
      .mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue({
          success: true,
          data   : [{ id: "entry-1", canonicalName: "诸葛亮", aliases: [] }],
          meta   : { pagination: { total: 3, page: 2, pageSize: 20 } }
        })
      })
      .mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue({
          success: true,
          data   : [],
          meta   : {}
        })
      })
      .mockResolvedValueOnce({
        json: vi.fn().mockResolvedValue({ success: false })
      });

    const withPagination = await fetchEntries("pack-1", {
      reviewStatus: "PENDING",
      q           : "孔明",
      page        : 2,
      pageSize    : 20
    });
    const withDefaultPagination = await fetchEntries("pack-1");

    expect(withPagination.total).toBe(3);
    expect(withPagination.page).toBe(2);
    expect(withPagination.pageSize).toBe(20);
    expect(withDefaultPagination).toMatchObject({ total: 0, page: 1, pageSize: 50 });

    await expect(fetchEntries("pack-1")).rejects.toThrow("获取条目失败");
    expect(hoisted.fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/admin/knowledge/alias-packs/pack-1/entries?reviewStatus=PENDING&q=%E5%AD%94%E6%98%8E&page=2&page_size=20"
    );
  });

  it("entry operations and batch/import requests hit expected endpoints", async () => {
    hoisted.clientFetchMock
      .mockResolvedValueOnce({ id: "entry-1" })
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 3 });
    hoisted.clientMutateMock.mockResolvedValue(undefined);

    await createEntry("pack-1", { canonicalName: "诸葛亮", aliases: ["孔明"] });
    await updateEntry("entry-1", { notes: "蜀汉丞相" });
    await deleteEntry("entry-1");
    await verifyEntry("entry-1");
    await rejectEntry("entry-1", "低置信");
    await batchVerifyEntries("pack-1", ["entry-1", "entry-2"]);
    await batchRejectEntries("pack-1", ["entry-3"], "重复");
    await importEntries("pack-1", {
      entries: [{ canonicalName: "关羽", aliases: ["云长"] }],
      source : "LLM_GENERATED"
    });

    expect(hoisted.clientFetchMock).toHaveBeenNthCalledWith(1, "/api/admin/knowledge/alias-packs/pack-1/entries", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ canonicalName: "诸葛亮", aliases: ["孔明"] })
    });
    expect(hoisted.clientMutateMock).toHaveBeenNthCalledWith(1, "/api/admin/knowledge/alias-entries/entry-1", {
      method : "PATCH",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ notes: "蜀汉丞相" })
    });
    expect(hoisted.clientMutateMock).toHaveBeenNthCalledWith(2, "/api/admin/knowledge/alias-entries/entry-1", { method: "DELETE" });
    expect(hoisted.clientMutateMock).toHaveBeenNthCalledWith(3, "/api/admin/knowledge/alias-entries/entry-1/verify", { method: "POST" });
    expect(hoisted.clientMutateMock).toHaveBeenNthCalledWith(4, "/api/admin/knowledge/alias-entries/entry-1/reject", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ note: "低置信" })
    });
    expect(hoisted.clientFetchMock).toHaveBeenNthCalledWith(2, "/api/admin/knowledge/alias-packs/pack-1/entries/batch-verify", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ ids: ["entry-1", "entry-2"] })
    });
    expect(hoisted.clientFetchMock).toHaveBeenNthCalledWith(3, "/api/admin/knowledge/alias-packs/pack-1/entries/batch-reject", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ ids: ["entry-3"], note: "重复" })
    });
    expect(hoisted.clientFetchMock).toHaveBeenNthCalledWith(4, "/api/admin/knowledge/alias-packs/pack-1/import", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ entries: [{ canonicalName: "关羽", aliases: ["云长"] }], source: "LLM_GENERATED" })
    });
  });

  it("getExportUrl builds expected query string", () => {
    expect(getExportUrl("pack-1")).toBe("/api/admin/knowledge/alias-packs/pack-1/export?format=json&reviewStatus=verified");
    expect(getExportUrl("pack-2", "csv", "all")).toBe("/api/admin/knowledge/alias-packs/pack-2/export?format=csv&reviewStatus=all");
  });
});
