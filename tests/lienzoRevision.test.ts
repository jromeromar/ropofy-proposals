import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/headers", () => ({ headers: async () => new Map() }));

import ClientDocView from "@/app/p/[token]/ClientDocView";
import { construirCondicion, buildClientDocument } from "@/lib/clientDocument";
import { toClientDocVM } from "@/lib/clientDocVM";
import { visibleText } from "@/lib/rules";
import { storage } from "@/lib/storage";
import type { Proposal, BrechaFueraDeAlcance } from "@/lib/types";

function loadFixture(): Proposal {
  const raw = readFileSync(
    path.join(process.cwd(), "fixtures", "propuesta-activos-v1.json"),
    "utf8",
  );
  return JSON.parse(raw) as Proposal;
}

function renderDoc(plan: 1 | 2 | 3, extra?: Partial<Proposal>): string {
  const data = { ...loadFixture(), ...extra } as Proposal;
  const condicion = construirCondicion(data, plan, {
    descuentoPct: null,
    vigencia: null,
    autor: "Ana Consultora",
    aprobador: null,
  });
  const doc = buildClientDocument(data, condicion, plan);
  const vm = toClientDocVM(doc, "2026-08-14T15:00:00.000Z");
  return renderToStaticMarkup(
    React.createElement(ClientDocView, {
      vm,
      token: "hIbJiVyz38YJMfMpLNJsNUvL",
      nowIso: "2026-08-20T00:00:00.000Z",
      initialPlan: plan,
    }),
  );
}

describe("F20 — brecha para el 100 (reactiva, sin cálculo)", () => {
  // Bifteki-like case: even the top plan leaves modules below 100, so the
  // section shows; a plan the pipeline marks as reaching 100 (null) hides it.
  const brecha: BrechaFueraDeAlcance = {
    "1": { lectura: "Faltan 40 puntos.", modulos: [] },
    "2": {
      lectura: "Faltan 18 puntos: dos módulos dependen de su equipo.",
      modulos: [
        { modulo: "Cierre", accion: "Firmar con SAE el flujo de llaves." },
      ],
    },
    "3": null,
  };

  it("muestra la brecha del plan seleccionado con su lectura y acciones", () => {
    const text = visibleText(renderDoc(2, { brecha_fuera_de_alcance: brecha }));
    expect(text).toContain("Faltan 18 puntos");
    expect(text).toContain("Firmar con SAE el flujo de llaves.");
  });

  it("oculta la sección cuando el plan llega a 100 (null en el contrato)", () => {
    const text = visibleText(renderDoc(3, { brecha_fuera_de_alcance: brecha }));
    expect(text).not.toContain("El tramo que le queda");
  });

  it("no muestra la sección cuando el contrato no trae la brecha", () => {
    const text = visibleText(renderDoc(2));
    expect(text).not.toContain("El tramo que le queda");
  });
});

describe("C7 — bloques de fugas / cegueras / restricciones", () => {
  it("agrupa por categoría con encabezado por bloque", () => {
    const text = visibleText(renderDoc(2));
    expect(text).toContain("Las fugas");
    expect(text).toContain("Las cegueras"); // fixture trae categoria=ceguera
    expect(text).toContain("Las restricciones"); // friccion_propia → restricción
  });
});

describe("D13 — el plan recomendado no va en el diagnóstico", () => {
  it("no repite «Recomendación: Plan» en la sección de diagnóstico", () => {
    const text = visibleText(renderDoc(2));
    expect(text).not.toContain("Recomendación: Plan");
  });
});

describe("A3 — sesión y arranque fuera del lienzo del cliente", () => {
  it("no muestra la sesión de diagnóstico ni el arranque estimado", () => {
    const text = visibleText(renderDoc(2));
    expect(text).not.toContain("Sesión de diagnóstico");
    expect(text).not.toContain("Arranque estimado");
  });
});

describe("C10 — registro de notas de fuga (append-only, atribuible)", () => {
  beforeEach(() => {
    // Each test file gets an isolated in-memory store under Vitest.
  });

  it("anexa notas sin sobrescribir y las conserva en el registro", async () => {
    const data = loadFixture();
    const rec = await storage.saveProposal(data, null);
    await storage.appendNotaFuga(rec.id, {
      at: "2026-08-21T10:00:00.000Z",
      autor: "jorge@ropofy.com",
      fugaIdx: 0,
      fugaTitulo: data.fugas[0].titulo,
      confirmada: true,
      nota: null,
    });
    await storage.appendNotaFuga(rec.id, {
      at: "2026-08-21T10:05:00.000Z",
      autor: "jorge@ropofy.com",
      fugaIdx: 0,
      fugaTitulo: data.fugas[0].titulo,
      confirmada: null,
      nota: "Eso lo hacen las telefonistas, solo cuando se acuerdan.",
    });
    const after = await storage.getProposal(rec.id);
    expect(after?.notasFugas).toHaveLength(2);
    expect(after?.notasFugas?.[0].confirmada).toBe(true);
    expect(after?.notasFugas?.[1].nota).toContain("telefonistas");
    // The original leak card is untouched.
    expect(after?.data.fugas[0].titulo).toBe(data.fugas[0].titulo);
  });
});
