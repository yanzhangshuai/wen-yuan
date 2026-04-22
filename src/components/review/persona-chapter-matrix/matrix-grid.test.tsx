/** @vitest-environment jsdom */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { PersonaChapterMatrixDto } from "@/lib/services/review-matrix";

import { MatrixGrid } from "./matrix-grid";

function buildMatrix(): PersonaChapterMatrixDto {
  return {
    bookId             : "book-1",
    generatedAt        : "2026-04-21T10:30:00.000Z",
    relationTypeOptions: [],
    personas           : [
      {
        personaId                : "persona-1",
        displayName              : "范进",
        aliases                  : ["范举人"],
        primaryPersonaCandidateId: "candidate-1",
        personaCandidateIds      : ["candidate-1"],
        firstChapterNo           : 1,
        totalEventCount          : 2,
        totalRelationCount       : 1,
        totalConflictCount       : 1
      },
      {
        personaId                : "persona-2",
        displayName              : "周进",
        aliases                  : ["周老爷"],
        primaryPersonaCandidateId: "candidate-2",
        personaCandidateIds      : ["candidate-2"],
        firstChapterNo           : 1,
        totalEventCount          : 0,
        totalRelationCount       : 0,
        totalConflictCount       : 0
      }
    ],
    chapters: [
      {
        chapterId: "chapter-1",
        chapterNo: 1,
        title    : "学道登场",
        label    : "第 1 回"
      },
      {
        chapterId: "chapter-2",
        chapterNo: 2,
        title    : "中举发迹",
        label    : "第 2 回"
      }
    ],
    cells: [
      {
        bookId            : "book-1",
        personaId         : "persona-1",
        chapterId         : "chapter-1",
        chapterNo         : 1,
        eventCount        : 2,
        relationCount     : 1,
        conflictCount     : 1,
        reviewStateSummary: {
          PENDING : { ACTIVE: 1 },
          ACCEPTED: { NONE: 2 }
        },
        latestUpdatedAt: "2026-04-21T10:30:00.000Z"
      }
    ]
  };
}

/**
 * 文件定位（矩阵网格单测）：
 * - 锁定 reviewer 看到的矩阵骨架，而不是页面级数据流。
 * - 这里验证的是“某个 cell 应该展示什么”和“点击后传什么”，为 Task 7/8 的状态编排留出稳定底座。
 */
describe("MatrixGrid", () => {
  it("renders personas as columns, chapters as rows, and shows populated cell summaries", () => {
    render(
      <MatrixGrid
        matrix={buildMatrix()}
        selectedCell={null}
        viewportHeight={480}
        viewportWidth={640}
      />
    );

    expect(screen.getByRole("columnheader", { name: /范进/ })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /周进/ })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: /第 1 回\s+学道登场/ })).toBeInTheDocument();

    const populatedCell = screen.getByRole("button", { name: "第 1 回 · 范进" });
    expect(within(populatedCell).getByText("事迹 2")).toBeInTheDocument();
    expect(within(populatedCell).getByText("关系 1")).toBeInTheDocument();
    expect(within(populatedCell).getByText("冲突 1")).toBeInTheDocument();
    expect(within(populatedCell).getByText("待审核 · 冲突")).toBeInTheDocument();
    expect(within(populatedCell).getByText("已接受")).toBeInTheDocument();
    expect(within(populatedCell).getByText("更新 2026-04-21 10:30")).toBeInTheDocument();
  });

  it("keeps empty cells clickable for manual create flows and emits selection", () => {
    const onSelectCell = vi.fn();

    render(
      <MatrixGrid
        matrix={buildMatrix()}
        selectedCell={null}
        onSelectCell={onSelectCell}
        viewportHeight={480}
        viewportWidth={640}
      />
    );

    const emptyCell = screen.getByRole("button", { name: "第 1 回 · 周进" });
    expect(within(emptyCell).getByText("待补录")).toBeInTheDocument();

    fireEvent.click(emptyCell);

    expect(onSelectCell).toHaveBeenCalledWith({
      personaId: "persona-2",
      chapterId: "chapter-1"
    });
  });

  it("visually distinguishes conflict cells and selected cells", () => {
    render(
      <MatrixGrid
        matrix={buildMatrix()}
        selectedCell={{
          personaId: "persona-1",
          chapterId: "chapter-1"
        }}
        viewportHeight={480}
        viewportWidth={640}
      />
    );

    const conflictCell = screen.getByRole("button", { name: "第 1 回 · 范进" });
    expect(conflictCell).toHaveClass("bg-warning/10");
    expect(conflictCell).toHaveAttribute("aria-pressed", "true");
  });
});
