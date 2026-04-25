import { type PersonaChapterMatrixDto } from "@/lib/services/review-matrix";

export function filterMatrixByPersonaId(
  matrix   : PersonaChapterMatrixDto,
  personaId: string | null
): PersonaChapterMatrixDto {
  if (personaId === null) return matrix;
  return {
    ...matrix,
    personas: matrix.personas.filter((p) => p.personaId === personaId),
    cells   : matrix.cells.filter((c) => c.personaId === personaId)
  };
}
