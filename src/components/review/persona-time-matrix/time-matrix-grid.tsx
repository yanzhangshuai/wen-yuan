import { Fragment } from "react";

import type {
  PersonaTimeAxisGroupDto,
  PersonaTimeMatrixCellDto,
  PersonaTimeMatrixPersonaDto
} from "@/lib/services/review-time-matrix";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { TimeMatrixCell } from "./time-matrix-cell";
import type { PersonaTimeSelection, ReviewTimeAxisGroupState } from "./types";

export interface TimeMatrixGridProps {
  personas            : PersonaTimeMatrixPersonaDto[];
  timeGroups          : PersonaTimeAxisGroupDto[];
  cells               : PersonaTimeMatrixCellDto[];
  selectedCell        : PersonaTimeSelection | null;
  expandedGroups      : ReviewTimeAxisGroupState;
  highlightedPersonaId?: string | null;
  onSelectCell        : (selection: PersonaTimeSelection) => void;
  onToggleGroup       : (timeType: PersonaTimeAxisGroupDto["timeType"]) => void;
  className?          : string;
}

function toCellKey(personaId: string, timeKey: string): string {
  return `${personaId}::${timeKey}`;
}

function buildCellMap(
  cells: readonly PersonaTimeMatrixCellDto[]
): Map<string, PersonaTimeMatrixCellDto> {
  return new Map(cells.map((cell) => [toCellKey(cell.personaId, cell.timeKey), cell]));
}

/**
 * 时间矩阵保持单表头布局，避免按分组拆成多张 table 造成列头重复，
 * 这样 reviewer 的列扫描和测试中的 columnheader 查询都保持稳定。
 */
export function TimeMatrixGrid({
  personas,
  timeGroups,
  cells,
  selectedCell,
  expandedGroups,
  highlightedPersonaId = null,
  onSelectCell,
  onToggleGroup,
  className
}: TimeMatrixGridProps) {
  const cellMap = buildCellMap(cells);

  return (
    <div className={cn("time-matrix-grid overflow-auto rounded-xl border bg-background", className)}>
      <table className="min-w-full border-separate border-spacing-2">
        <thead className="sticky top-0 z-10 bg-background">
          <tr>
            <th
              scope="col"
              className="min-w-60 rounded-lg bg-muted/40 p-3 text-left text-sm font-semibold text-foreground"
            >
              时间片
            </th>
            {personas.map((persona) => {
              const isHighlighted = highlightedPersonaId === persona.personaId;

              return (
                <th
                  key={persona.personaId}
                  scope="col"
                  data-highlighted={isHighlighted ? "true" : undefined}
                  className={cn(
                    "min-w-52 rounded-lg bg-muted/40 p-3 text-left align-top",
                    isHighlighted && "bg-primary/10"
                  )}
                >
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">{persona.displayName}</p>
                    <p className="text-xs text-muted-foreground">
                      事迹 {persona.totalEventCount} · 关系 {persona.totalRelationCount} · 时间 {persona.totalTimeClaimCount}
                    </p>
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {timeGroups.map((group) => {
            const isExpanded = expandedGroups[group.timeType];

            return (
              <Fragment key={group.timeType}>
                <tr className="time-matrix-group-row">
                  <th
                    colSpan={personas.length + 1}
                    className="rounded-lg bg-muted/30 px-3 py-2 text-left"
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-auto px-0 text-sm font-medium"
                      aria-expanded={isExpanded}
                      onClick={() => onToggleGroup(group.timeType)}
                    >
                      {isExpanded ? "收起" : "展开"}
                      <span className="ml-2">{group.label}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {group.slices.length} 个时间片
                      </span>
                    </Button>
                  </th>
                </tr>

                {isExpanded ? group.slices.map((slice) => (
                  <tr key={slice.timeKey} className="time-matrix-slice-row align-top">
                    <th
                      scope="row"
                      className="rounded-lg border bg-card p-3 text-left align-top"
                    >
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground">{slice.normalizedLabel}</p>
                        {slice.rawLabels.length > 0 ? (
                          <p className="text-xs text-muted-foreground">
                            原文：{slice.rawLabels.join(" / ")}
                          </p>
                        ) : null}
                      </div>
                    </th>

                    {personas.map((persona) => {
                      const cell = cellMap.get(toCellKey(persona.personaId, slice.timeKey)) ?? null;
                      const isSelected = selectedCell?.personaId === persona.personaId
                        && selectedCell.timeKey === slice.timeKey;
                      const isCellInHighlightedColumn = highlightedPersonaId === persona.personaId;

                      return (
                        <td
                          key={`${persona.personaId}-${slice.timeKey}`}
                          className={cn(
                            "align-top",
                            isCellInHighlightedColumn && "border-x border-primary/30"
                          )}
                        >
                          <TimeMatrixCell
                            persona={persona}
                            slice={slice}
                            cell={cell}
                            isSelected={isSelected}
                            onSelectCell={onSelectCell}
                          />
                        </td>
                      );
                    })}
                  </tr>
                )) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
