import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { storage } from "@/lib/storage";
import { construirCondicion, buildClientDocument } from "@/lib/clientDocument";
import type { Proposal } from "@/lib/types";

function loadFixture(): Proposal {
  const raw = readFileSync(
    path.join(process.cwd(), "fixtures", "propuesta-activos-v1.json"),
    "utf8",
  );
  return JSON.parse(raw) as Proposal;
}

async function send(
  id: string,
  plan: 1 | 2 | 3,
  descuentoPct: number | null,
  vigencia: string | null,
  autor: string,
  aprobador: string | null,
) {
  const stored = await storage.getProposal(id);
  const condicion = construirCondicion(stored!.data, plan, {
    descuentoPct,
    vigencia,
    autor,
    aprobador,
  });
  const clientDocument = buildClientDocument(stored!.data, condicion, plan);
  return storage.saveSentVersion(id, {
    plan,
    autor,
    aprobador,
    motivo: "nota interna",
    condicion,
    clientDocument,
  });
}

describe("flujo de envío — versionado inmutable y tokens", () => {
  it("dos envíos → dos versiones, dos tokens, ambos independientes", async () => {
    const stored = await storage.saveProposal(loadFixture());

    const v1 = await send(stored.id, 2, 15, "2026-09-01T12:00:00.000Z", "Ana", null);
    const v2 = await send(stored.id, 2, null, null, "Ana", null);

    expect(v1.version).toBe("v1");
    expect(v2.version).toBe("v2");
    expect(v1.token).not.toBe(v2.token);
    expect(v1.token.length).toBeGreaterThanOrEqual(24);

    const r1 = await storage.getByToken(v1.token);
    const r2 = await storage.getByToken(v2.token);
    expect(r1?.sentVersion.version).toBe("v1");
    expect(r2?.sentVersion.version).toBe("v2");
    expect(r1?.sentVersion.condicion.descuentoPct).toBe(15);
    expect(r2?.sentVersion.condicion.descuentoPct).toBeNull();
  });

  it("editar el borrador después de enviar no cambia lo que sirve el token", async () => {
    const stored = await storage.saveProposal(loadFixture());
    const v1 = await send(stored.id, 1, 10, "2026-09-01T12:00:00.000Z", "Ana", null);

    // Mutate the working proposal data after sending.
    const live = await storage.getProposal(stored.id);
    live!.data.cliente = "OTRO CLIENTE MODIFICADO";
    live!.data.condicion_comercial.precio_por_plan["1"] = 999999;

    const resolved = await storage.getByToken(v1.token);
    expect(resolved?.sentVersion.clientDocument.cliente).toBe(
      "Activos por Colombia S.A.S.",
    );
    expect(
      resolved?.sentVersion.condicion.precioLista,
    ).not.toBe(999999);
  });

  it("aprobación por umbral: descuento alto guarda ambos nombres", async () => {
    const stored = await storage.saveProposal(loadFixture());
    const v = await send(
      stored.id,
      2,
      35,
      "2026-09-01T12:00:00.000Z",
      "Ana Consultora",
      "Beto Aprobador",
    );
    expect(v.autor).toBe("Ana Consultora");
    expect(v.aprobador).toBe("Beto Aprobador");
  });
});

describe("aceptación — rechazo server-side de segundo accept", () => {
  it("una versión aceptada rechaza un segundo accept", async () => {
    const stored = await storage.saveProposal(loadFixture());
    const v = await send(stored.id, 2, 15, "2027-01-01T12:00:00.000Z", "Ana", null);

    const first = await storage.aceptarVersion(v.token, {
      at: "2026-08-20T10:00:00.000Z",
      nombre: "Cliente Uno",
      correo: "cliente@ejemplo.com",
      observaciones: "todo bien",
      plan: 2,
      precioEfectivo: 3468,
      moneda: "USD",
      ip: "1.2.3.4",
      userAgent: "test",
    });
    expect(first.ok).toBe(true);

    const second = await storage.aceptarVersion(v.token, {
      at: "2026-08-20T11:00:00.000Z",
      nombre: "Cliente Dos",
      correo: "otro@ejemplo.com",
      observaciones: null,
      plan: 2,
      precioEfectivo: 3468,
      moneda: "USD",
      ip: "1.2.3.4",
      userAgent: "test",
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe("already_accepted");

    const resolved = await storage.getByToken(v.token);
    expect(resolved?.sentVersion.estado).toBe("aceptada");
    expect(resolved?.sentVersion.acceptance?.nombre).toBe("Cliente Uno");
  });

  it("aceptar una versión no invalida los otros tokens", async () => {
    const stored = await storage.saveProposal(loadFixture());
    const a = await send(stored.id, 2, 15, "2027-01-01T12:00:00.000Z", "Ana", null);
    const b = await send(stored.id, 1, null, null, "Ana", null);
    await storage.aceptarVersion(a.token, {
      at: "2026-08-20T10:00:00.000Z",
      nombre: "Cliente",
      correo: "c@ejemplo.com",
      observaciones: null,
      plan: 2,
      precioEfectivo: 3468,
      moneda: "USD",
      ip: null,
      userAgent: null,
    });
    const rb = await storage.getByToken(b.token);
    expect(rb?.sentVersion.estado).toBe("enviada");
  });
});
