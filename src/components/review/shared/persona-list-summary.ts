import {
  type PersonaChapterMatrixDto,
  type PersonaChapterMatrixPersona
} from "@/lib/services/review-matrix";

export interface PersonaListItem {
  personaId          : string;
  displayName        : string;
  aliases            : string[];
  firstChapterNo     : number | null;
  totalEventCount    : number;
  totalRelationCount : number;
  totalConflictCount : number;
  pendingClaimCount  : number;
  personaCandidateIds: string[];
}

export function buildPersonaListItems(matrix: PersonaChapterMatrixDto): PersonaListItem[] {
  const pendingByPersona = new Map<string, number>();
  for (const cell of matrix.cells) {
    const summary = cell.reviewStateSummary;
    const pending = (summary.PENDING?.NONE ?? 0)
      + (summary.PENDING?.CONFLICTED ?? 0)
      + (summary.ACCEPTED?.CONFLICTED ?? 0);
    pendingByPersona.set(
      cell.personaId,
      (pendingByPersona.get(cell.personaId) ?? 0) + pending
    );
  }

  return matrix.personas.map((p: PersonaChapterMatrixPersona): PersonaListItem => ({
    personaId          : p.personaId,
    displayName        : p.displayName,
    aliases            : p.aliases ?? [],
    firstChapterNo     : p.firstChapterNo ?? null,
    totalEventCount    : p.totalEventCount,
    totalRelationCount : p.totalRelationCount,
    totalConflictCount : p.totalConflictCount,
    pendingClaimCount  : pendingByPersona.get(p.personaId) ?? 0,
    personaCandidateIds: p.personaCandidateIds ?? []
  }));
}

export type PersonaSortKey = "first-chapter" | "pending-desc" | "event-desc";
export type PersonaStatusFilter = "pending" | "conflict" | "done";

export function sortPersonaListItems(
  items: PersonaListItem[],
  by   : PersonaSortKey
): PersonaListItem[] {
  const arr = [...items];
  if (by === "first-chapter") {
    arr.sort((a, b) => {
      const av = a.firstChapterNo ?? Number.POSITIVE_INFINITY;
      const bv = b.firstChapterNo ?? Number.POSITIVE_INFINITY;
      return av - bv;
    });
  } else if (by === "pending-desc") {
    arr.sort((a, b) => b.pendingClaimCount - a.pendingClaimCount);
  } else if (by === "event-desc") {
    arr.sort((a, b) => b.totalEventCount - a.totalEventCount);
  }
  return arr;
}

export function filterPersonaListItems(
  items        : PersonaListItem[],
  keyword      : string,
  statusFilters: PersonaStatusFilter[]
): PersonaListItem[] {
  const kw = keyword.trim().toLowerCase();
  return items.filter((item) => {
    if (kw) {
      const hay = [item.displayName, ...item.aliases].join(" ").toLowerCase();
      if (!hay.includes(kw)) return false;
    }
    if (statusFilters.length === 0) return true;
    const isPending  = item.pendingClaimCount > 0;
    const isConflict = item.totalConflictCount > 0;
    const isDone     = !isPending && !isConflict;
    return statusFilters.some((f) => {
      if (f === "pending")  return isPending;
      if (f === "conflict") return isConflict;
      if (f === "done")     return isDone;
      return false;
    });
  });
}

export function findNextPendingPersonaId(
  items    : PersonaListItem[],
  currentId: string | null
): string | null {
  const candidates = items
    .filter((i) => i.personaId !== currentId && i.pendingClaimCount > 0)
    .sort((a, b) => {
      if (b.pendingClaimCount !== a.pendingClaimCount) {
        return b.pendingClaimCount - a.pendingClaimCount;
      }
      const av = a.firstChapterNo ?? Number.POSITIVE_INFINITY;
      const bv = b.firstChapterNo ?? Number.POSITIVE_INFINITY;
      return av - bv;
    });
  return candidates[0]?.personaId ?? null;
}

export interface PersonaProgress {
  total   : number;
  reviewed: number;
  ratio   : number;
}

export function computePersonaProgress(items: PersonaListItem[]): PersonaProgress {
  let total   = 0;
  let pending = 0;
  for (const it of items) {
    total   += it.totalEventCount + it.totalRelationCount;
    pending += it.pendingClaimCount;
  }
  if (total === 0) return { total: 0, reviewed: 0, ratio: 1 };
  const reviewed = total - pending;
  return { total, reviewed, ratio: reviewed / total };
}
