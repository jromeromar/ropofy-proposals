"use client";

/**
 * Quotation panel. Consultant-only. Builds the commercial condition and, on
 * send, invokes the server action that GENERATES the frozen client version.
 * The discount controls live ONLY here — they never travel to the client.
 */

import { useMemo, useState } from "react";
import { formatPrice } from "@/lib/rules";
import { precioFinal, requiereAprobacion } from "@/lib/pricing";
import { formatVigencia } from "@/lib/clientDocument";
import { PLAN_LABEL } from "@/lib/mapLayout";
import { enviarPropuesta, type EnviarResult } from "./actions";

type Plan = 1 | 2 | 3;
type PlanKey = "1" | "2" | "3";

interface Props {
  id: string;
  cliente: string;
  moneda: string;
  precioPorPlan: { "1": number; "2": number; "3": number };
  limite: number;
  planInicial: Plan;
  versionesEnviadas: number;
}

export default function CotizarPanel({
  id,
  cliente,
  moneda,
  precioPorPlan,
  limite,
  planInicial,
  versionesEnviadas,
}: Props) {
  const [plan, setPlan] = useState<Plan>(planInicial);
  const [descuentoStr, setDescuentoStr] = useState("");
  const [vigencia, setVigencia] = useState("");
  const [autor, setAutor] = useState("");
  const [aprobador, setAprobador] = useState("");
  const [motivo, setMotivo] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [result, setResult] = useState<Extract<EnviarResult, { ok: true }> | null>(
    null,
  );

  const precioLista = precioPorPlan[String(plan) as PlanKey];

  const descuentoPct = useMemo(() => {
    const t = descuentoStr.trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }, [descuentoStr]);

  const overLimit = requiereAprobacion(descuentoPct, limite);
  const finalPrice = precioFinal(precioLista, descuentoPct);

  const missingVigencia = descuentoPct != null && vigencia.trim() === "";
  const missingAprobador = overLimit && aprobador.trim() === "";
  const canSend =
    autor.trim() !== "" && !missingVigencia && !missingAprobador && !sending;

  async function handleSend() {
    setErrors([]);
    setSending(true);
    try {
      const res = await enviarPropuesta({
        id,
        plan,
        descuentoPct,
        vigencia: descuentoPct != null ? vigencia || null : null,
        autor: autor.trim(),
        aprobador: aprobador.trim() || null,
        motivo: motivo.trim() || null,
      });
      if (res.ok) setResult(res);
      else setErrors(res.errors);
    } catch {
      setErrors(["No se pudo enviar la propuesta. Intenta de nuevo."]);
    } finally {
      setSending(false);
    }
  }

  if (result) {
    return (
      <Confirmacion result={result} cliente={cliente} />
    );
  }

  return (
    <main className="container stack">
      <div className="header-row">
        <div>
          <h1>Preparar propuesta</h1>
          <p className="muted">{cliente}</p>
        </div>
        <a href={`/consultor/${id}/presentacion`} className="btn btn-secondary">
          Volver a la presentación
        </a>
      </div>

      <div className="cot-grid">
        {/* Form */}
        <div className="cot-form card stack">
          <div>
            <label htmlFor="plan">Plan</label>
            <div className="cot-plan-selector" id="plan">
              {([1, 2, 3] as Plan[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`cot-plan-btn${p === plan ? " active" : ""}`}
                  onClick={() => setPlan(p)}
                >
                  {PLAN_LABEL[p]}
                </button>
              ))}
            </div>
            <p className="muted cot-list-price">
              Precio de lista: <strong>{formatPrice(precioLista, moneda)}</strong>
            </p>
          </div>

          <div>
            <label htmlFor="descuento">Descuento (%) — opcional</label>
            <input
              id="descuento"
              type="number"
              min={0}
              max={100}
              step="0.5"
              inputMode="decimal"
              value={descuentoStr}
              onChange={(e) => setDescuentoStr(e.target.value)}
              placeholder="Sin descuento"
            />
          </div>

          <div>
            <label htmlFor="vigencia">
              Vigencia {descuentoPct != null ? "(obligatoria)" : "(si hay descuento)"}
            </label>
            <input
              id="vigencia"
              type="datetime-local"
              value={vigencia}
              onChange={(e) => setVigencia(e.target.value)}
              disabled={descuentoPct == null}
            />
          </div>

          <div>
            <label htmlFor="autor">Autor (obligatorio)</label>
            <input
              id="autor"
              type="text"
              value={autor}
              onChange={(e) => setAutor(e.target.value)}
              placeholder="Nombre del consultor"
            />
          </div>

          {overLimit && (
            <div className="cot-approval">
              <p className="cot-approval-note">
                Por encima del {Math.round(limite * 100)}% requiere aprobación de un
                segundo usuario.
              </p>
              <label htmlFor="aprobador">Aprobador (obligatorio)</label>
              <input
                id="aprobador"
                type="text"
                value={aprobador}
                onChange={(e) => setAprobador(e.target.value)}
                placeholder="Nombre de quien aprueba"
              />
            </div>
          )}

          <div>
            <label htmlFor="motivo">Motivo — opcional (interno, no lo ve el cliente)</label>
            <input
              id="motivo"
              type="text"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Nota interna"
            />
          </div>

          {errors.length > 0 && (
            <div className="errors" role="alert">
              <h3>No se pudo enviar</h3>
              <ul>
                {errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          {confirmando && versionesEnviadas > 0 && (
            <div className="cot-confirm" role="alert">
              Ya existe v{versionesEnviadas} enviada. Se generará v
              {versionesEnviadas + 1} con la condición nueva; la anterior sigue
              viva en su enlace.
            </div>
          )}

          <div className="cot-send-row">
            <button
              className="btn btn-primary"
              onClick={() => {
                if (versionesEnviadas > 0 && !confirmando) setConfirmando(true);
                else handleSend();
              }}
              disabled={!canSend}
            >
              {sending
                ? "Enviando…"
                : confirmando || versionesEnviadas === 0
                  ? "Confirmar y enviar"
                  : "Enviar propuesta"}
            </button>
            {confirmando && !sending && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setConfirmando(false)}
              >
                Cancelar
              </button>
            )}
          </div>
        </div>

        {/* Live client-price preview */}
        <div className="cot-preview">
          <div className="cot-preview-label">Vista del cliente</div>
          <ClientPricePreview
            moneda={moneda}
            precioLista={precioLista}
            finalPrice={finalPrice}
            descuentoPct={descuentoPct}
            autor={autor}
            vigencia={vigencia}
          />
        </div>
      </div>
    </main>
  );
}

