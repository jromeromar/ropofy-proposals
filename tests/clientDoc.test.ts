import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// The view imports a server action that pulls next/headers; stub it so the
// module graph loads in the test env (the action is never called at render).
vi.mock("next/headers", () => ({ headers: async () => new Map() }));

import ClientDocView from "@/app/p/[token]/ClientDocView";
import { construirCondicion, buildClientDocument } from "@/lib/clientDocument";
import { toClientDocVM } from "@/lib/clientDocVM";
import { forbiddenContentCheck, visibleText } from "@/lib/rules";
import type { Proposal, Acceptance } from "@/lib/types";

function loadFixture(): Proposal {
  const raw = readFileSync(
    path.join(process.cwd(), "fixtures", "propuesta-activos-v1.json"),
    "utf8",
  );
  return JSON.parse(raw) as Proposal;
}

function renderDoc(opts: {
  descuentoPct: number | null;
  vigencia: string | null;
  nowIso: string;
  acceptance?: Acceptance | null;
}): string {
  const data = loadFixture();
  const condicion = construirCondicion(data, 2, {
    descuentoPct: opts.descuentoPct,
    vigencia: opts.vigencia,
    autor: "Ana Consultora",
    aprobador: null,
  });
  const doc = buildClientDocument(data, condicion, 2);
  const vm = toClientDocVM(doc, "2026-08-14T15:00:00.000Z");
  return renderToStaticMarkup(
    React.createElement(ClientDocView, {
      vm,
      token: "hIbJiVyz38YJMfMpLNJsNUvL",
      nowIso: opts.nowIso,
      acceptance: opts.acceptance ?? null,
    }),
  );
}

describe("documento del cliente — exclusiones", () => {
  const html = renderDoc({
    descuentoPct: 15,
    vigencia: "2027-01-01T12:00:00.000Z",
    nowIso: "2026-08-20T00:00:00.000Z",
  });

  it("no filtra contenido prohibido", () => {
    expect(forbiddenContentCheck(html).ok).toBe(true);
  });

  it("no referencia ninguna ruta /consultor/", () => {
    expect(html).not.toContain("/consultor/");
  });

  it("no expone ids internos, tipo ni claves de precio internas", () => {
    for (const bad of [
      "comp-ia-",
      "chatbot_ia",
      "multiplicador",
      "base_por_plan",
      "tramos",
      "esfuerzo",
      "jornadas",
    ]) {
      expect(html).not.toContain(bad);
    }
  });
});

describe("documento del cliente — bloque de precio", () => {
  it("condición activa: lista tachada, precio final y línea", () => {
    const text = visibleText(
      renderDoc({
        descuentoPct: 15,
        vigencia: "2027-01-01T12:00:00.000Z",
        nowIso: "2026-08-20T00:00:00.000Z",
      }),
    );
    expect(text).toContain("$4.080 USD");
    expect(text).toContain("$3.468 USD");
    expect(text).toContain("Condición registrada por Ana Consultora");
  });

  it("expirada: precio de lista + nota de expiración", () => {
    const text = visibleText(
      renderDoc({
        descuentoPct: 15,
        vigencia: "2026-01-01T12:00:00.000Z",
        nowIso: "2026-08-20T00:00:00.000Z",
      }),
    );
    expect(text).toContain("La condición anterior expiró el");
    expect(text).toContain("$4.080 USD");
    expect(text).not.toContain("$3.468");
  });

  it("sin condición: solo precio de lista, sin bloque de condición ni precio con descuento", () => {
    const text = visibleText(
      renderDoc({
        descuentoPct: null,
        vigencia: null,
        nowIso: "2026-08-20T00:00:00.000Z",
      }),
    );
    // NOTE: the real proposal has a component literally named "Los descuentos
    // dentro de política…", so we cannot ban the word "descuento" outright —
    // we assert the discount CONDITION is absent, not the word.
    expect(text).toContain("$4.080 USD");
    expect(text).not.toContain("Condición registrada por");
    expect(text).not.toContain("$3.468"); // no discounted price
  });

  it("sin condición: el objeto condición del VM no lleva descuento", () => {
    const data = loadFixture();
    const condicion = construirCondicion(data, 2, {
      descuentoPct: null,
      vigencia: null,
      autor: "Ana Consultora",
      aprobador: null,
    });
    const doc = buildClientDocument(data, condicion, 2);
    const vm = toClientDocVM(doc, "2026-08-14T15:00:00.000Z");
    // The condition the client is offered carries no discount and no key
    // whose name contains "descuento" (the VM field is `pct`, not descuentoPct).
    expect(JSON.stringify(vm.condicion).toLowerCase()).not.toContain("descuento");
    expect(vm.condicion.pct).toBeNull();
    expect(vm.condicion.lineaCondicion).toBeNull();
  });
});

describe("documento del cliente — contenido y aceptación", () => {
  it("se explica solo: incluye prose, cita y clave de lectura", () => {
    const text = visibleText(
      renderDoc({
        descuentoPct: null,
        vigencia: null,
        nowIso: "2026-08-20T00:00:00.000Z",
      }),
    );
    expect(text).toContain("Este documento se explica solo");
    expect(text).toContain("Cómo leer el plano que sigue");
    // fuga verbatim quote (real F-08 evidence)
    expect(text).toContain("no tenemos el personal para atender");
    // visibility badge
    expect(text).toContain("tu cliente lo ve");
  });

  it("con aceptación previa muestra la banda, no el formulario", () => {
    const acceptance: Acceptance = {
      at: "2026-08-18T20:14:00.000Z",
      nombre: "Cliente Uno",
      correo: "c@ejemplo.com",
      observaciones: null,
      plan: 2,
      precioEfectivo: 3468,
      moneda: "USD",
      ip: null,
      userAgent: null,
    };
    const text = visibleText(
      renderDoc({
        descuentoPct: 15,
        vigencia: "2027-01-01T12:00:00.000Z",
        nowIso: "2026-08-20T00:00:00.000Z",
        acceptance,
      }),
    );
    expect(text).toContain("Su aceptación quedó registrada el");
    expect(text).toContain("Nada se cobra hasta la firma");
  });
});
