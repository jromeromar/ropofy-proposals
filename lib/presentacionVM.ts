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
import type {
  Proposal,
  AsIs,
  EstadoFuga,
  LetraNota,
  PlanNombre,
  EtiquetaIntegracion,
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
  fugaDominante: { idx: number; titulo: string; valor: string } | null;
  fugasResto: FugaVM[];
  nota: { letra: LetraNota; puntos: number };
  /** Sector average maturity per module (0-4), or null. */
  benchmarkModulos: Record<string, number> | null;
  bands: BandVM[];
  integraciones: Array<[string, string, EtiquetaIntegracion]>;
  noAplican: Array<[string, string]>;
  madurez: MadurezVM[];
  /** Every feature (included AND removed), for the inventory drawer. */
  inventario: InventarioItem[];
  planRecomendado: 1 | 2 | 3;
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
  const fugasResto: FugaVM[] = proposal.fugas
    .map((f, idx) => ({ f, idx }))
    .filter(({ f }) => f.dominante !== true)
    .map(({ f, idx }) => ({
      idx,
      titulo: f.titulo,
      estado: f.estado,
      dependeDeTercero: Boolean(f.depende_de_tercero),
    }));

  return {
    cliente: proposal.cliente,
    titular: proposal.titular,
    asIs: proposal.as_is,
    fugaDominante:
      dominanteIdx >= 0
        ? {
            idx: dominanteIdx,
            titulo: proposal.fugas[dominanteIdx].titulo,
            valor: String(proposal.fugas[dominanteIdx].cuantificacion.valor),
          }
        : null,
    fugasResto,
    nota: { letra: proposal.nota.letra, puntos: proposal.nota.puntos },
    benchmarkModulos: benchmarkPorModulo(
      (proposal as { benchmark?: unknown }).benchmark,
    ),
    bands,
    integraciones: proposal.integraciones,
    noAplican: proposal.no_aplican,
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
    moneda: proposal.condicion_comercial.moneda,
    precioPorPlan: proposal.condicion_comercial.precio_por_plan,
  };
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
    plan: comp.plan,
    instancias: comp.instancias,
    cuota: comp.cuota ?? null,
  };
}
