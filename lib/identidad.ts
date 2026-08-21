/**
 * Client identity resolution.
 *
 * The pipeline may send the identity in two shapes:
 *  - New: `cliente` is the BRAND (e.g. "Gosen casa de Comidas") and a separate
 *    `razon_social` carries the legal name ("BIFTEKI S.A.S.").
 *  - Old: only `cliente`, which is the legal name (no `razon_social`).
 *
 * These helpers normalise both so the renderer always knows the legal name and
 * a sensible default brand, and the consultant's manual `marca` still wins.
 */

import type { Proposal } from "./types";

function razonSocialRaw(data: Proposal): string | null {
  const rs = (data as { razon_social?: unknown }).razon_social;
  return typeof rs === "string" && rs.trim() !== "" ? rs.trim() : null;
}

/** The legal name: `razon_social` when present, else `cliente`. */
export function razonSocialDe(data: Proposal): string {
  return razonSocialRaw(data) ?? data.cliente;
}

/**
 * The brand the pipeline implies: when a separate `razon_social` exists,
 * `cliente` IS the brand; otherwise there is no pipeline brand.
 */
export function marcaDefaultDe(data: Proposal): string | null {
  return razonSocialRaw(data) ? data.cliente : null;
}

/** Effective brand: the consultant's manual marca wins over the default. */
export function marcaEfectiva(
  data: Proposal,
  marcaManual?: string | null,
): string | null {
  const m = marcaManual?.trim();
  return m ? m : marcaDefaultDe(data);
}
