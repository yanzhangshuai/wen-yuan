/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { AliasReviewTab } from "./alias-review-tab";
import type { AliasMappingItem } from "@/lib/services/alias-mappings";

/* ------------------------------------------------
   Mocks
   ------------------------------------------------ */

vi.mock("@/lib/services/alias-mappings", () => ({
  confirmAliasMapping: vi.fn().mockResolvedValue(undefined),
  rejectAliasMapping : vi.fn().mockResolvedValue(undefined)
}));

const { confirmAliasMapping, rejectAliasMapping } = await import("@/lib/services/alias-mappings");

function buildMapping(overrides: Partial<AliasMappingItem> = {}): AliasMappingItem {
  return {
    id          : "m-1",
    bookId      : "book-1",
    alias       : "太祖皇帝",
    resolvedName: "朱元璋",
    aliasType   : "TITLE",
    personaId   : "persona-1",
    confidence  : 0.95,
    evidence    : "明朝开国皇帝",
    status      : "PENDING",
    chapterStart: 1,
    chapterEnd  : 56,
    createdAt   : "2026-03-31T10:00:00Z",
    ...overrides
  };
}

/* ------------------------------------------------
   Tests
   ------------------------------------------------ */

describe("AliasReviewTab", () => {
  const onRefresh = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders empty state when no mappings", () => {
    render(<AliasReviewTab bookId="book-1" aliasMappings={[]} onRefresh={onRefresh} />);
    expect(screen.getByText("暂无别名映射记录")).toBeInTheDocument();
  });

  it("renders mapping cards with alias and resolved name", () => {
    render(
      <AliasReviewTab
        bookId="book-1"
        aliasMappings={[buildMapping()]}
        onRefresh={onRefresh}
      />
    );
    expect(screen.getByText(/太祖皇帝/)).toBeInTheDocument();
    expect(screen.getByText(/朱元璋/)).toBeInTheDocument();
    expect(screen.getAllByText("称号/封号").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("待确认").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/95%/)).toBeInTheDocument();
  });

  it("shows placeholder when resolvedName is null", () => {
    render(
      <AliasReviewTab
        bookId="book-1"
        aliasMappings={[buildMapping({ resolvedName: null })]}
        onRefresh={onRefresh}
      />
    );
    expect(screen.getByText("？待确认")).toBeInTheDocument();
  });

  it("filters by status", () => {
    const mappings = [
      buildMapping({ id: "m-1", status: "PENDING" }),
      buildMapping({ id: "m-2", alias: "丞相", status: "CONFIRMED" })
    ];
    render(<AliasReviewTab bookId="book-1" aliasMappings={mappings} onRefresh={onRefresh} />);

    // Initially shows both
    expect(screen.getByText("2 条记录")).toBeInTheDocument();

    // Filter to CONFIRMED
    const statusSelect = screen.getByRole("combobox", { name: "状态筛选" });
    fireEvent.click(statusSelect);
    fireEvent.click(screen.getByRole("option", { name: "已确认" }));
    expect(screen.getByText("1 条记录")).toBeInTheDocument();
  });

  it("calls confirmAliasMapping and onRefresh on confirm click", async () => {
    render(
      <AliasReviewTab
        bookId="book-1"
        aliasMappings={[buildMapping()]}
        onRefresh={onRefresh}
      />
    );

    const confirmBtn = screen.getByRole("button", { name: /确认/ });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(confirmAliasMapping).toHaveBeenCalledWith("book-1", "m-1");
      expect(onRefresh).toHaveBeenCalled();
    });
  });

  it("calls rejectAliasMapping and onRefresh on reject click", async () => {
    render(
      <AliasReviewTab
        bookId="book-1"
        aliasMappings={[buildMapping()]}
        onRefresh={onRefresh}
      />
    );

    const rejectBtn = screen.getByRole("button", { name: /拒绝/ });
    fireEvent.click(rejectBtn);

    await waitFor(() => {
      expect(rejectAliasMapping).toHaveBeenCalledWith("book-1", "m-1");
      expect(onRefresh).toHaveBeenCalled();
    });
  });

  it("hides action buttons for non-PENDING mappings", () => {
    render(
      <AliasReviewTab
        bookId="book-1"
        aliasMappings={[buildMapping({ status: "CONFIRMED" })]}
        onRefresh={onRefresh}
      />
    );
    expect(screen.queryByRole("button", { name: /确认/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /拒绝/ })).not.toBeInTheDocument();
  });

  it("displays record count", () => {
    const mappings = [
      buildMapping({ id: "m-1" }),
      buildMapping({ id: "m-2", alias: "丞相" }),
      buildMapping({ id: "m-3", alias: "世子" })
    ];
    render(<AliasReviewTab bookId="book-1" aliasMappings={mappings} onRefresh={onRefresh} />);
    expect(screen.getByText("3 条记录")).toBeInTheDocument();
  });
});
