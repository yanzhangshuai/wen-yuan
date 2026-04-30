/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { ReviewPanel } from "./review-panel";
import type { DraftsData } from "@/lib/services/reviews";

vi.mock("@/components/review/chapter-events-workbench", () => ({
  ChapterEventsWorkbench: ({ onOpenRoles }: { onOpenRoles: () => void }) => (
    <button type="button" onClick={onOpenRoles}>去统一角色工作台</button>
  )
}));

vi.mock("@/components/review/role-review-workbench", () => ({
  RoleReviewWorkbench: () => <div>统一角色列表</div>
}));

vi.mock("@/components/graph", () => ({
  TextReaderPanel: () => <div>原文面板</div>
}));

vi.mock("@/lib/services/books", () => ({
  fetchChapterContent: vi.fn(),
  fetchBookPersonas  : vi.fn().mockResolvedValue([]),
  createBookPersona  : vi.fn()
}));

vi.mock("@/lib/services/personas", () => ({
  fetchPersonaSummary      : vi.fn(),
  deletePersona            : vi.fn(),
  fetchPersonaDeletePreview: vi.fn(),
  patchPersona             : vi.fn(),
  updatePersonaStatus      : vi.fn()
}));

vi.mock("@/lib/services/reviews", () => ({
  fetchDrafts          : vi.fn(),
  fetchMergeSuggestions: vi.fn(),
  acceptMergeSuggestion: vi.fn(),
  rejectMergeSuggestion: vi.fn(),
  deferMergeSuggestion : vi.fn(),
  bulkVerifyDrafts     : vi.fn(),
  bulkRejectDrafts     : vi.fn()
}));

vi.mock("@/lib/services/alias-mappings", () => ({
  fetchAliasMappings: vi.fn().mockResolvedValue([])
}));

vi.mock("@/lib/services/validation-reports", () => ({
  fetchValidationReports: vi.fn().mockResolvedValue([])
}));

function buildDrafts(): DraftsData {
  return {
    summary: {
      persona     : 2,
      relationship: 0,
      biography   : 0,
      total       : 2
    },
    personas: [
      {
        id          : "profile-1",
        bookId      : "book-1",
        bookTitle   : "测试书",
        personaId   : "persona-1",
        name        : "范进",
        aliases     : [],
        nameType    : "NAMED",
        recordSource: "AI",
        confidence  : 0.91,
        hometown    : null,
        status      : "PENDING"
      }
    ],
    relationships   : [],
    biographyRecords: []
  };
}

describe("ReviewPanel role workspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses one role review tab without nested pending and stored segments", () => {
    render(
      <ReviewPanel
        bookId="book-1"
        bookTitle="测试书"
        initialDrafts={buildDrafts()}
        initialMergeSuggestions={[]}
        initialAliasMappings={[]}
        initialValidationReports={[]}
      />
    );

    expect(screen.queryByRole("button", { name: /人物草稿/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /角色管理/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /关系草稿/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /传记事件/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /角色审核\s*2/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "待审核" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "已入库" })).not.toBeInTheDocument();
    expect(screen.getByText("统一角色列表")).toBeInTheDocument();
  });

  it("opens the unified role list from the chapter events workbench", () => {
    render(
      <ReviewPanel
        bookId="book-1"
        bookTitle="测试书"
        initialDrafts={buildDrafts()}
        initialMergeSuggestions={[]}
        initialAliasMappings={[]}
        initialValidationReports={[]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /章节事迹/ }));
    fireEvent.click(screen.getByRole("button", { name: "去统一角色工作台" }));

    expect(screen.getByRole("button", { name: /角色审核\s*2/ })).toHaveClass("bg-card");
    expect(screen.queryByRole("button", { name: "已入库" })).not.toBeInTheDocument();
    expect(screen.getByText("统一角色列表")).toBeInTheDocument();
  });
});
