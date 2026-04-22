"use client";

import type {
  ReviewRelationPersonaOptionDto,
  ReviewRelationTypeOptionDto
} from "@/lib/services/relation-editor";
import { cn } from "@/lib/utils";
import {
  isSelectEmptyValue,
  SELECT_EMPTY_VALUE,
  Select,
  SelectContent,
  SelectEmptyItem,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

import {
  CONFLICT_STATE_FILTER_OPTIONS,
  REVIEW_STATE_FILTER_OPTIONS,
  type ConflictStateFilterValue,
  type RelationEditorFilters,
  type ReviewStateFilterValue
} from "./types";

interface RelationEditorToolbarProps {
  filters            : RelationEditorFilters;
  personaOptions     : ReviewRelationPersonaOptionDto[];
  relationTypeOptions: ReviewRelationTypeOptionDto[];
  pairCount          : number;
  isLoading          : boolean;
  onFiltersChange    : (filters: RelationEditorFilters) => void;
  onReset            : () => void;
  className        ? : string;
}

function toSelectValue(value: string): string {
  return value.length > 0 ? value : SELECT_EMPTY_VALUE;
}

function fromSelectValue(value: string): string {
  return isSelectEmptyValue(value) ? "" : value;
}

function toReviewStateFilterValue(value: string): ReviewStateFilterValue {
  const normalized = fromSelectValue(value);
  const matched = REVIEW_STATE_FILTER_OPTIONS.find((option) => option.value === normalized);
  return matched?.value ?? "";
}

function toConflictStateFilterValue(value: string): ConflictStateFilterValue {
  const normalized = fromSelectValue(value);
  const matched = CONFLICT_STATE_FILTER_OPTIONS.find((option) => option.value === normalized);
  return matched?.value ?? "";
}

/**
 * 关系编辑器筛选工具栏。
 * 使用受控 filter 对象，确保页面层能在筛选变化时统一回源刷新 pair list。
 */
export function RelationEditorToolbar({
  filters,
  personaOptions,
  relationTypeOptions,
  pairCount,
  isLoading,
  onFiltersChange,
  onReset,
  className
}: RelationEditorToolbarProps) {
  return (
    <div className={cn("relation-editor-toolbar rounded-xl border bg-background p-4", className)}>
      <div className="grid gap-3 lg:grid-cols-[repeat(4,minmax(10rem,1fr))_auto]">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          人物筛选
          <Select
            value={toSelectValue(filters.personaId)}
            disabled={isLoading}
            onValueChange={(value) => {
              onFiltersChange({
                ...filters,
                personaId: fromSelectValue(value)
              });
            }}
          >
            <SelectTrigger aria-label="人物筛选" className="w-full">
              <SelectValue placeholder="全部人物" />
            </SelectTrigger>
            <SelectContent>
              <SelectEmptyItem>全部人物</SelectEmptyItem>
              {personaOptions.map((persona) => (
                <SelectItem key={persona.personaId} value={persona.personaId}>
                  {persona.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          关系类型
          <Select
            value={toSelectValue(filters.relationTypeKey)}
            disabled={isLoading}
            onValueChange={(value) => {
              onFiltersChange({
                ...filters,
                relationTypeKey: fromSelectValue(value)
              });
            }}
          >
            <SelectTrigger aria-label="关系类型" className="w-full">
              <SelectValue placeholder="全部关系" />
            </SelectTrigger>
            <SelectContent>
              <SelectEmptyItem>全部关系</SelectEmptyItem>
              {relationTypeOptions.map((relationType) => (
                <SelectItem
                  key={relationType.relationTypeKey}
                  value={relationType.relationTypeKey}
                >
                  {relationType.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          审核状态
          <Select
            value={toSelectValue(filters.reviewState)}
            disabled={isLoading}
            onValueChange={(value) => {
              onFiltersChange({
                ...filters,
                reviewState: toReviewStateFilterValue(value)
              });
            }}
          >
            <SelectTrigger aria-label="审核状态" className="w-full">
              <SelectValue placeholder="全部状态" />
            </SelectTrigger>
            <SelectContent>
              {REVIEW_STATE_FILTER_OPTIONS.map((option) => (
                option.value.length === 0 ? (
                  <SelectEmptyItem key="__ALL_REVIEW_STATES__">{option.label}</SelectEmptyItem>
                ) : (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                )
              ))}
            </SelectContent>
          </Select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          冲突状态
          <Select
            value={toSelectValue(filters.conflictState)}
            disabled={isLoading}
            onValueChange={(value) => {
              onFiltersChange({
                ...filters,
                conflictState: toConflictStateFilterValue(value)
              });
            }}
          >
            <SelectTrigger aria-label="冲突状态" className="w-full">
              <SelectValue placeholder="全部冲突" />
            </SelectTrigger>
            <SelectContent>
              {CONFLICT_STATE_FILTER_OPTIONS.map((option) => (
                option.value.length === 0 ? (
                  <SelectEmptyItem key="__ALL_CONFLICT_STATES__">{option.label}</SelectEmptyItem>
                ) : (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                )
              ))}
            </SelectContent>
          </Select>
        </label>

        <div className="flex items-end">
          <button
            type="button"
            disabled={isLoading}
            onClick={onReset}
            className="h-9 rounded-md border px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            重置筛选
          </button>
        </div>
      </div>

      <div className="mt-3 text-xs text-muted-foreground">
        当前筛选命中 {pairCount} 组人物关系
      </div>
    </div>
  );
}
