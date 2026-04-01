/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { ValidationReportTab } from "./validation-report-tab";
import type { ValidationReportItem } from "@/lib/services/validation-reports";
import type { ValidationSummary } from "@/types/validation";

/* ------------------------------------------------
   Mocks
   ------------------------------------------------ */

const mockFetchDetail = vi.fn();
const mockApplyAutoFixes = vi.fn();

vi.mock("@/lib/services/validation-reports", () => ({
  fetchValidationReportDetail: (...args: unknown[]) => mockFetchDetail(...args) as Promise<unknown>,
  applyAutoFixes             : (...args: unknown[]) => mockApplyAutoFixes(...args) as Promise<unknown>
}));

function buildSummary(overrides: Partial<ValidationSummary> = {}): ValidationSummary {
  return {
    totalIssues : 5,
    errorCount  : 2,
    warningCount: 2,
    infoCount   : 1,
    autoFixable : 3,
    needsReview : 2,
    ...overrides
  };
}

function buildReport(overrides: Partial<ValidationReportItem> = {}): ValidationReportItem {
  return {
    id       : "report-1",
    bookId   : "book-1",
    jobId    : "job-1",
    scope    : "FULL_BOOK",
    chapterId: null,
    status   : "PENDING",
    summary  : buildSummary(),
    createdAt: "2026-03-31T10:00:00Z",
    ...overrides
  };
}

/* ------------------------------------------------
   Tests
   ------------------------------------------------ */

describe("ValidationReportTab", () => {
  const onRefresh = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders empty state when no reports", () => {
    render(<ValidationReportTab bookId="book-1" reports={[]} onRefresh={onRefresh} />);
    expect(screen.getByText("暂无自检报告")).toBeInTheDocument();
  });

  it("renders report cards with summary info", () => {
    render(
      <ValidationReportTab
        bookId="book-1"
        reports={[buildReport()]}
        onRefresh={onRefresh}
      />
    );
    expect(screen.getByText("全书级自检报告")).toBeInTheDocument();
    expect(screen.getByText("待处理")).toBeInTheDocument();
    expect(screen.getByText(/共 5 个问题/)).toBeInTheDocument();
    expect(screen.getByText(/2 错误/)).toBeInTheDocument();
    expect(screen.getByText(/可自动修正 3 项/)).toBeInTheDocument();
  });

  it("renders chapter-level scope label", () => {
    render(
      <ValidationReportTab
        bookId="book-1"
        reports={[buildReport({ scope: "CHAPTER" })]}
        onRefresh={onRefresh}
      />
    );
    expect(screen.getByText("章节级自检报告")).toBeInTheDocument();
  });

  it("expands report and loads detail on click", async () => {
    mockFetchDetail.mockResolvedValueOnce({
      ...buildReport(),
      issues: [
        {
          id                : "issue-1",
          type              : "ALIAS_AS_NEW_PERSONA",
          severity          : "ERROR",
          confidence        : 0.92,
          description       : "\"范老爷\" 可能是 \"范进\" 的别名",
          evidence          : "第3回原文",
          affectedPersonaIds: ["p1", "p2"],
          suggestion        : { action: "MERGE", targetPersonaId: "p2", sourcePersonaId: "p1", reason: "合并" }
        }
      ]
    });

    render(
      <ValidationReportTab
        bookId="book-1"
        reports={[buildReport()]}
        onRefresh={onRefresh}
      />
    );

    // Click to expand
    fireEvent.click(screen.getByText("全书级自检报告"));

    await waitFor(() => {
      expect(mockFetchDetail).toHaveBeenCalledWith("book-1", "report-1");
      expect(screen.getByText(/范老爷/)).toBeInTheDocument();
      expect(screen.getByText("别名误识为新人物")).toBeInTheDocument();
      expect(screen.getByText(/92%/)).toBeInTheDocument();
    });
  });

  it("shows auto-fix button and calls applyAutoFixes", async () => {
    mockFetchDetail.mockResolvedValue({
      ...buildReport(),
      issues: [
        {
          id                : "issue-1", type              : "DUPLICATE_PERSONA", severity          : "WARNING",
          confidence        : 0.85, description       : "重复", evidence          : "证据",
          affectedPersonaIds: ["p1"], suggestion        : { action: "MERGE", reason: "合并" }
        }
      ]
    });
    mockApplyAutoFixes.mockResolvedValueOnce({ appliedCount: 3 });

    render(
      <ValidationReportTab
        bookId="book-1"
        reports={[buildReport()]}
        onRefresh={onRefresh}
      />
    );

    // Expand
    fireEvent.click(screen.getByText("全书级自检报告"));
    await waitFor(() => expect(screen.getByText(/应用自动修正/)).toBeInTheDocument());

    // Click auto-fix
    fireEvent.click(screen.getByText(/应用自动修正/));
    await waitFor(() => {
      expect(mockApplyAutoFixes).toHaveBeenCalledWith("book-1", "report-1");
      expect(onRefresh).toHaveBeenCalled();
    });
  });

  it("collapses on second click", async () => {
    mockFetchDetail.mockResolvedValueOnce({
      ...buildReport(),
      issues: []
    });

    render(
      <ValidationReportTab
        bookId="book-1"
        reports={[buildReport()]}
        onRefresh={onRefresh}
      />
    );

    // Expand
    fireEvent.click(screen.getByText("全书级自检报告"));
    await waitFor(() => expect(mockFetchDetail).toHaveBeenCalled());

    // Collapse
    fireEvent.click(screen.getByText("全书级自检报告"));

    // Detail should be gone — no auto-fix button visible
    await waitFor(() => {
      expect(screen.queryByText(/应用自动修正/)).not.toBeInTheDocument();
    });
  });

  it("shows APPLIED status label", () => {
    render(
      <ValidationReportTab
        bookId="book-1"
        reports={[buildReport({ status: "APPLIED" })]}
        onRefresh={onRefresh}
      />
    );
    expect(screen.getByText("已应用")).toBeInTheDocument();
  });
});
