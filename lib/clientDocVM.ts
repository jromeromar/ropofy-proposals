/**
 * View model for the full client document, built on the server from a FROZEN
 * clientDocument snapshot (already id-free). This is the only data that
 * crosses to the client component, so — like presentacionVM — nothing internal
 * can leak into the bundle or the hydration payload.
 */

import { bandsFrom, benchmarkPorModulo, type Band } from "./mapLayout";
import {
  normalizarResumen,
  fraseDePlan,
  benchmarkFuente,
  bloqueDeCategoria,
  type ResumenVM,
} from "./lienzo";
import type {
  ClientDocument,
  AsIs,
  EstadoFuga,
  CategoriaFuga,
  LetraNota,
  PlanNombre,
  Visibilidad,
  EtiquetaIntegracion,
  BrechaFueraDeAlcance,
  PlanFrase,
  Resumen,
} from "./types";

export interface ClientComp {
  key: string;
  nombre: string;
  beneficio: string | null;
  /** One-line synthesis (E15); the card shows this, not the full detail. */
  sintesis: string | null;
  /** Client-language names this capability feeds into (E16 engranaje). */
  conectaCon: string[];
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
  /** Block this card belongs to (C7). Absent in the contract ⇒ "fuga". */
  categoria: CategoriaFuga;
  dominante: boolean;
  /** The third party's name (mitigable fugas), interpolated in the document. */
  dependeDe: string | null;
  cifra: string;
}

export interface MadurezVM {
  m: string;
  hoy: number;
  /** Why the module sits where it does (client-facing reason). */
  porQue: string | null;
  p: { "1": number; "2": number; "3": number };
}

export interface ClientDocVM {
  cliente: string;
  /** Brand / trade name (or null); shown alongside the legal name. */
  marca: string | null;
  titular: string;
  /** Executive summary as a short paragraph + a few bullets (B4). */
  resumen: ResumenVM;
  sentAt: string;
  /** Key figures for "Lo que entendimos": channel → figure + unit. */
  stats: Array<{ canal: string; cifra: string; unidad: string }>;
  datosQueFaltan: string[];
  asIs: AsIs;
  /** Every leak, in order; grouped by `categoria` in the view (C7). */
  fugas: FugaVM[];
  fugaDominante: FugaVM | null;
  fugasResto: FugaVM[];
  nota: { letra: LetraNota; puntos: number };
  /** Sector average maturity per module (0-4), or null. */
  benchmarkModulos: Record<string, number> | null;
  /** Human label for the benchmark source (D12); null when unsafe/absent. */
  benchmarkFuente: string | null;
  /** Sector average as a 0-100 score, or null. */
  puntosSector: number | null;
  madurez: MadurezVM[];
  bands: Band<ClientComp>[];
  integraciones: Array<[string, string, EtiquetaIntegracion]>;
  advertencias: string[];
  planRecomendado: 1 | 2 | 3;
  planRecomendadoPorQue: string | null;
  /** Personalised one-liner per plan (E14); null ⇒ use the built-in default. */
  planFrases: { "1": string | null; "2": string | null; "3": string | null };
  /** Raw gap-to-100 contract block (F20); resolved per plan in the view. */
  brechaFuera: BrechaFueraDeAlcance | null;
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
function extractStats(
  asIs: AsIs,
): Array<{ canal: string; cifra: string; unidad: string }> {
  const cols = [asIs.de_donde_llegan, asIs.por_donde_pasan, asIs.donde_queda];
  const out: Array<{ canal: string; cifra: string; unidad: string }> = [];
  for (const col of cols ?? []) {
    for (const fila of col ?? []) {
      // The middle axis may carry hierarchical { quien, … } objects, which
      // hold no headline figure — only tuple rows contribute a stat tile.
      if (!Array.isArray(fila)) continue;
      const [canal, , extra] = fila;
      // cifra may be text or a number; unidad is optional text.
      const cifra = extra?.cifra == null ? "" : String(extra.cifra).trim();
      if (!cifra) continue;
      const unidad = extra?.unidad == null ? "" : String(extra.unidad).trim();
      out.push({ canal, cifra, unidad });
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
    categoria: bloqueDeCategoria(f.categoria),
    dominante: f.dominante === true,
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
    sintesis: (c.sintesis as string | null) ?? null,
    conectaCon: Array.isArray(c.conecta_con)
      ? (c.conecta_con as unknown[]).filter((x): x is string => typeof x === "string")
      : [],
    plan: c.plan as PlanNombre,
    cortesiaPlan: (c.cortesiaPlan as PlanNombre | null) ?? null,
    vis: c.vis as Visibilidad,
    journey: Number(c.journey ?? 0),
    instancias: Number(c.instancias ?? 1),
    cuota: (c.cuota as string | null) ?? null,
    isAI: Boolean(c.isAI),
  }));

