import { NextResponse } from "next/server";
import { storage } from "@/lib/storage";
import { enlaceDe } from "@/lib/enlace";
import {
  emitirEvento,
  eventoDocumentoAbierto,
  eventoPlanExplorado,
  eventoObservacionEscrita,
  type EventoBase,
} from "@/lib/events";

// Emits events on every hit; never cache.
export const dynamic = "force-dynamic";

/** documento_abierto throttle: at most one per token per 10 minutes. */
const APERTURA_WINDOW_MS = 10 * 60 * 1000;

function plan(v: unknown): 1 | 2 | 3 | undefined {
  const n = Number(v);
  return n === 1 || n === 2 || n === 3 ? (n as 1 | 2 | 3) : undefined;
}

/**
 * POST /api/telemetria — receive a client-document signal and EMIT the matching
 * CRM event (fire-and-forget). Body: { token, tipo, planVisto? }. Rejects
 * unknown tokens (nothing is ever created from a telemetry hit).
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token : "";
  const tipo = body.tipo;
  if (!token || typeof tipo !== "string") {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const resolved = await storage.getByToken(token);
  if (!resolved) {
    // Unknown token: reject. Never emit or create anything.
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  const base: Omit<EventoBase, "evento"> = {
    cliente: resolved.proposal.cliente,
    propuestaId: resolved.proposal.id,
    version: resolved.sentVersion.version,
    enlace: enlaceDe(request.headers, token),
    at: new Date().toISOString(),
  };
  const userAgent = request.headers.get("user-agent");

  switch (tipo) {
    case "abierto": {
      // Throttled server-side so a re-opened document doesn't spam the CRM.
      if (await storage.debeEmitirApertura(token, APERTURA_WINDOW_MS)) {
        emitirEvento(
          eventoDocumentoAbierto(base, { planVisto: plan(body.planVisto), userAgent }),
        );
      }
      return NextResponse.json({ ok: true });
    }
    case "plan_cambiado": {
      const p = plan(body.planVisto);
      if (p) emitirEvento(eventoPlanExplorado(base, { planVisto: p }));
      return NextResponse.json({ ok: true });
    }
    case "observacion_escrita": {
      emitirEvento(eventoObservacionEscrita(base));
      return NextResponse.json({ ok: true });
    }
    default:
      return NextResponse.json({ ok: false }, { status: 400 });
  }
}
