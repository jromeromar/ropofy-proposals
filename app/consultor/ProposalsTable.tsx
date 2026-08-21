"use client";

/**
 * Consultant proposals desk. Client-side search + filters (client, status,
 * date range), an "Activas / Archivadas" tab, KPI tiles, and per-row actions
 * (present, prepare/send, edit, share link, archive). Consultant-only; the
 * client never sees this route.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/rules";
import { ESTADO_LABEL, type EstadoPropuesta } from "@/lib/estadoPropuesta";
import CopyLink from "./CopyLink";
import EditMarca from "./EditMarca";
import { archivarPropuesta } from "./actions";

export interface FilaPropuesta {
  id: string;
  cliente: string;
  marca: string | null;
  createdAt: string;
  estado: EstadoPropuesta;
  valor: number | null;
  moneda: string | null;
  vigencia: string | null;
  token: string | null;
  versiones: number;
  archivado: boolean;
}

const ESTADOS: EstadoPropuesta[] = ["borrador", "enviada", "aceptada", "expirada"];

function fmtFecha(iso: string): string {
  try {
    return new Intl.DateTimeFormat("es-CO", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function ProposalsTable({ filas }: { filas: FilaPropuesta[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<"activas" | "archivadas">("activas");
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState<"" | EstadoPropuesta>("");
  const [cliente, setCliente] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);

  const clientes = useMemo(
    () =>
      Array.from(new Set(filas.map((f) => f.cliente))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [filas],
  );

  const enTab = useMemo(
    () => filas.filter((f) => (tab === "archivadas" ? f.archivado : !f.archivado)),
    [filas, tab],
  );

  const visibles = useMemo(() => {
    const term = q.trim().toLowerCase();
    return enTab.filter((f) => {
      if (estado && f.estado !== estado) return false;
      if (cliente && f.cliente !== cliente) return false;
      if (term) {
        const hay = `${f.id} ${f.cliente} ${f.marca ?? ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      if (desde && f.createdAt.slice(0, 10) < desde) return false;
      if (hasta && f.createdAt.slice(0, 10) > hasta) return false;
      return true;
    });
  }, [enTab, q, estado, cliente, desde, hasta]);

  // KPIs over the active (non-archived) set.
  const activas = useMemo(() => filas.filter((f) => !f.archivado), [filas]);
  const kpi = useMemo(() => {
    const aceptadas = activas.filter((f) => f.estado === "aceptada");
    return {
      valorAceptado: aceptadas.reduce((a, f) => a + (f.valor ?? 0), 0),
      moneda: aceptadas.find((f) => f.moneda)?.moneda ?? "USD",
      aceptadas: aceptadas.length,
      enviadas: activas.filter((f) => f.estado === "enviada").length,
      expiradas: activas.filter((f) => f.estado === "expirada").length,
    };
  }, [activas]);

  const limpiar = () => {
    setQ("");
    setEstado("");
    setCliente("");
    setDesde("");
    setHasta("");
  };
  const hayFiltro = q || estado || cliente || desde || hasta;

  async function archivar(id: string, archivado: boolean) {
    setOcupado(id);
    try {
      const res = await archivarPropuesta(id, archivado);
      if (res.ok) router.refresh();
    } finally {
      setOcupado(null);
    }
  }

  return (
    <main className="container stack">
      <div className="header-row">
        <div>
          <h1>Propuestas</h1>
          <p className="muted">
            Estado, búsqueda y archivo. La gestión completa vive en Ropofy.
          </p>
        </div>
        <Link href="/consultor/nueva" className="btn btn-primary">
          Nueva propuesta
        </Link>
      </div>

      {/* KPIs */}
      <div className="pr-kpis">
        <div className="pr-kpi">
          <div className="pr-kpi-val">{formatPrice(kpi.valorAceptado, kpi.moneda)}</div>
          <div className="pr-kpi-lbl">Aceptado</div>
        </div>
        <div className="pr-kpi">
          <div className="pr-kpi-val">{kpi.aceptadas}</div>
          <div className="pr-kpi-lbl">Aceptadas</div>
        </div>
        <div className="pr-kpi">
          <div className="pr-kpi-val">{kpi.enviadas}</div>
          <div className="pr-kpi-lbl">Enviadas</div>
        </div>
        <div className="pr-kpi">
          <div className="pr-kpi-val">{kpi.expiradas}</div>
          <div className="pr-kpi-lbl">Expiradas</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="pr-tabs">
        <button
          type="button"
          className={`pr-tab${tab === "activas" ? " on" : ""}`}
          onClick={() => setTab("activas")}
        >
          Activas ({filas.filter((f) => !f.archivado).length})
        </button>
        <button
          type="button"
          className={`pr-tab${tab === "archivadas" ? " on" : ""}`}
          onClick={() => setTab("archivadas")}
        >
          Archivadas ({filas.filter((f) => f.archivado).length})
        </button>
      </div>

      {/* Filters */}
      <div className="pr-filtros">
        <input
          type="text"
          className="pr-buscar"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por cliente, marca o id…"
          aria-label="Buscar"
        />
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value as "" | EstadoPropuesta)}
          aria-label="Filtrar por estado"
        >
          <option value="">Todos los estados</option>
          {ESTADOS.map((s) => (
            <option key={s} value={s}>
              {ESTADO_LABEL[s]}
            </option>
          ))}
        </select>
        <select
          value={cliente}
          onChange={(e) => setCliente(e.target.value)}
          aria-label="Filtrar por cliente"
        >
          <option value="">Todos los clientes</option>
          {clientes.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <label className="pr-fecha">
          <span>Desde</span>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label className="pr-fecha">
          <span>Hasta</span>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </label>
        {hayFiltro && (
          <button type="button" className="pr-limpiar" onClick={limpiar}>
            Limpiar
          </button>
        )}
      </div>

      {/* Table */}
      {visibles.length === 0 ? (
        <div className="card card-muted">
          <p className="muted" style={{ margin: 0 }}>
            {tab === "archivadas"
              ? "No hay propuestas archivadas."
              : hayFiltro
                ? "Ninguna propuesta coincide con los filtros."
                : "Aún no hay propuestas. Empieza con «Nueva propuesta»."}
          </p>
        </div>
      ) : (
        <div className="pr-tabla-wrap">
          <table className="pr-tabla">
            <thead>
              <tr>
                <th>ID#</th>
                <th>Cliente</th>
                <th>Fecha</th>
                <th>Valor</th>
                <th>Vigencia</th>
                <th>Estado</th>
                <th className="pr-acciones-h">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((f) => (
                <tr key={f.id}>
                  <td>
                    <code className="pr-id">…{f.id.slice(-8)}</code>
                  </td>
                  <td>
                    <div className="pr-cliente">{f.cliente}</div>
                    <div className="pr-marca">
                      <EditMarca id={f.id} marca={f.marca} />
                    </div>
                  </td>
                  <td>{fmtFecha(f.createdAt)}</td>
                  <td>{f.valor != null ? formatPrice(f.valor, f.moneda ?? "USD") : "—"}</td>
                  <td>{f.vigencia ? fmtFecha(f.vigencia) : "—"}</td>
                  <td>
                    <span className={`pr-badge ${f.estado}`}>
                      {ESTADO_LABEL[f.estado]}
                    </span>
                  </td>
                  <td>
                    <div className="pr-acciones">
                      <Link href={`/consultor/${f.id}/presentacion`}>Presentar</Link>
                      <Link href={`/consultor/${f.id}/cotizar`}>Enviar</Link>
                      {f.token && (
                        <>
                          <a href={`/p/${f.token}`} target="_blank" rel="noreferrer">
                            /p/…{f.token.slice(-6)}
                          </a>
                          <CopyLink path={`/p/${f.token}`} />
                        </>
                      )}
                      <button
                        type="button"
                        className="pr-archivar"
                        onClick={() => archivar(f.id, !f.archivado)}
                        disabled={ocupado === f.id}
                      >
                        {ocupado === f.id
                          ? "…"
                          : f.archivado
                            ? "Desarchivar"
                            : "Archivar"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
