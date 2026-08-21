"use client";

/**
 * Consultant proposals desk. Client-side search + filters (client, status,
 * date range), sortable columns, an "Activas / Archivadas" tab, KPI tiles,
 * per-row actions (present, prepare/send, share link, decline, archive) and an
 * expandable row that lists every sent version. Consultant-only route.
 */

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/rules";
import { PLAN_LABEL } from "@/lib/mapLayout";
import { ESTADO_LABEL, type EstadoPropuesta } from "@/lib/estadoPropuesta";
import CopyLink from "./CopyLink";
import EditMarca from "./EditMarca";
import { archivarPropuesta, marcarEstado } from "./actions";

interface VersionFila {
  version: string;
  sentAt: string;
  plan: 1 | 2 | 3;
  valor: number;
  moneda: string;
  vigencia: string | null;
  token: string;
  aceptada: boolean;
}

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
  archivado: boolean;
  versiones: VersionFila[];
}

const ESTADOS: EstadoPropuesta[] = [
  "borrador",
  "enviada",
  "aceptada",
  "vencida",
  "rechazada",
];

type SortKey = "fecha" | "cliente" | "valor" | "estado";

function fmtFecha(iso: string): string {
  try {
    return new Intl.DateTimeFormat("es-CO", {
      year: "2-digit",
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
  const [sortKey, setSortKey] = useState<SortKey>("fecha");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());

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

  const filtradas = useMemo(() => {
    const term = q.trim().toLowerCase();
    return enTab.filter((f) => {
      if (estado && f.estado !== estado) return false;
      if (cliente && f.cliente !== cliente) return false;
      if (term && !`${f.id} ${f.cliente} ${f.marca ?? ""}`.toLowerCase().includes(term))
        return false;
      if (desde && f.createdAt.slice(0, 10) < desde) return false;
      if (hasta && f.createdAt.slice(0, 10) > hasta) return false;
      return true;
    });
  }, [enTab, q, estado, cliente, desde, hasta]);

  const visibles = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const arr = [...filtradas];
    arr.sort((a, b) => {
      switch (sortKey) {
        case "cliente":
          return a.cliente.localeCompare(b.cliente) * dir;
        case "valor":
          return ((a.valor ?? -1) - (b.valor ?? -1)) * dir;
        case "estado":
          return a.estado.localeCompare(b.estado) * dir;
        default:
          return a.createdAt.localeCompare(b.createdAt) * dir;
      }
    });
    return arr;
  }, [filtradas, sortKey, sortDir]);

  const activas = useMemo(() => filas.filter((f) => !f.archivado), [filas]);
  const kpi = useMemo(() => {
    const aceptadas = activas.filter((f) => f.estado === "aceptada");
    return {
      valorAceptado: aceptadas.reduce((a, f) => a + (f.valor ?? 0), 0),
      moneda: aceptadas.find((f) => f.moneda)?.moneda ?? "USD",
      aceptadas: aceptadas.length,
      enviadas: activas.filter((f) => f.estado === "enviada").length,
      vencidas: activas.filter((f) => f.estado === "vencida").length,
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

  function sortPor(k: SortKey) {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "fecha" ? "desc" : "asc");
    }
  }
  const flecha = (k: SortKey) =>
    k === sortKey ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  function toggleAbierta(id: string) {
    setAbiertas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function correr(id: string, fn: () => Promise<{ ok: boolean }>) {
    setOcupado(id);
    try {
      const res = await fn();
      if (res.ok) router.refresh();
    } finally {
      setOcupado(null);
    }
  }

  return (
    <main className="container container-wide stack">
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
          <div className="pr-kpi-val">{kpi.vencidas}</div>
          <div className="pr-kpi-lbl">Vencidas</div>
        </div>
      </div>

      <div className="pr-barra">
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
      </div>

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
                <th className="pr-sort" onClick={() => sortPor("cliente")}>
                  Cliente{flecha("cliente")}
                </th>
                <th className="pr-sort" onClick={() => sortPor("fecha")}>
                  Fecha{flecha("fecha")}
                </th>
                <th className="pr-sort pr-num" onClick={() => sortPor("valor")}>
                  Valor{flecha("valor")}
                </th>
                <th>Vigencia</th>
                <th className="pr-sort" onClick={() => sortPor("estado")}>
                  Estado{flecha("estado")}
                </th>
                <th>Versiones</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((f) => {
                const abierta = abiertas.has(f.id);
                const nv = f.versiones.length;
                return (
                  <Fragment key={f.id}>
                    <tr>
                      <td>
                        <div className="pr-cliente">{f.cliente}</div>
                        <div className="pr-sub">
                          <EditMarca id={f.id} marca={f.marca} />
                          <code className="pr-id">…{f.id.slice(-6)}</code>
                        </div>
                      </td>
                      <td className="pr-nowrap">{fmtFecha(f.createdAt)}</td>
                      <td className="pr-num">
                        {f.valor != null ? formatPrice(f.valor, f.moneda ?? "USD") : "—"}
                      </td>
                      <td className="pr-nowrap">
                        {f.vigencia ? fmtFecha(f.vigencia) : "—"}
                      </td>
                      <td>
                        <span className={`pr-badge ${f.estado}`}>
                          {ESTADO_LABEL[f.estado]}
                        </span>
                      </td>
                      <td>
                        {nv > 0 ? (
                          <button
                            type="button"
                            className="pr-verv"
                            onClick={() => toggleAbierta(f.id)}
                          >
                            {nv} {nv === 1 ? "versión" : "versiones"} {abierta ? "▲" : "▼"}
                          </button>
                        ) : (
                          <span className="pr-sub">sin enviar</span>
                        )}
                      </td>
                      <td>
                        <div className="pr-acciones">
                          <Link href={`/consultor/${f.id}/presentacion`}>Presentar</Link>
                          <Link href={`/consultor/${f.id}/cotizar`}>Enviar</Link>
                          {f.estado === "rechazada" ? (
                            <button
                              type="button"
                              className="pr-mini"
                              disabled={ocupado === f.id}
                              onClick={() => correr(f.id, () => marcarEstado(f.id, null))}
                            >
                              Reactivar
                            </button>
                          ) : (
                            f.estado !== "aceptada" && (
                              <button
                                type="button"
                                className="pr-mini"
                                disabled={ocupado === f.id}
                                onClick={() =>
                                  correr(f.id, () => marcarEstado(f.id, "rechazada"))
                                }
                              >
                                Rechazar
                              </button>
                            )
                          )}
                          <button
                            type="button"
                            className="pr-mini"
                            disabled={ocupado === f.id}
                            onClick={() =>
                              correr(f.id, () => archivarPropuesta(f.id, !f.archivado))
                            }
                          >
                            {f.archivado ? "Desarchivar" : "Archivar"}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {abierta && nv > 0 && (
                      <tr className="pr-vrow">
                        <td colSpan={7}>
                          <div className="pr-versiones">
                            {f.versiones.map((v) => (
                              <div className="pr-vitem" key={v.token}>
                                <span className="pr-vtag">
                                  {v.version}
                                  {v.aceptada && <span className="pr-vok"> · aceptada</span>}
                                </span>
                                <span>{PLAN_LABEL[v.plan]}</span>
                                <span>{formatPrice(v.valor, v.moneda)}</span>
                                <span className="pr-sub">{fmtFecha(v.sentAt)}</span>
                                <span className="pr-sub">
                                  {v.vigencia ? `vence ${fmtFecha(v.vigencia)}` : "sin vigencia"}
                                </span>
                                <a href={`/p/${v.token}`} target="_blank" rel="noreferrer">
                                  /p/…{v.token.slice(-6)}
                                </a>
                                <CopyLink path={`/p/${v.token}`} />
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
