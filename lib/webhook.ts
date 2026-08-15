/**
 * Acceptance webhook — the n8n glue. On accept we POST a JSON payload to a
 * configurable URL. Fire-and-forget with retries; a webhook failure NEVER
 * blocks or delays the client's confirmation screen.
 */

import type { SentVersion, Acceptance } from "./types";

export interface WebhookPayload {
  evento: "propuesta_aceptada";
  cliente: string;
  propuestaId: string;
  version: string;
  plan: 1 | 2 | 3;
  precio_final: number;
  moneda: string;
  condicion: {
    descuento_pct: number | null;
    autor: string;
    vigencia: string | null;
  };
  acepta: { nombre: string; correo: string; fecha: string };
  observaciones: string | null;
  enlace: string;
}

/** Pure builder — no I/O, easy to assert in tests. */
export function construirPayloadAceptacion(args: {
  propuestaId: string;
  cliente: string;
  sentVersion: SentVersion;
  acceptance: Acceptance;
  enlace: string;
}): WebhookPayload {
  const { propuestaId, cliente, sentVersion, acceptance, enlace } = args;
  const c = sentVersion.condicion;
  return {
    evento: "propuesta_aceptada",
    cliente,
    propuestaId,
    version: sentVersion.version,
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
    enlace,
  };
}

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number }>;

export interface EnviarWebhookResult {
  ok: boolean;
  intentos: number;
  status?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * POST the payload with up to `retries` extra attempts on failure, using
 * exponential backoff. NEVER throws — returns a result the caller may ignore.
 */
export async function enviarWebhook(
  url: string,
  payload: WebhookPayload,
  opts: { retries?: number; backoffMs?: number; fetchImpl?: FetchLike } = {},
): Promise<EnviarWebhookResult> {
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
        body: JSON.stringify(payload),
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
 * Read the configured URL and fire the webhook without blocking the caller.
 * If the env var is unset, log locally and skip. Returns immediately; the
 * network work runs detached.
 */
export function dispararWebhookAceptacion(payload: WebhookPayload): void {
  const url = process.env.ACCEPTANCE_WEBHOOK_URL;
  if (!url) {
    // eslint-disable-next-line no-console
    console.log("[webhook] ACCEPTANCE_WEBHOOK_URL sin configurar; evento local:", {
      evento: payload.evento,
      propuestaId: payload.propuestaId,
      version: payload.version,
    });
    return;
  }
  // Fire-and-forget: never await, never throw into the caller.
  void enviarWebhook(url, payload).catch(() => {});
}
