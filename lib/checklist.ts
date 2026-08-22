/**
 * Consultant-only checklist derived from the raw proposal. This is INTERNAL
 * working material (spelling to confirm, transcription risks, what the session
 * did not cover, the next-call agenda) — it must never reach the client
 * document. Built and shown only on consultant routes.
 */

import type { Proposal } from "./types";
import { razonSocialDe } from "./identidad";
import { benchmarkFuente } from "./lienzo";

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
  /** Session stamps (A3): shown internally, never on the client canvas. */
  sesiones: string[];
  /** Estimated kickoff window (A3): internal only. */
  ventana: string | null;
  /** "Lo que no se dibuja" (E18): moved off the client canvas to here. */
  noAplican: Array<[string, string]>;
  /**
   * True when `benchmark.fuente` carried digits (a sample size) — a pipeline
   * error to flag, since the sample size must never be shown to the client
   * (D12).
   */
  benchmarkFuenteConDigitos: boolean;
  modo: string | null;
}

/** True when the checklist has anything worth showing. */
export function checklistTieneContenido(c: ChecklistConsultor): boolean {
  return (
    c.nombresPorConfirmar.length > 0 ||
    c.silencios.length > 0 ||
    c.datosQueFaltan.length > 0 ||
    c.noAplican.length > 0 ||
    c.sesiones.length > 0 ||
    c.ventana != null ||
    c.benchmarkFuenteConDigitos ||
    c.grafiaEstado != null
  );
}

export function checklistConsultor(data: Proposal): ChecklistConsultor {
  const raw = data as Record<string, unknown>;
  // Newer builds nest the consultant-only material under `panel_interno`;
  // older ones put it at the top level. Read from the panel first, then fall
  // back to the top level so both contract generations work.
  const panel =
    raw.panel_interno && typeof raw.panel_interno === "object"
      ? (raw.panel_interno as Record<string, unknown>)
      : {};
  const pick = (key: string): unknown =>
    panel[key] !== undefined ? panel[key] : raw[key];

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

  // Next-call agenda: `datos_que_faltan`, else the panel's consultant questions.
  const datosFuente = Array.isArray(pick("datos_que_faltan"))
    ? (pick("datos_que_faltan") as unknown[])
    : Array.isArray(pick("preguntas_para_el_consultor"))
      ? (pick("preguntas_para_el_consultor") as unknown[])
      : [];
  const datosQueFaltan = datosFuente.map((x) => String(x)).filter((s) => s !== "");

  const sesiones = Array.isArray(pick("sesiones"))
    ? (pick("sesiones") as unknown[]).map((x) => String(x)).filter((s) => s !== "")
    : [];

  const ventana =
    typeof raw.ventana === "string" && raw.ventana.trim() !== ""
      ? raw.ventana
      : null;

  const noAplican = Array.isArray(pick("no_aplican"))
    ? (pick("no_aplican") as unknown[])
        .filter((x): x is unknown[] => Array.isArray(x) && x.length >= 2)
        .map((x) => [String(x[0]), String(x[1])] as [string, string])
    : [];

  return {
    grafiaEstado,
    razonSocial: razonSocialDe(data),
    nombresPorConfirmar,
    silencios,
    datosQueFaltan,
    sesiones,
    ventana,
    noAplican,
    benchmarkFuenteConDigitos: benchmarkFuente(raw.benchmark).tieneDigitos,
    modo: typeof raw.modo === "string" ? raw.modo : null,
  };
}
