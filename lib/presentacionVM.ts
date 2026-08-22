/**
 * View model for the consultant presentation.
 *
 * CONTRACTUAL BOUNDARY: this is the ONLY data that crosses from the server
 * to the client component. It is built from `propuesta.json` but deliberately
 * DROPS everything internal — component ids, `tipo`, `multiplicador_calculado`,
 * the pricing internals (base_por_plan, tramos_factor, desglose_interno),
 * `esfuerzo`, `advertencias`, `resumen`, fuga ids. Nothing forbidden can leak
 * into the client bundle or the hydration payload because it never leaves here.
 */

import {
  buildLayout,
  benchmarkPorModulo,
  bandFromJourney,
  type BandName,
} from "./mapLayout";
import { fraseDePlan, benchmarkFuente, bloqueDeCategoria } from "./lienzo";
import { notaHoy } from "./grade";
import { razonSocialDe } from "./identidad";
import type {
  Proposal,
  AsIs,
  EstadoFuga,
  CategoriaFuga,
  LetraNota,
  PlanNombre,
  EtiquetaIntegracion,
  BrechaFueraDeAlcance,
} from "./types";

/** One row of the feature inventory (every component, included or removed). */
export interface InventarioItem {
  /** Positional index into `componentes` (same idx used for inline edits). */
  idx: number;
  nombre: string;
  /** Natural tier (from the pipeline). */
  plan: PlanNombre;
  /** Courtesy grant tier, or null (a gift into a lower plan). */
  cortesiaPlan: PlanNombre | null;
  banda: BandName;
  /** Whether it is currently shown in the plano. */
  incluido: boolean;
}

export interface CompVM {
  /** Synthesised, id-free React key (never the internal component id). */
  key: string;
  /** Courtesy grant tier, or null (see Componente.cortesiaPlan). */
  cortesiaPlan: PlanNombre | null;
  /**
   * Positional index into the proposal's `componentes` enumeration. A plain
   * number (not an internal id), used only to address the field for inline
   * edits; the server resolves it back to the real key.
   */
  idx: number;
  nombre: string;
  /** One-line synthesis (E15); shown on the card, not the full detail. */
  sintesis: string | null;
  /** Client-language names this capability feeds into (E16 engranaje). */
  conectaCon: string[];
  plan: PlanNombre;
  instancias: number;
  cuota: string | null;
}

export interface BandVM {
  name: BandName;
  numero: number;
  regular: CompVM[];
  ai: CompVM[];
}

export interface FugaVM {
  /** Positional index into the proposal's `fugas` array (for inline edits). */
  idx: number;
  titulo: string;
  estado: EstadoFuga;
  /** Block this card belongs to (C7). Absent in the contract ⇒ "fuga". */
  categoria: CategoriaFuga;
  dominante: boolean;
  /** Headline figure (cuantificacion.valor), for the card. */
  valor: string;
  /** Verbatim client quote (shown smaller than the title, C8). */
  evidencia: string | null;
  dependeDeTercero: boolean;
}

export interface MadurezVM {
  m: string;
  hoy: number;
  p: { "1": number; "2": number; "3": number };
}

export interface PresentacionVM {
  cliente: string;
  titular: string;
  asIs: AsIs;
  /** Every leak, in order; grouped by `categoria` in the view (C7). */
  fugas: FugaVM[];
  fugaDominante: { idx: number; titulo: string; valor: string } | null;
  fugasResto: FugaVM[];
  nota: { letra: LetraNota; puntos: number };
  /** Sector average maturity per module (0-4), or null. */
  benchmarkModulos: Record<string, number> | null;
  /** Human label for the benchmark source (D12); null when unsafe/absent. */
  benchmarkFuente: string | null;
  bands: BandVM[];
  integraciones: Array<[string, string, EtiquetaIntegracion]>;
  madurez: MadurezVM[];
  /** Every feature (included AND removed), for the inventory drawer. */
  inventario: InventarioItem[];
  planRecomendado: 1 | 2 | 3;
  /** Personalised one-liner per plan (E14); null ⇒ use the built-in default. */
  planFrases: { "1": string | null; "2": string | null; "3": string | null };
  /** Raw gap-to-100 contract block (F20); resolved per plan in the view. */
  brechaFuera: BrechaFueraDeAlcance | null;
  moneda: string;
  precioPorPlan: { "1": number; "2": number; "3": number };
}

