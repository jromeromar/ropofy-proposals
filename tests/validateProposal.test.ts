import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { validateProposal } from "@/lib/validateProposal";
import type { Proposal } from "@/lib/types";

function loadFixture(): Proposal {
  const raw = readFileSync(
    path.join(process.cwd(), "fixtures", "propuesta-activos-v1.json"),
    "utf8",
  );
  return JSON.parse(raw) as Proposal;
}

// Deep clone so each test mutates an isolated copy.
function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

describe("validateProposal", () => {
  // ALARMA DE CONTRATO: el fixture ES el propuesta.json real del pipeline.
  // Si el contrato y la app se separan, esta prueba grita primero.
  it("acepta el propuesta.json real (fixture) con CERO errores", () => {
    const result = validateProposal(loadFixture());
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("rechaza cuando falta el bloque «nota»", () => {
    const p = clone(loadFixture()) as Record<string, unknown>;
    delete p.nota;
    const result = validateProposal(p);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("nota"))).toBe(true);
  });

  it("rechaza depende_de_tercero booleano en una fuga mitigable (debe ser texto)", () => {
    const p = clone(loadFixture());
    const mitigable = p.fugas.find((f) => f.estado === "mitigable");
    expect(mitigable).toBeDefined();
    (mitigable as Record<string, unknown>).depende_de_tercero = true;
    const result = validateProposal(p);
    expect(result.ok).toBe(false);
    expect(
      result.errors.some((e) => e.includes("depende_de_tercero")),
    ).toBe(true);
  });

  it("rechaza cuando dos fugas son dominantes", () => {
    const p = clone(loadFixture());
    // The first fuga is dominante in the fixture; make a second one too.
    p.fugas[1].dominante = true;
    const result = validateProposal(p);
    expect(result.ok).toBe(false);
    expect(
      result.errors.some((e) => e.includes("exactamente una fuga")),
    ).toBe(true);
  });

  it("rechaza cuando un no_aplican expone un id interno", () => {
    const p = clone(loadFixture());
    p.no_aplican[0][0] = "gestion-base-contactos";
    const result = validateProposal(p);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("id interno"))).toBe(true);
  });

  it("rechaza cuando un precio no es entero", () => {
    const p = clone(loadFixture());
    p.condicion_comercial.precio_por_plan["2"] = 4080.5;
    const result = validateProposal(p);
    expect(result.ok).toBe(false);
    expect(
      result.errors.some((e) => e.includes("precio_por_plan")),
    ).toBe(true);
  });

  it("reporta todos los problemas a la vez, no fail-fast", () => {
    const p = clone(loadFixture()) as Record<string, unknown>;
    delete p.nota;
    delete p.plan_recomendado;
    const result = validateProposal(p);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});
