import { describe, it, expect } from "vitest";
import {
  normalizarResumen,
  fraseDePlan,
  benchmarkFuente,
  brechaDePlan,
  normalizarGestionFila,
  bloqueDeCategoria,
} from "@/lib/lienzo";

describe("normalizarResumen (B4)", () => {
  it("degrada un string a solo párrafo", () => {
    expect(normalizarResumen("Hola")).toEqual({ parrafo: "Hola", bullets: [] });
  });
  it("lee { parrafo, bullets }", () => {
    expect(
      normalizarResumen({ parrafo: "P", bullets: ["a", "b"] }),
    ).toEqual({ parrafo: "P", bullets: ["a", "b"] });
  });
  it("tolera bullets ausentes o basura", () => {
    expect(normalizarResumen({ parrafo: "P" })).toEqual({
      parrafo: "P",
      bullets: [],
    });
    expect(normalizarResumen(undefined)).toEqual({ parrafo: "", bullets: [] });
  });
});

describe("fraseDePlan (E14)", () => {
  it("mapea por número de plan", () => {
    const planes = [
      { plan: 1 as const, frase: "uno" },
      { plan: 2 as const, frase: "dos" },
    ];
    expect(fraseDePlan(planes, 1)).toBe("uno");
    expect(fraseDePlan(planes, 2)).toBe("dos");
    expect(fraseDePlan(planes, 3)).toBeNull();
  });
  it("mapea por posición cuando no hay plan/nivel", () => {
    expect(fraseDePlan([{ frase: "a" }, { frase: "b" }], 2)).toBe("b");
  });
  it("mapea por nombre de nivel", () => {
    expect(fraseDePlan([{ nivel: "inteligente", frase: "x" }], 3)).toBe("x");
  });
  it("degrada a null sin planes", () => {
    expect(fraseDePlan(undefined, 1)).toBeNull();
  });
});

describe("benchmarkFuente (D12)", () => {
  it("devuelve el texto limpio", () => {
    const r = benchmarkFuente({
      fuente: "diagnósticos de PYMES en Colombia y Argentina",
    });
    expect(r.texto).toBe("diagnósticos de PYMES en Colombia y Argentina");
    expect(r.tieneDigitos).toBe(false);
  });
  it("suprime el texto y marca error si trae dígitos (tamaño de muestra)", () => {
    const r = benchmarkFuente({ fuente: "muestra de 128 pymes" });
    expect(r.texto).toBeNull();
    expect(r.tieneDigitos).toBe(true);
  });
  it("degrada a null cuando no hay fuente", () => {
    expect(benchmarkFuente({ Gestión: 1.3 }).texto).toBeNull();
    expect(benchmarkFuente(undefined).texto).toBeNull();
  });
});

describe("brechaDePlan (F20) — sin cálculo, solo lectura", () => {
  const perPlan = {
    "1": { lectura: "faltan 30", modulos: [{ modulo: "Cierre", accion: "firmar" }] },
    "2": { lectura: "faltan 12", modulos: [] },
    "3": null,
  };
  it("resuelve la lectura del plan seleccionado (reactivo)", () => {
    expect(brechaDePlan(perPlan, 1)?.lectura).toBe("faltan 30");
    expect(brechaDePlan(perPlan, 2)?.lectura).toBe("faltan 12");
  });
  it("oculta la sección cuando el plan llega a 100 (null)", () => {
    expect(brechaDePlan(perPlan, 3)).toBeNull();
  });
  it("acepta la forma plana (misma lectura para todo plan)", () => {
    const flat = { lectura: "faltan X", modulos: [] };
    expect(brechaDePlan(flat, 1)?.lectura).toBe("faltan X");
    expect(brechaDePlan(flat, 3)?.lectura).toBe("faltan X");
  });
  it("degrada a null cuando el contrato no lo trae", () => {
    expect(brechaDePlan(undefined, 1)).toBeNull();
    expect(brechaDePlan(null, 1)).toBeNull();
  });
});

describe("normalizarGestionFila (B6)", () => {
  it("degrada la tupla [canal, nota] a un ítem plano sin subítems", () => {
    expect(normalizarGestionFila(["Telefonistas", "reciben"])).toEqual({
      quien: "Telefonistas",
      nota: "reciben",
      detalle: [],
    });
  });
  it("subordina el detalle bajo el rol", () => {
    expect(
      normalizarGestionFila({
        quien: "Telefonistas",
        nota: "primer contacto",
        detalle: ["toma el pedido", "agenda"],
      }),
    ).toEqual({
      quien: "Telefonistas",
      nota: "primer contacto",
      detalle: ["toma el pedido", "agenda"],
    });
  });
});

describe("bloqueDeCategoria (C7)", () => {
  it("reconoce fuga, ceguera y restricción", () => {
    expect(bloqueDeCategoria("fuga")).toBe("fuga");
    expect(bloqueDeCategoria("ceguera")).toBe("ceguera");
    expect(bloqueDeCategoria("restriccion")).toBe("restriccion");
  });
  it("mapea el vocabulario del pipeline (friccion_propia) a restricción", () => {
    expect(bloqueDeCategoria("friccion_propia")).toBe("restriccion");
  });
  it("degrada lo desconocido/ausente a fuga", () => {
    expect(bloqueDeCategoria(undefined)).toBe("fuga");
    expect(bloqueDeCategoria("otro")).toBe("fuga");
  });
});
