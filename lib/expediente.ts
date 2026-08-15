/**
 * Pure helpers for the consultant expediente (audit trail). Kept out of the
 * page so the activity-feed and decision-signal logic can be unit-tested.
 */

import type { SentVersion } from "./types";
import { PLAN_LABEL } from "./mapLayout";

/** Summarise a userAgent into "Chrome en Mac" style, no fingerprinting. */
export function resumenUserAgent(ua: string | null): string {
  if (!ua) return "dispositivo desconocido";
  const s = ua.toLowerCase();
  let os = "";
  if (s.includes("iphone")) os = "iPhone";
  else if (s.includes("ipad")) os = "iPad";
  else if (s.includes("android")) os = "Android";
  else if (s.includes("mac os") || s.includes("macintosh")) os = "Mac";
  else if (s.includes("windows")) os = "Windows";
  else if (s.includes("linux")) os = "Linux";
  let br = "";
  if (s.includes("edg/")) br = "Edge";
  else if (s.includes("chrome/")) br = "Chrome";
  else if (s.includes("firefox/")) br = "Firefox";
  else if (s.includes("safari/")) br = "Safari";
  const parts = [br, os].filter(Boolean);
  return parts.length ? parts.join(" en ") : "dispositivo desconocido";
}

export interface FeedLinea {
  at: string;
  texto: string;
}

/** Build the activity feed for a version, newest first, as plain lines. */
export function feedLineas(v: SentVersion): FeedLinea[] {
  const lineas: FeedLinea[] = [];
  for (const e of v.events) {
    switch (e.tipo) {
      case "abierto":
        lineas.push({
          at: e.at,
          texto: `Abrió el documento · ${resumenUserAgent(e.userAgent)}`,
        });
        break;
      case "plan_cambiado":
        lineas.push({ at: e.at, texto: `Vio el plan ${PLAN_LABEL[e.planVisto]}` });
        break;
      case "observacion_escrita":
        lineas.push({ at: e.at, texto: "Empezó a escribir una observación" });
        break;
      case "tiempo_en_pagina":
        lineas.push({
          at: e.at,
          texto: `Permaneció ${Math.max(1, Math.round(e.seconds / 60))} min en la página`,
        });
        break;
    }
  }
  if (v.acceptance) lineas.push({ at: v.acceptance.at, texto: "Aceptó la propuesta" });
  return lineas.sort((a, b) => b.at.localeCompare(a.at));
}

/** Count `abierto` events within the last `horas` hours. */
export function aperturasEnVentana(
  v: SentVersion,
  now: number,
  horas: number,
): number {
  const desde = now - horas * 3600 * 1000;
  return v.events.filter(
    (e) => e.tipo === "abierto" && new Date(e.at).getTime() >= desde,
  ).length;
}

export interface Señal {
  /** Opens in the last 7 days (the aggregate count). */
  n7: number;
  /** True when >= 2 opens within 48h and the version is not yet accepted. */
  mostrar: boolean;
}

export function señalDecision(v: SentVersion, now: number): Señal {
  const n7 = aperturasEnVentana(v, now, 24 * 7);
  const n48 = aperturasEnVentana(v, now, 48);
  const aceptada = v.estado === "aceptada";
  return { n7, mostrar: n48 >= 2 && !aceptada };
}

/** Derived display state for a sent version (expirada is time-derived). */
export function estadoVersion(
  v: SentVersion,
  now: number,
): "aceptada" | "expirada" | "enviada" {
  if (v.estado === "aceptada") return "aceptada";
  const vig = v.condicion.vigencia;
  if (vig && new Date(vig).getTime() < now) return "expirada";
  return "enviada";
}
