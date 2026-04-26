import { type VisiblePersonaTimeMatrix } from "./view-helpers";

export function filterTimeMatrixByPersonaId(
  matrix   : VisiblePersonaTimeMatrix,
  personaId: string | null
): VisiblePersonaTimeMatrix {
  if (personaId === null) return matrix;
  return {
    personas  : matrix.personas.filter((p) => p.personaId === personaId),
    timeGroups: matrix.timeGroups,
    cells     : matrix.cells.filter((c) => c.personaId === personaId)
  };
}
