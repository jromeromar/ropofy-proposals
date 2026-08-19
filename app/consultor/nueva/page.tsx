"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { validateProposal } from "@/lib/validateProposal";
import { formatPrice } from "@/lib/rules";
import type { Proposal, StoredProposal, PlanNombre } from "@/lib/types";

interface Summary {
  stored: StoredProposal;
  proposal: Proposal;
  asVersion: boolean;
}

/** Slim shape returned by GET /api/proposals for the existing-client selector. */
interface ClienteOpcion {
  id: string;
  cliente: string;
  version: string;
  createdAt: string;
  sentCount: number;
}

const PLAN_LABELS: Record<PlanNombre, string> = {
  fundamental: "Fundamental",
  avanzado: "Avanzado",
  inteligente: "Inteligente",
};

function contarPorPlan(proposal: Proposal): Record<PlanNombre, number> {
  const counts: Record<PlanNombre, number> = {
    fundamental: 0,
    avanzado: 0,
    inteligente: 0,
  };
  for (const comp of Object.values(proposal.componentes)) {
    if (comp.plan in counts) counts[comp.plan] += 1;
  }
  return counts;
}

export default function NuevaPropuesta() {
  const [text, setText] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [existentes, setExistentes] = useState<ClienteOpcion[]>([]);
  const [asociarA, setAsociarA] = useState("");

  useEffect(() => {
    let vivo = true;
    fetch("/api/proposals")
      .then((r) => (r.ok ? r.json() : { proposals: [] }))
      .then((p) => {
        if (vivo && Array.isArray(p.proposals)) setExistentes(p.proposals);
      })
      .catch(() => {
        /* the selector is optional; ignore load errors */
      });
    return () => {
      vivo = false;
    };
  }, []);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const content = await file.text();
    setText(content);
    setErrors([]);
    setSummary(null);
  }

  async function handleLoad() {
    setErrors([]);
    setSummary(null);

    // 1) Parse.
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      setErrors(["El texto pegado no es un JSON válido. Revisa la sintaxis."]);
      return;
    }

    // 2) Validate structure BEFORE rendering anything.
    const result = validateProposal(parsed);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }

    // 3) Persist via the API (which re-validates server-side). When a client
    //    is selected, store it as a NEW VERSION of that existing proposal.
    setLoading(true);
    try {
      const url = asociarA
        ? `/api/proposals?version_of=${encodeURIComponent(asociarA)}`
        : "/api/proposals";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const payload = await res.json();
      if (!res.ok) {
        setErrors(
          payload.errors ?? ["No se pudo guardar la propuesta. Intenta de nuevo."],
        );
        return;
      }
      setSummary({
        stored: payload.proposal as StoredProposal,
        proposal: parsed as Proposal,
        asVersion: Boolean(payload.asVersion),
      });
    } catch {
      setErrors(["Error de red al guardar la propuesta. Intenta de nuevo."]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container stack">
      <div className="header-row">
        <div>
          <h1>Nueva propuesta</h1>
          <p className="muted">
            Pega el contenido de <code>propuesta.json</code> o sube el archivo.
          </p>
        </div>
        <Link href="/consultor" className="btn btn-secondary">
          Volver
        </Link>
      </div>

      {!summary && (
        <div className="stack">
          <div>
            <label htmlFor="asociar">Cliente</label>
            <select
              id="asociar"
              value={asociarA}
              onChange={(e) => setAsociarA(e.target.value)}
            >
              <option value="">Cliente nuevo (crear propuesta)</option>
              {existentes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.cliente} · {c.version}
                  {c.sentCount > 0 ? ` · ${c.sentCount} enviada(s)` : ""}
                </option>
              ))}
            </select>
            <p className="muted" style={{ marginTop: 6 }}>
              {asociarA
                ? "Se cargará como una versión nueva de este cliente; su historial de envíos se conserva."
                : "Deja «Cliente nuevo» para crear una propuesta desde cero, o elige un cliente existente para asociarla como versión nueva."}
            </p>
          </div>

          <div>
            <label htmlFor="json">Contenido de la propuesta (JSON)</label>
            <textarea
              id="json"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Pega aquí el JSON de la propuesta…"
              spellCheck={false}
            />
          </div>

          <div>
            <label htmlFor="file">O sube un archivo .json</label>
            <input
              id="file"
              type="file"
              accept="application/json,.json"
              onChange={handleFile}
            />
          </div>

          <div>
            <button
              className="btn btn-primary"
              onClick={handleLoad}
              disabled={loading || text.trim().length === 0}
            >
              {loading ? "Cargando…" : "Cargar propuesta"}
            </button>
          </div>

          {errors.length > 0 && (
            <div className="errors" role="alert">
              <h3>La propuesta no se pudo cargar</h3>
              <ul>
                {errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {summary && <SummaryCard summary={summary} />}
    </main>
  );
}

function SummaryCard({ summary }: { summary: Summary }) {
  const { stored, proposal } = summary;
  const counts = contarPorPlan(proposal);
  const cc = proposal.condicion_comercial;

  return (
    <div className="stack">
      <div className="card">
        <div className="header-row">
          <h2 style={{ margin: 0 }}>
            {summary.asVersion ? "Versión nueva cargada" : "Propuesta cargada"}
          </h2>
          <span className="badge">
            {stored.version} · {stored.estado}
          </span>
        </div>
        {summary.asVersion && (
          <p className="muted" style={{ marginTop: 0 }}>
            Asociada a un cliente existente como {stored.version}. Los envíos
            anteriores siguen vivos en sus enlaces.
          </p>
        )}

        <div className="summary-grid">
          <div className="summary-cell">
            <div className="k">Cliente</div>
            <div className="v">{proposal.cliente}</div>
          </div>
          <div className="summary-cell">
            <div className="k">Modo</div>
            <div className="v">{proposal.modo}</div>
          </div>
          <div className="summary-cell">
            <div className="k">Nota</div>
            <div className="v">
              {proposal.nota.letra} · {proposal.nota.puntos}/100
            </div>
          </div>
          <div className="summary-cell">
            <div className="k">Plan recomendado</div>
            <div className="v">Plan {proposal.plan_recomendado.plan}</div>
          </div>
        </div>

        <h3>Componentes por plan</h3>
        <div className="summary-grid">
          {(Object.keys(counts) as PlanNombre[]).map((plan) => (
            <div className="summary-cell" key={plan}>
              <div className="k">{PLAN_LABELS[plan]}</div>
              <div className="v">{counts[plan]}</div>
            </div>
          ))}
        </div>

        <h3>Precios de lista</h3>
        <div className="price-row">
          {(["1", "2", "3"] as const).map((plan) => (
            <div className="price" key={plan}>
              {formatPrice(cc.precio_por_plan[plan], cc.moneda)}
              <small>Plan {plan}</small>
            </div>
          ))}
        </div>
      </div>

      <div className="header-row">
        {/* Enlace muerto por ahora: la vista de presentación llega en el prompt 2. */}
        <Link
          href={`/consultor/${stored.id}/presentacion`}
          className="btn btn-primary"
        >
          Abrir vista de presentación
        </Link>
        <Link href="/consultor" className="btn btn-secondary">
          Ir al listado
        </Link>
      </div>
    </div>
  );
}
