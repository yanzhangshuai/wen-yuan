/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PersonaDetailPanel } from "./persona-detail-panel";
import type { PersonaDetail } from "@/types/graph";

/**
 * 文件定位（人物详情侧栏单测）：
 * - 验证面板按 `PersonaDetail` 契约展示主档/档案/时间轴/关系，并正确分发回调。
 */
function buildDetail(overrides: Partial<PersonaDetail> = {}): PersonaDetail {
  return {
    id        : "persona-1",
    name      : "周进",
    nameType  : "NAMED",
    entityType: "PERSON",
    status    : "DRAFT",
    confidence: 0.9,
    gender    : "男",
    hometown  : "山东兖州",
    aliases   : ["周老师"],
    globalTags: ["寒士"],
    summary   : "科举失意多年后中举的老学究。",
    profile   : {
      localName               : "周老师",
      localSummary            : "屡试不第，最终中举。",
      officialTitle           : "国子监监生",
      localTags               : ["迂腐", "老学究"],
      ironyIndex              : 6,
      firstAppearanceChapterNo: 2,
      status                  : "VERIFIED"
    },
    relationships: [
      {
        id             : "rel-1",
        counterpartId  : "persona-2",
        counterpartName: "范进",
        type           : "师生",
        factCount      : 3,
        status         : "DRAFT",
        firstChapterNo : 3,
        latestChapterNo: 8
      }
    ],
    timeline: [
      {
        id          : "fact-1",
        chapterId   : "chapter-1",
        chapterNo   : 2,
        category    : "EXAM",
        title       : "进学",
        location    : "济南",
        event       : "周进进学，众人贺喜。",
        virtualYear : null,
        tags        : ["科举"],
        recordSource: "AI",
        status      : "DRAFT"
      }
    ],
    appearanceCount         : 12,
    firstAppearanceChapterNo: 2,
    ...overrides
  };
}

describe("PersonaDetailPanel", () => {
  it("renders persona identity, profile, timeline and relationships", () => {
    render(
      <PersonaDetailPanel detail={buildDetail()} onClose={vi.fn()} />
    );

    // 主档信息。
    expect(screen.getByRole("heading", { name: "周进" })).toBeInTheDocument();
    expect(screen.getByText("国子监监生")).toBeInTheDocument();
    expect(screen.getByText("男")).toBeInTheDocument();
    expect(screen.getByText("周老师")).toBeInTheDocument();
    expect(screen.getByText("山东兖州")).toBeInTheDocument();

    // 时间轴事件。
    expect(screen.getByText("进学")).toBeInTheDocument();
    expect(screen.getByText("第2回")).toBeInTheDocument();
    expect(screen.getByText("周进进学，众人贺喜。")).toBeInTheDocument();

    // 关系列表。
    expect(screen.getByText("范进")).toBeInTheDocument();
    expect(screen.getByText("师生")).toBeInTheDocument();

    // 出场统计。
    expect(screen.getByText(/全书出场 12 次/)).toBeInTheDocument();
  });

  it("hides empty sections to avoid noise", () => {
    render(
      <PersonaDetailPanel
        detail={buildDetail({
          aliases        : [],
          hometown       : null,
          summary        : null,
          profile        : null,
          timeline       : [],
          relationships  : [],
          appearanceCount: 0
        })}
        onClose={vi.fn()}
      />
    );

    // 姓名仍渲染，但空分区标题不出现。
    expect(screen.getByRole("heading", { name: "周进" })).toBeInTheDocument();
    expect(screen.queryByText("人物小传")).not.toBeInTheDocument();
    expect(screen.queryByText("生平时间轴")).not.toBeInTheDocument();
    expect(screen.queryByText("与他/她的关系")).not.toBeInTheDocument();
  });

  it("fires onEdit with persona id when edit button clicked", () => {
    const onEdit = vi.fn();
    render(
      <PersonaDetailPanel detail={buildDetail()} onClose={vi.fn()} onEdit={onEdit} />
    );

    fireEvent.click(screen.getByRole("button", { name: /校对此人物/ }));
    expect(onEdit).toHaveBeenCalledWith("persona-1");
  });

  it("fires onClose when close button clicked", () => {
    const onClose = vi.fn();
    render(
      <PersonaDetailPanel detail={buildDetail()} onClose={onClose} />
    );

    fireEvent.click(screen.getByRole("button", { name: "关闭面板" }));
    expect(onClose).toHaveBeenCalled();
  });
});
