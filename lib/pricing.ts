/**
 * Price computation. Kept pure and unit-tested so the discount arithmetic is
 * never re-derived inline in a component (where it could drift or leak).
 */

/**
 * Final price after an optional percentage discount, rounded to a clean
 * integer. A null/zero/absent discount returns the list price unchanged.
 *
 *   precioFinal(2070, 15) -> 1760   // round(2070 × 0.85)
 *   precioFinal(2070, null) -> 2070
 */
export function precioFinal(
  precioLista: number,
  descuentoPct: number | null | undefined,
): number {
  if (descuentoPct == null || descuentoPct === 0) {
    return Math.round(precioLista);
  }
  return Math.round(precioLista * (1 - descuentoPct / 100));
}

/** Apply a discount to each plan's list price, returning clean integers. */
export function preciosFinalesPorPlan(
  precioPorPlan: { "1": number; "2": number; "3": number },
  descuentoPct: number | null | undefined,
): { "1": number; "2": number; "3": number } {
  return {
    "1": precioFinal(precioPorPlan["1"], descuentoPct),
    "2": precioFinal(precioPorPlan["2"], descuentoPct),
    "3": precioFinal(precioPorPlan["3"], descuentoPct),
  };
}

/** True when the discount exceeds the policy limit and needs approval. */
export function requiereAprobacion(
  descuentoPct: number | null | undefined,
  limite: number,
): boolean {
  if (descuentoPct == null) return false;
  return descuentoPct > limite * 100;
}
