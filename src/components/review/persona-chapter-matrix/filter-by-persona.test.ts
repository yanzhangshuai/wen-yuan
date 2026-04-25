import { describe, expect, it } from "vitest";
import { filterMatrixByPersonaId } from "./filter-by-persona";
import { type PersonaChapterMatrixDto } from "@/lib/services/review-matrix";

describe("filterMatrixByPersonaId", () => {
  it("personaId=null 时原样返回", () => {
    const m = { personas: [{ personaId: "a" }], cells: [{ personaId: "a" }] } as PersonaChapterMatrixDto;
    expect(filterMatrixByPersonaId(m, null)).toBe(m);
  });

  it("仅保留指定 persona 的列与单元格", () => {
    const m = {
      personas: [{ personaId: "a" }, { personaId: "b" }],
      cells   : [{ personaId: "a" }, { personaId: "b" }]
    } as PersonaChapterMatrixDto;
    const r = filterMatrixByPersonaId(m, "a");
    expect(r.personas.map((p) => p.personaId)).toEqual(["a"]);
    expect(r.cells.map((c) => c.personaId)).toEqual(["a"]);
  });
});
