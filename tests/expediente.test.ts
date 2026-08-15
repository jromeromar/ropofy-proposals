import { describe, it, expect } from "vitest";
import {
  resumenUserAgent,
  feedLineas,
  señalDecision,
  aperturasEnVentana,
} from "@/lib/expediente";
import type { SentVersion, TelemetryEvent } from "@/lib/types";

function version(events: TelemetryEvent[], estado: "enviada" | "aceptada" = "enviada"): SentVersion {
  return {
    version: "v1",
    token: "t".repeat(24),
    sentAt: "2026-08-10T10:00:00.000Z",
    plan: 2,
    autor: "Ana",
    aprobador: null,
    motivo: null,
    condicion: {
      descuentoPct: null,
      vigencia: null,
      autor: "Ana",
      aprobador: null,
      moneda: "USD",
      precioLista: 4080,
      precioFinal: 4080,
      preciosFinales: { "1": 2070, "2": 4080, "3": 6435 },
      lineaCondicion: null,
    },
    clientDocument: {} as SentVersion["clientDocument"],
    estado,
    acceptance: null,
    events,
    sourceHash: "h",
  };
}

const NOW = Date.parse("2026-08-14T00:00:00.000Z");

describe("resumenUserAgent", () => {
  it("resume navegador y sistema", () => {
    expect(
      resumenUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit Chrome/120 Safari/537",
      ),
    ).toBe("Chrome en Mac");
    expect(resumenUserAgent(null)).toBe("dispositivo desconocido");
  });
});

describe("feedLineas", () => {
  it("ordena de más nuevo a más viejo y traduce cada evento", () => {
    const v = version([
      { tipo: "abierto", at: "2026-08-12T21:14:00.000Z", userAgent: "Chrome/1" },
      { tipo: "plan_cambiado", at: "2026-08-12T21:15:00.000Z", planVisto: 3 },
      { tipo: "tiempo_en_pagina", at: "2026-08-12T21:20:00.000Z", seconds: 360 },
    ]);
    const lineas = feedLineas(v);
    expect(lineas[0].texto).toContain("6 min"); // newest (tiempo)
    expect(lineas.some((l) => l.texto.includes("Inteligente"))).toBe(true);
    expect(lineas[lineas.length - 1].texto).toContain("Abrió el documento");
  });
});

describe("señalDecision", () => {
  it("se muestra con ≥2 aperturas en 48h y sin aceptar", () => {
    const v = version([
      { tipo: "abierto", at: "2026-08-13T09:00:00.000Z", userAgent: null },
      { tipo: "abierto", at: "2026-08-13T20:00:00.000Z", userAgent: null },
    ]);
    const s = señalDecision(v, NOW);
    expect(s.n7).toBe(2);
    expect(s.mostrar).toBe(true);
  });

  it("no se muestra si ya fue aceptada", () => {
    const v = version(
      [
        { tipo: "abierto", at: "2026-08-13T09:00:00.000Z", userAgent: null },
        { tipo: "abierto", at: "2026-08-13T20:00:00.000Z", userAgent: null },
      ],
      "aceptada",
    );
    expect(señalDecision(v, NOW).mostrar).toBe(false);
  });

  it("cuenta solo aperturas dentro de la ventana", () => {
    const v = version([
      { tipo: "abierto", at: "2026-08-01T09:00:00.000Z", userAgent: null }, // >7d
      { tipo: "abierto", at: "2026-08-13T09:00:00.000Z", userAgent: null },
    ]);
    expect(aperturasEnVentana(v, NOW, 24 * 7)).toBe(1);
  });
});
