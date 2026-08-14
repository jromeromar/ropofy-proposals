/**
 * Type contract for `propuesta.json`, the single bridge produced by the
 * upstream pipeline. The renderer knows nothing about the ficha or the
 * diagnostico: everything the canvas shows comes from this shape.
 *
 * These types describe the SUBSET this foundation validates and stores.
 * The pipeline may add more keys; unknown keys are ignored, never rendered.
 */

export type Modo = "A" | "B";
export type PlanNombre = "fundamental" | "avanzado" | "inteligente";
export type Visibilidad = "front" | "back" | "ambos";
export type EstadoFuga = "activa" | "mitigable" | "fuera_de_alcance";
export type LetraNota = "A" | "B" | "C" | "D" | "E" | "F";
export type EtiquetaIntegracion =
  | "incluido"
  | "consumo_variable"
  | "licencia_del_cliente"
  | "desarrollo_a_cotizar";

/** A [label, note] pair used across the as_is section. */
export type Par = [string, string];

export interface AsIs {
  de_donde_llegan: Par[];
  por_donde_pasan: Par[];
  donde_queda: Par[];
}

export interface Fuga {
  id: string;
  titulo: string;
  estado: EstadoFuga;
  dominante?: boolean;
  cuantificacion: { valor: number | string };
  /** Required when estado === "mitigable". */
  depende_de_tercero?: boolean;
}

export interface Madurez {
  m: string;
  hoy: number; // 0-4
  por_que: string;
  p: { "1": number; "2": number; "3": number }; // 0-4 each
}

export interface Nota {
  puntos: number; // 0-100
  letra: LetraNota;
}

export interface Componente {
  id?: string;
  nombre_cliente: string;
  plan: PlanNombre;
  instancias: number; // >= 1
  vis: Visibilidad;
  journey: number;
  cuota?: string | null;
}

export interface MultiplicadorPlan {
  piezas: number;
  config: number;
}

export interface CondicionComercial {
  moneda: string;
  base_por_plan: Record<string, number>;
  tramos_factor: Array<[number, number]>;
  precio_por_plan: { "1": number; "2": number; "3": number };
  limite_descuento_sin_aprobacion: number; // 0-1
}

export interface PlanRecomendado {
  plan: 1 | 2 | 3;
  por_que: string;
}

export interface Proposal {
  cliente: string;
  titular: string;
  resumen: string;
  modo: Modo;
  as_is: AsIs;
  fugas: Fuga[];
  madurez: Madurez[];
  nota: Nota;
  componentes: Record<string, Componente>;
  no_aplican: Par[];
  integraciones: Array<[string, string, EtiquetaIntegracion]>;
  multiplicador_calculado: {
    "1": MultiplicadorPlan;
    "2": MultiplicadorPlan;
    "3": MultiplicadorPlan;
  };
  condicion_comercial: CondicionComercial;
  plan_recomendado: PlanRecomendado;
  advertencias: string[];
  // The pipeline emits additional keys (sesiones, benchmark, ...) that this
  // foundation does not need; they are carried through storage untouched.
  [key: string]: unknown;
}

/** A proposal as persisted by the storage layer. */
export interface StoredProposal {
  id: string;
  cliente: string;
  version: string;
  /** ISO-8601 timestamp of when it was loaded. */
  createdAt: string;
  /** Workflow state. "borrador" for now; will grow later. */
  estado: string;
  data: Proposal;
}
