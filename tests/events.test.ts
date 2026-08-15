import { describe, it, expect } from "vitest";
import {
  eventoPropuestaEnviada,
  eventoDocumentoAbierto,
  eventoPlanExplorado,
  eventoObservacionEscrita,
  eventoPropuestaAceptada,
  eventoCondicionExpirada,
  enviarEvento,
  type EventoBase,
} from "@/lib/events";
import type { SentVersion, Acceptance } from "@/lib/types";

const base: Omit<EventoBase, "evento"> = {
  cliente: "Activos por Colombia S.A.S.",
  propuestaId: "activos-1617a383",
  version: "v1",
  enlace: "https://ejemplo.com/p/tok",
  at: "2026-08-18T20:14:00.000Z",
};

function fakeSentVersion(): SentVersion {
  return {
    version: "v1",
    token: "tok",
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
      lineaCondicion: null,
    },
    clientDocument: {} as SentVersion["clientDocument"],
    estado: "aceptada",
    acceptance: null,
    lastOpenEmitAt: null,
    expiredEmitted: false,
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

describe("event builders — envelope + shape", () => {
  it("propuesta_enviada", () => {
    const e = eventoPropuestaEnviada(base, {
      plan: 2,
      precio_lista: 4080,
      condicion: {
        descuento_pct: 15,
        autor: "Ana",
        aprobador: "Beto",
        vigencia: "2027-01-01T12:00:00.000Z",
      },
    });
    expect(e).toMatchObject({
      evento: "propuesta_enviada",
      cliente: base.cliente,
      propuestaId: base.propuestaId,
      version: "v1",
      enlace: base.enlace,
      at: base.at,
      plan: 2,
      precio_lista: 4080,
      condicion: { descuento_pct: 15, autor: "Ana", aprobador: "Beto" },
    });
  });

  it("documento_abierto / plan_explorado / observacion_escrita", () => {
    expect(eventoDocumentoAbierto(base, { planVisto: 3, userAgent: "UA" })).toMatchObject({
      evento: "documento_abierto",
      planVisto: 3,
      userAgent: "UA",
    });
    expect(eventoPlanExplorado(base, { planVisto: 2 })).toMatchObject({
      evento: "plan_explorado",
      planVisto: 2,
    });
    const obs = eventoObservacionEscrita(base);
    expect(obs.evento).toBe("observacion_escrita");
    expect(Object.keys(obs).sort()).toEqual(
      ["at", "cliente", "enlace", "evento", "propuestaId", "version"].sort(),
    );
  });

  it("propuesta_aceptada (payload completo)", () => {
    const e = eventoPropuestaAceptada(base, fakeSentVersion(), fakeAcceptance());
    expect(e).toMatchObject({
      evento: "propuesta_aceptada",
      plan: 2,
      precio_final: 3468,
      moneda: "USD",
      condicion: { descuento_pct: 15, autor: "Ana Consultora" },
      acepta: { nombre: "Carla Decisora", correo: "carla@empresa.com" },
      observaciones: "Arrancamos en septiembre",
    });
  });

  it("condicion_expirada", () => {
    expect(eventoCondicionExpirada(base).evento).toBe("condicion_expirada");
  });
});

describe("enviarEvento — transporte", () => {
  const evento = eventoObservacionEscrita(base);

  it("éxito al primer intento", async () => {
    const r = await enviarEvento("https://hook", evento, {
      backoffMs: 1,
      fetchImpl: async () => ({ ok: true, status: 200 }),
    });
    expect(r).toEqual({ ok: true, intentos: 1, status: 200 });
  });

  it("reintenta y NO lanza cuando responde 500", async () => {
    let calls = 0;
    const r = await enviarEvento("https://hook", evento, {
      retries: 2,
      backoffMs: 1,
      fetchImpl: async () => {
        calls++;
        return { ok: false, status: 500 };
      },
    });
    expect(r.ok).toBe(false);
    expect(r.intentos).toBe(3);
    expect(calls).toBe(3);
  });

  it("no lanza cuando fetch arroja", async () => {
    const r = await enviarEvento("https://hook", evento, {
      retries: 1,
      backoffMs: 1,
      fetchImpl: async () => {
        throw new Error("down");
      },
    });
    expect(r.ok).toBe(false);
    expect(r.intentos).toBe(2);
  });
});
