import type {
  FetchPersonaTimeMatrixInput,
  PersonaTimeAxisGroupDto,
  PersonaTimeMatrixDto,
  PersonaTimeMatrixPersonaDto
} from "@/lib/services/review-time-matrix";

import {
  buildExpandedTimeGroupState,
  filterTimeGroupsByLabel,
  resolveInitialTimeSelection
} from "./time-axis";
import type {
  PersonaTimeFilters,
  PersonaTimeSelection,
  ReviewTimeAxisGroupState
} from "./types";

export interface VisiblePersonaTimeMatrix {
  personas  : PersonaTimeMatrixPersonaDto[];
  timeGroups: PersonaTimeAxisGroupDto[];
  cells     : PersonaTimeMatrixDto["cells"];
}

export interface PersonaTimeInitialViewState {
  filters       : PersonaTimeFilters;
  selectedCell  : PersonaTimeSelection | null;
  expandedGroups: ReviewTimeAxisGroupState;
}

export function buildInitialFilters(matrix: PersonaTimeMatrixDto): PersonaTimeFilters {
  return {
    personaId: "",
    timeTypes: matrix.timeGroups
      .filter((group) => group.slices.length > 0)
      .map((group) => group.timeType),
    labelKeyword: ""
  };
}

/**
 * 首屏与 reset 都应复用同一套初始化规则，避免过滤器、默认选中项、
 * 默认展开组在不同入口上各自漂移。
 */
export function buildInitialViewState(
  matrix: PersonaTimeMatrixDto,
  requestedSelection?: PersonaTimeSelection | null
): PersonaTimeInitialViewState {
  const filters = buildInitialFilters(matrix);
  const selectedCell = resolveInitialTimeSelection({
    personas          : matrix.personas,
    timeGroups        : matrix.timeGroups,
    requestedPersonaId: requestedSelection?.personaId,
    requestedTimeKey  : requestedSelection?.timeKey
  });

  return {
    filters,
    selectedCell,
    expandedGroups: buildExpandedTimeGroupState({
      timeGroups     : matrix.timeGroups,
      selectedTimeKey: selectedCell?.timeKey ?? null
    })
  };
}

export function applyLocalFilters(
  matrix: PersonaTimeMatrixDto,
  filters: PersonaTimeFilters
): VisiblePersonaTimeMatrix {
  const personas = filters.personaId.length > 0
    ? matrix.personas.filter((persona) => persona.personaId === filters.personaId)
    : matrix.personas;
  const selectedTimeGroups = matrix.timeGroups.filter((group) => (
    filters.timeTypes.includes(group.timeType)
  ));
  const labelFilteredGroups = filterTimeGroupsByLabel(selectedTimeGroups, filters.labelKeyword);
  const visibleTimeKeys = new Set(
    labelFilteredGroups.flatMap((group) => group.slices.map((slice) => slice.timeKey))
  );
  const visiblePersonaIds = new Set(personas.map((persona) => persona.personaId));

  return {
    personas,
    timeGroups: labelFilteredGroups,
    cells     : matrix.cells.filter((cell) => (
      visiblePersonaIds.has(cell.personaId) && visibleTimeKeys.has(cell.timeKey)
    ))
  };
}

export function selectionExists(
  visibleMatrix: VisiblePersonaTimeMatrix,
  selection: PersonaTimeSelection | null
): boolean {
  if (selection === null) {
    return false;
  }

  const hasPersona = visibleMatrix.personas.some((persona) => persona.personaId === selection.personaId);
  const hasTimeKey = visibleMatrix.timeGroups.some((group) => (
    group.slices.some((slice) => slice.timeKey === selection.timeKey)
  ));

  return hasPersona && hasTimeKey;
}

export function toLoadErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "矩阵加载失败，请稍后重试。";
}

export function buildRefreshQuery(
  bookId: string,
  filters: PersonaTimeFilters
): FetchPersonaTimeMatrixInput {
  return {
    bookId,
    ...(filters.personaId ? { personaId: filters.personaId } : {}),
    ...(filters.timeTypes.length > 0 ? { timeTypes: filters.timeTypes } : {})
  };
}

export function countVisibleSlices(timeGroups: readonly PersonaTimeAxisGroupDto[]): number {
  return timeGroups.reduce((count, group) => count + group.slices.length, 0);
}

export function resolveJumpPersonaId(
  visibleMatrix: VisiblePersonaTimeMatrix,
  filters: PersonaTimeFilters,
  selectedCell: PersonaTimeSelection | null
): string | null {
  if (filters.personaId.length > 0) {
    return filters.personaId;
  }

  if (
    selectedCell !== null
    && visibleMatrix.personas.some((persona) => persona.personaId === selectedCell.personaId)
  ) {
    return selectedCell.personaId;
  }

  return visibleMatrix.personas[0]?.personaId ?? null;
}

export function findGroupByTimeKey(
  timeGroups: readonly PersonaTimeAxisGroupDto[],
  timeKey: string
): PersonaTimeAxisGroupDto | null {
  return timeGroups.find((group) => group.slices.some((slice) => slice.timeKey === timeKey)) ?? null;
}
