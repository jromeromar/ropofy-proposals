import { describe, it, expect } from "vitest";
import { isLocked, esCortesia, planUnlockRank } from "@/lib/mapLayout";

describe("cortesía — gating de plan", () => {
  it("una función de un tier superior está bloqueada sin cortesía", () => {
    // "inteligente" (rank 3) with the plan on "avanzado" (2).
    expect(isLocked("inteligente", 2)).toBe(true);
    expect(esCortesia("inteligente", 2)).toBe(false);
  });

  it("con cortesía al plan seleccionado, se desbloquea y cuenta como cortesía", () => {
    expect(isLocked("inteligente", 2, "avanzado")).toBe(false);
    expect(esCortesia("inteligente", 2, "avanzado")).toBe(true);
    expect(planUnlockRank("inteligente", "avanzado")).toBe(2);
  });

  it("una función de su propio tier no es cortesía aunque tenga el campo", () => {
    // Natural plan already at/below the selected plan → not a courtesy.
    expect(esCortesia("avanzado", 2, "avanzado")).toBe(false);
    expect(isLocked("avanzado", 2)).toBe(false);
  });

  it("la cortesía no alcanza si el plan seleccionado sigue por debajo", () => {
    // Gifted into "avanzado" (2) but presenting "fundamental" (1): still locked.
    expect(isLocked("inteligente", 1, "avanzado")).toBe(true);
    expect(esCortesia("inteligente", 1, "avanzado")).toBe(false);
  });
});
