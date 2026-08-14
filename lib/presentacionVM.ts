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

import { buildLayout, type BandName } from "./mapLayout";
import type {
  Proposal,
  AsIs,
  EstadoFuga,
  LetraNota,
  PlanNombre,
  EtiquetaIntegracion,
} from "./types";

export interface CompVM {
  /** Synthesised, id-free React key (never the internal component id). */
  key: string;
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
  fugaDominante: { titulo: string; valor: string } | null;
  fugasResto: FugaVM[];
  nota: { letra: LetraNota; puntos: number };
  benchmarkSector: number | null;
  bands: BandVM[];
  integraciones: Array<[string, string, EtiquetaIntegracion]>;
  noAplican: Array<[string, string]>;
  madurez: MadurezVM[];
  planRecomendado: 1 | 2 | 3;
  moneda: string;
  precioPorPlan: { "1": number; "2": number; "3": number };
}

export function toPresentacionVM(proposal: Proposal): PresentacionVM {
  const layout = buildLayout(proposal.componentes);
  const bands: BandVM[] = layout.map((band) => ({
    name: band.name,
    numero: band.numero,
    regular: band.regular.map((e, i) => toCompVM(e.comp, `b${band.numero}r${i}`)),
    ai: band.ai.map((e, i) => toCompVM(e.comp, `b${band.numero}a${i}`)),
  }));

  const dominante = proposal.fugas.find((f) => f.dominante === true);
  const fugasResto: FugaVM[] = proposal.fugas
    .filter((f) => f.dominante !== true)
    .map((f) => ({
      titulo: f.titulo,
      estado: f.estado,
      dependeDeTercero: Boolean(f.depende_de_tercero),
    }));

  const benchmark = (proposal as { benchmark?: { sector?: number } }).benchmark;

  return {
    cliente: proposal.cliente,
    titular: proposal.titular,
    asIs: proposal.as_is,
    fugaDominante: dominante
      ? { titulo: dominante.titulo, valor: String(dominante.cuantificacion.valor) }
      : null,
    fugasResto,
    nota: { letra: proposal.nota.letra, puntos: proposal.nota.puntos },
    benchmarkSector: typeof benchmark?.sector === "number" ? benchmark.sector : null,
    bands,
    integraciones: proposal.integraciones,
    noAplican: proposal.no_aplican,
    madurez: proposal.madurez.map((m) => ({ m: m.m, hoy: m.hoy, p: m.p })),
    planRecomendado: proposal.plan_recomendado.plan,
    moneda: proposal.condicion_comercial.moneda,
    precioPorPlan: proposal.condicion_comercial.precio_por_plan,
  };
}

function toCompVM(
  comp: Proposal["componentes"][string],
  key: string,
): CompVM {
  return {
    key,
    nombre: comp.nombre_cliente,
    plan: comp.plan,
    instancias: comp.instancias,
    cuota: comp.cuota ?? null,
  };
}
