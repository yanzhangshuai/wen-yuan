/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { RoleManagementTab } from "./role-management-tab";
import type { BookPersonaListItem } from "@/lib/services/books";

const {
  fetchBookPersonasMock,
  createBookPersonaMock,
  patchPersonaMock,
  deletePersonaMock,
  fetchPersonaDeletePreviewMock
} = vi.hoisted(() => ({
  fetchBookPersonasMock        : vi.fn(),
  createBookPersonaMock        : vi.fn(),
  patchPersonaMock             : vi.fn(),
  deletePersonaMock            : vi.fn(),
  fetchPersonaDeletePreviewMock: vi.fn()
}));

vi.mock("@/lib/services/books", () => ({
  fetchBookPersonas: fetchBookPersonasMock,
  createBookPersona: createBookPersonaMock
}));

vi.mock("@/lib/services/personas", () => ({
  patchPersona             : patchPersonaMock,
  deletePersona            : deletePersonaMock,
  fetchPersonaDeletePreview: fetchPersonaDeletePreviewMock
}));

function buildPersona(overrides: Partial<BookPersonaListItem>): BookPersonaListItem {
  return {
    id           : "persona-stored",
    profileId    : "profile-stored",
    bookId       : "book-1",
    name         : "Alpha 正式",
    localName    : "Alpha",
    aliases      : [],
    gender       : null,
    hometown     : null,
    nameType     : "NAMED",
    globalTags   : [],
    localTags    : [],
    officialTitle: null,
    localSummary : null,
    ironyIndex   : 0,
    confidence   : 1,
    recordSource : "MANUAL",
    status       : "VERIFIED",
    ...overrides
  };
}

function row(name: string): HTMLElement {
  return screen.getByText(name).closest("article") as HTMLElement;
}

describe("RoleManagementTab role data management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createBookPersonaMock.mockResolvedValue(undefined);
    patchPersonaMock.mockResolvedValue(undefined);
    deletePersonaMock.mockResolvedValue(undefined);
    fetchPersonaDeletePreviewMock.mockResolvedValue({
      persona: { id: "persona-ai", name: "Beta AI" },
      counts : {
        relationshipCount: 0,
        biographyCount   : 1,
        mentionCount     : 0,
        profileCount     : 1
      },
      biographies  : [{ id: "bio-1", title: null, event: "入京", chapter: "第一回" }],
      relationships: [],
      mentions     : [],
      profiles     : [{ id: "profile-ai", bookId: "book-1", localName: "Beta AI" }]
    });
    fetchBookPersonasMock.mockResolvedValue([
      buildPersona({ id: "persona-manual", profileId: "profile-manual", name: "Alpha 手动", recordSource: "MANUAL" }),
      buildPersona({ id: "persona-ai", profileId: "profile-ai", name: "Beta AI", localName: "Beta AI", recordSource: "AI", confidence: 0.82 })
    ]);
  });

  it("shows AI and manual roles as the same editable data list", async () => {
    render(<RoleManagementTab bookId="book-1" />);

    await screen.findByText("Alpha 手动");

    expect(screen.getByRole("button", { name: "全部" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "AI生成" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "手动创建" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "待确认" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "已入库" })).not.toBeInTheDocument();
    expect(within(row("Beta AI")).getByText("AI生成")).toBeInTheDocument();
    expect(within(row("Beta AI")).getByRole("button", { name: "编辑角色" })).toBeInTheDocument();
    expect(within(row("Beta AI")).getByRole("button", { name: "删除角色" })).toBeInTheDocument();
    expect(within(row("Beta AI")).queryByRole("button", { name: "确认角色" })).not.toBeInTheDocument();
    expect(within(row("Beta AI")).queryByRole("button", { name: "拒绝角色" })).not.toBeInTheDocument();
  });

  it("filters roles by source", async () => {
    render(<RoleManagementTab bookId="book-1" />);

    await screen.findByText("Beta AI");

    fireEvent.click(screen.getByRole("button", { name: "AI生成" }));
    expect(screen.getByText("Beta AI")).toBeInTheDocument();
    expect(screen.queryByText("Alpha 手动")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "手动创建" }));
    expect(screen.queryByText("Beta AI")).not.toBeInTheDocument();
    expect(screen.getByText("Alpha 手动")).toBeInTheDocument();
  });

  it("edits an AI generated role through the same persona form", async () => {
    render(<RoleManagementTab bookId="book-1" />);

    await screen.findByText("Beta AI");
    fireEvent.click(within(row("Beta AI")).getByRole("button", { name: "编辑角色" }));
    fireEvent.change(screen.getByLabelText("姓名"), { target: { value: "Beta 已修正" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(patchPersonaMock).toHaveBeenCalledWith(
      "persona-ai",
      expect.objectContaining({
        bookId   : "book-1",
        name     : "Beta 已修正",
        localName: "Beta AI"
      })
    ));
  });

  it("deletes an AI generated role only after cascade preview confirmation", async () => {
    render(<RoleManagementTab bookId="book-1" />);

    await screen.findByText("Beta AI");
    fireEvent.click(within(row("Beta AI")).getByRole("button", { name: "删除角色" }));

    await screen.findByRole("alertdialog", { name: "确认删除角色" });
    expect(fetchPersonaDeletePreviewMock).toHaveBeenCalledWith("persona-ai", "book-1");
    expect(await screen.findByText(/入京/)).toBeInTheDocument();
    expect(deletePersonaMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));
    await waitFor(() => expect(deletePersonaMock).toHaveBeenCalledWith("persona-ai", "book-1"));
  });
});
