import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { construirCondicion, buildClientDocument } from "@/lib/clientDocument";
import { toClientDocVM } from "@/lib/clientDocVM";
import type { Proposal } from "@/lib/types";

function loadFixture(): Proposal {
  const raw = readFileSync(
    path.join(process.cwd(), "fixtures", "propuesta-activos-v1.json"),
    "utf8",
  );
  return JSON.parse(raw) as Proposal;
}

function buildDoc(descuentoPct: number | null) {
  const data = loadFixture();
  const condicion = construirCondicion(data, 2, {
    descuentoPct,
    vigencia: descuentoPct != null ? "2026-09-01T12:00:00.000Z" : null,
    autor: "Ana Consultora",
    aprobador: null,
  });
  return { data, doc: buildClientDocument(data, condicion, 2), condicion };
}

describe("buildClientDocument — claves prohibidas ausentes", () => {
  const { doc } = buildDoc(15);
  const serialized = JSON.stringify(doc);

  it("no contiene las claves internas prohibidas", () => {
    expect(serialized).not.toContain("multiplicador_calculado");
    expect(serialized).not.toContain("multiplicador");
    expect(serialized).not.toContain("base_por_plan");
    expect(serialized).not.toContain("tramos_factor");
    expect(serialized).not.toContain("limite_descuento_sin_aprobacion");
    expect(serialized).not.toContain("desglose_interno");
    expect(serialized).not.toContain("motivo");
  });

  it("no expone ids internos de componentes", () => {
    expect(serialized).not.toContain("gestion-chatbot-precalificacion");
    expect(serialized).not.toContain("tableros-operativo-asesor");
    expect(serialized).not.toContain("chatbot_ia");
  });

  it("condicion_comercial conserva solo moneda y precios de lista", () => {
    const cc = doc.condicion_comercial as Record<string, unknown>;
    expect(cc).toBeDefined();
    expect(cc.base_por_plan).toBeUndefined();
    expect(cc.tramos_factor).toBeUndefined();
    expect(cc.limite_descuento_sin_aprobacion).toBeUndefined();
    expect(cc.moneda).toBe("USD");
  });

  it("embebe la condición aplicada con valores fijos", () => {
    expect(doc.condicion_aplicada.plan_seleccionado).toBe(2);
    expect(doc.condicion_aplicada.descuento_pct).toBe(15);
    expect(doc.condicion_aplicada.precio_final_seleccionado).toBe(3468);
  });
});

describe("marca (nombre comercial) en el documento del cliente", () => {
  it("congela la marca en el snapshot y la expone en el VM", () => {
    const data = loadFixture();
    const condicion = construirCondicion(data, 2, {
      descuentoPct: null,
      vigencia: null,
      autor: "Ana Consultora",
      aprobador: null,
    });
    const doc = buildClientDocument(data, condicion, 2, "Gosen Casa de Comidas");
    expect(doc.marca).toBe("Gosen Casa de Comidas");
    const vm = toClientDocVM(doc, "2026-08-14T15:00:00.000Z");
    expect(vm.marca).toBe("Gosen Casa de Comidas");
    expect(vm.cliente).toBe(data.cliente);
  });

  it("sin marca, el VM la deja en null", () => {
    const data = loadFixture();
    const condicion = construirCondicion(data, 2, {
      descuentoPct: null,
      vigencia: null,
      autor: "Ana Consultora",
      aprobador: null,
    });
    const vm = toClientDocVM(
      buildClientDocument(data, condicion, 2),
      "2026-08-14T15:00:00.000Z",
    );
    expect(vm.marca).toBeNull();
  });
});

describe("as_is stats — cifra explícita, nunca escarbada", () => {
  it("toma la cifra declarada, su unidad y el canal", () => {
    const { doc } = buildDoc(15);
    const vm = toClientDocVM(doc, "2026-08-14T15:00:00.000Z");
    expect(
      vm.stats.some((s) => s.cifra === "306" && s.unidad === "leads/mes"),
    ).toBe(true);
    expect(
      vm.stats.some(
        (s) => s.cifra === "30" && s.unidad === "conversaciones/día",
      ),
    ).toBe(true);
  });

  it("una fila sin cifra no aporta ninguna estadística (no escarba prosa)", () => {
    const data = loadFixture();
    // A row whose note is full of numbers but declares NO cifra: the old
    // scraper would have emitted phantom stats (a "4" from "4 km", etc.).
    data.as_is.de_donde_llegan = [
      ["Pedix", "zonas fuera del radio de 4 km"],
      ["Comanda impresa", "ítems de 3 o 4 sectores"],
    ];
    const condicion = construirCondicion(data, 2, {
      descuentoPct: null,
      vigencia: null,
      autor: "Ana Consultora",
      aprobador: null,
    });
    const doc = buildClientDocument(data, condicion, 2);
    const vm = toClientDocVM(doc, "2026-08-14T15:00:00.000Z");
    // No phantom values from those prose numbers.
    for (const bad of ["4", "3"]) {
      expect(vm.stats.some((s) => s.cifra === bad)).toBe(false);
    }
    // And no stat for those channels (they declared no cifra).
    for (const canal of ["Pedix", "Comanda impresa"]) {
      expect(vm.stats.some((s) => s.canal === canal)).toBe(false);
    }
  });
});

describe("inventario — funcionalidad removida (incluido:false)", () => {
  it("una funcionalidad removida no llega al snapshot del cliente pero sigue en el borrador", () => {
    const data = loadFixture();
    const keys = Object.keys(data.componentes);
    const target = keys[0];
    const nombre = data.componentes[target].nombre_cliente;
    data.componentes[target].incluido = false;

    const condicion = construirCondicion(data, 2, {
      descuentoPct: null,
      vigencia: null,
      autor: "Ana Consultora",
      aprobador: null,
    });
    const doc = buildClientDocument(data, condicion, 2);

    // The removed feature's client name is absent from the frozen snapshot…
    const nombres = Object.values(
      doc.componentes as Record<string, { nombre_cliente: string }>,
    ).map((c) => c.nombre_cliente);
    expect(nombres).not.toContain(nombre);
    // …one fewer than the total.
    expect(nombres.length).toBe(keys.length - 1);
    // …but it is still in the source draft (recoverable).
    expect(data.componentes[target].incluido).toBe(false);
    expect(data.componentes[target].nombre_cliente).toBe(nombre);
  });
});

describe("buildClientDocument — sin descuento", () => {
  it("la condición aplicada no lleva descuento ni línea de condición", () => {
    const { doc } = buildDoc(null);
    expect(doc.condicion_aplicada.descuento_pct).toBeNull();
    expect(doc.condicion_aplicada.linea_condicion).toBeNull();
    expect(doc.condicion_aplicada.precio_final_seleccionado).toBe(
      doc.condicion_aplicada.precio_lista_seleccionado,
    );
  });
});
