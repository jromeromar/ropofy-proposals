import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { storage } from "@/lib/storage";
import { guardarContenido } from "@/app/consultor/[id]/editar/actions";
import type { Proposal } from "@/lib/types";

function loadFixture(): Proposal {
  return JSON.parse(
    readFileSync(
      path.join(process.cwd(), "fixtures", "propuesta-activos-v1.json"),
      "utf8",
    ),
  ) as Proposal;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

describe("editar contenido — corrección en vivo", () => {
  it("actualiza el borrador en el sitio, sin subir la versión ni tocar envíos", async () => {
    const stored = await storage.saveProposal(loadFixture());
    expect(stored.version).toBe("v1");

    const edited = clone(stored.data);
    edited.titular = "Titular corregido en vivo";
    edited.cliente = "Bifteki S.A.S.";

    const res = await guardarContenido({
      id: stored.id,
      data: edited,
      marca: "Gosen Casa de Comidas",
    });
    expect(res.ok).toBe(true);

    const after = await storage.getProposal(stored.id);
    expect(after?.data.titular).toBe("Titular corregido en vivo");
    expect(after?.cliente).toBe("Bifteki S.A.S.");
    expect(after?.marca).toBe("Gosen Casa de Comidas");
    // In place: same version tag, no new sent versions.
    expect(after?.version).toBe("v1");
    expect(after?.sentVersions.length).toBe(0);
  });

  it("rechaza (contrato) vaciar un campo obligatorio", async () => {
    const stored = await storage.saveProposal(loadFixture());
    const edited = clone(stored.data);
    edited.titular = "   "; // empty after trim

    const res = await guardarContenido({
      id: stored.id,
      data: edited,
      marca: null,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors.some((e) => e.includes("titular"))).toBe(true);
    }
    // The stored draft is untouched when validation fails.
    const after = await storage.getProposal(stored.id);
    expect(after?.data.titular).toBe(stored.data.titular);
  });
});
