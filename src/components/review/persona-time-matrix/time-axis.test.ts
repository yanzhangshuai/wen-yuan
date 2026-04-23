import { describe, expect, it } from "vitest";

import type {
  PersonaTimeAxisGroupDto,
  PersonaTimeMatrixPersonaDto
} from "@/lib/services/review-time-matrix";

import {
  buildExpandedTimeGroupState,
  filterTimeGroupsByLabel,
  findNextTimeSliceKey,
  resolveInitialTimeSelection
} from "./time-axis";

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
    slices          : [{
      timeKey           : "chapter-1",
      timeType          : "CHAPTER_ORDER",
      normalizedLabel   : "第十回",
      rawLabels         : ["第十回"],
      timeSortKey       : 10,
      chapterRangeStart : 10,
      chapterRangeEnd   : 10,
      linkedChapters    : [],
      sourceTimeClaimIds: ["time-claim-1"]
    }]
  },
  {
    timeType        : "NAMED_EVENT",
    label           : "事件节点",
    defaultCollapsed: true,
    slices          : [
      {
        timeKey           : "event-1",
        timeType          : "NAMED_EVENT",
        normalizedLabel   : "赤壁之战前",
        rawLabels         : ["赤壁之战以前"],
        timeSortKey       : 20,
        chapterRangeStart : 42,
        chapterRangeEnd   : 43,
        linkedChapters    : [],
        sourceTimeClaimIds: ["time-claim-2"]
      },
      {
        timeKey           : "event-2",
        timeType          : "NAMED_EVENT",
        normalizedLabel   : "赤壁之战后",
        rawLabels         : ["赤壁既罢"],
        timeSortKey       : 21,
        chapterRangeStart : 44,
        chapterRangeEnd   : 45,
        linkedChapters    : [],
        sourceTimeClaimIds: ["time-claim-3"]
      }
    ]
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

/**
 * 文件定位（人物 x 时间轴纯 helper 单测）：
 * - 锁定 URL 选中项、折叠状态、标签搜索和长书跳转的纯函数契约；
 * - 这些断言故意不依赖 React，避免 Task 5 页面把核心时间轴规则散落到组件状态里。
 */
describe("persona time axis helpers", () => {
  it("prefers valid URL selection and falls back to the first persona and slice when missing", () => {
    expect(resolveInitialTimeSelection({
      personas,
      timeGroups,
      requestedPersonaId: "persona-2",
      requestedTimeKey  : "event-2"
    })).toEqual({
      personaId: "persona-2",
      timeKey  : "event-2"
    });

    expect(resolveInitialTimeSelection({
      personas,
      timeGroups,
      requestedPersonaId: "persona-missing",
      requestedTimeKey  : "missing-slice"
    })).toEqual({
      personaId: "persona-1",
      timeKey  : "chapter-1"
    });
  });

  it("forces the selected time group open even when the server default is collapsed", () => {
    expect(buildExpandedTimeGroupState({
      timeGroups,
      selectedTimeKey: "event-1"
    })).toEqual({
      CHAPTER_ORDER  : true,
      RELATIVE_PHASE : false,
      NAMED_EVENT    : true,
      HISTORICAL_YEAR: false,
      BATTLE_PHASE   : false,
      UNCERTAIN      : false
    });
  });

  it("filters slices by label text without disturbing the original time-group order", () => {
    expect(filterTimeGroupsByLabel(timeGroups, "赤壁")).toEqual([
      {
        ...timeGroups[1],
        slices: timeGroups[1].slices
      }
    ]);

    expect(filterTimeGroupsByLabel(timeGroups, "建安")).toEqual([
      {
        ...timeGroups[2],
        slices: timeGroups[2].slices
      }
    ]);
  });

  it("returns the next visible slice key in stable axis order and stops at the end", () => {
    expect(findNextTimeSliceKey({
      timeGroups,
      selectedTimeKey: "event-1"
    })).toBe("event-2");

    expect(findNextTimeSliceKey({
      timeGroups,
      selectedTimeKey: "uncertain-1"
    })).toBeNull();
  });
});
