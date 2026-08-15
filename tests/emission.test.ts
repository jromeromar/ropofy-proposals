import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// Server action + route both read request headers; provide a host so enlaces
// resolve absolutely.
vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({ host: "ejemplo.com", "x-forwarded-proto": "https" }),
}));

import { storage } from "@/lib/storage";
import { construirCondicion, buildClientDocument } from "@/lib/clientDocument";
import { POST as telemetriaPOST } from "@/app/api/telemetria/route";
import { aceptarPropuesta } from "@/app/p/[token]/actions";
import type { Proposal } from "@/lib/types";

function loadFixture(): Proposal {
  return JSON.parse(
    readFileSync(
      path.join(process.cwd(), "fixtures", "propuesta-activos-v1.json"),
      "utf8",
    ),
  ) as Proposal;
}

let captured: Array<Record<string, unknown>>;

beforeEach(() => {
  captured = [];
  process.env.EVENTS_WEBHOOK_URL = "https://hook.example/events";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      captured.push(JSON.parse(init.body));
      return { ok: true, status: 200 };
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.EVENTS_WEBHOOK_URL;
});

const flush = () => new Promise((r) => setTimeout(r, 15));

async function seedSent(descuentoPct: number | null, vigencia: string | null) {
  const stored = await storage.saveProposal(loadFixture());
  const c = construirCondicion(stored.data, 2, {
    descuentoPct,
    vigencia,
    autor: "Ana Consultora",
    aprobador: null,
  });
  const sv = await storage.saveSentVersion(stored.id, {
    plan: 2,
    autor: "Ana Consultora",
    aprobador: null,
    motivo: null,
    condicion: c,
    clientDocument: buildClientDocument(stored.data, c, 2),
  });
  return { stored, sv };
}

function req(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/telemetria", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "UA-test" },
    body: JSON.stringify(body),
  });
}

describe("telemetría → eventos", () => {
  it("documento_abierto se emite con forma correcta y se throttlea", async () => {
    const { sv } = await seedSent(15, "2027-01-01T12:00:00.000Z");

    const r1 = await telemetriaPOST(req({ token: sv.token, tipo: "abierto", planVisto: 3 }));
    expect(r1.status).toBe(200);
    await flush();
    const abiertos = captured.filter((e) => e.evento === "documento_abierto");
    expect(abiertos).toHaveLength(1);
    expect(abiertos[0]).toMatchObject({
      evento: "documento_abierto",
      version: "v1",
      planVisto: 3,
      userAgent: "UA-test",
    });
    expect(abiertos[0].enlace).toContain("/p/");

    // Second open immediately → throttled (no new event).
    await telemetriaPOST(req({ token: sv.token, tipo: "abierto", planVisto: 2 }));
    await flush();
    expect(captured.filter((e) => e.evento === "documento_abierto")).toHaveLength(1);
  });

  it("plan_cambiado → plan_explorado; observacion → observacion_escrita", async () => {
    const { sv } = await seedSent(null, null);
    await telemetriaPOST(req({ token: sv.token, tipo: "plan_cambiado", planVisto: 3 }));
    await telemetriaPOST(req({ token: sv.token, tipo: "observacion_escrita" }));
    await flush();
    expect(captured.some((e) => e.evento === "plan_explorado" && e.planVisto === 3)).toBe(true);
    expect(captured.some((e) => e.evento === "observacion_escrita")).toBe(true);
  });

  it("token desconocido → 404 y no emite nada", async () => {
    const r = await telemetriaPOST(req({ token: "no-existe", tipo: "abierto" }));
    expect(r.status).toBe(404);
    await flush();
    expect(captured).toHaveLength(0);
  });
});

describe("aceptación → propuesta_aceptada", () => {
  it("emite el evento con forma correcta", async () => {
    const { sv } = await seedSent(15, "2027-01-01T12:00:00.000Z");
    const res = await aceptarPropuesta({
      token: sv.token,
      plan: 2,
      nombre: "Carla Decisora",
      correo: "carla@empresa.com",
      observaciones: "Arrancamos en septiembre",
    });
    expect(res.ok).toBe(true);
    await flush();
    const acc = captured.find((e) => e.evento === "propuesta_aceptada");
    expect(acc).toMatchObject({
      evento: "propuesta_aceptada",
      version: "v1",
      plan: 2,
      moneda: "USD",
      acepta: { nombre: "Carla Decisora", correo: "carla@empresa.com" },
    });
  });

  it("la aceptación confirma AUNQUE el endpoint esté caído", async () => {
    const { sv } = await seedSent(null, null);
    // Endpoint down: fetch throws on every attempt.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("endpoint down");
      }),
    );
    const res = await aceptarPropuesta({
      token: sv.token,
      plan: 2,
      nombre: "Carla",
      correo: "carla@empresa.com",
      observaciones: null,
    });
    expect(res.ok).toBe(true); // client still gets confirmation
  });
});
