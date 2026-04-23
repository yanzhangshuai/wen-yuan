/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ReviewClaimListItem } from "@/lib/services/review-time-matrix";

function buildClaim(
  overrides: Partial<ReviewClaimListItem> = {}
): ReviewClaimListItem {
  return {
    claimKind          : "EVENT",
    claimId            : "claim-event-1",
    bookId             : "book-1",
    chapterId          : "chapter-42",
    reviewState        : "PENDING",
    source             : "AI",
    conflictState      : "NONE",
    createdAt          : "2026-04-22T10:00:00.000Z",
    updatedAt          : "2026-04-22T10:05:00.000Z",
    personaCandidateIds: ["candidate-1"],
    personaIds         : ["persona-1"],
    timeLabel          : "赤壁之战前",
    relationTypeKey    : null,
    evidenceSpanIds    : ["evidence-1"],
    ...overrides
  };
}

async function renderTimeCellClaimList({
  claims,
  selectedClaimId = null,
  onSelectClaim = vi.fn()
}: {
  claims          : ReviewClaimListItem[];
  selectedClaimId?: string | null;
  onSelectClaim ? : (claim: ReviewClaimListItem) => void;
}) {
  const { TimeCellClaimList } = await import("./time-cell-claim-list");

  render(
    <TimeCellClaimList
      claims={claims}
      selectedClaimId={selectedClaimId}
      onSelectClaim={onSelectClaim}
    />
  );

  return { onSelectClaim };
}

/**
 * 文件定位（T15 Task 6 时间单元格 claim 列表单测）：
 * - 锁定 reviewer-first 的列表排序与摘要文案，避免时间矩阵复用章节矩阵时把 TIME claim 淹没在普通事件里。
 * - 这里只校验 reviewer 可见的标签与交互，不把 claim 表字段直接暴露成测试主语。
 */
describe("TimeCellClaimList", () => {
  it("places time claims first, keeps events and relations in the middle, and moves conflict flags last", async () => {
    await renderTimeCellClaimList({
      claims: [
        buildClaim({
          claimKind      : "CONFLICT_FLAG",
          claimId        : "claim-conflict-1",
          reviewState    : "CONFLICTED",
          conflictState  : "ACTIVE",
          timeLabel      : null,
          relationTypeKey: null
        }),
        buildClaim({
          claimKind      : "RELATION",
          claimId        : "claim-relation-1",
          relationTypeKey: "ally_of",
          timeLabel      : null
        }),
        buildClaim(),
        buildClaim({
          claimKind: "TIME",
          claimId  : "claim-time-1"
        })
      ]
    });

    const claimButtons = screen.getAllByRole("button");
    const claimTexts = claimButtons.map((button) => button.textContent ?? "");
    const timeIndex = claimTexts.findIndex((text) => text.includes("时间"));
    const eventIndex = claimTexts.findIndex((text) => text.includes("事迹"));
    const relationIndex = claimTexts.findIndex((text) => text.includes("关系"));
    const conflictIndex = claimTexts.findIndex((text) => text.includes("冲突"));

    expect(timeIndex).toBe(0);
    expect(eventIndex).toBeGreaterThan(timeIndex);
    expect(relationIndex).toBeGreaterThan(timeIndex);
    expect(eventIndex).toBeLessThan(conflictIndex);
    expect(relationIndex).toBeLessThan(conflictIndex);
    expect(conflictIndex).toBe(claimButtons.length - 1);
  });

  it("shows time and relation summaries clearly and forwards the clicked claim back to the sheet", async () => {
    const timeClaim = buildClaim({
      claimKind: "TIME",
      claimId  : "claim-time-1"
    });
    const relationClaim = buildClaim({
      claimKind      : "RELATION",
      claimId        : "claim-relation-1",
      relationTypeKey: "ally_of",
      timeLabel      : null
    });
    const conflictClaim = buildClaim({
      claimKind      : "CONFLICT_FLAG",
      claimId        : "claim-conflict-1",
      reviewState    : "CONFLICTED",
      conflictState  : "ACTIVE",
      timeLabel      : null,
      relationTypeKey: null
    });
    const onSelectClaim = vi.fn();

    await renderTimeCellClaimList({
      claims         : [relationClaim, timeClaim, conflictClaim],
      selectedClaimId: relationClaim.claimId,
      onSelectClaim
    });

    expect(screen.getByText("时间：赤壁之战前")).toBeInTheDocument();
    expect(screen.getByText("关系类型：ally_of")).toBeInTheDocument();
    expect(screen.getByText("存在冲突待判")).toBeInTheDocument();

    const timeClaimButton = screen.getByText("时间").closest("button");
    expect(timeClaimButton).not.toBeNull();

    if (timeClaimButton === null) {
      throw new Error("Expected the time claim row to render as a button.");
    }

    fireEvent.click(timeClaimButton);

    expect(onSelectClaim).toHaveBeenCalledWith(timeClaim);
  });
});
