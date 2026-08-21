/**
 * Derived proposal status for the consultant desk — the one place this app
 * keeps light "estado" control. Mostly DERIVED from the immutable sent versions
 * and acceptance; the only manual override is "rechazada" (the client said no):
 *   borrador  → nothing sent yet
 *   rechazada → the consultant marked it declined (manual override)
 *   aceptada  → some sent version was accepted
 *   vencida   → the latest sent version's vigencia (deadline) passed, unaccepted
 *   enviada   → sent and still live (pending the client's decision)
 */

import type { StoredProposal } from "./types";

export type EstadoPropuesta =
  | "borrador"
  | "enviada"
  | "aceptada"
  | "vencida"
  | "rechazada";

export const ESTADO_LABEL: Record<EstadoPropuesta, string> = {
  borrador: "Borrador",
  enviada: "Enviada",
  aceptada: "Aceptada",
  vencida: "Vencida",
  rechazada: "Rechazada",
};

export function estadoDe(
  p: Pick<StoredProposal, "sentVersions" | "estadoManual">,
  now: Date = new Date(),
): EstadoPropuesta {
  const sv = p.sentVersions ?? [];
  if (sv.some((v) => v.estado === "aceptada" || v.acceptance != null))
    return "aceptada";
  // Manual "declined" override (only meaningful once nothing is accepted).
  if (p.estadoManual === "rechazada") return "rechazada";
  if (sv.length === 0) return "borrador";
  const last = sv[sv.length - 1];
  const c = last.condicion;
  if (c?.vigencia && new Date(c.vigencia).getTime() <= now.getTime()) {
    return "vencida";
  }
  return "enviada";
}

/** The latest sent version (or null), for value / valid-until / share link. */
export function ultimaVersion(
  p: Pick<StoredProposal, "sentVersions">,
) {
  const sv = p.sentVersions ?? [];
  return sv.length ? sv[sv.length - 1] : null;
}
