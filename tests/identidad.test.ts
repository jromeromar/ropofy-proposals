import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { razonSocialDe, marcaDefaultDe, marcaEfectiva } from "@/lib/identidad";
import { construirCondicion, buildClientDocument } from "@/lib/clientDocument";
import { toClientDocVM } from "@/lib/clientDocVM";
import type { Proposal } from "@/lib/types";

function fixture(): Proposal {
  return JSON.parse(
    readFileSync(
      path.join(process.cwd(), "fixtures", "propuesta-activos-v1.json"),
      "utf8",
    ),
  ) as Proposal;
}

describe("identidad — razón social vs. marca", () => {
  it("estilo nuevo: razon_social separado, cliente ES la marca", () => {
    const d = { cliente: "Gosen casa de Comidas", razon_social: "BIFTEKI S.A.S." } as unknown as Proposal;
    expect(razonSocialDe(d)).toBe("BIFTEKI S.A.S.");
    expect(marcaDefaultDe(d)).toBe("Gosen casa de Comidas");
    expect(marcaEfectiva(d, null)).toBe("Gosen casa de Comidas");
    // Manual marca wins.
    expect(marcaEfectiva(d, "Otra marca")).toBe("Otra marca");
  });

  it("estilo viejo: solo cliente (razón social), sin marca por defecto", () => {
    const d = { cliente: "Activos por Colombia S.A.S." } as unknown as Proposal;
    expect(razonSocialDe(d)).toBe("Activos por Colombia S.A.S.");
    expect(marcaDefaultDe(d)).toBeNull();
    expect(marcaEfectiva(d, null)).toBeNull();
    expect(marcaEfectiva(d, "Marca X")).toBe("Marca X");
  });

  it("el snapshot pone la razón social en cliente y la marca aparte", () => {
    const data = { ...fixture(), cliente: "Gosen casa de Comidas", razon_social: "BIFTEKI S.A.S." } as Proposal;
    const c = construirCondicion(data, 2, {
      descuentoPct: null,
      vigencia: null,
      autor: "Ana",
      aprobador: null,
    });
    const vm = toClientDocVM(buildClientDocument(data, c, 2), "2026-08-21T00:00:00.000Z");
    expect(vm.cliente).toBe("BIFTEKI S.A.S.");
    expect(vm.marca).toBe("Gosen casa de Comidas");
  });
});
