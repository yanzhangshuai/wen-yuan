/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { RoleReviewWorkbench } from "./role-review-workbench";
import type { BookPersonaListItem } from "@/lib/services/books";
import type { DraftsData } from "@/lib/services/role-workbench";
import type { AliasMappingItem } from "@/lib/services/alias-mappings";
import type { PersonaDetail } from "@/types/graph";

class MockResizeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}

const ROLE_REVIEW_WORKBENCH_TEST_TIMEOUT = 10000;

const {
  fetchBookPersonasMock,
  createBookPersonaMock,
  fetchPersonaDetailMock,
  fetchPersonaDeletePreviewMock,
  patchPersonaMock,
  deletePersonaMock,
  patchRelationshipMock,
  createRelationshipMock,
  patchBiographyMock,
  createBiographyMock,
  deleteBiographyMock,
  confirmAliasMappingMock,
  rejectAliasMappingMock,
  createAliasMappingMock,
  fetchChapterEventChaptersMock
} = vi.hoisted(() => ({
  fetchBookPersonasMock        : vi.fn(),
  createBookPersonaMock        : vi.fn(),
  fetchPersonaDetailMock       : vi.fn(),
  fetchPersonaDeletePreviewMock: vi.fn(),
  patchPersonaMock             : vi.fn(),
  deletePersonaMock            : vi.fn(),
  patchRelationshipMock        : vi.fn(),
  createRelationshipMock       : vi.fn(),
  patchBiographyMock           : vi.fn(),
  createBiographyMock          : vi.fn(),
  deleteBiographyMock          : vi.fn(),
  confirmAliasMappingMock      : vi.fn(),
  rejectAliasMappingMock       : vi.fn(),
  createAliasMappingMock       : vi.fn(),
  fetchChapterEventChaptersMock: vi.fn()
}));

vi.mock("@/lib/services/books", () => ({
  fetchBookPersonas: fetchBookPersonasMock,
  createBookPersona: createBookPersonaMock
}));

vi.mock("@/lib/services/personas", () => ({
  fetchPersonaDetail       : fetchPersonaDetailMock,
  fetchPersonaDeletePreview: fetchPersonaDeletePreviewMock,
  deletePersona            : deletePersonaMock,
  patchPersona             : patchPersonaMock
}));

vi.mock("@/lib/services/relationships", () => ({
  patchRelationship : patchRelationshipMock,
  createRelationship: createRelationshipMock
}));

vi.mock("@/lib/services/biography", () => ({
  patchBiography : patchBiographyMock,
  createBiography: createBiographyMock,
  deleteBiography: deleteBiographyMock
}));

vi.mock("@/lib/services/alias-mappings", () => ({
  confirmAliasMapping: confirmAliasMappingMock,
  rejectAliasMapping : rejectAliasMappingMock,
  createAliasMapping : createAliasMappingMock
}));

vi.mock("@/lib/services/role-workbench", () => ({
  fetchChapterEventChapters: fetchChapterEventChaptersMock
}));

vi.mock("@/components/relations/persona-pair-drawer", () => ({
  PersonaPairDrawer: ({ open, aId, bId, role }: { open: boolean; aId: string; bId: string; role: string }) => (
    open ? <div role="dialog">Pair Drawer {aId} {bId} {role}</div> : null
  )
}));

function buildPersona(overrides: Partial<BookPersonaListItem>): BookPersonaListItem {
  return {
    id                         : "persona-1",
    profileId                  : "profile-1",
    bookId                     : "book-1",
    name                       : "范进",
    localName                  : "范进",
    aliases                    : [],
    gender                     : null,
    hometown                   : null,
    nameType                   : "NAMED",
    globalTags                 : [],
    localTags                  : [],
    officialTitle              : null,
    localSummary               : null,
    firstAppearanceChapterId   : null,
    firstAppearanceChapterNo   : null,
    firstAppearanceChapterTitle: null,
    ironyIndex                 : 0,
    confidence                 : 0.91,
    recordSource               : "AI",
    status                     : "DRAFT",
    ...overrides
  };
}

