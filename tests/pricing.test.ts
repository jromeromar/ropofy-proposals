import { describe, it, expect } from "vitest";
import {
  precioFinal,
  preciosFinalesPorPlan,
  requiereAprobacion,
} from "@/lib/pricing";

describe("precioFinal", () => {
  it("aplica el descuento y redondea a entero", () => {
    expect(precioFinal(2070, 15)).toBe(1760); // round(2070 * 0.85) = 1759.5 -> 1760
    expect(precioFinal(4080, 15)).toBe(3468);
    expect(precioFinal(6435, 15)).toBe(5470); // round(5469.75)
  });

  it("sin descuento devuelve el precio de lista", () => {
    expect(precioFinal(2070, null)).toBe(2070);
    expect(precioFinal(2070, 0)).toBe(2070);
    expect(precioFinal(2070, undefined)).toBe(2070);
  });
});

describe("preciosFinalesPorPlan", () => {
  it("aplica el descuento a los tres planes", () => {
    const r = preciosFinalesPorPlan({ "1": 2070, "2": 4080, "3": 6435 }, 15);
    expect(r).toEqual({ "1": 1760, "2": 3468, "3": 5470 });
  });
});

describe("requiereAprobacion", () => {
  it("marca aprobación solo por encima del límite", () => {
    expect(requiereAprobacion(35, 0.3)).toBe(true);
    expect(requiereAprobacion(30, 0.3)).toBe(false); // 30 no es > 30
    expect(requiereAprobacion(15, 0.3)).toBe(false);
    expect(requiereAprobacion(null, 0.3)).toBe(false);
  });
});
