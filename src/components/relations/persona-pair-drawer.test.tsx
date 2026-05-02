/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PersonaPairDrawer } from "@/components/relations/persona-pair-drawer";
import { fetchPersonaPair } from "@/lib/services/persona-pairs";
import type { PersonaPairResponse } from "@/types/persona-pair";

vi.mock("@/lib/services/persona-pairs", () => ({
  fetchPersonaPair: vi.fn()
}));

const fetchPersonaPairMock = vi.mocked(fetchPersonaPair);

function buildPair(overrides: Partial<PersonaPairResponse> = {}): PersonaPairResponse {
  return {
    bookId  : "book-1",
    aId     : "persona-a",
    bId     : "persona-b",
    personas: [
      { id: "persona-a", name: "张三", aliases: [], portraitUrl: null },
      { id: "persona-b", name: "李四", aliases: [], portraitUrl: null }
    ],
    relationships: [
      {
        id                  : "rel-mentor",
        sourceId            : "persona-a",
        targetId            : "persona-b",
        relationshipTypeCode: "MENTOR",
        relationshipType    : {
          code         : "MENTOR",
          name         : "师生",
          group        : "社会",
          directionMode: "DIRECTED",
          inverseLabel : "学生"
        },
        recordSource  : "DRAFT_AI",
        status        : "DRAFT",
        firstChapterNo: 3,
        lastChapterNo : 7,
        eventCount    : 2,
        events        : [
          {
            id          : "event-1",
            chapterId   : "chapter-3",
            chapterNo   : 3,
            chapterTitle: "第三回",
            sourceId    : "persona-a",
            targetId    : "persona-b",
            summary     : "张三提携李四",
            evidence    : "张三把李四引荐给众人。",
            attitudeTags: [" 资助 ", "提携", "资助"],
            paraIndex   : 12,
            confidence  : 0.91,
            recordSource: "AI",
            status      : "DRAFT"
          },
          {
            id          : "event-2",
            chapterId   : "chapter-7",
            chapterNo   : 7,
            chapterTitle: "第七回",
            sourceId    : "persona-b",
            targetId    : "persona-a",
            summary     : "李四公开感激张三",
            evidence    : null,
            attitudeTags: ["公开", "资助"],
            paraIndex   : null,
            confidence  : 0.8,
            recordSource: "MANUAL",
            status      : "VERIFIED"
          }
        ]
      }
    ],
    ...overrides
  };
}

function renderDrawer(role: "admin" | "viewer" = "viewer") {
  return render(
    <PersonaPairDrawer
      open
      onOpenChange={vi.fn()}
      bookId="book-1"
      aId="persona-a"
      bId="persona-b"
      role={role}
    />
  );
}

describe("PersonaPairDrawer", () => {
  beforeEach(() => {
    fetchPersonaPairMock.mockReset();
  });

  it("renders loading and then the loaded pair summary", async () => {
    fetchPersonaPairMock.mockResolvedValue(buildPair());

    renderDrawer();

    expect(screen.getByText("正在加载人物关系...")).toBeInTheDocument();
    expect(await screen.findByText("张三 与 李四 的关系")).toBeInTheDocument();
    expect(screen.getByText("师生")).toBeInTheDocument();
    expect(screen.getByText("张三提携李四")).toBeInTheDocument();
    expect(fetchPersonaPairMock).toHaveBeenCalledWith("book-1", "persona-a", "persona-b");
  });

  it("renders an empty relationship state", async () => {
    fetchPersonaPairMock.mockResolvedValue(buildPair({ relationships: [] }));

    renderDrawer();

    expect(await screen.findByText("暂无结构关系")).toBeInTheDocument();
  });

  it("auto-expands a single relationship and collapses multiple relationships by default", async () => {
    fetchPersonaPairMock.mockResolvedValue(buildPair({
      relationships: [
        buildPair().relationships[0],
        {
          ...buildPair().relationships[0],
          id                  : "rel-rival",
          relationshipTypeCode: "RIVAL",
          relationshipType    : {
            code         : "RIVAL",
            name         : "竞争",
            group        : "冲突",
            directionMode: "SYMMETRIC",
            inverseLabel : null
          },
          events: [{
            ...buildPair().relationships[0].events[0],
            id     : "event-rival",
            summary: "二人同场竞争"
          }]
        }
      ]
    }));

    renderDrawer();

    const mentorToggle = await screen.findByRole("button", { name: /师生/ });
    const rivalToggle = screen.getByRole("button", { name: /竞争/ });

    expect(mentorToggle).toHaveAttribute("aria-expanded", "false");
    expect(rivalToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("张三提携李四")).toBeNull();

    fireEvent.click(mentorToggle);
    expect(screen.getByText("张三提携李四")).toBeInTheDocument();
  });

  it("deduplicates attitude tags by normalized value and sorts by count", async () => {
    fetchPersonaPairMock.mockResolvedValue(buildPair());

    renderDrawer();

    await screen.findByText("张三 与 李四 的关系");

    expect(screen.getByText("资助 ×3")).toBeInTheDocument();
    expect(screen.getByText("提携 ×1")).toBeInTheDocument();
    expect(screen.getByText("公开 ×1")).toBeInTheDocument();
  });

  it("hides edit actions for viewers and shows them for admins", async () => {
    fetchPersonaPairMock.mockResolvedValue(buildPair());
    const { rerender } = render(
      <PersonaPairDrawer
        open
        onOpenChange={vi.fn()}
        bookId="book-1"
        aId="persona-a"
        bId="persona-b"
        role="viewer"
      />
    );

    await screen.findByText("张三 与 李四 的关系");
    expect(screen.queryByRole("button", { name: "编辑关系" })).toBeNull();
    expect(screen.queryByRole("button", { name: "+ 录入新事件" })).toBeNull();

    rerender(
      <PersonaPairDrawer
        open
        onOpenChange={vi.fn()}
        bookId="book-1"
        aId="persona-a"
        bId="persona-b"
        role="admin"
      />
    );

    expect(await screen.findByRole("button", { name: "编辑关系" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ 录入新事件" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ 新增结构关系" })).toBeInTheDocument();
  });

  it("marks relationships that have no events", async () => {
    fetchPersonaPairMock.mockResolvedValue(buildPair({
      relationships: [{
        ...buildPair().relationships[0],
        eventCount: 0,
        events    : []
      }]
    }));

    renderDrawer("admin");

    expect(await screen.findByText("待补充事件")).toBeInTheDocument();
  });
});
