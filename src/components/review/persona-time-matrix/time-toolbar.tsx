"use client";

import type {
  PersonaTimeAxisGroupDto,
  PersonaTimeMatrixPersonaDto,
  ReviewTimeAxisType
} from "@/lib/services/review-time-matrix";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
import { cn } from "@/lib/utils";

import { TIME_AXIS_TYPE_VALUES, type PersonaTimeFilters } from "./types";

interface TimeToolbarProps {
  filters        : PersonaTimeFilters;
  personas       : PersonaTimeMatrixPersonaDto[];
  timeGroups     : PersonaTimeAxisGroupDto[];
  canJumpNext    : boolean;
  isLoading      : boolean;
  onFiltersChange: (filters: PersonaTimeFilters) => void;
  onJumpNext     : () => void;
  onReset        : () => void;
  className    ? : string;
}

function toSelectValue(value: string): string {
  return value.length > 0 ? value : SELECT_EMPTY_VALUE;
}

function fromSelectValue(value: string): string {
  return isSelectEmptyValue(value) ? "" : value;
}

function toggleTimeType(
  selectedTimeTypes: readonly ReviewTimeAxisType[],
  timeType: ReviewTimeAxisType
): ReviewTimeAxisType[] {
  const nextSelected = new Set(selectedTimeTypes);
  if (nextSelected.has(timeType)) {
    nextSelected.delete(timeType);
  } else {
    nextSelected.add(timeType);
  }

  return TIME_AXIS_TYPE_VALUES.filter((value) => nextSelected.has(value));
}

/**
 * 人物 x 时间工具栏保持完全受控：
 * - 页面层统一持有筛选状态，便于后续和 URL query / 矩阵刷新共享同一份来源；
 * - 本组件只组织 reviewer-facing 输入控件，不偷偷保存额外副本状态。
 */
export function TimeToolbar({
  filters,
  personas,
  timeGroups,
  canJumpNext,
  isLoading,
  onFiltersChange,
  onJumpNext,
  onReset,
  className
}: TimeToolbarProps) {
  return (
    <div className={cn("time-matrix-toolbar rounded-xl border bg-background p-4", className)}>
      <div className="grid gap-3 xl:grid-cols-[minmax(12rem,1.1fr)_minmax(18rem,1.6fr)_minmax(14rem,1.2fr)_auto_auto]">
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
              {personas.map((persona) => (
                <SelectItem key={persona.personaId} value={persona.personaId}>
                  {persona.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <fieldset className="flex flex-col gap-1">
          <legend className="text-xs font-medium text-muted-foreground">时间类型</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2 rounded-md border border-dashed p-3">
            {timeGroups.map((group) => (
              <label
                key={group.timeType}
                className="flex items-center gap-2 text-sm text-foreground"
              >
                <Checkbox
                  aria-label={group.label}
                  checked={filters.timeTypes.includes(group.timeType)}
                  disabled={isLoading || group.slices.length === 0}
                  onCheckedChange={() => {
                    onFiltersChange({
                      ...filters,
                      timeTypes: toggleTimeType(filters.timeTypes, group.timeType)
                    });
                  }}
                />
                <span>{group.label}</span>
                <span className="text-xs text-muted-foreground">{group.slices.length}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          时间标签搜索
          <Input
            aria-label="时间标签搜索"
            value={filters.labelKeyword}
            disabled={isLoading}
            onChange={(event) => {
              onFiltersChange({
                ...filters,
                labelKeyword: event.target.value
              });
            }}
            placeholder="搜索归一化标签或原文时间"
          />
        </label>

        <div className="flex items-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isLoading || !canJumpNext}
            onClick={onJumpNext}
          >
            下一个时间片
          </Button>
        </div>

        <div className="flex items-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isLoading}
            onClick={onReset}
          >
            重置筛选
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span>{personas.length} 名人物</span>
        <span>{timeGroups.length} 类时间轴</span>
        <span>{timeGroups.reduce((count, group) => count + group.slices.length, 0)} 个时间片</span>
      </div>
    </div>
  );
}
