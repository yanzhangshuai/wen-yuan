import type {
  PersonaTimeMatrixCellDto,
  PersonaTimeMatrixPersonaDto,
  PersonaTimeSliceDto
} from "@/lib/services/review-time-matrix";
import { cn } from "@/lib/utils";

import type { PersonaTimeSelection } from "./types";

export interface TimeMatrixCellProps {
  persona     : PersonaTimeMatrixPersonaDto;
  slice       : PersonaTimeSliceDto;
  cell        : PersonaTimeMatrixCellDto | null;
  isSelected  : boolean;
  onSelectCell: (selection: PersonaTimeSelection) => void;
}

/**
 * 时间矩阵单元格只展示 reviewer 首屏所需的摘要计数。
 * 详细证据与 claim 操作会在 Task 6 的钻取抽屉中承接，这里先保持 summary-only。
 */
export function TimeMatrixCell({
  persona,
  slice,
  cell,
  isSelected,
  onSelectCell
}: TimeMatrixCellProps) {
  const eventCount = cell?.eventCount ?? 0;
  const relationCount = cell?.relationCount ?? 0;
  const timeClaimCount = cell?.timeClaimCount ?? 0;
  const hasFacts = eventCount > 0 || relationCount > 0 || timeClaimCount > 0;

  return (
    <button
      type="button"
      className={cn(
        "time-matrix-cell flex min-h-24 w-full flex-col rounded-xl border p-3 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
        hasFacts ? "bg-card shadow-sm" : "border-dashed bg-muted/20",
        isSelected ? "ring-2 ring-primary/60" : null
      )}
      aria-label={`${slice.normalizedLabel} · ${persona.displayName}`}
      aria-pressed={isSelected}
      onClick={() => {
        onSelectCell({
          personaId: persona.personaId,
          timeKey  : slice.timeKey
        });
      }}
    >
      <div className="grid flex-1 grid-cols-3 gap-2 text-xs text-muted-foreground">
        <div className="rounded-md bg-muted/40 px-2 py-2">
          <p className="font-medium text-foreground">{eventCount}</p>
          <p>事迹</p>
        </div>
        <div className="rounded-md bg-muted/40 px-2 py-2">
          <p className="font-medium text-foreground">{relationCount}</p>
          <p>关系</p>
        </div>
        <div className="rounded-md bg-muted/40 px-2 py-2">
          <p className="font-medium text-foreground">{timeClaimCount}</p>
          <p>时间</p>
        </div>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        {hasFacts ? "摘要已生成" : "待补录"}
      </p>
    </button>
  );
}
