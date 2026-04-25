import { describe, expect, it } from "vitest";
import {
  buildPersonaListItems,
  computePersonaProgress,
  filterPersonaListItems,
  findNextPendingPersonaId,
  sortPersonaListItems,
  type PersonaListItem
} from "./persona-list-summary";
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

function p(over: Partial<PersonaListItem>): PersonaListItem {
  return {
    personaId          : "x",
    displayName        : "x",
    aliases            : [],
    firstChapterNo     : null,
    totalEventCount    : 0,
    totalRelationCount : 0,
    totalConflictCount : 0,
    pendingClaimCount  : 0,
    personaCandidateIds: [],
    ...over
  };
}

describe("sortPersonaListItems", () => {
  const items = [
    p({ personaId: "a", firstChapterNo: 5,    pendingClaimCount: 1, totalEventCount: 10 }),
    p({ personaId: "b", firstChapterNo: 1,    pendingClaimCount: 5, totalEventCount: 3 }),
    p({ personaId: "c", firstChapterNo: null, pendingClaimCount: 0, totalEventCount: 50 })
  ];

  it("first-chapter 升序，null 排末尾", () => {
    expect(sortPersonaListItems(items, "first-chapter").map((i) => i.personaId)).toEqual(["b", "a", "c"]);
  });

  it("pending-desc 把待审最多的排前", () => {
    expect(sortPersonaListItems(items, "pending-desc").map((i) => i.personaId)).toEqual(["b", "a", "c"]);
  });

  it("event-desc 按 totalEventCount 降序", () => {
    expect(sortPersonaListItems(items, "event-desc").map((i) => i.personaId)).toEqual(["c", "a", "b"]);
  });
});

describe("filterPersonaListItems", () => {
  const items = [
    p({ personaId: "a", displayName: "周进",     aliases: ["字蒙夜"], pendingClaimCount: 2, totalConflictCount: 0 }),
    p({ personaId: "b", displayName: "范进",     aliases: [],         pendingClaimCount: 0, totalConflictCount: 1 }),
    p({ personaId: "c", displayName: "马二先生", aliases: ["马纯上"], pendingClaimCount: 0, totalConflictCount: 0 })
  ];

  it("空关键字 + 空 chip → 原样返回", () => {
    expect(filterPersonaListItems(items, "", []).map((i) => i.personaId)).toEqual(["a", "b", "c"]);
  });

  it("关键字匹配 displayName 与 aliases，大小写不敏感", () => {
    expect(filterPersonaListItems(items, "纯上", []).map((i) => i.personaId)).toEqual(["c"]);
    expect(filterPersonaListItems(items, "周",   []).map((i) => i.personaId)).toEqual(["a"]);
  });

  it("status chip 多选取并集", () => {
    expect(filterPersonaListItems(items, "", ["pending"]).map((i) => i.personaId)).toEqual(["a"]);
    expect(filterPersonaListItems(items, "", ["conflict"]).map((i) => i.personaId)).toEqual(["b"]);
    expect(filterPersonaListItems(items, "", ["done"]).map((i) => i.personaId)).toEqual(["c"]);
    expect(filterPersonaListItems(items, "", ["pending", "done"]).map((i) => i.personaId)).toEqual(["a", "c"]);
  });
});

describe("findNextPendingPersonaId", () => {
  const items = [
    p({ personaId: "a", pendingClaimCount: 1, firstChapterNo: 5 }),
    p({ personaId: "b", pendingClaimCount: 3, firstChapterNo: 2 }),
    p({ personaId: "c", pendingClaimCount: 0, firstChapterNo: 1 })
  ];

  it("跳过 currentId 选 pending 最多的；平局取 firstChapterNo 最小", () => {
    expect(findNextPendingPersonaId(items, null)).toBe("b");
    expect(findNextPendingPersonaId(items, "b")).toBe("a");
  });

  it("全部 pending=0 时返回 null", () => {
    expect(findNextPendingPersonaId([p({ pendingClaimCount: 0 })], null)).toBeNull();
  });
});

describe("computePersonaProgress", () => {
  it("总计 = sum(eventCount + relationCount)，已审 = 总-pending", () => {
    const items = [
      p({ personaId: "a", totalEventCount: 10, totalRelationCount: 5, pendingClaimCount: 4 }),
      p({ personaId: "b", totalEventCount: 2,  totalRelationCount: 0, pendingClaimCount: 1 })
    ];
    expect(computePersonaProgress(items)).toEqual({ total: 17, reviewed: 12, ratio: 12 / 17 });
  });

  it("总计为 0 时 ratio 为 1（全部已审）", () => {
    expect(computePersonaProgress([])).toEqual({ total: 0, reviewed: 0, ratio: 1 });
  });
});


