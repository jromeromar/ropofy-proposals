"use server";

/**
 * Acceptance action for the client document. Records the acceptance
 * server-side (with the effective price computed at accept time and the
 * request IP / user-agent) and rejects a second accept on the same version.
 * Runs on the /p/ route only — no consultant logic.
 */

import { headers } from "next/headers";
import { storage } from "@/lib/storage";
import { bloquePrecioEfectivo } from "@/lib/condition";
import { formatVigencia } from "@/lib/clientDocument";
import { emitirEvento, eventoPropuestaAceptada } from "@/lib/events";
import { enlaceDe } from "@/lib/enlace";
import type { Acceptance } from "@/lib/types";

export interface AceptarInput {
  token: string;
  plan: 1 | 2 | 3;
  nombre: string;
  correo: string;
  observaciones: string | null;
}

export type AceptarResult =
  | { ok: true; fecha: string }
  | { ok: false; yaAceptada: true; fecha: string }
  | { ok: false; errors: string[] };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function aceptarPropuesta(
  input: AceptarInput,
): Promise<AceptarResult> {
  const resolved = await storage.getByToken(input.token);
  if (!resolved) return { ok: false, errors: ["El enlace no es válido."] };

  const errors: string[] = [];
  const nombre = (input.nombre ?? "").trim();
  const correo = (input.correo ?? "").trim();
  if (!nombre) errors.push("El nombre completo es obligatorio.");
  if (!correo || !EMAIL_RE.test(correo))
    errors.push("El correo no es válido.");
  if (errors.length > 0) return { ok: false, errors };

  const plan: 1 | 2 | 3 =
    input.plan === 1 || input.plan === 2 || input.plan === 3
      ? input.plan
      : resolved.sentVersion.clientDocument.condicion_aplicada.plan_seleccionado;

  // Already accepted → reject server-side.
  if (resolved.sentVersion.estado === "aceptada") {
    const at = resolved.sentVersion.acceptance?.at ?? new Date().toISOString();
    return { ok: false, yaAceptada: true, fecha: formatVigencia(at) };
  }

  // Effective price served for the selected plan, computed now.
  const ca = resolved.sentVersion.clientDocument.condicion_aplicada;
  const cc = resolved.sentVersion.clientDocument.condicion_comercial as {
    precio_por_plan: { "1": number; "2": number; "3": number };
  };
  const key = String(plan) as "1" | "2" | "3";
  const bloque = bloquePrecioEfectivo(
    {
      descuentoPct: ca.descuento_pct,
      vigencia: ca.vigencia,
      precioLista: cc.precio_por_plan[key],
      precioFinal: ca.preciosFinales[key],
      lineaCondicion: ca.linea_condicion,
      moneda: ca.moneda,
    },
    new Date(),
  );

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = h.get("user-agent") ?? null;

  const acceptance: Acceptance = {
    at: new Date().toISOString(),
    nombre,
    correo,
    observaciones: (input.observaciones ?? "").trim() || null,
    plan,
    precioEfectivo: bloque.precioMostrar,
    moneda: ca.moneda,
    ip,
    userAgent,
  };

  const res = await storage.aceptarVersion(input.token, acceptance);
  if (!res.ok) {
    if (res.reason === "already_accepted") {
      return { ok: false, yaAceptada: true, fecha: formatVigencia(acceptance.at) };
    }
    return { ok: false, errors: ["El enlace no es válido."] };
  }

  // Fire-and-forget event — never blocks or delays the confirmation.
  try {
    const enlace = enlaceDe(h, input.token);
    emitirEvento(
      eventoPropuestaAceptada(
        {
          cliente: resolved.proposal.cliente,
          propuestaId: resolved.proposal.id,
          version: res.sentVersion.version,
          enlace,
          at: acceptance.at,
        },
        res.sentVersion,
        acceptance,
      ),
    );
  } catch {
    /* event emission must never affect the client's confirmation */
  }

  return { ok: true, fecha: formatVigencia(acceptance.at) };
}
