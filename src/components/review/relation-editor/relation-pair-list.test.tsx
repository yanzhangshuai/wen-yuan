/** @vitest-environment jsdom */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type {
  ReviewRelationPairSummaryDto,
  ReviewRelationPersonaOptionDto,
  ReviewRelationTypeOptionDto
} from "@/lib/services/relation-editor";

import { RelationEditorToolbar } from "./relation-editor-toolbar";
import { RelationPairList } from "./relation-pair-list";
import type { RelationEditorFilters } from "./types";

const personaOptions: ReviewRelationPersonaOptionDto[] = [
  { personaId: "persona-1", displayName: "范进", aliases: ["范举人"] },
  { personaId: "persona-2", displayName: "周进", aliases: ["周老爷"] }
];

const relationTypeOptions: ReviewRelationTypeOptionDto[] = [
  {
    relationTypeKey   : "teacher_of",
    label             : "师生",
    direction         : "FORWARD",
    relationTypeSource: "PRESET",
    aliasLabels       : ["授业"],
    systemPreset      : true
  },
  {
    relationTypeKey   : "enemy_of",
    label             : "敌对",
    direction         : "BIDIRECTIONAL",
    relationTypeSource: "PRESET",
    aliasLabels       : [],
    systemPreset      : true
  }
];

const pairSummaries: ReviewRelationPairSummaryDto[] = [
  {
    pairKey           : "persona-1::persona-2",
    leftPersonaId     : "persona-1",
    rightPersonaId    : "persona-2",
    leftPersonaName   : "范进",
    rightPersonaName  : "周进",
    totalClaims       : 3,
    activeClaims      : 2,
    latestUpdatedAt   : "2026-04-22T10:00:00.000Z",
    relationTypeKeys  : ["teacher_of", "enemy_of"],
    reviewStateSummary: { PENDING: 2, ACCEPTED: 1 },
    warningFlags      : {
      directionConflict: true,
      intervalConflict : false
    }
  },
  {
    pairKey           : "persona-2::persona-3",
    leftPersonaId     : "persona-2",
    rightPersonaId    : "persona-3",
    leftPersonaName   : "周进",
    rightPersonaName  : "梅玖",
    totalClaims       : 1,
    activeClaims      : 1,
    latestUpdatedAt   : "2026-04-22T11:00:00.000Z",
    relationTypeKeys  : ["teacher_of"],
    reviewStateSummary: { ACCEPTED: 1 },
    warningFlags      : {
      directionConflict: false,
      intervalConflict : true
    }
  }
];

const defaultFilters: RelationEditorFilters = {
  personaId      : "",
  relationTypeKey: "",
  reviewState    : "",
  conflictState  : ""
};

/**
 * 文件定位（关系对导航与工具栏单测）：
 * - 锁定 T14 关系编辑器首屏最重要的导航面：pair list 与 filter toolbar；
 * - 这里只验证 reviewer-facing 摘要和筛选交互，不涉及 claim detail 懒加载。
 */