function buildDrafts(): DraftsData {
  return {
    summary: {
      persona     : 1,
      relationship: 2,
      biography   : 1,
      total       : 4
    },
    personas     : [],
    relationships: [
      {
        id             : "rel-out",
        bookId         : "book-1",
        bookTitle      : "儒林外史",
        chapterId      : "11111111-1111-4111-8111-111111111111",
        chapterNo      : 1,
        sourcePersonaId: "persona-1",
        sourceName     : "范进",
        targetPersonaId: "persona-2",
        targetName     : "胡屠户",
        type           : "岳婿",
        weight         : 1,
        confidence     : 0.8,
        evidence       : "胡屠户训斥范进",
        recordSource   : "AI",
        status         : "DRAFT"
      },
      {
        id             : "rel-in",
        bookId         : "book-1",
        bookTitle      : "儒林外史",
        chapterId      : "11111111-1111-4111-8111-111111111111",
        chapterNo      : 1,
        sourcePersonaId: "persona-2",
        sourceName     : "胡屠户",
        targetPersonaId: "persona-1",
        targetName     : "范进",
        type           : "训斥",
        weight         : 1,
        confidence     : 0.7,
        evidence       : null,
        recordSource   : "AI",
        status         : "DRAFT"
      }
    ],
    biographyRecords: [
      {
        id          : "bio-1",
        bookId      : "book-1",
        bookTitle   : "儒林外史",
        chapterId   : "11111111-1111-4111-8111-111111111111",
        chapterNo   : 1,
        personaId   : "persona-1",
        personaName : "范进",
        category    : "EVENT",
        title       : "中举前",
        location    : null,
        event       : "范进借盘缠应试。",
        recordSource: "AI",
        status      : "DRAFT"
      }
    ]
  };
}

function buildAliases(): AliasMappingItem[] {
  return [{
    id          : "alias-1",
    bookId      : "book-1",
    alias       : "范相公",
    resolvedName: "范进",
    aliasType   : "TITLE",
    personaId   : "persona-1",
    confidence  : 0.86,
    evidence    : "范相公来了",
    status      : "PENDING",
    chapterStart: 1,
    chapterEnd  : 1,
    createdAt   : "2026-01-01T00:00:00.000Z"
  }];
}

function buildPersonaDetail(overrides: Partial<PersonaDetail> = {}): PersonaDetail {
  return {
    id          : "persona-1",
    name        : "范进",
    aliases     : ["范相公"],
    gender      : null,
    hometown    : null,
    nameType    : "NAMED",
    recordSource: "AI",
    confidence  : 0.91,
    status      : "DRAFT",
    profiles    : [],
    timeline    : [{
      id          : "bio-1",
      bookId      : "book-1",
      bookTitle   : "儒林外史",
      chapterId   : "11111111-1111-4111-8111-111111111111",
      chapterNo   : 1,
      category    : "EVENT",
      title       : "中举前",
      location    : null,
      event       : "范进借盘缠应试。",
      recordSource: "AI",
      status      : "DRAFT"
    }],
    relationships: [
      {
        id             : "rel-out",
        bookId         : "book-1",
        bookTitle      : "儒林外史",
        chapterId      : "11111111-1111-4111-8111-111111111111",
        chapterNo      : 1,
        direction      : "outgoing",
        counterpartId  : "persona-2",
        counterpartName: "胡屠户",
        type           : "岳婿",
        weight         : 1,
        evidence       : "胡屠户训斥范进",
        recordSource   : "AI",
        status         : "DRAFT"
      },
      {
        id             : "rel-in",
        bookId         : "book-1",
        bookTitle      : "儒林外史",
        chapterId      : "11111111-1111-4111-8111-111111111111",
        chapterNo      : 1,
        direction      : "incoming",
        counterpartId  : "persona-2",
        counterpartName: "胡屠户",
        type           : "训斥",
        weight         : 1,
        evidence       : null,
        recordSource   : "AI",
        status         : "DRAFT"
      }
    ],
    ...overrides
  };
}

