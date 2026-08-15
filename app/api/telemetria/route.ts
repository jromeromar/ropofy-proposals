import { NextResponse } from "next/server";
import { storage } from "@/lib/storage";
import type { TelemetryEvent } from "@/lib/types";

// Telemetry writes hit storage on every event; never cache.
export const dynamic = "force-dynamic";

/** Max seconds we will store for a single page-time event (30 min). */
const MAX_SECONDS = 30 * 60;

/**
 * POST /api/telemetria — record one client-document event.
 * Body: { token, tipo, planVisto?, seconds? }. Rejects unknown tokens.
 * Accepts both fetch (JSON) and navigator.sendBeacon (text/JSON) bodies.
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

  const at = new Date().toISOString();
  const ua = request.headers.get("user-agent");
  let event: TelemetryEvent | null = null;

  switch (tipo) {
    case "abierto":
      event = { tipo: "abierto", at, userAgent: ua };
      break;
    case "plan_cambiado": {
      const p = Number(body.planVisto);
      if (p === 1 || p === 2 || p === 3)
        event = { tipo: "plan_cambiado", at, planVisto: p };
      break;
    }
    case "observacion_escrita":
      event = { tipo: "observacion_escrita", at };
      break;
    case "tiempo_en_pagina": {
      const raw = Number(body.seconds);
      if (Number.isFinite(raw) && raw >= 0) {
        const seconds = Math.min(Math.round(raw), MAX_SECONDS);
        event = { tipo: "tiempo_en_pagina", at, seconds };
      }
      break;
    }
    default:
      event = null;
  }

  if (!event) return NextResponse.json({ ok: false }, { status: 400 });

  const result = await storage.registrarEvento(token, event);
  if (!result.ok) {
    // Unknown token: reject (never create anything from an event).
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
