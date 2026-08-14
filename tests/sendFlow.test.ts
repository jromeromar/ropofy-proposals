import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { storage } from "@/lib/storage";
import { construirCondicion, buildClientDocument } from "@/lib/clientDocument";
import { forbiddenContentCheck, visibleText } from "@/lib/rules";
import PlaceholderDoc from "@/app/p/[token]/PlaceholderDoc";
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
      "Empresa de Ejemplo S.A.",
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

describe("placeholder /p — render", () => {
  it("con descuento muestra lista tachada, precio final y línea con autor", async () => {
    const data = loadFixture();
    const condicion = construirCondicion(data, 2, {
      descuentoPct: 15,
      vigencia: "2026-09-01T12:00:00.000Z",
      autor: "Ana Consultora",
      aprobador: null,
    });
    const doc = buildClientDocument(data, condicion, 2);
    const html = renderToStaticMarkup(
      React.createElement(PlaceholderDoc, {
        clientDocument: doc,
        now: new Date("2026-08-20T00:00:00Z"),
      }),
    );
    const text = visibleText(html);
    expect(forbiddenContentCheck(html).ok).toBe(true);
    expect(text).toContain("$4.080 USD"); // struck list
    expect(text).toContain("$3.468 USD"); // final
    expect(text).toContain("Condición registrada por Ana Consultora");
  });

  it("sin descuento muestra solo el precio de lista, cero menciones de descuento", async () => {
    const data = loadFixture();
    const condicion = construirCondicion(data, 2, {
      descuentoPct: null,
      vigencia: null,
      autor: "Ana Consultora",
      aprobador: null,
    });
    const doc = buildClientDocument(data, condicion, 2);
    const html = renderToStaticMarkup(
      React.createElement(PlaceholderDoc, { clientDocument: doc }),
    );
    const text = visibleText(html);
    expect(forbiddenContentCheck(html).ok).toBe(true);
    expect(text).toContain("$4.080 USD");
    expect(text.toLowerCase()).not.toContain("descuento");
    expect(text.toLowerCase()).not.toContain("condición registrada");
    expect(text).not.toContain("$3.468"); // no discounted price anywhere
  });
});
