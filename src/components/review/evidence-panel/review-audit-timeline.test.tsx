/** @vitest-environment jsdom */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { buildAuditHistoryItem, buildFieldDiff } from "./test-fixtures";
import { ReviewAuditTimeline } from "./review-audit-timeline";

describe("ReviewAuditTimeline", () => {
  it("sorts audit items newest-first and shows curated field diffs", () => {
    render(
      <ReviewAuditTimeline
        auditHistory={[
          buildAuditHistoryItem({
            id       : "audit-older",
            note     : "较早确认",
            createdAt: "2026-04-22T09:00:00.000Z"
          }),
          buildAuditHistoryItem({
            id        : "audit-newer",
            note      : "后续修订",
            createdAt : "2026-04-22T10:30:00.000Z",
            fieldDiffs: [
              buildFieldDiff({
                fieldKey  : "relationTypeKey",
                fieldLabel: "关系类型 Key",
                beforeText: "friend_of",
                afterText : "teacher_of"
              })
            ]
          })
        ]}
      />
    );

    const items = screen.getAllByTestId("review-audit-item");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText("后续修订")).toBeInTheDocument();
    expect(within(items[0]).getByText("关系类型 Key")).toBeInTheDocument();
    expect(within(items[0]).getByText("friend_of")).toBeInTheDocument();
    expect(within(items[0]).getByText("teacher_of")).toBeInTheDocument();
    expect(within(items[1]).getByText("较早确认")).toBeInTheDocument();
  });

  it("shows an explicit empty state when audit history is absent", () => {
    render(<ReviewAuditTimeline auditHistory={[]} />);

    expect(screen.getByText("暂无审核记录")).toBeInTheDocument();
  });
});
