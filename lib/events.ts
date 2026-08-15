/**
 * Event bus — the bridge to Ropofy (the GHL-based CRM) via n8n.
 *
 * ONE configurable endpoint (EVENTS_WEBHOOK_URL). n8n receives every event and
 * routes it into GoHighLevel. Fire-and-forget with retries: emitting an event
 * NEVER blocks or delays the UX. This app owns render/freeze/tokenize/accept;
 * management (status, activity, decision signals) lives in the CRM.
 */

import type { SentVersion, Acceptance } from "./types";

export type EventoNombre =
  | "propuesta_enviada"
  | "documento_abierto"
  | "plan_explorado"
  | "observacion_escrita"
  | "propuesta_aceptada"
  | "condicion_expirada";

/** The envelope every event carries. */
export interface EventoBase {
  evento: EventoNombre;
  cliente: string;
  propuestaId: string;
  version: string;
  enlace: string;
  at: string;
}

export type Evento = EventoBase & Record<string, unknown>;

// --- event builders (explicit shapes, easy to assert in tests) ----------

export function eventoPropuestaEnviada(
  base: Omit<EventoBase, "evento">,
  p: {
    plan: 1 | 2 | 3;
    precio_lista: number;
    condicion: {
      descuento_pct: number | null;
      autor: string;
      aprobador?: string | null;
      vigencia: string | null;
    };
  },
): Evento {
  return { evento: "propuesta_enviada", ...base, ...p };
}

export function eventoDocumentoAbierto(
  base: Omit<EventoBase, "evento">,
  p: { planVisto?: 1 | 2 | 3; userAgent: string | null },
): Evento {
  return { evento: "documento_abierto", ...base, ...p };
}

export function eventoPlanExplorado(
  base: Omit<EventoBase, "evento">,
  p: { planVisto: 1 | 2 | 3 },
): Evento {
  return { evento: "plan_explorado", ...base, ...p };
}

export function eventoObservacionEscrita(
  base: Omit<EventoBase, "evento">,
): Evento {
  return { evento: "observacion_escrita", ...base };
}

export function eventoPropuestaAceptada(
  base: Omit<EventoBase, "evento">,
  sentVersion: SentVersion,
  acceptance: Acceptance,
): Evento {
  const c = sentVersion.condicion;
  return {
    evento: "propuesta_aceptada",
    ...base,
    plan: acceptance.plan,
    precio_final: acceptance.precioEfectivo,
    moneda: acceptance.moneda,
    condicion: {
      descuento_pct: c.descuentoPct,
      autor: c.autor,
      vigencia: c.vigencia,
    },
    acepta: {
      nombre: acceptance.nombre,
      correo: acceptance.correo,
      fecha: acceptance.at,
    },
    observaciones: acceptance.observaciones,
  };
}

export function eventoCondicionExpirada(
  base: Omit<EventoBase, "evento">,
): Evento {
  return { evento: "condicion_expirada", ...base };
}

// --- transport ----------------------------------------------------------

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number }>;

export interface EnviarResult {
  ok: boolean;
  intentos: number;
  status?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * POST the event with up to `retries` extra attempts on failure, exponential
 * backoff. NEVER throws — returns a result the caller may ignore.
 */
export async function enviarEvento(
  url: string,
  evento: Evento,
  opts: { retries?: number; backoffMs?: number; fetchImpl?: FetchLike } = {},
): Promise<EnviarResult> {
  const retries = opts.retries ?? 3;
  const backoffMs = opts.backoffMs ?? 300;
  const doFetch: FetchLike = opts.fetchImpl ?? (globalThis.fetch as FetchLike);

  let intentos = 0;
  let lastStatus: number | undefined;
  for (let attempt = 0; attempt <= retries; attempt++) {
    intentos++;
    try {
      const res = await doFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(evento),
      });
      lastStatus = res.status;
      if (res.ok) return { ok: true, intentos, status: res.status };
    } catch {
      // network error — fall through to backoff/retry
    }
    if (attempt < retries) await sleep(backoffMs * 2 ** attempt);
  }
  return { ok: false, intentos, status: lastStatus };
}

/**
 * Read the configured endpoint and emit without blocking the caller. If unset,
 * log locally and skip. Returns immediately; the network work runs detached.
 */
export function emitirEvento(evento: Evento): void {
  const url = process.env.EVENTS_WEBHOOK_URL;
  if (!url) {
    // eslint-disable-next-line no-console
    console.log("[events] EVENTS_WEBHOOK_URL sin configurar; evento local:", {
      evento: evento.evento,
      propuestaId: evento.propuestaId,
      version: evento.version,
    });
    return;
  }
  void enviarEvento(url, evento).catch(() => {});
}