function ClientPricePreview({
  moneda,
  precioLista,
  finalPrice,
  descuentoPct,
  autor,
  vigencia,
}: {
  moneda: string;
  precioLista: number;
  finalPrice: number;
  descuentoPct: number | null;
  autor: string;
  vigencia: string;
}) {
  const conDescuento = descuentoPct != null && vigencia.trim() !== "";
  return (
    <div className="cot-price-block">
      {conDescuento ? (
        <>
          <div className="cot-price-strike">{formatPrice(precioLista, moneda)}</div>
          <div className="cot-price-final">{formatPrice(finalPrice, moneda)}</div>
          <div className="cot-price-line">
            Condición registrada por {autor.trim() || "…"} · válida hasta{" "}
            {safeVigencia(vigencia)}
          </div>
        </>
      ) : (
        <div className="cot-price-final">{formatPrice(precioLista, moneda)}</div>
      )}
    </div>
  );
}

function safeVigencia(v: string): string {
  if (!v) return "…";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "…" : formatVigencia(d.toISOString());
}

function Confirmacion({
  result,
  cliente,
}: {
  result: Extract<EnviarResult, { ok: true }>;
  cliente: string;
}) {
  const [copiado, setCopiado] = useState(false);
  const fullUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${result.link}`
      : result.link;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <main className="container stack">
      <h1>Propuesta enviada</h1>
      <div className="card stack">
        <div>
          <div className="muted">Cliente</div>
          <div style={{ fontWeight: 650 }}>{cliente}</div>
        </div>
        <div>
          <div className="muted">Versión</div>
          <div style={{ fontWeight: 650 }}>{result.version}</div>
        </div>
        <div>
          <div className="muted">Condición</div>
          <div style={{ fontWeight: 650 }}>{result.resumen}</div>
        </div>
        <div>
          <div className="muted">Enlace para el cliente</div>
          <div className="cot-link-row">
            <code className="cot-link">{fullUrl}</code>
            <button className="btn btn-secondary" onClick={copiar}>
              {copiado ? "¡Copiado!" : "Copiar enlace"}
            </button>
          </div>
        </div>
        <p className="cot-frozen-note">
          Esta versión quedó congelada: los cambios posteriores generan una versión
          nueva.
        </p>
      </div>
      <div className="header-row">
        <a href="/consultor" className="btn btn-secondary">
          Ir al listado
        </a>
        <a href={result.link} className="btn btn-primary" target="_blank" rel="noreferrer">
          Abrir documento del cliente
        </a>
      </div>
    </main>
  );
}
