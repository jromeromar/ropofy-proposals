import { describe, it, expect } from "vitest";
import { estadoDe } from "@/lib/estadoPropuesta";
import type { SentVersion } from "@/lib/types";

function sent(over: Partial<SentVersion> = {}): SentVersion {
  return {
    version: "v1",
    token: "t",
    sentAt: "2026-08-01T00:00:00.000Z",
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
      precioLista: 1000,
      precioFinal: 1000,
      preciosFinales: { "1": 1, "2": 2, "3": 3 },
      lineaCondicion: null,
    },
    clientDocument: {} as SentVersion["clientDocument"],
    estado: "enviada",
    acceptance: null,
    lastOpenEmitAt: null,
    expiredEmitted: false,
    ...over,
  };
}

describe("estadoDe", () => {
  const now = new Date("2026-08-20T00:00:00.000Z");

  it("borrador cuando no hay versiones enviadas", () => {
    expect(estadoDe({ sentVersions: [] }, now)).toBe("borrador");
  });

  it("enviada cuando hay una versión viva sin aceptar", () => {
    expect(estadoDe({ sentVersions: [sent()] }, now)).toBe("enviada");
  });

  it("aceptada cuando alguna versión fue aceptada", () => {
    const v = sent({ estado: "aceptada" });
    expect(estadoDe({ sentVersions: [v] }, now)).toBe("aceptada");
  });

  it("vencida cuando la vigencia (plazo) ya pasó y no aceptó", () => {
    const v = sent({
      condicion: {
        ...sent().condicion,
        descuentoPct: 15,
        vigencia: "2026-01-01T00:00:00.000Z",
      },
    });
    expect(estadoDe({ sentVersions: [v] }, now)).toBe("vencida");
  });

  it("aceptada gana sobre vencida", () => {
    const vieja = sent({
      condicion: { ...sent().condicion, descuentoPct: 15, vigencia: "2026-01-01T00:00:00.000Z" },
    });
    const aceptada = sent({ version: "v2", estado: "aceptada" });
    expect(estadoDe({ sentVersions: [vieja, aceptada] }, now)).toBe("aceptada");
  });

  it("rechazada por override manual (si no hay aceptación)", () => {
    expect(
      estadoDe({ sentVersions: [sent()], estadoManual: "rechazada" }, now),
    ).toBe("rechazada");
  });

  it("aceptada gana sobre el override de rechazada", () => {
    const aceptada = sent({ estado: "aceptada" });
    expect(
      estadoDe({ sentVersions: [aceptada], estadoManual: "rechazada" }, now),
    ).toBe("aceptada");
  });
});
