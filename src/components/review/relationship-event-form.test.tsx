/** @vitest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RelationshipEventForm } from "@/components/review/relationship-event-form";
import {
  createRelationshipEvent,
  patchRelationshipEvent
} from "@/lib/services/relationship-events";

vi.mock("@/lib/services/relationship-events", () => ({
  createRelationshipEvent: vi.fn(),
  patchRelationshipEvent : vi.fn()
}));

const createRelationshipEventMock = vi.mocked(createRelationshipEvent);
const patchRelationshipEventMock = vi.mocked(patchRelationshipEvent);
const FORM_FLOW_TEST_TIMEOUT_MS = 10000;

describe("RelationshipEventForm", () => {
  beforeEach(() => {
    createRelationshipEventMock.mockReset();
    patchRelationshipEventMock.mockReset();
  });

  it("creates an event with quick tags and custom tags", async () => {
    createRelationshipEventMock.mockResolvedValue(undefined);
    const onSaved = vi.fn();

    render(
      <RelationshipEventForm
        relationshipId="rel-1"
        chapters={[{ id: "chapter-1", no: 3, title: "第三回" }]}
        onSaved={onSaved}
        onCancel={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("事件摘要"), { target: { value: "张三提携李四" } });
    fireEvent.click(screen.getByRole("button", { name: "资助" }));
    fireEvent.change(screen.getByLabelText("自定义标签"), { target: { value: "赏识" } });
    fireEvent.click(screen.getByRole("button", { name: "添加标签" }));
    expect(screen.getByText("赏识")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "保存关系事件" }));

    await waitFor(() => {
      expect(createRelationshipEventMock).toHaveBeenCalledWith("rel-1", {
        chapterId   : "chapter-1",
        summary     : "张三提携李四",
        evidence    : null,
        attitudeTags: ["资助", "赏识"],
        paraIndex   : null,
        confidence  : 0.8
      });
    });
    expect(onSaved).toHaveBeenCalled();
  }, FORM_FLOW_TEST_TIMEOUT_MS);

  it("renders all preset quick tags", () => {
    render(
      <RelationshipEventForm
        relationshipId="rel-1"
        chapters={[{ id: "chapter-1", no: 3, title: "第三回" }]}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    for (const tag of ["感激", "怨恨", "倾慕", "厌恶", "愧疚", "惧怕", "资助", "提携", "排挤", "背叛", "庇护", "疏远", "决裂", "修好", "公开", "隐瞒", "利用"]) {
      expect(screen.getByRole("button", { name: tag })).toBeInTheDocument();
    }
  });

  it("patches an existing event", async () => {
    patchRelationshipEventMock.mockResolvedValue(undefined);

    render(
      <RelationshipEventForm
        relationshipId="rel-1"
        event={{
          id          : "event-1",
          chapterId   : "chapter-1",
          summary     : "旧摘要",
          evidence    : "旧证据",
          attitudeTags: ["公开"],
          paraIndex   : 8,
          confidence  : 0.6,
          recordSource: "DRAFT_AI",
          status      : "DRAFT"
        }}
        chapters={[{ id: "chapter-1", no: 3, title: "第三回" }]}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("事件摘要"), { target: { value: "新摘要" } });
    fireEvent.click(screen.getByRole("button", { name: "保存关系事件" }));

    await waitFor(() => {
      expect(patchRelationshipEventMock).toHaveBeenCalledWith("event-1", expect.objectContaining({
        summary     : "新摘要",
        evidence    : "旧证据",
        attitudeTags: ["公开"],
        paraIndex   : 8,
        confidence  : 0.6,
        recordSource: "DRAFT_AI",
        status      : "DRAFT"
      }));
    });
  });
});
