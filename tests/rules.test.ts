import { describe, it, expect } from "vitest";
import { forbiddenContentCheck, formatPrice } from "@/lib/rules";

describe("forbiddenContentCheck", () => {
  it("atrapa un id interno de componente", () => {
    const html = "<p>Servicio de gestion-base-contactos incluido</p>";
    const result = forbiddenContentCheck(html);
    expect(result.ok).toBe(false);
    expect(
      result.violations.some((v) => v.includes("gestion-base-contactos")),
    ).toBe(true);
  });

  it("atrapa palabras internas prohibidas", () => {
    expect(forbiddenContentCheck("total de esfuerzo estimado").ok).toBe(false);
    expect(forbiddenContentCheck("12 jornadas de trabajo").ok).toBe(false);
    expect(forbiddenContentCheck("multiplicador de complejidad").ok).toBe(false);
  });

  it("atrapa la fórmula de precio", () => {
    expect(forbiddenContentCheck("precio = base × factor").ok).toBe(false);
  });

  it("acepta contenido limpio orientado al cliente", () => {
    const html =
      "<h1>Cada solicitud llega a un responsable</h1><p>Precio: $2.070 USD</p>";
    const result = forbiddenContentCheck(html);
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
  });
});

describe("formatPrice", () => {
  it("formatea enteros limpios en locale es-CO", () => {
    expect(formatPrice(2070, "USD")).toBe("$2.070 USD");
    expect(formatPrice(6435, "USD")).toBe("$6.435 USD");
  });

  it("redondea a entero (sin decimales visibles)", () => {
    expect(formatPrice(4080.5, "USD")).toBe("$4.081 USD");
  });
});
