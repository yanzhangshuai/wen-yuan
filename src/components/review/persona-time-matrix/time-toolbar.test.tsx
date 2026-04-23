/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type {
  PersonaTimeAxisGroupDto,
  PersonaTimeMatrixPersonaDto
} from "@/lib/services/review-time-matrix";

import type { PersonaTimeFilters } from "./types";
import { TimeToolbar } from "./time-toolbar";

const personas: PersonaTimeMatrixPersonaDto[] = [
  {
    personaId                : "persona-1",
    displayName              : "诸葛亮",
    aliases                  : ["孔明"],
    primaryPersonaCandidateId: "candidate-1",
    personaCandidateIds      : ["candidate-1"],
    firstTimeSortKey         : 10,
    totalEventCount          : 3,
    totalRelationCount       : 1,
    totalTimeClaimCount      : 2
  },
  {
    personaId                : "persona-2",
    displayName              : "周瑜",
    aliases                  : ["公瑾"],
    primaryPersonaCandidateId: "candidate-2",
    personaCandidateIds      : ["candidate-2"],
    firstTimeSortKey         : 12,
    totalEventCount          : 1,
    totalRelationCount       : 1,
    totalTimeClaimCount      : 1
  }
];

const timeGroups: PersonaTimeAxisGroupDto[] = [
  {
    timeType        : "CHAPTER_ORDER",
    label           : "章节顺序",
    defaultCollapsed: false,
    slices          : []
  },
  {
    timeType        : "NAMED_EVENT",
    label           : "事件节点",
    defaultCollapsed: true,
    slices          : [{
      timeKey           : "event-1",
      timeType          : "NAMED_EVENT",
      normalizedLabel   : "赤壁之战前",
      rawLabels         : ["赤壁之战以前"],
      timeSortKey       : 20,
      chapterRangeStart : 42,
      chapterRangeEnd   : 43,
      linkedChapters    : [],
      sourceTimeClaimIds: ["time-claim-2"]
    }]
  },
  {
    timeType        : "UNCERTAIN",
    label           : "未定时间",
    defaultCollapsed: true,
    slices          : [{
      timeKey           : "uncertain-1",
      timeType          : "UNCERTAIN",
      normalizedLabel   : "约在建安年间",
      rawLabels         : ["约在建安年间"],
      timeSortKey       : 99,
      chapterRangeStart : null,
      chapterRangeEnd   : null,
      linkedChapters    : [],
      sourceTimeClaimIds: ["time-claim-4"]
    }]
  }
];

const defaultFilters: PersonaTimeFilters = {
  personaId   : "",
  timeTypes   : ["UNCERTAIN"],
  labelKeyword: ""
};

/**
 * 文件定位（人物 x 时间工具栏单测）：
 * - 锁定 reviewer-facing 过滤与跳转交互，避免 Task 5 页面把工具栏状态散落成多处回调；
 * - 这里只验证受控组件契约，不提前覆盖矩阵渲染与 URL 同步。
 */
describe("TimeToolbar", () => {
  it("updates persona filter, time-type multi-select, label search, jump, and reset callbacks", () => {
    const onFiltersChange = vi.fn();
    const onJumpNext = vi.fn();
    const onReset = vi.fn();

    render(
      <TimeToolbar
        filters={defaultFilters}
        personas={personas}
        timeGroups={timeGroups}
        canJumpNext
        isLoading={false}
        onFiltersChange={onFiltersChange}
        onJumpNext={onJumpNext}
        onReset={onReset}
      />
    );

    fireEvent.click(screen.getByRole("combobox", { name: "人物筛选" }));
    fireEvent.click(screen.getByRole("option", { name: "周瑜" }));
    expect(onFiltersChange).toHaveBeenCalledWith({
      ...defaultFilters,
      personaId: "persona-2"
    });

    fireEvent.click(screen.getByRole("checkbox", { name: "事件节点" }));
    expect(onFiltersChange).toHaveBeenCalledWith({
      ...defaultFilters,
      timeTypes: ["NAMED_EVENT", "UNCERTAIN"]
    });

    fireEvent.change(screen.getByRole("textbox", { name: "时间标签搜索" }), {
      target: { value: "赤壁" }
    });
    expect(onFiltersChange).toHaveBeenCalledWith({
      ...defaultFilters,
      labelKeyword: "赤壁"
    });

    fireEvent.click(screen.getByRole("button", { name: "下一个时间片" }));
    expect(onJumpNext).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "重置筛选" }));
    expect(onReset).toHaveBeenCalledOnce();
  });

  it("disables the jump control when no later slice is available", () => {
    render(
      <TimeToolbar
        filters={defaultFilters}
        personas={personas}
        timeGroups={timeGroups}
        canJumpNext={false}
        isLoading={false}
        onFiltersChange={vi.fn()}
        onJumpNext={vi.fn()}
        onReset={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "下一个时间片" })).toBeDisabled();
  });
});
