/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  ReviewClaimDetailRecord,
  ReviewClaimDetailResponse,
  ReviewRelationEditorDto,
  ReviewRelationSelectedPairDto
} from "@/lib/services/relation-editor";

import { RelationEditorPage } from "./relation-editor-page";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";

const allBooks = [
  { id: BOOK_ID, title: "儒林外史", personaCount: 12 },
  { id: "22222222-2222-4222-8222-222222222222", title: "三国演义", personaCount: 108 }
];

const relationTypeOptions = [
  {
    relationTypeKey   : "teacher_of",
    label             : "师生",
    direction         : "FORWARD" as const,
    relationTypeSource: "PRESET" as const,
    aliasLabels       : ["授业"],
    systemPreset      : true
  },
  {
    relationTypeKey   : "enemy_of",
    label             : "敌对",
    direction         : "BIDIRECTIONAL" as const,
    relationTypeSource: "PRESET" as const,
    aliasLabels       : [],
    systemPreset      : true
  }
];

const hoisted = vi.hoisted(() => ({
  fetchRelationEditorViewMock: vi.fn(),
  fetchReviewClaimDetailMock : vi.fn(),
  submitReviewClaimActionMock: vi.fn(),
  createManualReviewClaimMock: vi.fn()
}));

vi.mock("@/lib/services/relation-editor", async () => {
  const actual = await vi.importActual("@/lib/services/relation-editor");

  return {
    ...actual,
    fetchRelationEditorView: hoisted.fetchRelationEditorViewMock,
    fetchReviewClaimDetail : hoisted.fetchReviewClaimDetailMock,
    submitReviewClaimAction: hoisted.submitReviewClaimActionMock,
    createManualReviewClaim: hoisted.createManualReviewClaimMock
  };
});

function buildSelectedPair(
  overrides?: Partial<ReviewRelationSelectedPairDto>
): ReviewRelationSelectedPairDto {
  return {
    pairKey    : "persona-1::persona-2",
    leftPersona: {
      personaId  : "persona-1",
      displayName: "范进",
      aliases    : ["范举人"]
    },
    rightPersona: {
      personaId  : "persona-2",
      displayName: "周进",
      aliases    : ["周老爷"]
    },
    warnings: {
      directionConflict: false,
      intervalConflict : true
    },
    claims: [
      {
        claimId              : "claim-1",
        reviewState          : "PENDING",
        source               : "AI",
        conflictState        : "NONE",
        relationTypeKey      : "teacher_of",
        relationLabel        : "师生",
        relationTypeSource   : "PRESET",
        direction            : "FORWARD",
        effectiveChapterStart: 1,
        effectiveChapterEnd  : 2,
        chapterId            : "chapter-1",
        chapterLabel         : "第 1 回",
        timeLabel            : "乡试之前",
        evidenceSpanIds      : ["evidence-1", "evidence-2"]
      }
    ],
    ...overrides
  };
}

function buildDetailRecord(
  overrides: Partial<ReviewClaimDetailRecord> = {}
): ReviewClaimDetailRecord {
  const baseRecord: ReviewClaimDetailRecord = {
    id                      : "claim-1",
    claimId                 : "claim-1",
    claimKind               : "RELATION",
    bookId                  : BOOK_ID,
    chapterId               : "chapter-1",
    reviewState             : "PENDING",
    source                  : "AI",
    conflictState           : "NONE",
    createdAt               : "2026-04-22T10:00:00.000Z",
    updatedAt               : "2026-04-22T10:05:00.000Z",
    personaCandidateIds     : ["candidate-source", "candidate-target"],
    personaIds              : ["persona-1", "persona-2"],
    timeLabel               : "乡试之前",
    relationTypeKey         : "teacher_of",
    evidenceSpanIds         : ["evidence-1", "evidence-2"],
    derivedFromClaimId      : null,
    runId                   : "run-1",
    confidence              : 0.92,
    sourceMentionId         : null,
    targetMentionId         : null,
    sourcePersonaCandidateId: "candidate-source",
    targetPersonaCandidateId: "candidate-target",
    relationLabel           : "师生",
    relationTypeSource      : "PRESET",
    direction               : "FORWARD",
    effectiveChapterStart   : 1,
    effectiveChapterEnd     : 2,
    timeHintId              : null,
    supersedesClaimId       : null
  };

  return {
    ...baseRecord,
    ...overrides,
    runId            : overrides.runId ?? baseRecord.runId,
    confidence       : overrides.confidence ?? baseRecord.confidence,
    supersedesClaimId: overrides.supersedesClaimId ?? baseRecord.supersedesClaimId
  };
}

