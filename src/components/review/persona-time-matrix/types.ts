import type { ReviewTimeAxisType } from "@/lib/services/review-time-matrix";

export const TIME_AXIS_TYPE_VALUES = [
  "CHAPTER_ORDER",
  "RELATIVE_PHASE",
  "NAMED_EVENT",
  "HISTORICAL_YEAR",
  "BATTLE_PHASE",
  "UNCERTAIN"
] as const satisfies readonly ReviewTimeAxisType[];

export const TIME_AXIS_TYPE_LABELS: Record<ReviewTimeAxisType, string> = {
  CHAPTER_ORDER  : "章节顺序",
  RELATIVE_PHASE : "相对阶段",
  NAMED_EVENT    : "事件节点",
  HISTORICAL_YEAR: "历史年份",
  BATTLE_PHASE   : "战役阶段",
  UNCERTAIN      : "未定时间"
};

export interface PersonaTimeSelection {
  personaId: string;
  timeKey  : string;
}

export interface PersonaTimeFilters {
  personaId   : string;
  timeTypes   : ReviewTimeAxisType[];
  labelKeyword: string;
}

export type ReviewTimeAxisGroupState = Record<ReviewTimeAxisType, boolean>;
