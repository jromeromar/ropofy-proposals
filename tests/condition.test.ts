import { describe, it, expect } from "vitest";
import { bloquePrecioEfectivo, type CondicionInput } from "@/lib/condition";

const conDescuento: CondicionInput = {
  descuentoPct: 15,
  vigencia: "2026-09-01T12:00:00.000Z",
  precioLista: 4080,
  precioFinal: 3468,
  lineaCondicion: "Condición registrada por Ana · válida hasta …",
  moneda: "USD",
};

const sinDescuento: CondicionInput = {
  descuentoPct: null,
  vigencia: null,
  precioLista: 4080,
  precioFinal: 4080,
  lineaCondicion: null,
  moneda: "USD",
};

describe("bloquePrecioEfectivo", () => {
  it("antes de la vigencia → precio con descuento", () => {
    const b = bloquePrecioEfectivo(conDescuento, new Date("2026-08-20T00:00:00Z"));
    expect(b.tieneDescuento).toBe(true);
    expect(b.precioMostrar).toBe(3468);
    expect(b.expirada).toBe(false);
    expect(b.lineaCondicion).not.toBeNull();
  });

  it("después de la vigencia → precio de lista + bandera expirada", () => {
    const b = bloquePrecioEfectivo(conDescuento, new Date("2026-09-02T00:00:00Z"));
    expect(b.expirada).toBe(true);
    expect(b.tieneDescuento).toBe(false);
    expect(b.precioMostrar).toBe(4080);
    expect(b.lineaCondicion).toBeNull();
  });

  it("sin descuento → precio de lista, sin banderas ni mención", () => {
    const b = bloquePrecioEfectivo(sinDescuento, new Date("2026-08-20T00:00:00Z"));
    expect(b.tieneDescuento).toBe(false);
    expect(b.expirada).toBe(false);
    expect(b.precioMostrar).toBe(4080);
    expect(b.lineaCondicion).toBeNull();
  });
});
