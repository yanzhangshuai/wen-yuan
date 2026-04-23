import type {
  PersonaTimeAxisGroupDto,
  PersonaTimeMatrixPersonaDto,
  PersonaTimeSliceDto
} from "@/lib/services/review-time-matrix";

import {
  TIME_AXIS_TYPE_VALUES,
  type PersonaTimeSelection,
  type ReviewTimeAxisGroupState
} from "./types";

interface ResolveInitialTimeSelectionInput {
  personas           : PersonaTimeMatrixPersonaDto[];
  timeGroups         : PersonaTimeAxisGroupDto[];
  requestedPersonaId?: string | null;
  requestedTimeKey?  : string | null;
}

interface BuildExpandedTimeGroupStateInput {
  timeGroups      : PersonaTimeAxisGroupDto[];
  selectedTimeKey?: string | null;
}

interface FindNextTimeSliceKeyInput {
  timeGroups      : PersonaTimeAxisGroupDto[];
  selectedTimeKey?: string | null;
}

function listAllSlices(timeGroups: readonly PersonaTimeAxisGroupDto[]): PersonaTimeSliceDto[] {
  return timeGroups.flatMap((group) => group.slices);
}

function createCollapsedState(): ReviewTimeAxisGroupState {
  return {
    CHAPTER_ORDER  : false,
    RELATIVE_PHASE : false,
    NAMED_EVENT    : false,
    HISTORICAL_YEAR: false,
    BATTLE_PHASE   : false,
    UNCERTAIN      : false
  };
}

function findGroupBySliceKey(
  timeGroups: readonly PersonaTimeAxisGroupDto[],
  timeKey?: string | null
): PersonaTimeAxisGroupDto | null {
  if (!timeKey) {
    return null;
  }

  return timeGroups.find((group) => group.slices.some((slice) => slice.timeKey === timeKey)) ?? null;
}

function normalizeLabelKeyword(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function matchesSliceLabel(slice: PersonaTimeSliceDto, labelKeyword: string): boolean {
  const normalizedLabel = slice.normalizedLabel.toLocaleLowerCase();
  if (normalizedLabel.includes(labelKeyword)) {
    return true;
  }

  return slice.rawLabels.some((label) => label.toLocaleLowerCase().includes(labelKeyword));
}

export function resolveInitialTimeSelection({
  personas,
  timeGroups,
  requestedPersonaId,
  requestedTimeKey
}: ResolveInitialTimeSelectionInput): PersonaTimeSelection | null {
  const resolvedPersonaId = personas.find((persona) => persona.personaId === requestedPersonaId)?.personaId
    ?? personas[0]?.personaId
    ?? null;

  const allSlices = listAllSlices(timeGroups);
  const resolvedTimeKey = allSlices.find((slice) => slice.timeKey === requestedTimeKey)?.timeKey
    ?? allSlices[0]?.timeKey
    ?? null;

  if (!resolvedPersonaId || !resolvedTimeKey) {
    return null;
  }

  return {
    personaId: resolvedPersonaId,
    timeKey  : resolvedTimeKey
  };
}

export function buildExpandedTimeGroupState({
  timeGroups,
  selectedTimeKey
}: BuildExpandedTimeGroupStateInput): ReviewTimeAxisGroupState {
  const expandedState = createCollapsedState();

  for (const timeType of TIME_AXIS_TYPE_VALUES) {
    const group = timeGroups.find((item) => item.timeType === timeType);
    expandedState[timeType] = group ? !group.defaultCollapsed : false;
  }

  // 深链选中的时间片必须可见，否则刷新后 reviewer 会落到“选中了但找不到”的状态。
  const selectedGroup = findGroupBySliceKey(timeGroups, selectedTimeKey);
  if (selectedGroup) {
    expandedState[selectedGroup.timeType] = true;
  }

  return expandedState;
}

export function filterTimeGroupsByLabel(
  timeGroups: readonly PersonaTimeAxisGroupDto[],
  labelKeyword: string
): PersonaTimeAxisGroupDto[] {
  const normalizedKeyword = normalizeLabelKeyword(labelKeyword);
  if (normalizedKeyword.length === 0) {
    return [...timeGroups];
  }

  return timeGroups.flatMap((group) => {
    const matchedSlices = group.slices.filter((slice) => matchesSliceLabel(slice, normalizedKeyword));
    if (matchedSlices.length === 0) {
      return [];
    }

    return [{
      ...group,
      slices: matchedSlices
    }];
  });
}

export function findNextTimeSliceKey({
  timeGroups,
  selectedTimeKey
}: FindNextTimeSliceKeyInput): string | null {
  const orderedSlices = listAllSlices(timeGroups);
  if (orderedSlices.length === 0) {
    return null;
  }

  if (!selectedTimeKey) {
    return orderedSlices[0]?.timeKey ?? null;
  }

  const selectedIndex = orderedSlices.findIndex((slice) => slice.timeKey === selectedTimeKey);
  if (selectedIndex < 0) {
    return orderedSlices[0]?.timeKey ?? null;
  }

  return orderedSlices[selectedIndex + 1]?.timeKey ?? null;
}
