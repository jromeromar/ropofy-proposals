import { describe, it, expect } from "vitest";
import {
  normalizarResumen,
  fraseDePlan,
  benchmarkFuente,
  brechaDePlan,
  normalizarGestionFila,
  bloqueDeCategoria,
} from "@/lib/lienzo";
import { benchmarkPorModulo } from "@/lib/mapLayout";
import { notaHoy } from "@/lib/grade";

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

describe("formas reales del contrato v5", () => {
  it("fraseDePlan lee `planes` como objeto {\"1\":{frase}}", () => {
    const planes = {
      "1": { frontera: "f1", frase: "uno" },
      "2": { frontera: "f2", frase: "dos" },
      "3": { frontera: "f3", frase: "tres" },
    };
    expect(fraseDePlan(planes, 1)).toBe("uno");
    expect(fraseDePlan(planes, 3)).toBe("tres");
  });

  it("brechaDePlan lee la forma {global, por_modulo}", () => {
    const b = {
      global: { por_que: "Faltan 18 puntos por datos por entregar." },
      por_modulo: [
        { m: "Atracción", por_que: "Declarar el gasto real de pauta." },
      ],
    };
    const r = brechaDePlan(b, 2);
    expect(r?.lectura).toContain("Faltan 18 puntos");
    expect(r?.modulos[0]).toEqual({
      modulo: "Atracción",
      accion: "Declarar el gasto real de pauta.",
    });
  });

  it("benchmarkPorModulo lee el mapa anidado en `por_modulo`", () => {
    const bench = {
      por_modulo: { Gestión: 1.3, Atracción: 1.2 },
      fuente: "diagnósticos de PYMES en Colombia y Argentina",
    };
    expect(benchmarkPorModulo(bench)).toEqual({ Gestión: 1.3, Atracción: 1.2 });
  });

  it("notaHoy deriva la nota desde madurez (suma/28)", () => {
    const madurez = Array.from({ length: 7 }, (_, i) => ({
      hoy: i === 0 ? 2 : 1,
      p: { "1": 2, "2": 3, "3": 4 },
    }));
    // suma hoy = 2 + 6*1 = 8 → round(8/28*100) = 29 → letra E
    expect(notaHoy(madurez)).toEqual({ puntos: 29, letra: "E" });
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