  const fugasRaw = (doc.fugas ?? []) as Array<Record<string, unknown>>;
  const fugas = fugasRaw.map(toFugaVM);
  const dominanteRaw = fugasRaw.find((f) => f.dominante === true);
  const restoRaw = fugasRaw.filter((f) => f.dominante !== true);

  const ca = doc.condicion_aplicada;
  const cc = (doc.condicion_comercial ?? {}) as {
    moneda?: string;
    precio_por_plan?: { "1": number; "2": number; "3": number };
  };
  const nota = doc.nota as { letra: LetraNota; puntos: number };
  const madurezRaw = (doc.madurez ?? []) as Array<Record<string, unknown>>;
  const bench = benchmarkPorModulo(doc.benchmark);
  const planReco = (doc.plan_recomendado ?? {}) as {
    plan?: 1 | 2 | 3;
    por_que?: string;
  };
  const planes = (doc as { planes?: unknown }).planes as PlanFrase[] | undefined;
  // Sector average as a 0-100 score (7 modules × 4 levels = 28).
  const puntosSector = bench
    ? Math.round(
        (Object.values(bench).reduce((a, b) => a + b, 0) / 28) * 100,
      )
    : null;

  return {
    cliente: doc.cliente,
    marca: (doc.marca as string | null) ?? null,
    titular: String(doc.titular ?? ""),
    resumen: normalizarResumen(doc.resumen as Resumen),
    sentAt,
    stats: extractStats(doc.as_is as AsIs),
    // A3: session date + estimated kickoff are NOT shown on the canvas — they
    // move to the consultant's internal panel and never cross to the client.
    datosQueFaltan: ((doc as { datos_que_faltan?: unknown }).datos_que_faltan ??
      []) as string[],
    asIs: doc.as_is as AsIs,
    fugas,
    fugaDominante: dominanteRaw ? toFugaVM(dominanteRaw) : null,
    fugasResto: restoRaw.map(toFugaVM),
    nota: { letra: nota.letra, puntos: nota.puntos },
    benchmarkModulos: bench,
    benchmarkFuente: benchmarkFuente((doc as { benchmark?: unknown }).benchmark).texto,
    puntosSector,
    madurez: madurezRaw.map((m) => ({
      m: String(m.m ?? ""),
      hoy: Number(m.hoy ?? 0),
      porQue: (m.por_que as string | null) ?? null,
      p: m.p as { "1": number; "2": number; "3": number },
    })),
    bands: bandsFrom(comps),
    integraciones: (doc.integraciones ?? []) as Array<
      [string, string, EtiquetaIntegracion]
    >,
    // E18: "lo que no se dibuja" (no_aplican) is removed from the client canvas
    // and never crosses here — it lives in the consultant's internal panel.
    advertencias: (doc.advertencias ?? []) as string[],
    planRecomendado: ca.plan_seleccionado,
    planRecomendadoPorQue: planReco.por_que ?? null,
    planFrases: {
      "1": fraseDePlan(planes, 1),
      "2": fraseDePlan(planes, 2),
      "3": fraseDePlan(planes, 3),
    },
    brechaFuera:
      ((doc as { brecha_fuera_de_alcance?: unknown })
        .brecha_fuera_de_alcance as BrechaFueraDeAlcance | undefined) ?? null,
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
