import { describe, expect, it, vi } from "vitest";

import { createAcceptanceRepository } from "./repository";

describe("createAcceptanceRepository", () => {
  it("hydrates claim details, audit rows, projection counts, and route paths", async () => {
    // Arrange
    const bookLookup = {
      findByTitle: vi.fn().mockResolvedValue({
        id         : "book-1",
        title      : "儒林外史",
        bookTypeKey: "CLASSICAL_NOVEL"
      })
    };
    const reviewQuery = {
      listReviewClaims: vi.fn().mockResolvedValue([
        { claimKind: "EVENT", claimId: "event-1" },
        { claimKind: "RELATION", claimId: "relation-1" }
      ]),
      getClaimDetail: vi.fn()
        .mockResolvedValueOnce({
          claim   : { claimId: "event-1", reviewState: "ACCEPTED" },
          evidence: [{
            id         : "ev-1",
            chapterId  : "chapter-3",
            quotedText : "范进中举",
            startOffset: 10,
            endOffset  : 14
          }]
        })
        .mockResolvedValueOnce({
          claim   : { claimId: "relation-1", reviewState: "ACCEPTED" },
          evidence: [{
            id         : "ev-2",
            chapterId  : "chapter-3",
            quotedText : "胡屠户认范进为女婿",
            startOffset: 20,
            endOffset  : 30
          }]
        })
    };
    const auditQuery = {
      listActions: vi.fn().mockResolvedValue(["ACCEPT", "EDIT", "MERGE_PERSONA"])
    };
    const projectionQuery = {
      getCounts: vi.fn().mockResolvedValue({
        personaChapterFacts: 3,
        personaTimeFacts   : 1,
        relationshipEdges  : 2,
        timelineEvents     : 1
      })
    };
    const relationCatalog = {
      hasEntry: vi.fn().mockResolvedValue(true)
    };
    const repository = createAcceptanceRepository({
      bookLookup,
      reviewQuery,
      auditQuery,
      projectionQuery,
      relationCatalog
    } as never);

    // Act
    const context = await repository.loadBookContext({
      scenarioKey: "rulin-waishi-sample",
      bookTitle  : "儒林外史"
    });

    // Assert
    expect(bookLookup.findByTitle).toHaveBeenCalledWith("儒林外史");
    expect(reviewQuery.listReviewClaims).toHaveBeenCalledWith("book-1");
    expect(context.book).toEqual({
      id   : "book-1",
      title: "儒林外史"
    });
    expect(context.claimDetails).toHaveLength(2);
    expect(context.claimDetails[0]).toEqual({
      claimKind  : "EVENT",
      claimId    : "event-1",
      reviewState: "ACCEPTED",
      evidence   : [{
        id         : "ev-1",
        chapterId  : "chapter-3",
        quotedText : "范进中举",
        startOffset: 10,
        endOffset  : 14
      }]
    });
    expect(context.auditActions).toContain("EDIT");
    expect(context.projectionCounts).toEqual({
      personaChapterFacts: 3,
      personaTimeFacts   : 1,
      relationshipEdges  : 2,
      timelineEvents     : 1
    });
    expect(context.routes).toEqual({
      personaChapter: "/admin/review/book-1",
      relationEditor: "/admin/review/book-1/relations",
      personaTime   : "/admin/review/book-1/time"
    });
    expect(relationCatalog.hasEntry).toHaveBeenCalledWith("book-1", "CLASSICAL_NOVEL");
    expect(context.relationCatalogAvailable).toBe(true);
  });
});
