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
    expect(serialized).not.toContain("comp-ia-precalifica");
    expect(serialized).not.toContain("multiplicador");
    expect(serialized).not.toContain("chatbot_ia");
  });
});

describe("presentación — contenido esperado", () => {
  it("renderiza la fuga dominante, badges de integración y no_aplican", () => {
    const text = visibleText(render(2));
    expect(text).toContain("El volumen supera la capacidad de respuesta");
    expect(text).toContain("Incluido");
    expect(text).toContain("Consumo variable");
    expect(text).toContain("Requiere su licencia");
    expect(text).toContain("Se cotiza aparte");
    expect(text).toContain("Facturación electrónica"); // no_aplican
    expect(text).toContain("Su asistente de IA — uno solo, con habilidades");
  });

  it("aplica el gating por plan: en Fundamental lo superior queda bloqueado", () => {
    const text1 = visibleText(render(1));
    expect(text1).toContain("🔒 Avanzado");
    expect(text1).toContain("🔒 Inteligente");
  });
});
