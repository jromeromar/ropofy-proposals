/**
 * Derived proposal status for the consultant list — the one place this app
 * keeps light "estado" control. It is DERIVED from the immutable sent versions
 * and acceptance, never a free-floating field:
 *   borrador  → nothing sent yet
 *   aceptada  → some sent version was accepted
 *   expirada  → the latest sent version carried a discount whose vigencia passed
 *   enviada   → sent and still live (pending the client's decision)
 */

import type { StoredProposal, SentVersion } from "./types";

export type EstadoPropuesta = "borrador" | "enviada" | "aceptada" | "expirada";

export const ESTADO_LABEL: Record<EstadoPropuesta, string> = {
  borrador: "Borrador",
  enviada: "Enviada",
  aceptada: "Aceptada",
  expirada: "Expirada",
};

export function estadoDe(
  p: Pick<StoredProposal, "sentVersions">,
  now: Date = new Date(),
): EstadoPropuesta {
  const sv = p.sentVersions ?? [];
  if (sv.length === 0) return "borrador";
  if (sv.some((v) => v.estado === "aceptada" || v.acceptance != null))
    return "aceptada";
  const last = sv[sv.length - 1];
  const c = last.condicion;
  if (
    c?.descuentoPct != null &&
    c?.vigencia &&
    new Date(c.vigencia).getTime() <= now.getTime()
  ) {
    return "expirada";
  }
  return "enviada";
}

/** The latest sent version (or null), for value / valid-until / share link. */
export function ultimaVersion(
  p: Pick<StoredProposal, "sentVersions">,
): SentVersion | null {
  const sv = p.sentVersions ?? [];
  return sv.length ? sv[sv.length - 1] : null;
}