export function toPresentacionVM(proposal: Proposal): PresentacionVM {
  // Positional index of each component in the `componentes` enumeration. The
  // server resolves this number back to the real (internal) key on save, so
  // the key itself never crosses to the client.
  const idxDe = new Map<object, number>();
  Object.values(proposal.componentes).forEach((c, i) => idxDe.set(c, i));

  const layout = buildLayout(proposal.componentes);
  const bands: BandVM[] = layout.map((band) => ({
    name: band.name,
    numero: band.numero,
    regular: band.regular.map((e, i) =>
      toCompVM(e.comp, `b${band.numero}r${i}`, idxDe.get(e.comp) ?? -1),
    ),
    ai: band.ai.map((e, i) =>
      toCompVM(e.comp, `b${band.numero}a${i}`, idxDe.get(e.comp) ?? -1),
    ),
  }));

  const dominanteIdx = proposal.fugas.findIndex((f) => f.dominante === true);
  const fugas: FugaVM[] = proposal.fugas.map((f, idx) => toFugaVM(f, idx));
  const fugasResto = fugas.filter((f) => !f.dominante);

  return {
    cliente: razonSocialDe(proposal),
    titular: proposal.titular,
    asIs: proposal.as_is,
    fugas,
    fugaDominante:
      dominanteIdx >= 0
        ? {
            idx: dominanteIdx,
            titulo: proposal.fugas[dominanteIdx].titulo,
            valor: String(proposal.fugas[dominanteIdx].cuantificacion.valor),
          }
        : null,
    fugasResto,
    // `nota` optional in newer builds — derive from `madurez` when absent.
    nota:
      proposal.nota && proposal.nota.letra != null && proposal.nota.puntos != null
        ? { letra: proposal.nota.letra, puntos: proposal.nota.puntos }
        : notaHoy(proposal.madurez),
    benchmarkModulos: benchmarkPorModulo(
      (proposal as { benchmark?: unknown }).benchmark,
    ),
    benchmarkFuente: benchmarkFuenteTexto(proposal),
    bands,
    integraciones: proposal.integraciones,
    madurez: proposal.madurez.map((m) => ({ m: m.m, hoy: m.hoy, p: m.p })),
    inventario: Object.values(proposal.componentes).map((c, idx) => ({
      idx,
      nombre: c.nombre_cliente,
      plan: c.plan,
      cortesiaPlan: c.cortesiaPlan ?? null,
      banda: bandFromJourney(c.journey),
      incluido: c.incluido !== false,
    })),
    planRecomendado: proposal.plan_recomendado.plan,
    planFrases: {
      "1": fraseDePlan(proposal.planes, 1),
      "2": fraseDePlan(proposal.planes, 2),
      "3": fraseDePlan(proposal.planes, 3),
    },
    brechaFuera: proposal.brecha_fuera_de_alcance ?? null,
    moneda: proposal.condicion_comercial.moneda,
    precioPorPlan: proposal.condicion_comercial.precio_por_plan,
  };
}

function toFugaVM(f: Proposal["fugas"][number], idx: number): FugaVM {
  const dep = f.depende_de_tercero;
  return {
    idx,
    titulo: f.titulo,
    estado: f.estado,
    categoria: bloqueDeCategoria(f.categoria),
    dominante: f.dominante === true,
    valor: f.cuantificacion?.valor != null ? String(f.cuantificacion.valor) : "",
    evidencia:
      typeof f.evidencia_textual === "string" && f.evidencia_textual.trim() !== ""
        ? f.evidencia_textual
        : null,
    dependeDeTercero: Boolean(dep),
  };
}

/** Benchmark source label for the presentation (D12); null when unsafe. */
function benchmarkFuenteTexto(proposal: Proposal): string | null {
  return benchmarkFuente((proposal as { benchmark?: unknown }).benchmark).texto;
}

function toCompVM(
  comp: Proposal["componentes"][string],
  key: string,
  idx: number,
): CompVM {
  return {
    key,
    idx,
    cortesiaPlan: comp.cortesiaPlan ?? null,
    nombre: comp.nombre_cliente,
    sintesis:
      typeof comp.sintesis === "string" && comp.sintesis.trim() !== ""
        ? comp.sintesis
        : null,
    conectaCon: Array.isArray(comp.conecta_con)
      ? comp.conecta_con.filter((x): x is string => typeof x === "string")
      : [],
    plan: comp.plan,
    instancias: comp.instancias,
    cuota: comp.cuota ?? null,
  };
}
