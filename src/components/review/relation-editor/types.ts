import type {
  ClaimReviewState,
  ConflictState,
  ReviewRelationTypeOptionDto
} from "@/lib/services/relation-editor";

export type ReviewStateFilterValue = ClaimReviewState | "";
export type ConflictStateFilterValue = ConflictState | "";

export interface RelationEditorFilters {
  personaId      : string;
  relationTypeKey: string;
  reviewState    : ReviewStateFilterValue;
  conflictState  : ConflictStateFilterValue;
}

export const EMPTY_RELATION_EDITOR_FILTERS: RelationEditorFilters = {
  personaId      : "",
  relationTypeKey: "",
  reviewState    : "",
  conflictState  : ""
};

export const REVIEW_STATE_FILTER_OPTIONS: Array<{
  value: ReviewStateFilterValue;
  label: string;
}> = [
  { value: "", label: "全部状态" },
  { value: "PENDING", label: "待审核" },
  { value: "CONFLICTED", label: "冲突待判" },
  { value: "EDITED", label: "已编辑" },
  { value: "ACCEPTED", label: "已接受" },
  { value: "DEFERRED", label: "已暂缓" },
  { value: "REJECTED", label: "已拒绝" }
];

export const CONFLICT_STATE_FILTER_OPTIONS: Array<{
  value: ConflictStateFilterValue;
  label: string;
}> = [
  { value: "", label: "全部冲突" },
  { value: "ACTIVE", label: "仅看冲突" },
  { value: "NONE", label: "无冲突" }
];

export function getRelationTypeLabel(
  relationTypeOptions: readonly ReviewRelationTypeOptionDto[],
  relationTypeKey: string,
  fallbackLabel?: string
): string {
  const matched = relationTypeOptions.find((option) => (
    option.relationTypeKey === relationTypeKey
  ));

  return matched?.label ?? fallbackLabel ?? relationTypeKey;
}
