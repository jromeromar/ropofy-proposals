import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { storage } from "@/lib/storage";
import { guardarContenido } from "@/app/consultor/[id]/editar/actions";
import { guardarInline } from "@/app/consultor/[id]/presentacion/actions";
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

describe("editar inline (presentación) — ediciones por índice posicional", () => {
  it("resuelve el índice de componente a su clave real y persiste", async () => {
    const stored = await storage.saveProposal(loadFixture());
    const keys = Object.keys(stored.data.componentes);

    const res = await guardarInline({
      id: stored.id,
      ediciones: [
        { campo: "titular", valor: "Titular inline" },
        { campo: "cliente", valor: "Bifteki S.A.S." },
        { campo: "marca", valor: "Gosen Casa de Comidas" },
        { campo: "compNombre", idx: 0, valor: "Primer componente renombrado" },
      ],
    });
    expect(res.ok).toBe(true);

    const after = await storage.getProposal(stored.id);
    expect(after?.data.titular).toBe("Titular inline");
    expect(after?.cliente).toBe("Bifteki S.A.S.");
    expect(after?.marca).toBe("Gosen Casa de Comidas");
    expect(after?.data.componentes[keys[0]].nombre_cliente).toBe(
      "Primer componente renombrado",
    );
    expect(after?.version).toBe("v1");
  });

  it("incluye/excluye una funcionalidad por índice (drawer de la presentación)", async () => {
    const stored = await storage.saveProposal(loadFixture());
    const keys = Object.keys(stored.data.componentes);

    const off = await guardarInline({
      id: stored.id,
      ediciones: [{ campo: "compIncluido", idx: 0, incluido: false }],
    });
    expect(off.ok).toBe(true);
    let after = await storage.getProposal(stored.id);
    expect(after?.data.componentes[keys[0]].incluido).toBe(false);
    // Still present in the data (recoverable), version unchanged.
    expect(Object.keys(after!.data.componentes).length).toBe(keys.length);
    expect(after?.version).toBe("v1");

    const on = await guardarInline({
      id: stored.id,
      ediciones: [{ campo: "compIncluido", idx: 0, incluido: true }],
    });
    expect(on.ok).toBe(true);
    after = await storage.getProposal(stored.id);
    expect(after?.data.componentes[keys[0]].incluido).toBe(true);
  });

  it("baja el plan de una función para ampliar el alcance de un plan inferior", async () => {
    const stored = await storage.saveProposal(loadFixture());
    const keys = Object.keys(stored.data.componentes);
    // Find an "inteligente" feature and give it to "avanzado".
    const idx = keys.findIndex(
      (k) => stored.data.componentes[k].plan === "inteligente",
    );
    expect(idx).toBeGreaterThanOrEqual(0);

    const res = await guardarInline({
      id: stored.id,
      ediciones: [{ campo: "compPlan", idx, plan: "avanzado" }],
    });
    expect(res.ok).toBe(true);

    const after = await storage.getProposal(stored.id);
    expect(after?.data.componentes[keys[idx]].plan).toBe("avanzado");
    expect(after?.version).toBe("v1");
  });

  it("otorga y quita una cortesía por índice (conserva el plan natural)", async () => {
    const stored = await storage.saveProposal(loadFixture());
    const keys = Object.keys(stored.data.componentes);
    const idx = keys.findIndex(
      (k) => stored.data.componentes[k].plan === "inteligente",
    );
    const planNatural = stored.data.componentes[keys[idx]].plan;

    // Grant courtesy into "avanzado".
    const grant = await guardarInline({
      id: stored.id,
      ediciones: [{ campo: "compCortesia", idx, cortesiaPlan: "avanzado" }],
    });
    expect(grant.ok).toBe(true);
    let after = await storage.getProposal(stored.id);
    expect(after?.data.componentes[keys[idx]].cortesiaPlan).toBe("avanzado");
    // Natural plan is preserved.
    expect(after?.data.componentes[keys[idx]].plan).toBe(planNatural);

    // Remove it.
    const remove = await guardarInline({
      id: stored.id,
      ediciones: [{ campo: "compCortesia", idx, cortesiaPlan: null }],
    });
    expect(remove.ok).toBe(true);
    after = await storage.getProposal(stored.id);
    expect(after?.data.componentes[keys[idx]].cortesiaPlan).toBeUndefined();
  });

  it("edita una fuga por su índice y valida (contrato)", async () => {
    const stored = await storage.saveProposal(loadFixture());
    const idx = stored.data.fugas.findIndex((f) => f.dominante === true);
    expect(idx).toBeGreaterThanOrEqual(0);

    const res = await guardarInline({
      id: stored.id,
      ediciones: [
        { campo: "fugaTitulo", idx, valor: "Fuga dominante corregida" },
        { campo: "fugaValor", idx, valor: "9.999" },
      ],
    });
    expect(res.ok).toBe(true);

    const after = await storage.getProposal(stored.id);
    expect(after?.data.fugas[idx].titulo).toBe("Fuga dominante corregida");
    expect(String(after?.data.fugas[idx].cuantificacion.valor)).toBe("9.999");

    // Contract still enforced: emptying the title is rejected.
    const bad = await guardarInline({
      id: stored.id,
      ediciones: [{ campo: "fugaTitulo", idx, valor: "   " }],
    });
    expect(bad.ok).toBe(false);
  });
});
