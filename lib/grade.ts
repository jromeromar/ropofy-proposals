/**
 * Grade math for the maturity section. Kept out of components so it can be
 * unit-tested in isolation and reused by the client document later.
 *
 * A module is scored 0-4. With 7 modules the maximum is 28 points, which we
 * normalise to a 0-100 score and map to a letter.
 */

import type { LetraNota } from "./types";

/** Minimal maturity shape the grade math needs (full Madurez is assignable). */
export interface MadurezLike {
  hoy: number;
  p: { "1": number; "2": number; "3": number };
}

/** Maximum level per maturity module. */
export const MAX_POR_MODULO = 4;
/** Expected number of maturity modules. */
export const MODULOS = 7;
/** Normalisation divisor: 7 modules × 4 levels. */
export const DIVISOR = MODULOS * MAX_POR_MODULO; // 28

export type PlanNumero = 1 | 2 | 3;

/** Map a 0-100 score to its letter grade. */
export function gradeFromPuntos(puntos: number): LetraNota {
  if (puntos >= 85) return "A";
  if (puntos >= 70) return "B";
  if (puntos >= 55) return "C";
  if (puntos >= 40) return "D";
  if (puntos >= 25) return "E";
  return "F";
}

/** Sum the projected level of every module for a given plan. */
export function sumForPlan(madurez: MadurezLike[], plan: PlanNumero): number {
  const key = String(plan) as "1" | "2" | "3";
  return madurez.reduce((acc, m) => acc + (m.p?.[key] ?? 0), 0);
}

/** 0-100 score projected for a plan. */
export function puntosForPlan(madurez: MadurezLike[], plan: PlanNumero): number {
  return Math.round((sumForPlan(madurez, plan) / DIVISOR) * 100);
}

/** 0-100 score of the current ("hoy") state. */
export function puntosHoy(madurez: MadurezLike[]): number {
  const sum = madurez.reduce((acc, m) => acc + (m.hoy ?? 0), 0);
  return Math.round((sum / DIVISOR) * 100);
}

export interface GradeResult {
  puntos: number;
  letra: LetraNota;
}

/** Score + letter projected for a plan. */
export function gradeForPlan(madurez: MadurezLike[], plan: PlanNumero): GradeResult {
  const puntos = puntosForPlan(madurez, plan);
  return { puntos, letra: gradeFromPuntos(puntos) };
}

/**
 * Today's note (score + letter) derived from `madurez`. Used only as a FALLBACK
 * when the pipeline omits the top-level `nota` — it applies the same
 * sum-over-28 normalisation the pipeline uses (verified to match), and the same
 * one the renderer already uses for the projected grade. Prefer the contract's
 * `nota` when present.
 */
export function notaHoy(madurez: MadurezLike[]): GradeResult {
  const puntos = puntosHoy(madurez);
  return { puntos, letra: gradeFromPuntos(puntos) };
}
