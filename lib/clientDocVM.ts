/**
 * View model for the full client document, built on the server from a FROZEN
 * clientDocument snapshot (already id-free). This is the only data that
 * crosses to the client component, so — like presentacionVM — nothing internal
 * can leak into the bundle or the hydration payload.
 */

import { bandsFrom, benchmarkPorModulo, type Band } from "./mapLayout";
import type {
  ClientDocument,
  AsIs,
  EstadoFuga,
  LetraNota,
  PlanNombre,
  Visibilidad,
  EtiquetaIntegracion,
} from "./types";

export interface ClientComp {
  key: string;
  nombre: string;
  beneficio: string | null;
  plan: PlanNombre;
  cortesiaPlan: PlanNombre | null;
  vis: Visibilidad;
  journey: number;
  instancias: number;
  cuota: string | null;
  isAI: boolean;
}

export interface FugaVM {
  titulo: string;
  texto: string | null;
  evidencia: string | null;
  estado: EstadoFuga;
  /** The third party's name (mitigable fugas), interpolated in the document. */
  dependeDe: string | null;
  cifra: string;
}

export interface MadurezVM {
  m: string;
  hoy: number;
  p: { "1": number; "2": number; "3": number };
}

export interface ClientDocVM {
  cliente: string;
  /** Brand / trade name (or null); shown alongside the legal name. */
  marca: string | null;
  titular: string;
  resumen: string;
  sentAt: string;
  stats: Array<{ value: string; label: string }>;
  asIs: AsIs;
  fugaDominante: FugaVM | null;
  fugasResto: FugaVM[];
  nota: { letra: LetraNota; puntos: number };
  /** Sector average maturity per module (0-4), or null. */
  benchmarkModulos: Record<string, number> | null;
  madurez: MadurezVM[];
  bands: Band<ClientComp>[];
  integraciones: Array<[string, string, EtiquetaIntegracion]>;
  noAplican: Array<[string, string]>;
  advertencias: string[];
  planRecomendado: 1 | 2 | 3;
  moneda: string;
  precioListaPorPlan: { "1": number; "2": number; "3": number };
  preciosFinales: { "1": number; "2": number; "3": number };
  condicion: {
    // Named `pct` (not `descuentoPct`) on purpose: the string "descuento"
    // must not appear anywhere in a client document's payload.
    pct: number | null;
    vigencia: string | null;
    lineaCondicion: string | null;
    autor: string;
    planSeleccionado: 1 | 2 | 3;
  };
}

/**
 * Headline figures for the "Lo que entendimos" tiles. The figure is read from
 * the row's explicit `cifra` (third element) — NEVER scraped from the note, so
 * no phantom numbers (a "4 km" or "3 o 4 sectores" in the prose). A row without
 * a declared cifra contributes no tile. The label is the unit that gives the
 * figure meaning, falling back to the channel name when no unit is given.
 */
function extractStats(asIs: AsIs): Array<{ value: string; label: string }> {
  const cols = [asIs.de_donde_llegan, asIs.por_donde_pasan, asIs.donde_queda];
  const out: Array<{ value: string; label: string }> = [];
  for (const col of cols ?? []) {
    for (const fila of col ?? []) {
      const [canal, , extra] = fila;
      const cifra = extra?.cifra?.trim();
      if (!cifra) continue;
      out.push({ value: cifra, label: extra?.unidad?.trim() || canal });
    }
  }
  return out;
}

function toFugaVM(f: Record<string, unknown>): FugaVM {
  const cuant = f.cuantificacion as { valor?: unknown } | undefined;
  const dep = f.depende_de_tercero;
  return {
    titulo: String(f.titulo ?? ""),
    texto: (f.texto as string | null) ?? null,
    evidencia: (f.evidencia_textual as string | null) ?? null,
    estado: f.estado as EstadoFuga,
    dependeDe: typeof dep === "string" && dep.trim() !== "" ? dep : null,
    cifra: cuant?.valor != null ? String(cuant.valor) : "",
  };
}

export function toClientDocVM(doc: ClientDocument, sentAt: string): ClientDocVM {
  const componentes = (doc.componentes ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  const comps: ClientComp[] = Object.entries(componentes).map(([key, c]) => ({
    key,
    nombre: String(c.nombre_cliente ?? ""),
    beneficio: (c.beneficio as string | null) ?? null,
    plan: c.plan as PlanNombre,
    cortesiaPlan: (c.cortesiaPlan as PlanNombre | null) ?? null,
    vis: c.vis as Visibilidad,
    journey: Number(c.journey ?? 0),
    instancias: Number(c.instancias ?? 1),
    cuota: (c.cuota as string | null) ?? null,
    isAI: Boolean(c.isAI),
  }));

  const fugas = (doc.fugas ?? []) as Array<Record<string, unknown>>;
  const dominanteRaw = fugas.find((f) => f.dominante === true);
  const restoRaw = fugas.filter((f) => f.dominante !== true);

  const ca = doc.condicion_aplicada;
  const cc = (doc.condicion_comercial ?? {}) as {
    moneda?: string;
    precio_por_plan?: { "1": number; "2": number; "3": number };
  };
  const nota = doc.nota as { letra: LetraNota; puntos: number };
  const madurezRaw = (doc.madurez ?? []) as Array<Record<string, unknown>>;

  return {
    cliente: doc.cliente,
    marca: (doc.marca as string | null) ?? null,
    titular: String(doc.titular ?? ""),
    resumen: String(doc.resumen ?? ""),
    sentAt,
    stats: extractStats(doc.as_is as AsIs),
    asIs: doc.as_is as AsIs,
    fugaDominante: dominanteRaw ? toFugaVM(dominanteRaw) : null,
    fugasResto: restoRaw.map(toFugaVM),
    nota: { letra: nota.letra, puntos: nota.puntos },
    benchmarkModulos: benchmarkPorModulo(doc.benchmark),
    madurez: madurezRaw.map((m) => ({
      m: String(m.m ?? ""),
      hoy: Number(m.hoy ?? 0),
      p: m.p as { "1": number; "2": number; "3": number },
    })),
    bands: bandsFrom(comps),
    integraciones: (doc.integraciones ?? []) as Array<
      [string, string, EtiquetaIntegracion]
    >,
    noAplican: (doc.no_aplican ?? []) as Array<[string, string]>,
    advertencias: (doc.advertencias ?? []) as string[],
    planRecomendado: ca.plan_seleccionado,
    moneda: ca.moneda,
    precioListaPorPlan: cc.precio_por_plan ?? { "1": 0, "2": 0, "3": 0 },
    preciosFinales: ca.preciosFinales,
    condicion: {
      pct: ca.descuento_pct,
      vigencia: ca.vigencia,
      lineaCondicion: ca.linea_condicion,
      autor: ca.autor,
      planSeleccionado: ca.plan_seleccionado,
    },
  };
}
