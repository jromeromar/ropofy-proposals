import { describe, it, expect } from "vitest";
import {
  construirPayloadAceptacion,
  enviarWebhook,
  type WebhookPayload,
} from "@/lib/webhook";
import type { SentVersion, Acceptance } from "@/lib/types";

function fakeSentVersion(): SentVersion {
  return {
    version: "v2",
    token: "tok123456789012345678901234",
    sentAt: "2026-08-14T15:00:00.000Z",
    plan: 2,
    autor: "Ana Consultora",
    aprobador: null,
    motivo: "interno",
    condicion: {
      descuentoPct: 15,
      vigencia: "2027-01-01T12:00:00.000Z",
      autor: "Ana Consultora",
      aprobador: null,
      moneda: "USD",
      precioLista: 4080,
      precioFinal: 3468,
      preciosFinales: { "1": 1760, "2": 3468, "3": 5470 },
      lineaCondicion: "Condición registrada por Ana Consultora · válida hasta …",
    },
    clientDocument: {
      cliente: "Activos por Colombia S.A.S.",
      condicion_aplicada: {
        plan_seleccionado: 2,
        descuento_pct: 15,
        vigencia: "2027-01-01T12:00:00.000Z",
        linea_condicion: null,
        autor: "Ana Consultora",
        moneda: "USD",
        precio_lista_seleccionado: 4080,
        precio_final_seleccionado: 3468,
        preciosFinales: { "1": 1760, "2": 3468, "3": 5470 },
      },
    },
    estado: "aceptada",
    acceptance: null,
    events: [],
    sourceHash: "abc",
  };
}

function fakeAcceptance(): Acceptance {
  return {
    at: "2026-08-18T20:14:00.000Z",
    nombre: "Carla Decisora",
    correo: "carla@empresa.com",
    observaciones: "Arrancamos en septiembre",
    plan: 2,
    precioEfectivo: 3468,
    moneda: "USD",
    ip: "190.0.0.1",
    userAgent: "seed",
  };
}

describe("construirPayloadAceptacion", () => {
  it("arma el payload con la forma esperada", () => {
    const payload = construirPayloadAceptacion({
      propuestaId: "activos-1617a383",
      cliente: "Activos por Colombia S.A.S.",
      sentVersion: fakeSentVersion(),
      acceptance: fakeAcceptance(),
      enlace: "https://ejemplo.com/p/tok123456789012345678901234",
    });
    expect(payload).toEqual<WebhookPayload>({
      evento: "propuesta_aceptada",
      cliente: "Activos por Colombia S.A.S.",
      propuestaId: "activos-1617a383",
      version: "v2",
      plan: 2,
      precio_final: 3468,
      moneda: "USD",
      condicion: {
        descuento_pct: 15,
        autor: "Ana Consultora",
        vigencia: "2027-01-01T12:00:00.000Z",
      },
      acepta: {
        nombre: "Carla Decisora",
        correo: "carla@empresa.com",
        fecha: "2026-08-18T20:14:00.000Z",
      },
      observaciones: "Arrancamos en septiembre",
      enlace: "https://ejemplo.com/p/tok123456789012345678901234",
    });
  });
});

describe("enviarWebhook", () => {
  const payload = construirPayloadAceptacion({
    propuestaId: "p1",
    cliente: "C",
    sentVersion: fakeSentVersion(),
    acceptance: fakeAcceptance(),
    enlace: "https://ejemplo.com/p/x",
  });

  it("éxito en el primer intento", async () => {
    let calls = 0;
    const res = await enviarWebhook("https://hook", payload, {
      backoffMs: 1,
      fetchImpl: async () => {
        calls++;
        return { ok: true, status: 200 };
      },
    });
    expect(res.ok).toBe(true);
    expect(res.intentos).toBe(1);
    expect(calls).toBe(1);
  });

  it("reintenta y NO lanza cuando el endpoint responde 500", async () => {
    let calls = 0;
    const res = await enviarWebhook("https://hook", payload, {
      retries: 2,
      backoffMs: 1,
      fetchImpl: async () => {
        calls++;
        return { ok: false, status: 500 };
      },
    });
    expect(res.ok).toBe(false);
    expect(res.intentos).toBe(3); // 1 + 2 retries
    expect(res.status).toBe(500);
    expect(calls).toBe(3);
  });

  it("no lanza cuando fetch arroja", async () => {
    const res = await enviarWebhook("https://hook", payload, {
      retries: 1,
      backoffMs: 1,
      fetchImpl: async () => {
        throw new Error("network down");
      },
    });
    expect(res.ok).toBe(false);
    expect(res.intentos).toBe(2);
  });
});
