import { describe, expect, it } from "vitest";
import { buildPersonaListItems } from "./persona-list-summary";
import { type PersonaChapterMatrixDto } from "@/lib/services/review-matrix";

function makeMatrix(overrides: Partial<PersonaChapterMatrixDto> = {}): PersonaChapterMatrixDto {
  return {
    bookId  : "b1",
    chapters: [{ chapterId: "c1", chapterNo: 1, title: "第一回", label: "第一回" }],
    personas: [
      {
        personaId                : "p1",
        displayName              : "周进",
        aliases                  : ["字蒙夜", "周老爹"],
        firstChapterNo           : 2,
        primaryPersonaCandidateId: "pc1",
        personaCandidateIds      : ["pc1"],
        totalEventCount          : 24,
        totalRelationCount       : 8,
        totalConflictCount       : 1
      }
    ],
    cells: [
      {
        bookId            : "b1",
        personaId         : "p1",
        chapterId         : "c1",
        chapterNo         : 1,
        eventCount        : 5,
        relationCount     : 2,
        conflictCount     : 1,
        reviewStateSummary: {
          PENDING   : { NONE: 3, CONFLICTED: 1 },
          ACCEPTED  : { NONE: 1, CONFLICTED: 0 },
          REJECTED  : { NONE: 0, CONFLICTED: 0 },
          SUPERSEDED: { NONE: 0, CONFLICTED: 0 }
        },
        latestUpdatedAt: "2025-01-01T00:00:00Z"
      }
    ],
    ...overrides
  } as PersonaChapterMatrixDto;
}

describe("buildPersonaListItems", () => {
  it("把 matrix.personas 平铺成 PersonaListItem，并按 cells 聚合 pendingClaimCount", () => {
    const items = buildPersonaListItems(makeMatrix());
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      personaId         : "p1",
      displayName       : "周进",
      aliases           : ["字蒙夜", "周老爹"],
      firstChapterNo    : 2,
      totalEventCount   : 24,
      totalRelationCount: 8,
      totalConflictCount: 1,
      pendingClaimCount : 4
    });
  });

  it("当某 persona 在 cells 中无记录时 pendingClaimCount 为 0", () => {
    const matrix = makeMatrix({ cells: [] });
    const [item] = buildPersonaListItems(matrix);
    expect(item.pendingClaimCount).toBe(0);
  });
});

