import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  gradeFromPuntos,
  puntosForPlan,
  gradeForPlan,
} from "@/lib/grade";
import type { Proposal } from "@/lib/types";

function loadFixture(): Proposal {
  const raw = readFileSync(
    path.join(process.cwd(), "fixtures", "propuesta-activos-v1.json"),
    "utf8",
  );
  return JSON.parse(raw) as Proposal;
}

describe("gradeFromPuntos", () => {
  it("mapea los umbrales de letra", () => {
    expect(gradeFromPuntos(100)).toBe("A");
    expect(gradeFromPuntos(85)).toBe("A");
    expect(gradeFromPuntos(84)).toBe("B");
    expect(gradeFromPuntos(70)).toBe("B");
    expect(gradeFromPuntos(55)).toBe("C");
    expect(gradeFromPuntos(40)).toBe("D");
    expect(gradeFromPuntos(25)).toBe("E");
    expect(gradeFromPuntos(24)).toBe("F");
    expect(gradeFromPuntos(0)).toBe("F");
  });
});

describe("puntos y grado por plan (fixture Activos)", () => {
  const madurez = loadFixture().madurez;

  it("plan 1 (Fundamental) → 61 / C", () => {
    expect(puntosForPlan(madurez, 1)).toBe(61);
    expect(gradeForPlan(madurez, 1).letra).toBe("C");
  });

  it("plan 2 (Avanzado) → 79 / B", () => {
    expect(puntosForPlan(madurez, 2)).toBe(79);
    expect(gradeForPlan(madurez, 2).letra).toBe("B");
  });

  it("plan 3 (Inteligente) → 93 / A", () => {
    expect(puntosForPlan(madurez, 3)).toBe(93);
    expect(gradeForPlan(madurez, 3).letra).toBe("A");
  });
});
