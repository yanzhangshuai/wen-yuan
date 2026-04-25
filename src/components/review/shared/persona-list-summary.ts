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
