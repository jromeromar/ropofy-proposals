import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import PresentacionView from "@/app/consultor/[id]/presentacion/PresentacionView";
import { toPresentacionVM } from "@/lib/presentacionVM";
import { forbiddenContentCheck, visibleText } from "@/lib/rules";
import type { Proposal } from "@/lib/types";

function loadFixture(): Proposal {
  const raw = readFileSync(
    path.join(process.cwd(), "fixtures", "propuesta-activos-v1.json"),
    "utf8",
  );
  return JSON.parse(raw) as Proposal;
}

function render(plan: 1 | 2 | 3): string {
  const vm = toPresentacionVM(loadFixture());
  return renderToStaticMarkup(
    React.createElement(PresentacionView, {
      id: "empresa-de-ejemplo-s-a-e3e192b5",
      vm,
      initialPlan: plan,
    }),
  );
}

describe("presentación — contenido prohibido", () => {
  it("no filtra nada prohibido en el HTML de ningún plan", () => {
    for (const plan of [1, 2, 3] as const) {
      const html = render(plan);
      const result = forbiddenContentCheck(html);
      expect(result.violations).toEqual([]);
      expect(result.ok).toBe(true);
    }
  });

  it("el view model (frontera cliente) no lleva ids, multiplicador ni internos", () => {
    // The serialized VM is exactly what crosses to the client and is embedded
    // in the hydration payload, so scanning it guards the real boundary.
    const vm = toPresentacionVM(loadFixture());
    const serialized = JSON.stringify(vm);
    expect(forbiddenContentCheck(serialized).ok).toBe(true);
    expect(serialized).not.toContain("gestion-chatbot-precalificacion");
    expect(serialized).not.toContain("multiplicador");
    expect(serialized).not.toContain("chatbot_ia");
  });
});

describe("presentación — contenido esperado", () => {
  it("renderiza la fuga dominante y los badges de integración", () => {
    const text = visibleText(render(2));
    expect(text).toContain("El volumen desbordó al equipo"); // fuga dominante
    expect(text).toContain("Incluido");
    expect(text).toContain("Consumo variable");
    expect(text).toContain("Requiere su licencia");
    expect(text).toContain("Se cotiza aparte");
    expect(text).toContain("Su asistente de IA — uno solo, con habilidades");
  });

  it("E18: no dibuja «lo que no se dibuja» (no_aplican) en el lienzo", () => {
    // no_aplican moved off the client-facing canvas to the consultant's
    // internal Checklist drawer; without the checklist prop it appears nowhere.
    const text = visibleText(render(2));
    expect(text).not.toContain("Pago en línea del anticipo");
    expect(text).not.toContain("No se dibujan en su plano");
  });

  it("C7: agrupa las fugas en bloques (fugas, cegueras, restricciones)", () => {
    const text = visibleText(render(2));
    expect(text).toContain("Las cegueras");
    expect(text).toContain("Las restricciones");
  });

  it("aplica el gating por plan: en Fundamental lo superior queda bloqueado", () => {
    const text1 = visibleText(render(1));
    expect(text1).toContain("🔒 Avanzado");
    expect(text1).toContain("🔒 Inteligente");
  });
});