describe("RelationPairList", () => {
  it("renders pair rows, relation chips, counts, and warning badges", () => {
    render(
      <RelationPairList
        pairSummaries={pairSummaries}
        relationTypeOptions={relationTypeOptions}
        selectedPairKey={null}
        onSelectPair={vi.fn()}
      />
    );

    const firstPairButton = screen.getByRole("button", { name: /范进.*周进/ });

    expect(firstPairButton).toBeInTheDocument();
    expect(within(firstPairButton).getByText("师生")).toBeInTheDocument();
    expect(within(firstPairButton).getByText("敌对")).toBeInTheDocument();
    expect(within(firstPairButton).getByText("进行方向复核")).toBeInTheDocument();
    expect(screen.getByText("生效区间待复核")).toBeInTheDocument();
    expect(screen.getByText("2 / 3 条有效关系")).toBeInTheDocument();
  });

  it("highlights the selected pair row and notifies when another pair is chosen", () => {
    const onSelectPair = vi.fn();

    render(
      <RelationPairList
        pairSummaries={pairSummaries}
        relationTypeOptions={relationTypeOptions}
        selectedPairKey="persona-1::persona-2"
        onSelectPair={onSelectPair}
      />
    );

    const selectedPairButton = screen.getByRole("button", { name: /范进.*周进/ });
    const nextPairButton = screen.getByRole("button", { name: /周进.*梅玖/ });

    expect(selectedPairButton).toHaveAttribute("aria-pressed", "true");
    expect(nextPairButton).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(nextPairButton);
    expect(onSelectPair).toHaveBeenCalledWith("persona-2::persona-3");
  });

  it("shows an empty state when no relation pairs match", () => {
    render(
      <RelationPairList
        pairSummaries={[]}
        relationTypeOptions={relationTypeOptions}
        selectedPairKey={null}
        onSelectPair={vi.fn()}
      />
    );

    expect(screen.getByText("当前筛选下暂无人物关系")).toBeInTheDocument();
  });

  it("applies bg-primary/5 highlighting to pairs touching highlightedPersonaId", () => {
    render(
      <RelationPairList
        pairSummaries={pairSummaries}
        relationTypeOptions={relationTypeOptions}
        selectedPairKey={null}
        onSelectPair={vi.fn()}
        highlightedPersonaId="persona-1"
      />
    );

    const firstPairButton = screen.getByRole("button", { name: /范进.*周进/ });
    const secondPairButton = screen.getByRole("button", { name: /周进.*梅玖/ });

    expect(firstPairButton).toHaveClass("bg-primary/5");
    expect(secondPairButton).not.toHaveClass("bg-primary/5");
  });

  it("does not highlight when highlightedPersonaId is null", () => {
    render(
      <RelationPairList
        pairSummaries={pairSummaries}
        relationTypeOptions={relationTypeOptions}
        selectedPairKey={null}
        onSelectPair={vi.fn()}
        highlightedPersonaId={null}
      />
    );

    const firstPairButton = screen.getByRole("button", { name: /范进.*周进/ });
    expect(firstPairButton).not.toHaveClass("bg-primary/5");
  });
});

describe("RelationEditorToolbar", () => {
  it("calls back with persona, relation, review-state, and conflict-state changes", () => {
    const onFiltersChange = vi.fn();
    const onReset = vi.fn();

    render(
      <RelationEditorToolbar
        filters={defaultFilters}
        personaOptions={personaOptions}
        relationTypeOptions={relationTypeOptions}
        pairCount={pairSummaries.length}
        isLoading={false}
        onFiltersChange={onFiltersChange}
        onReset={onReset}
      />
    );

    fireEvent.click(screen.getByRole("combobox", { name: "人物筛选" }));
    fireEvent.click(screen.getByRole("option", { name: "范进" }));
    expect(onFiltersChange).toHaveBeenCalledWith({
      ...defaultFilters,
      personaId: "persona-1"
    });

    fireEvent.click(screen.getByRole("combobox", { name: "关系类型" }));
    fireEvent.click(screen.getByRole("option", { name: "敌对" }));
    expect(onFiltersChange).toHaveBeenCalledWith({
      ...defaultFilters,
      relationTypeKey: "enemy_of"
    });

    fireEvent.click(screen.getByRole("combobox", { name: "审核状态" }));
    fireEvent.click(screen.getByRole("option", { name: "待审核" }));
    expect(onFiltersChange).toHaveBeenCalledWith({
      ...defaultFilters,
      reviewState: "PENDING"
    });

    fireEvent.click(screen.getByRole("combobox", { name: "冲突状态" }));
    fireEvent.click(screen.getByRole("option", { name: "仅看冲突" }));
    expect(onFiltersChange).toHaveBeenCalledWith({
      ...defaultFilters,
      conflictState: "ACTIVE"
    });

    fireEvent.click(screen.getByRole("button", { name: "重置筛选" }));
    expect(onReset).toHaveBeenCalledOnce();
  });
});
