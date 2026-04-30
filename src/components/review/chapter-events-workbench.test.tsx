/** @vitest-environment jsdom */
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChapterEventsWorkbench } from "./chapter-events-workbench";
import type { BookPersonaListItem, ChapterContent } from "@/lib/services/books";
import type { ChapterEventChapterData, ChapterEventItem } from "@/lib/services/reviews";

const {
  fetchBookPersonasMock,
  fetchChapterContentMock,
  fetchChapterEventChaptersMock,
  fetchChapterEventsMock,
  createChapterEventMock,
  updateChapterEventMock,
  deleteChapterEventMock,
  markChapterEventsVerifiedMock
} = vi.hoisted(() => ({
  fetchBookPersonasMock        : vi.fn(),
  fetchChapterContentMock      : vi.fn(),
  fetchChapterEventChaptersMock: vi.fn(),
  fetchChapterEventsMock       : vi.fn(),
  createChapterEventMock       : vi.fn(),
  updateChapterEventMock       : vi.fn(),
  deleteChapterEventMock       : vi.fn(),
  markChapterEventsVerifiedMock: vi.fn()
}));

vi.mock("@/lib/services/books", () => ({
  fetchBookPersonas  : fetchBookPersonasMock,
  fetchChapterContent: fetchChapterContentMock
}));

vi.mock("@/lib/services/reviews", () => ({
  fetchChapterEventChapters: fetchChapterEventChaptersMock,
  fetchChapterEvents       : fetchChapterEventsMock,
  createChapterEvent       : createChapterEventMock,
  updateChapterEvent       : updateChapterEventMock,
  deleteChapterEvent       : deleteChapterEventMock,
  markChapterEventsVerified: markChapterEventsVerifiedMock
}));

function buildChapterData(): ChapterEventChapterData {
  return {
    summary: {
      totalChapters   : 2,
      verifiedChapters: 0,
      pendingEvents   : 1
    },
    chapters: [
      {
        id          : "chapter-1",
        no          : 1,
        noText      : "第一回",
        title       : "说楔子敷陈大义",
        eventCount  : 1,
        pendingCount: 1,
        isVerified  : false,
        verifiedAt  : null
      },
      {
        id          : "chapter-2",
        no          : 2,
        noText      : "第二回",
        title       : "王孝廉村学识同科",
        eventCount  : 0,
        pendingCount: 0,
        isVerified  : false,
        verifiedAt  : null
      }
    ]
  };
}

function buildPersonas(): BookPersonaListItem[] {
  return [{
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
    firstAppearanceChapterId   : "chapter-1",
    firstAppearanceChapterNo   : 1,
    firstAppearanceChapterTitle: "说楔子敷陈大义",
    ironyIndex                 : 0,
    confidence                 : 0.9,
    recordSource               : "AI",
    status                     : "DRAFT"
  }];
}

function buildEvents(): ChapterEventItem[] {
  return [{
    id          : "event-1",
    personaId   : "persona-1",
    personaName : "范进",
    chapterId   : "chapter-1",
    chapterNo   : 1,
    category    : "EVENT",
    title       : "赴试",
    location    : null,
    event       : "范进借盘缠应试。",
    virtualYear : null,
    tags        : ["情节"],
    ironyNote   : null,
    recordSource: "AI",
    status      : "DRAFT",
    updatedAt   : null
  }];
}

function buildSource(): ChapterContent {
  return {
    title     : "说楔子敷陈大义",
    chapterNo : 1,
    paragraphs: ["人生南北多歧路。", "将相神仙也要凡人做。"]
  };
}

function expectBoundedScrollPanel(panel: Element | null) {
  expect(panel).toHaveClass("h-full", "min-h-0", "overflow-hidden");
  const scroller = panel?.querySelector(".overflow-y-auto");
  expect(scroller).toBeInTheDocument();
  expect(scroller).toHaveClass("min-h-0", "flex-1", "overflow-y-auto");
}

describe("ChapterEventsWorkbench", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchChapterEventChaptersMock.mockResolvedValue(buildChapterData());
    fetchBookPersonasMock.mockResolvedValue(buildPersonas());
    fetchChapterEventsMock.mockResolvedValue(buildEvents());
    fetchChapterContentMock.mockResolvedValue(buildSource());
  });

  it("keeps chapter progress, source text, and event list in independent scroll containers", async () => {
    const { container } = render(
      <ChapterEventsWorkbench bookId="book-1" onOpenRoles={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByText("角色事迹")).toBeInTheDocument();
    });

    const workbench = container.querySelector(".chapter-events-workbench");
    expect(workbench).toHaveClass("h-full", "min-h-0", "overflow-hidden");

    const chapterProgress = container.querySelector(".chapter-events-progress");
    expectBoundedScrollPanel(chapterProgress);

    const sourcePanel = container.querySelector(".chapter-events-source-panel");
    expectBoundedScrollPanel(sourcePanel);

    const eventPanel = container.querySelector(".chapter-events-list-panel");
    expectBoundedScrollPanel(eventPanel);
  });
});
