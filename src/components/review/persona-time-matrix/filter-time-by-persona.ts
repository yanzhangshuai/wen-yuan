import { type PersonaTimeMatrixDto } from "@/lib/services/review-time-matrix";

export function filterTimeMatrixByPersonaId(
  matrix   : PersonaTimeMatrixDto,
  personaId: string | null
): PersonaTimeMatrixDto {
  if (personaId === null) return matrix;
  return {
    ...matrix,
    personas: matrix.personas.filter((p) => p.personaId === personaId),
    cells   : matrix.cells.filter((c) => c.personaId === personaId)
  };
}
