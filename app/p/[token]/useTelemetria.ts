"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Tiny telemetry hook for the client document. Posts events to
 * /api/telemetria. Everything degrades silently — analytics must NEVER break
 * the document. No cookies, no third-party scripts; the userAgent is read
 * server-side from the request header.
 */
function post(token: string, payload: Record<string, unknown>): void {
  try {
    void fetch("/api/telemetria", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, ...payload }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}

export interface Telemetria {
  planCambiado: (planVisto: 1 | 2 | 3) => void;
  observacionEscrita: () => void;
}

export function useTelemetria(token: string): Telemetria {
  const started = useRef(false);
  const startMs = useRef(0);
  const observado = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    startMs.current = Date.now();
    post(token, { tipo: "abierto" });

    const enviarTiempo = () => {
      const seconds = Math.round((Date.now() - startMs.current) / 1000);
      const body = JSON.stringify({ token, tipo: "tiempo_en_pagina", seconds });
      try {
        if (typeof navigator !== "undefined" && navigator.sendBeacon) {
          navigator.sendBeacon(
            "/api/telemetria",
            new Blob([body], { type: "application/json" }),
          );
        } else {
          post(token, { tipo: "tiempo_en_pagina", seconds });
        }
      } catch {
        /* ignore */
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") enviarTiempo();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", enviarTiempo);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", enviarTiempo);
    };
  }, [token]);

  const planCambiado = useCallback(
    (planVisto: 1 | 2 | 3) => post(token, { tipo: "plan_cambiado", planVisto }),
    [token],
  );

  const observacionEscrita = useCallback(() => {
    if (observado.current) return;
    observado.current = true;
    post(token, { tipo: "observacion_escrita" });
  }, [token]);

  return { planCambiado, observacionEscrita };
}