function buildDetail(
  overrides: Partial<ReviewClaimDetailResponse> = {}
): ReviewClaimDetailResponse {
  const baseDetail: ReviewClaimDetailResponse = {
    claim   : buildDetailRecord(),
    evidence: [
      {
        id                 : "evidence-1",
        chapterId          : "chapter-1",
        chapterLabel       : "第 1 回",
        startOffset        : 12,
        endOffset          : 24,
        quotedText         : "周进提拔范进，众人称善。",
        normalizedText     : "周进提拔范进，众人称善。",
        speakerHint        : "叙事",
        narrativeRegionType: "NARRATIVE",
        createdAt          : "2026-04-22T10:00:00.000Z"
      }
    ],
    basisClaim: buildDetailRecord({
      id                 : "basis-1",
      claimId            : "basis-1",
      relationLabel      : "周进提携范进",
      effectiveChapterEnd: 1,
      reviewState        : "ACCEPTED"
    }),
    projectionSummary: {
      personaChapterFacts: [],
      personaTimeFacts   : [],
      relationshipEdges  : [],
      timelineEvents     : []
    },
    aiSummary   : null,
    auditHistory: [],
    versionDiff : null
  };

  return {
    ...baseDetail,
    ...overrides,
    aiSummary  : overrides.aiSummary ?? baseDetail.aiSummary,
    versionDiff: overrides.versionDiff ?? baseDetail.versionDiff
  };
}

function buildRelationEditorDto(
  overrides?: Partial<ReviewRelationEditorDto>
): ReviewRelationEditorDto {
  return {
    bookId        : BOOK_ID,
    generatedAt   : "2026-04-22T10:00:00.000Z",
    personaOptions: [
      { personaId: "persona-1", displayName: "范进", aliases: ["范举人"] },
      { personaId: "persona-2", displayName: "周进", aliases: ["周老爷"] },
      { personaId: "persona-3", displayName: "梅玖", aliases: [] }
    ],
    relationTypeOptions,
    pairSummaries: [
      {
        pairKey           : "persona-1::persona-2",
        leftPersonaId     : "persona-1",
        rightPersonaId    : "persona-2",
        leftPersonaName   : "范进",
        rightPersonaName  : "周进",
        totalClaims       : 2,
        activeClaims      : 1,
        latestUpdatedAt   : "2026-04-22T10:00:00.000Z",
        relationTypeKeys  : ["teacher_of"],
        reviewStateSummary: { PENDING: 1, ACCEPTED: 1 },
        warningFlags      : {
          directionConflict: false,
          intervalConflict : true
        }
      },
      {
        pairKey           : "persona-2::persona-3",
        leftPersonaId     : "persona-2",
        rightPersonaId    : "persona-3",
        leftPersonaName   : "周进",
        rightPersonaName  : "梅玖",
        totalClaims       : 1,
        activeClaims      : 1,
        latestUpdatedAt   : "2026-04-22T11:00:00.000Z",
        relationTypeKeys  : ["enemy_of"],
        reviewStateSummary: { CONFLICTED: 1 },
        warningFlags      : {
          directionConflict: true,
          intervalConflict : false
        }
      }
    ],
    selectedPair: null,
    ...overrides
  };
}

function selectComboboxOption(label: string, optionLabel: string) {
  fireEvent.click(screen.getByRole("combobox", { name: label }));
  fireEvent.click(screen.getByRole("option", { name: optionLabel }));
}

