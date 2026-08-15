/**
 * Effective-price resolution for a frozen client document.
 *
 * A sent version stores a fixed commercial condition. When the client opens
 * it, the condition may have expired: this module decides, at read time, what
 * the client actually sees. Pure and unit-tested; `now` is injected so tests
 * are deterministic and there is no hidden clock.
 */

export interface CondicionInput {
  /** null = no discount ever existed (client sees list price, no mention). */
  descuentoPct: number | null;
  /** ISO timestamp; null when there is no discount. */
  vigencia: string | null;
  precioLista: number;
  precioFinal: number;
  lineaCondicion: string | null;
  moneda: string;
}

export interface PrecioBlock {
  moneda: string;
  precioLista: number;
  /** The price to show prominently. */
  precioMostrar: number;
  /** True only when a live discount applies (show struck list + condition line). */
  tieneDescuento: boolean;
  lineaCondicion: string | null;
  /** True when a discount existed but its vigencia has passed. */
  expirada: boolean;
}

/**
 * Resolve the price block a client should see right now.
 * - no discount        → list price, no flags, no discount mention
 * - discount, in force  → final price, struck list, condition line
 * - discount, expired   → list price, expired flag (no discount shown)
 */
export function bloquePrecioEfectivo(
  c: CondicionInput,
  now: Date,
): PrecioBlock {
  const base: PrecioBlock = {
    moneda: c.moneda,
    precioLista: c.precioLista,
    precioMostrar: c.precioLista,
    tieneDescuento: false,
    lineaCondicion: null,
    expirada: false,
  };

  if (c.descuentoPct == null) return base;

  const vig = c.vigencia ? new Date(c.vigencia) : null;
  const expirada = vig ? now.getTime() >= vig.getTime() : false;
  if (expirada) return { ...base, expirada: true };

  return {
    ...base,
    precioMostrar: c.precioFinal,
    tieneDescuento: true,
    lineaCondicion: c.lineaCondicion,
  };
}
