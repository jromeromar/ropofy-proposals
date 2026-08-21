import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { checklistConsultor, checklistTieneContenido } from "@/lib/checklist";
import type { Proposal } from "@/lib/types";

const OUT =
  "/tmp/claude-0/-home-user-ropofy-proposals/98b5b1d4-02d9-5289-9295-e8a345154908/scratchpad";

describe("checklist del consultor", () => {
  it("extrae grafía, nombres por confirmar, silencios y datos que faltan", () => {
    const d = JSON.parse(readFileSync(OUT + "/bifteki.json", "utf8")) as Proposal;
    const c = checklistConsultor(d);
    expect(c.grafiaEstado).toBe("confirmada");
    expect(c.razonSocial).toBe("BIFTEKI S.A.S.");
    expect(c.nombresPorConfirmar.length).toBeGreaterThan(0);
    expect(c.nombresPorConfirmar[0]).toHaveLength(2);
    expect(c.silencios.length).toBeGreaterThan(0);
    expect(c.silencios[0]).toHaveProperty("modulo");
    expect(c.silencios[0]).toHaveProperty("lectura");
    expect(c.datosQueFaltan.length).toBe(12);
    expect(checklistTieneContenido(c)).toBe(true);
  });

  it("tolera un propuesta sin los campos internos", () => {
    const d = { cliente: "X" } as unknown as Proposal;
    const c = checklistConsultor(d);
    expect(c.nombresPorConfirmar).toEqual([]);
    expect(c.silencios).toEqual([]);
    expect(c.datosQueFaltan).toEqual([]);
    expect(checklistTieneContenido(c)).toBe(false);
  });
});
