"use client";

import { useState } from "react";
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

/** Normalise a client name for matching (accents, case, punctuation). */
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export default function NuevaPropuesta() {
  // Step 1 (carga) → step 2 (asociar) → summary.
  const [paso, setPaso] = useState<"carga" | "asociar">("carga");
  const [text, setText] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const [parsed, setParsed] = useState<Proposal | null>(null);
  const [existentes, setExistentes] = useState<ClienteOpcion[]>([]);
  const [listaEstado, setListaEstado] = useState<"idle" | "ok" | "error">("idle");
  const [asociarA, setAsociarA] = useState("");
  const [sugeridoId, setSugeridoId] = useState<string | null>(null);

  const [summary, setSummary] = useState<Summary | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const content = await file.text();
    setText(content);
    setErrors([]);
  }

  // Step 1 → 2: parse + validate the JSON (no persistence yet), then load the
  // existing clients and pre-select the one whose name matches, if any.
  async function handleContinuar() {
    setErrors([]);

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      setErrors(["El texto pegado no es un JSON válido. Revisa la sintaxis."]);
      return;
    }
    const result = validateProposal(data);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }

    const proposal = data as Proposal;
    setParsed(proposal);

    // Load existing clients on demand (no-store so the list is always fresh).
    let lista: ClienteOpcion[] = [];
    try {
      const res = await fetch("/api/proposals", { cache: "no-store" });
      if (res.ok) {
        const payload = await res.json();
        if (Array.isArray(payload.proposals)) lista = payload.proposals;
        setListaEstado("ok");
      } else {
        setListaEstado("error");
      }
    } catch {
      setListaEstado("error");
    }
    setExistentes(lista);

    // Auto-suggest: same client name → offer it as a new version.
    const match = lista.find((c) => norm(c.cliente) === norm(proposal.cliente));
    setSugeridoId(match?.id ?? null);
    setAsociarA(match?.id ?? "");

    setPaso("asociar");
  }

  // Step 2: persist (as a new version when a client is selected).
  async function handleGuardar() {
    if (!parsed) return;
    setErrors([]);
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
        proposal: parsed,
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

      {/* Step 1: load the JSON */}
      {!summary && paso === "carga" && (
        <div className="stack">
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
              onClick={handleContinuar}
              disabled={text.trim().length === 0}
            >
              Continuar
            </button>
          </div>

          {errors.length > 0 && <ErrorBox title="La propuesta no se pudo cargar" errors={errors} />}
        </div>
      )}

      {/* Step 2: choose the client (new, or a new version of an existing one) */}
      {!summary && paso === "asociar" && parsed && (
        <AsociarPaso
          proposal={parsed}
          existentes={existentes}
          listaEstado={listaEstado}
          asociarA={asociarA}
          setAsociarA={setAsociarA}
          sugeridoId={sugeridoId}
          loading={loading}
          onGuardar={handleGuardar}
          onVolver={() => {
            setPaso("carga");
            setErrors([]);
          }}
          errors={errors}
        />
      )}

      {summary && <SummaryCard summary={summary} />}
    </main>
  );
}

function ErrorBox({ title, errors }: { title: string; errors: string[] }) {
  return (
    <div className="errors" role="alert">
      <h3>{title}</h3>
      <ul>
        {errors.map((err, i) => (
          <li key={i}>{err}</li>
        ))}
      </ul>
    </div>
  );
}

function AsociarPaso({
  proposal,
  existentes,
  listaEstado,
  asociarA,
  setAsociarA,
  sugeridoId,
  loading,
  onGuardar,
  onVolver,
  errors,
}: {
  proposal: Proposal;
  existentes: ClienteOpcion[];
  listaEstado: "idle" | "ok" | "error";
  asociarA: string;
  setAsociarA: (v: string) => void;
  sugeridoId: string | null;
  loading: boolean;
  onGuardar: () => void;
  onVolver: () => void;
  errors: string[];
}) {
  const eligeSugerido = sugeridoId != null && asociarA === sugeridoId;
  return (
    <div className="stack">
      <div className="card stack">
        <div className="header-row">
          <h2 style={{ margin: 0 }}>¿A qué cliente pertenece?</h2>
          <span className="badge">{proposal.cliente}</span>
        </div>

        {sugeridoId && (
          <div className="cot-confirm" role="status">
            Hay un cliente que coincide con «{proposal.cliente}». Se sugiere
            cargarla como <strong>versión nueva</strong> de ese cliente; puedes
            cambiarlo abajo.
          </div>
        )}

        <div>
          <label htmlFor="asociar">Cliente</label>
          <select
            id="asociar"
            value={asociarA}
            onChange={(e) => setAsociarA(e.target.value)}
          >
            <option value="">
              Cliente nuevo (crear propuesta){sugeridoId ? " — ignorar sugerencia" : ""}
            </option>
            {existentes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.cliente} · {c.version}
                {c.sentCount > 0 ? ` · ${c.sentCount} enviada(s)` : ""}
                {c.id === sugeridoId ? " · sugerido" : ""}
              </option>
            ))}
          </select>
          <p className="muted" style={{ marginTop: 6 }}>
            {asociarA
              ? eligeSugerido
                ? "Se guardará como una versión nueva del cliente sugerido; su historial de envíos se conserva."
                : "Se guardará como una versión nueva de este cliente; su historial de envíos se conserva."
              : "Se creará una propuesta nueva desde cero."}
          </p>
          {listaEstado === "error" && (
            <p className="muted" style={{ marginTop: 6 }}>
              No se pudo cargar la lista de clientes; puedes continuar como
              cliente nuevo.
            </p>
          )}
          {listaEstado === "ok" && existentes.length === 0 && (
            <p className="muted" style={{ marginTop: 6 }}>
              Aún no hay clientes cargados: esta será la primera propuesta.
            </p>
          )}
        </div>

        {errors.length > 0 && <ErrorBox title="No se pudo guardar" errors={errors} />}

        <div className="cot-send-row">
          <button className="btn btn-primary" onClick={onGuardar} disabled={loading}>
            {loading
              ? "Guardando…"
              : asociarA
                ? "Guardar como versión nueva"
                : "Guardar propuesta nueva"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onVolver}>
            Volver a editar el JSON
          </button>
        </div>
      </div>
    </div>
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
