/**
 * FINAL SWEEP — the executable guardrail for the whole contract.
 *
 * Builds a fully-exercised state (loaded, sent with discount, sent without,
 * one accepted, one expired) and renders the client-facing surface against it,
 * asserting the ten invariants that must hold before v1.0.0 ships.
 *
 * Practical note: Next page shells (server components importing CSS + headers)
 * can't be mounted in vitest, so we render the exact view components the routes
 * render (ClientDocView / PresentacionView) plus the storage/snapshot layer —
 * that is where every invariant actually lives.
 */

import { describe, it, expect, beforeAll, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/headers", () => ({ headers: async () => new Map() }));

import ClientDocView from "@/app/p/[token]/ClientDocView";
import PresentacionView from "@/app/consultor/[id]/presentacion/PresentacionView";
import { toClientDocVM } from "@/lib/clientDocVM";
import { toPresentacionVM } from "@/lib/presentacionVM";
import { construirCondicion, buildClientDocument } from "@/lib/clientDocument";
import { storage } from "@/lib/storage";
import { visibleText } from "@/lib/rules";
import { INTERNAL_ID_PATTERN_GLOBAL } from "@/lib/rules";
import type { Proposal, SentVersion } from "@/lib/types";

function loadFixture(): Proposal {
  return JSON.parse(
    readFileSync(
      path.join(process.cwd(), "fixtures", "propuesta-activos-v1.json"),
      "utf8",
    ),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as Proposal;
}

const FORBIDDEN_WORDS = [
  "esfuerzo",
  "jornadas",
  "multiplicador",
  "base_por_plan",
  "tramos",
];

const FORBIDDEN_KEYS = [
  "multiplicador_calculado",
  "base_por_plan",
  "tramos_factor",
  "limite_descuento_sin_aprobacion",
  "desglose_interno",
  "motivo",
];

// Render a /p document from a sent version (the exact route view).
function renderDoc(v: SentVersion, nowIso: string): string {
  const vm = toClientDocVM(v.clientDocument, v.sentAt);
  return renderToStaticMarkup(
    React.createElement(ClientDocView, {
      vm,
      token: v.token,
      nowIso,
      acceptance: v.acceptance,
    }),
  );
}

interface State {
  id: string;
  conDescuento: SentVersion;
  sinDescuento: SentVersion;
  expirada: SentVersion;
}

async function buildState(): Promise<State> {
  const data = loadFixture();
  const stored = await storage.saveProposal(data);

  async function send(
    plan: 1 | 2 | 3,
    pct: number | null,
    vig: string | null,
  ): Promise<SentVersion> {
    const c = construirCondicion(stored.data, plan, {
      descuentoPct: pct,
      vigencia: vig,
      autor: "Ana Consultora",
      aprobador: null,
    });
    return storage.saveSentVersion(stored.id, {
      plan,
      autor: "Ana Consultora",
      aprobador: null,
      motivo: "nota interna secreta",
      condicion: c,
      clientDocument: buildClientDocument(stored.data, c, plan),
    });
  }

  const conDescuento = await send(2, 15, "2027-01-01T12:00:00.000Z");
  const sinDescuento = await send(1, null, null);
  const expirada = await send(3, 15, "2020-01-01T12:00:00.000Z");

  // Accept the discounted one.
  await storage.aceptarVersion(conDescuento.token, {
    at: "2026-08-18T20:14:00.000Z",
    nombre: "Carla Decisora",
    correo: "carla@empresa.com",
    observaciones: "Arrancamos en septiembre",
    plan: 2,
    precioEfectivo: 3468,
    moneda: "USD",
    ip: "190.0.0.1",
    userAgent: "sweep",
  });
  const acc = (await storage.getByToken(conDescuento.token))!.sentVersion;

  return { id: stored.id, conDescuento: acc, sinDescuento, expirada };
}

describe("FINAL SWEEP", () => {
  let state: State;
  const NOW = "2026-08-20T00:00:00.000Z";
  let docs: string[];

  beforeAll(async () => {
    state = await buildState();
    docs = [
      renderDoc(state.conDescuento, NOW),
      renderDoc(state.sinDescuento, NOW),
      renderDoc(state.expirada, NOW),
    ];
  });

  it("1. ningún id interno (patrón minúscula-con-guiones) visible en /p", () => {
    for (const html of docs) {
      const text = visibleText(html);
      const match = text.match(INTERNAL_ID_PATTERN_GLOBAL);
      expect(match, `id interno visible: ${match?.join(", ")}`).toBeNull();
    }
  });

  it("2. palabras internas ausentes de todo /p", () => {
    for (const html of docs) {
      for (const w of FORBIDDEN_WORDS) {
        expect(html.includes(w), `«${w}» presente`).toBe(false);
      }
    }
  });

  it("3. ninguna ruta /consultor/ referenciada en /p", () => {
    for (const html of docs) expect(html).not.toContain("/consultor/");
  });

  it("4. precios enteros en formato es-CO ($1.234 USD), sin decimales", () => {
    for (const html of docs) {
      const text = visibleText(html);
      // No price may carry a decimal comma (e.g. $3.468,50).
      expect(/\$\d[\d.]*,\d/.test(text)).toBe(false);
      // At least one well-formed price is present.
      expect(/\$\d{1,3}(\.\d{3})*\sUSD/.test(text)).toBe(true);
    }
  });

  it("5. /p sin condición no muestra la condición de descuento", () => {
    // NOTE: the real proposal has a component named "Los descuentos dentro de
    // política…", so a raw "descuento" substring ban is wrong. We assert the
    // discount CONDITION (struck price / condition line / discounted price) is
    // absent — which is the actual invariant.
    const text = visibleText(renderDoc(state.sinDescuento, NOW));
    expect(text).not.toContain("Condición registrada por");
    expect(text).not.toContain("válida hasta");
    // Plan 1 list price is $2.070; its discounted value ($1.760) must not show.
    expect(text).not.toContain("$1.760");
  });

  it("6. una versión aceptada rechaza un segundo accept (server-side)", async () => {
    const res = await storage.aceptarVersion(state.conDescuento.token, {
      at: "2026-08-21T00:00:00.000Z",
      nombre: "Otro",
      correo: "otro@x.com",
      observaciones: null,
      plan: 2,
      precioEfectivo: 3468,
      moneda: "USD",
      ip: null,
      userAgent: null,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("already_accepted");
  });

  it("7. condición expirada sirve precio de lista + nota de expiración", () => {
    const text = visibleText(renderDoc(state.expirada, NOW));
    expect(text).toContain("La condición anterior expiró el");
    expect(text).toContain("$6.435 USD"); // plan 3 list price
    expect(text).not.toContain("$5.470"); // discounted plan-3 price hidden
  });

  it("8. telemetría no emite nada para tokens desconocidos", async () => {
    // Unknown token → the emission guards return false (nothing is emitted).
    expect(await storage.debeEmitirApertura("token-que-no-existe", 1000)).toBe(false);
    expect(await storage.debeEmitirExpiracion("token-que-no-existe")).toBe(false);
  });

  it("9. todo snapshot de cliente carece de las claves prohibidas", () => {
    for (const v of [state.conDescuento, state.sinDescuento, state.expirada]) {
      const s = JSON.stringify(v.clientDocument);
      for (const k of FORBIDDEN_KEYS) {
        expect(s.includes(k), `snapshot contiene «${k}»`).toBe(false);
      }
      expect(s).not.toContain("chatbot_ia");
      expect(s).not.toContain("gestion-"); // internal component id prefix
    }
  });

  it("presentación del consultor tampoco filtra contenido prohibido", () => {
    const vm = toPresentacionVM(loadFixture());
    const html = renderToStaticMarkup(
      React.createElement(PresentacionView, { id: state.id, vm, initialPlan: 1 }),
    );
    for (const w of FORBIDDEN_WORDS)
      expect(html.includes(w), `«${w}» en presentación`).toBe(false);
  });

  // 10. `npm run build` is enforced by the done-criteria build step and CI;
  // running it inside vitest would double every test run, so it is intentionally
  // left to `npm run build` rather than asserted here.
});
