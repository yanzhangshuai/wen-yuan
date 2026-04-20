import { describe, expect, it, vi } from "vitest";

import { createRelationTypeCatalogLoader } from "@/server/modules/knowledge-v2/relation-types/loader";

describe("relation type catalog loader", () => {
  it("loads verified and pending relation knowledge for runtime mode", async () => {
    const repository = {
      listKnowledgeItems: vi.fn().mockResolvedValue([])
    };
    const loader = createRelationTypeCatalogLoader({ knowledgeRepository: repository as never });

    await loader.load({
      bookId     : "book-1",
      bookTypeKey: "CLASSICAL_NOVEL",
      runId      : "run-1",
      mode       : "RUNTIME"
    });

    expect(repository.listKnowledgeItems).toHaveBeenCalledWith(expect.objectContaining({
      reviewStates  : ["VERIFIED", "PENDING"],
      knowledgeTypes: [
        "relation taxonomy rule",
        "relation label mapping rule",
        "relation negative rule"
      ]
    }));
  });

  it("includes disabled taxonomy in review mode", async () => {
    const repository = {
      listKnowledgeItems: vi.fn().mockResolvedValue([])
    };
    const loader = createRelationTypeCatalogLoader({ knowledgeRepository: repository as never });

    await loader.load({
      bookId     : "book-1",
      bookTypeKey: null,
      runId      : null,
      mode       : "REVIEW"
    });

    expect(repository.listKnowledgeItems).toHaveBeenCalledWith(expect.objectContaining({
      reviewStates: ["VERIFIED", "PENDING", "DISABLED"]
    }));
  });
});