describe("RoleReviewWorkbench", { timeout: ROLE_REVIEW_WORKBENCH_TEST_TIMEOUT }, () => {
  beforeAll(() => {
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    fetchBookPersonasMock.mockResolvedValue([
      buildPersona({ id: "persona-1", name: "范进", aliases: ["范相公"], recordSource: "AI" }),
      buildPersona({ id: "persona-2", name: "胡屠户", localName: "胡屠户", aliases: ["杀猪的"], recordSource: "MANUAL" })
    ]);
    fetchChapterEventChaptersMock.mockResolvedValue({
      summary: {
        totalChapters   : 2,
        verifiedChapters: 0,
        pendingEvents   : 1
      },
      chapters: [
        {
          id          : "11111111-1111-4111-8111-111111111111",
          no          : 1,
          noText      : null,
          title       : "说楔子敷陈大义",
          eventCount  : 1,
          pendingCount: 1,
          isVerified  : false,
          verifiedAt  : null
        },
        {
          id          : "22222222-2222-4222-8222-222222222222",
          no          : 2,
          noText      : null,
          title       : "王孝廉村学识同科",
          eventCount  : 0,
          pendingCount: 0,
          isVerified  : false,
          verifiedAt  : null
        }
      ]
    });
    fetchPersonaDetailMock.mockResolvedValue(buildPersonaDetail());
    fetchPersonaDeletePreviewMock.mockResolvedValue({
      persona: { id: "persona-1", name: "范进" },
      counts : {
        relationshipCount: 2,
        biographyCount   : 1,
        mentionCount     : 0,
        profileCount     : 1
      },
      biographies  : [{ id: "bio-1", title: "中举前", event: "范进借盘缠应试。", chapter: "第一回" }],
      relationships: [{ id: "rel-out", type: "岳婿", sourceName: "范进", targetName: "胡屠户", description: null, chapter: "第一回" }],
      mentions     : [],
      profiles     : [{ id: "profile-1", bookId: "book-1", localName: "范进" }]
    });
    deletePersonaMock.mockResolvedValue(undefined);
    patchRelationshipMock.mockResolvedValue(undefined);
    patchBiographyMock.mockResolvedValue(undefined);
    deleteBiographyMock.mockResolvedValue(undefined);
    createBookPersonaMock.mockResolvedValue(undefined);
    patchPersonaMock.mockResolvedValue(undefined);
  });

  it("sorts roles by first appearance chapter by default", async () => {
    const drafts = buildDrafts();
    const biographyTemplate = drafts.biographyRecords[0];
    if (!biographyTemplate) throw new Error("missing biography fixture");
    drafts.relationships = [];
    drafts.biographyRecords = [
      {
        ...biographyTemplate,
        id       : "bio-persona-1",
        personaId: "persona-1",
        chapterNo: 5
      },
      {
        ...biographyTemplate,
        id         : "bio-persona-2",
        personaId  : "persona-2",
        personaName: "胡屠户",
        chapterNo  : 1
      }
    ];

    const { container } = render(
      <RoleReviewWorkbench
        bookId="book-1"
        drafts={drafts}
        aliasMappings={[]}
        onRefreshDrafts={vi.fn()}
        onRefreshAliases={vi.fn()}
      />
    );

    await screen.findByRole("button", { name: /胡屠户/ });
    const roleRows = container.querySelectorAll(".role-review-sidebar button.mb-2");
    expect(roleRows[0]).toHaveTextContent("胡屠户");
    expect(screen.getByRole("heading", { name: "胡屠户" })).toBeInTheDocument();
  });

  it("prefers explicitly configured first appearance chapter when sorting roles", async () => {
    const drafts = buildDrafts();
    const biographyTemplate = drafts.biographyRecords[0];
    if (!biographyTemplate) throw new Error("missing biography fixture");
    drafts.relationships = [];
    drafts.biographyRecords = [
      {
        ...biographyTemplate,
        id       : "bio-persona-1",
        personaId: "persona-1",
        chapterNo: 5
      },
      {
        ...biographyTemplate,
        id         : "bio-persona-2",
        personaId  : "persona-2",
        personaName: "胡屠户",
        chapterNo  : 1
      }
    ];
    fetchBookPersonasMock.mockResolvedValue([
      buildPersona({
        id                         : "persona-1",
        name                       : "范进",
        firstAppearanceChapterId   : "22222222-2222-4222-8222-222222222222",
        firstAppearanceChapterNo   : 2,
        firstAppearanceChapterTitle: "王孝廉村学识同科"
      }),
      buildPersona({ id: "persona-2", name: "胡屠户", localName: "胡屠户" })
    ]);

    const { container } = render(
      <RoleReviewWorkbench
        bookId="book-1"
        drafts={drafts}
        aliasMappings={[]}
        onRefreshDrafts={vi.fn()}
        onRefreshAliases={vi.fn()}
      />
    );

    await screen.findByRole("button", { name: /胡屠户/ });
    const roleRows = container.querySelectorAll(".role-review-sidebar button.mb-2");
    expect(roleRows[0]).toHaveTextContent("胡屠户");
    expect(roleRows[1]).toHaveTextContent("范进");
  });

  it("filters roles, shows pending badges, and renders directional relationships", async () => {
    render(
      <RoleReviewWorkbench
        bookId="book-1"
        drafts={buildDrafts()}
        aliasMappings={buildAliases()}
        onRefreshDrafts={vi.fn()}
        onRefreshAliases={vi.fn()}
      />
    );

    await screen.findByRole("button", { name: /范进/ });
    const fanRow = screen.getByRole("button", { name: /范进/ });
    expect(within(fanRow).getByText("关系 2")).toBeInTheDocument();
    expect(within(fanRow).getByText("传记 1")).toBeInTheDocument();
    expect(within(fanRow).getByText("别名 1")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("搜索角色、别名或标签"), { target: { value: "屠户" } });
    expect(screen.queryByRole("button", { name: /范进/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /胡屠户/ })).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("搜索角色、别名或标签"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /范进/ }));
    fireEvent.click(screen.getByRole("button", { name: "关系" }));

    expect(screen.getByText("当前角色 -> 对方")).toBeInTheDocument();
    expect(screen.getByText("范进 -> 胡屠户")).toBeInTheDocument();
    expect(screen.getByText("对方 -> 当前角色")).toBeInTheDocument();
    expect(screen.getByText("胡屠户 -> 范进")).toBeInTheDocument();
    expect(screen.getByText("这是对端指向当前角色的入向边。")).toBeInTheDocument();
  });

  it("keeps sidebar and workspace in independent scroll containers", async () => {
    const { container } = render(
      <RoleReviewWorkbench
        bookId="book-1"
        drafts={buildDrafts()}
        aliasMappings={buildAliases()}
        onRefreshDrafts={vi.fn()}
        onRefreshAliases={vi.fn()}
      />
    );

    await screen.findByRole("button", { name: /范进/ });

    expect(container.querySelector(".role-review-workbench")).toHaveClass(
      "h-full",
      "min-h-0",
      "overflow-hidden"
    );
    expect(container.querySelector(".role-review-sidebar")).toHaveClass(
      "h-full",
      "min-h-0",
      "overflow-hidden"
    );
    expect(container.querySelector(".role-review-sidebar .overflow-y-auto")).toBeInTheDocument();
    expect(container.querySelector(".role-review-workspace")).toHaveClass(
      "h-full",
      "min-h-0",
      "overflow-hidden"
    );
    expect(container.querySelector(".role-review-workspace .overflow-y-auto")).toBeInTheDocument();
  });

  it("uses chapter dropdowns instead of chapter ID text inputs in biography forms", async () => {
    render(
      <RoleReviewWorkbench
        bookId="book-1"
        drafts={buildDrafts()}
        aliasMappings={buildAliases()}
        onRefreshDrafts={vi.fn()}
        onRefreshAliases={vi.fn()}
      />
    );

    await screen.findByRole("button", { name: /范进/ });
    fireEvent.click(screen.getByRole("button", { name: "传记事件" }));
    fireEvent.click(screen.getByRole("button", { name: "新增传记" }));

    expect(screen.queryByLabelText("章节 ID")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "章节" })).toBeInTheDocument();
    expect(screen.getByText("第1回 · 说楔子敷陈大义")).toBeInTheDocument();
  });

  it("uses searchable limited-height selectors for relationship target and chapter", async () => {
    render(
      <RoleReviewWorkbench
        bookId="book-1"
        drafts={buildDrafts()}
        aliasMappings={buildAliases()}
        onRefreshDrafts={vi.fn()}
        onRefreshAliases={vi.fn()}
      />
    );

    await screen.findByRole("button", { name: /范进/ });
    fireEvent.click(screen.getByRole("button", { name: "关系" }));
    fireEvent.click(screen.getByRole("button", { name: "新增关系" }));

    expect(screen.queryByLabelText("章节 ID")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "章节" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("combobox", { name: "选择对方角色" }));
    fireEvent.change(screen.getByPlaceholderText("搜索角色名、书内名或别名"), { target: { value: "杀猪" } });

    expect(screen.getAllByText("胡屠户").length).toBeGreaterThan(0);
    expect(document.querySelector("[data-slot='command-list']")).toHaveClass(
      "max-h-72",
      "overflow-y-auto"
    );
  });

  it("uses an inline editor for role basics and guards dirty cancel", async () => {
    const { container } = render(
      <RoleReviewWorkbench
        bookId="book-1"
        drafts={buildDrafts()}
        aliasMappings={buildAliases()}
        onRefreshDrafts={vi.fn()}
        onRefreshAliases={vi.fn()}
      />
    );

    await screen.findByRole("button", { name: /范进/ });
    fireEvent.click(screen.getByRole("button", { name: "编辑基础资料" }));

    expect(container.querySelector(".role-persona-inline-editor")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "出场章节" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("姓名"), { target: { value: "范进改" } });
    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    expect(screen.getByRole("alertdialog", { name: "放弃未保存修改？" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "继续编辑" }));
    expect(screen.getByLabelText("姓名")).toHaveValue("范进改");
  });

  it("saves configured first appearance chapter from the inline role editor", async () => {
    render(
      <RoleReviewWorkbench
        bookId="book-1"
        drafts={buildDrafts()}
        aliasMappings={buildAliases()}
        onRefreshDrafts={vi.fn()}
        onRefreshAliases={vi.fn()}
      />
    );

    await screen.findByRole("button", { name: /范进/ });
    fireEvent.click(screen.getByRole("button", { name: "编辑基础资料" }));
    fireEvent.click(screen.getByRole("combobox", { name: "出场章节" }));
    fireEvent.click(screen.getByText("第2回 · 王孝廉村学识同科"));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(patchPersonaMock).toHaveBeenCalledWith("persona-1", expect.objectContaining({
        bookId                  : "book-1",
        firstAppearanceChapterId: "22222222-2222-4222-8222-222222222222"
      }));
    });
  });

  it("opens role creation in the workspace instead of the side sheet", async () => {
    const { container } = render(
      <RoleReviewWorkbench
        bookId="book-1"
        drafts={buildDrafts()}
        aliasMappings={buildAliases()}
        onRefreshDrafts={vi.fn()}
        onRefreshAliases={vi.fn()}
      />
    );

    await screen.findByRole("button", { name: /范进/ });
    fireEvent.click(screen.getByRole("button", { name: "新增角色" }));

    expect(container.querySelector(".role-persona-inline-editor")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "新增角色" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
  });

  it("guards dirty sheet changes before closing the relationship editor", async () => {
    render(
      <RoleReviewWorkbench
        bookId="book-1"
        drafts={buildDrafts()}
        aliasMappings={buildAliases()}
        onRefreshDrafts={vi.fn()}
        onRefreshAliases={vi.fn()}
      />
    );

    await screen.findByRole("button", { name: /范进/ });
    fireEvent.click(screen.getByRole("button", { name: "关系" }));
    fireEvent.click(screen.getByRole("button", { name: "新增关系" }));
    fireEvent.change(screen.getByLabelText("关系类型"), { target: { value: "师友" } });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.getByRole("alertdialog", { name: "放弃未保存修改？" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "继续编辑" }));
    expect(screen.getByLabelText("关系类型")).toHaveValue("师友");
  });

  it("shows feedback when relationship review action fails", async () => {
    patchRelationshipMock.mockRejectedValueOnce(new Error("network"));

    render(
      <RoleReviewWorkbench
        bookId="book-1"
        drafts={buildDrafts()}
        aliasMappings={buildAliases()}
        onRefreshDrafts={vi.fn()}
        onRefreshAliases={vi.fn()}
      />
    );

    await screen.findByRole("button", { name: /范进/ });
    fireEvent.click(screen.getByRole("button", { name: "关系" }));
    const confirmButtons = screen.getAllByRole("button", { name: "确认" });
    expect(confirmButtons.length).toBeGreaterThan(0);
    const firstConfirmButton = confirmButtons[0];
    if (!firstConfirmButton) throw new Error("missing relationship confirm button");
    fireEvent.click(firstConfirmButton);

    expect(await screen.findByText("关系确认失败，请稍后重试。")).toBeInTheDocument();
  });

  it("guards dirty sheet changes before switching roles", async () => {
    render(
      <RoleReviewWorkbench
        bookId="book-1"
        drafts={buildDrafts()}
        aliasMappings={buildAliases()}
        onRefreshDrafts={vi.fn()}
        onRefreshAliases={vi.fn()}
      />
    );

    await screen.findByRole("button", { name: /范进/ });
    fireEvent.click(screen.getByRole("button", { name: "编辑基础资料" }));
    fireEvent.change(screen.getByLabelText("姓名"), { target: { value: "范进改" } });
    fireEvent.click(screen.getByRole("button", { name: /胡屠户/ }));

    expect(screen.getByRole("alertdialog", { name: "放弃未保存修改？" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "继续编辑" }));
    expect(screen.getByLabelText("姓名")).toHaveValue("范进改");
  });

  it("blocks incomplete relationship and biography submissions before calling services", async () => {
    fetchBookPersonasMock.mockResolvedValue([
      buildPersona({ id: "persona-1", name: "范进", aliases: ["范相公"], recordSource: "AI" })
    ]);

    render(
      <RoleReviewWorkbench
        bookId="book-1"
        drafts={buildDrafts()}
        aliasMappings={buildAliases()}
        onRefreshDrafts={vi.fn()}
        onRefreshAliases={vi.fn()}
      />
    );

    await screen.findByRole("button", { name: /范进/ });
    fireEvent.click(screen.getByRole("button", { name: "关系" }));
    fireEvent.click(screen.getByRole("button", { name: "新增关系" }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(screen.getByText("请选择对方角色后再保存关系。")).toBeInTheDocument();
    expect(createRelationshipMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "传记事件" }));
    fireEvent.click(screen.getByRole("button", { name: "新增传记" }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(screen.getByText("请填写事件描述后再保存传记事件。")).toBeInTheDocument();
    expect(createBiographyMock).not.toHaveBeenCalled();
  });

  it("requires delete preview before deleting a role", async () => {
    render(
      <RoleReviewWorkbench
        bookId="book-1"
        drafts={buildDrafts()}
        aliasMappings={buildAliases()}
        onRefreshDrafts={vi.fn()}
        onRefreshAliases={vi.fn()}
      />
    );

    await screen.findByRole("button", { name: /范进/ });
    fireEvent.click(screen.getByRole("button", { name: "删除角色" }));

    expect(fetchPersonaDeletePreviewMock).toHaveBeenCalledWith("persona-1", "book-1");
    expect(await screen.findByText("中举前 - 范进借盘缠应试。")).toBeInTheDocument();
    expect(deletePersonaMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));
    await waitFor(() => expect(deletePersonaMock).toHaveBeenCalledWith("persona-1", "book-1"));
  });

  it("uses persona detail so verified role records remain visible after draft refresh", async () => {
    fetchPersonaDetailMock.mockResolvedValue(buildPersonaDetail({
      timeline: [{
        id          : "bio-verified",
        bookId      : "book-1",
        bookTitle   : "儒林外史",
        chapterId   : "11111111-1111-4111-8111-111111111111",
        chapterNo   : 2,
        category    : "EVENT",
        title       : "已确认传记",
        location    : null,
        event       : "范进中举后发疯。",
        recordSource: "MANUAL",
        status      : "VERIFIED"
      }],
      relationships: [{
        id             : "rel-verified",
        bookId         : "book-1",
        bookTitle      : "儒林外史",
        chapterId      : "11111111-1111-4111-8111-111111111111",
        chapterNo      : 2,
        direction      : "outgoing",
        counterpartId  : "persona-2",
        counterpartName: "胡屠户",
        type           : "翁婿",
        weight         : 2,
        evidence       : "胡屠户贺喜",
        recordSource   : "MANUAL",
        status         : "VERIFIED"
      }]
    }));

    render(
      <RoleReviewWorkbench
        bookId="book-1"
        drafts={{ ...buildDrafts(), relationships: [], biographyRecords: [] }}
        aliasMappings={buildAliases()}
        onRefreshDrafts={vi.fn()}
        onRefreshAliases={vi.fn()}
      />
    );

    await screen.findByRole("button", { name: /范进/ });
    fireEvent.click(screen.getByRole("button", { name: "关系" }));
    expect(await screen.findByText("范进 -> 胡屠户")).toBeInTheDocument();
    expect(screen.getByText("翁婿")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "传记事件" }));
    expect(await screen.findByText("已确认传记")).toBeInTheDocument();
    expect(screen.getByText("范进中举后发疯。")).toBeInTheDocument();
  });

  it("shows relationship events tab and opens the selected pair drawer", async () => {
    render(
      <RoleReviewWorkbench
        bookId="book-1"
        drafts={buildDrafts()}
        aliasMappings={buildAliases()}
        onRefreshDrafts={vi.fn()}
        onRefreshAliases={vi.fn()}
      />
    );

    await screen.findByRole("button", { name: /范进/ });
    fireEvent.click(screen.getByRole("button", { name: "关系事件" }));
    const relationshipEventsRegion = screen.getByRole("region", { name: "关系事件" });
    fireEvent.click(within(relationshipEventsRegion).getByRole("button", { name: /胡屠户/ }));

    expect(screen.getByRole("dialog")).toHaveTextContent("Pair Drawer persona-1 persona-2 admin");
  });
});
