import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { construirCondicion, buildClientDocument } from "@/lib/clientDocument";
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
