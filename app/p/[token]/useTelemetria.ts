"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Tiny telemetry hook for the client document. Posts signals to
 * /api/telemetria, which emits the matching CRM event. Everything degrades
 * silently — analytics must NEVER break the document. No cookies, no
 * third-party scripts; the userAgent is read server-side from the request.
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

export function useTelemetria(token: string, planInicial: 1 | 2 | 3): Telemetria {
  const started = useRef(false);
  const observado = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    post(token, { tipo: "abierto", planVisto: planInicial });
  }, [token, planInicial]);

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
