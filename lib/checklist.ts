/**
 * Consultant-only checklist derived from the raw proposal. This is INTERNAL
 * working material (spelling to confirm, transcription risks, what the session
 * did not cover, the next-call agenda) — it must never reach the client
 * document. Built and shown only on consultant routes.
 */

import type { Proposal } from "./types";
import { razonSocialDe } from "./identidad";

export interface ChecklistConsultor {
  /** Brand-spelling status, e.g. "confirmada" / "por confirmar". */
  grafiaEstado: string | null;
  razonSocial: string;
  /** [tipo, nombre] pairs a human should verify (Teams mangles proper nouns). */
  nombresPorConfirmar: Array<[string, string]>;
  /** What the session left unsaid, per module, with the analyst's reading. */
  silencios: Array<{ modulo: string; lectura: string }>;
  /** Data still missing — the agenda for the next call. */
  datosQueFaltan: string[];
  modo: string | null;
}

/** True when the checklist has anything worth showing. */
export function checklistTieneContenido(c: ChecklistConsultor): boolean {
  return (
    c.nombresPorConfirmar.length > 0 ||
    c.silencios.length > 0 ||
    c.datosQueFaltan.length > 0 ||
    c.grafiaEstado != null
  );
}

export function checklistConsultor(data: Proposal): ChecklistConsultor {
  const raw = data as Record<string, unknown>;

  const grafiaEstado =
    typeof raw.cliente_grafia_estado === "string"
      ? raw.cliente_grafia_estado
      : null;

  const nombresPorConfirmar = Array.isArray(raw.nombres_por_confirmar)
    ? (raw.nombres_por_confirmar as unknown[])
        .filter((x): x is unknown[] => Array.isArray(x) && x.length >= 2)
        .map((x) => [String(x[0]), String(x[1])] as [string, string])
    : [];

  const silencios = Array.isArray(raw.silencios)
    ? (raw.silencios as unknown[])
        .filter(
          (x): x is Record<string, unknown> =>
            !!x && typeof x === "object" && !Array.isArray(x),
        )
        .map((x) => ({
          modulo: String(x.modulo ?? ""),
          lectura: String(x.lectura ?? ""),
        }))
    : [];

  const datosQueFaltan = Array.isArray(raw.datos_que_faltan)
    ? (raw.datos_que_faltan as unknown[]).map((x) => String(x))
    : [];

  return {
    grafiaEstado,
    razonSocial: razonSocialDe(data),
    nombresPorConfirmar,
    silencios,
    datosQueFaltan,
    modo: typeof raw.modo === "string" ? raw.modo : null,
  };
}