/**
 * 文件定位（T14 Task 5 页面壳层单测）：
 * - 锁定关系编辑器首屏的筛选、pair 选择与回源刷新编排；
 * - 这里不验证 Task 6 的 detail sheet，只验证 DTO 驱动的 page shell 状态机。
 */
describe("RelationEditorPage", () => {
  beforeEach(() => {
    hoisted.fetchRelationEditorViewMock.mockReset();
    hoisted.fetchReviewClaimDetailMock.mockReset();
    hoisted.submitReviewClaimActionMock.mockReset();
    hoisted.createManualReviewClaimMock.mockReset();
  });

  it("initializes from the server-provided dto without refetching", () => {
    render(
      <RelationEditorPage
        bookId={BOOK_ID}
        bookTitle="儒林外史"
        allBooks={allBooks}
        initialRelationEditor={buildRelationEditorDto({
          selectedPair: buildSelectedPair()
        })}
        selectedPersonaId={null}
        focusOnly={false}
      />
    );

    expect(screen.getByRole("heading", { level: 1, name: "儒林外史" })).toBeInTheDocument();
    expect(screen.getByText("当前筛选命中 2 组人物关系")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /范进.*周进/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: /claim-1.*师生/ })).toBeInTheDocument();
    expect(hoisted.fetchRelationEditorViewMock).not.toHaveBeenCalled();
  });

  it("refreshes the pair list when filters change", async () => {
    hoisted.fetchRelationEditorViewMock.mockResolvedValueOnce(buildRelationEditorDto({
      pairSummaries: [buildRelationEditorDto().pairSummaries[0]]
    }));

    render(
      <RelationEditorPage
        bookId={BOOK_ID}
        bookTitle="儒林外史"
        allBooks={allBooks}
        initialRelationEditor={buildRelationEditorDto()}
        selectedPersonaId={null}
        focusOnly={false}
      />
    );

    fireEvent.click(screen.getByRole("combobox", { name: "审核状态" }));
    fireEvent.click(screen.getByRole("option", { name: "待审核" }));

    await waitFor(() => {
      expect(hoisted.fetchRelationEditorViewMock).toHaveBeenCalledWith({
        bookId      : BOOK_ID,
        reviewStates: ["PENDING"]
      });
    });
    expect(screen.queryByRole("button", { name: /周进.*梅玖/ })).not.toBeInTheDocument();
  });

  it("keeps the selected pair when it still exists after refresh", async () => {
    hoisted.fetchRelationEditorViewMock
      .mockResolvedValueOnce(buildRelationEditorDto({
        selectedPair: buildSelectedPair()
      }))
      .mockResolvedValueOnce(buildRelationEditorDto({
        pairSummaries: [
          {
            ...buildRelationEditorDto().pairSummaries[0],
            totalClaims : 3,
            activeClaims: 2
          }
        ],
        selectedPair: buildSelectedPair({
          claims: [
            ...buildSelectedPair().claims,
            {
              claimId              : "claim-2",
              reviewState          : "ACCEPTED",
              source               : "MANUAL",
              conflictState        : "NONE",
              relationTypeKey      : "teacher_of",
              relationLabel        : "授业",
              relationTypeSource   : "PRESET",
              direction            : "FORWARD",
              effectiveChapterStart: 3,
              effectiveChapterEnd  : 3,
              chapterId            : "chapter-3",
              chapterLabel         : "第 3 回",
              timeLabel            : null,
              evidenceSpanIds      : []
            }
          ]
        })
      }));

    render(
      <RelationEditorPage
        bookId={BOOK_ID}
        bookTitle="儒林外史"
        allBooks={allBooks}
        initialRelationEditor={buildRelationEditorDto()}
        selectedPersonaId={null}
        focusOnly={false}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /范进.*周进/ }));

    await waitFor(() => {
      expect(hoisted.fetchRelationEditorViewMock).toHaveBeenNthCalledWith(1, {
        bookId       : BOOK_ID,
        personaId    : "persona-1",
        pairPersonaId: "persona-2"
      });
    });

    fireEvent.click(screen.getByRole("combobox", { name: "审核状态" }));
    fireEvent.click(screen.getByRole("option", { name: "待审核" }));

    await waitFor(() => {
      expect(hoisted.fetchRelationEditorViewMock).toHaveBeenNthCalledWith(2, {
        bookId       : BOOK_ID,
        personaId    : "persona-1",
        pairPersonaId: "persona-2",
        reviewStates : ["PENDING"]
      });
    });
    expect(screen.getByRole("button", { name: /范进.*周进/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: /claim-2.*授业/ })).toBeInTheDocument();
  });

  it("clears the selection when the selected pair disappears after refresh", async () => {
    hoisted.fetchRelationEditorViewMock
      .mockResolvedValueOnce(buildRelationEditorDto({
        selectedPair: buildSelectedPair()
      }))
      .mockResolvedValueOnce(buildRelationEditorDto({
        pairSummaries: [buildRelationEditorDto().pairSummaries[1]],
        selectedPair : null
      }));

    render(
      <RelationEditorPage
        bookId={BOOK_ID}
        bookTitle="儒林外史"
        allBooks={allBooks}
        initialRelationEditor={buildRelationEditorDto()}
        selectedPersonaId={null}
        focusOnly={false}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /范进.*周进/ }));

    await waitFor(() => {
      expect(hoisted.fetchRelationEditorViewMock).toHaveBeenNthCalledWith(1, {
        bookId       : BOOK_ID,
        personaId    : "persona-1",
        pairPersonaId: "persona-2"
      });
    });

    fireEvent.click(screen.getByRole("combobox", { name: "审核状态" }));
    fireEvent.click(screen.getByRole("option", { name: "待审核" }));

    await waitFor(() => {
      expect(hoisted.fetchRelationEditorViewMock).toHaveBeenNthCalledWith(2, {
        bookId       : BOOK_ID,
        personaId    : "persona-1",
        pairPersonaId: "persona-2",
        reviewStates : ["PENDING"]
      });
    });
    expect(screen.queryByRole("button", { name: /范进.*周进/ })).not.toBeInTheDocument();
    expect(screen.getByText("先选择一组人物关系")).toBeInTheDocument();
  });

  it("shows an explicit error state when the route fetch fails", async () => {
    hoisted.fetchRelationEditorViewMock.mockRejectedValueOnce(new Error("网络错误"));

    render(
      <RelationEditorPage
        bookId={BOOK_ID}
        bookTitle="儒林外史"
        allBooks={allBooks}
        initialRelationEditor={buildRelationEditorDto()}
        selectedPersonaId={null}
        focusOnly={false}
      />
    );

    fireEvent.click(screen.getByRole("combobox", { name: "审核状态" }));
    fireEvent.click(screen.getByRole("option", { name: "待审核" }));

    await waitFor(() => {
      expect(screen.getByText("关系加载失败")).toBeInTheDocument();
    });
    expect(screen.getByText("网络错误")).toBeInTheDocument();
  });

  it("loads claim detail lazily and refreshes the pair view after saving an edit", async () => {
    hoisted.fetchRelationEditorViewMock
      .mockResolvedValueOnce(buildRelationEditorDto({
        selectedPair: buildSelectedPair()
      }))
      .mockResolvedValueOnce(buildRelationEditorDto({
        selectedPair: buildSelectedPair({
          claims: [
            {
              ...buildSelectedPair().claims[0],
              relationTypeKey   : "fellow_townsman_of",
              relationLabel     : "同乡",
              relationTypeSource: "CUSTOM",
              direction         : "REVERSE"
            }
          ]
        })
      }));
    hoisted.fetchReviewClaimDetailMock.mockResolvedValueOnce(buildDetail());
    hoisted.submitReviewClaimActionMock.mockResolvedValueOnce(undefined);

    render(
      <RelationEditorPage
        bookId={BOOK_ID}
        bookTitle="儒林外史"
        allBooks={allBooks}
        initialRelationEditor={buildRelationEditorDto()}
        selectedPersonaId={null}
        focusOnly={false}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /范进.*周进/ }));

    await waitFor(() => {
      expect(hoisted.fetchRelationEditorViewMock).toHaveBeenNthCalledWith(1, {
        bookId       : BOOK_ID,
        personaId    : "persona-1",
        pairPersonaId: "persona-2"
      });
    });

    fireEvent.click(screen.getByRole("button", { name: /claim-1.*师生/ }));

    await waitFor(() => {
      expect(hoisted.fetchReviewClaimDetailMock).toHaveBeenCalledWith({
        bookId   : BOOK_ID,
        claimKind: "RELATION",
        claimId  : "claim-1"
      });
    });

    fireEvent.click(screen.getByRole("radio", { name: "编辑自定义输入" }));
    fireEvent.change(screen.getByRole("textbox", { name: "关系类型 Key" }), {
      target: { value: "fellow_townsman_of" }
    });
    fireEvent.change(screen.getByRole("textbox", { name: "关系显示名称" }), {
      target: { value: "同乡" }
    });
    selectComboboxOption("关系方向", "反向");
    fireEvent.click(screen.getByRole("button", { name: "保存关系修改" }));

    await waitFor(() => {
      expect(hoisted.submitReviewClaimActionMock).toHaveBeenCalledWith(expect.objectContaining({
        bookId   : BOOK_ID,
        claimKind: "RELATION",
        claimId  : "claim-1",
        action   : "EDIT"
      }));
    });

    await waitFor(() => {
      expect(hoisted.fetchRelationEditorViewMock).toHaveBeenNthCalledWith(2, {
        bookId       : BOOK_ID,
        personaId    : "persona-1",
        pairPersonaId: "persona-2"
      });
    });

    await waitFor(() => {
      // Sheet 打开时，Radix 会把背景 claim 列表标记为 aria-hidden；
      // 这里显式查询 hidden 元素，用来确认回刷后的 claim 摘要确实已经更新。
      expect(screen.getByRole("button", {
        name  : /claim-1.*同乡/,
        hidden: true
      })).toBeInTheDocument();
    });
  });

  it("shows all pairs when focusOnly=false but highlights matching ones", () => {
    render(
      <RelationEditorPage
        bookId={BOOK_ID}
        bookTitle="儒林外史"
        allBooks={allBooks}
        initialRelationEditor={buildRelationEditorDto()}
        selectedPersonaId="persona-1"
        focusOnly={false}
      />
    );

    expect(screen.getByRole("button", { name: /范进.*周进/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /周进.*梅玖/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /范进.*周进/ })).toHaveClass("bg-primary/5");
  });

  it("filters to only related pairs when focusOnly=true and selectedPersonaId set", () => {
    render(
      <RelationEditorPage
        bookId={BOOK_ID}
        bookTitle="儒林外史"
        allBooks={allBooks}
        initialRelationEditor={buildRelationEditorDto()}
        selectedPersonaId="persona-1"
        focusOnly={true}
      />
    );

    expect(screen.getByRole("button", { name: /范进.*周进/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /周进.*梅玖/ })).not.toBeInTheDocument();
  });

  it("triggers onFocusOnlyChange when focus toggle is clicked", () => {
    const onFocusOnlyChange = vi.fn();

    render(
      <RelationEditorPage
        bookId={BOOK_ID}
        bookTitle="儒林外史"
        allBooks={allBooks}
        initialRelationEditor={buildRelationEditorDto()}
        selectedPersonaId="persona-1"
        focusOnly={false}
        onFocusOnlyChange={onFocusOnlyChange}
      />
    );

    fireEvent.click(screen.getByRole("switch", { name: "只看当前角色相关 claim" }));
    expect(onFocusOnlyChange).toHaveBeenCalledWith(true);
  });
});
