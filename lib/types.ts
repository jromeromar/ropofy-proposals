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

/** A [label, note] pair (used by no_aplican). */
export type Par = [string, string];

/**
 * The headline figure of an as_is row, declared explicitly by the contract so
 * the renderer never has to scrape digits out of the free-prose note. Optional:
 * a row without a clear figure simply carries no cifra (and shows no stat).
 */
export interface AsIsCifra {
  /**
   * The number to highlight (e.g. "306", "95%", or 306). The pipeline may send
   * it as text or as a number; the renderer coerces to a string.
   */
  cifra: string | number;
  /** Unit that gives the figure meaning (e.g. "leads/mes"). */
  unidad?: string;
}

/**
 * An as_is row: [canal, nota] with an OPTIONAL third element carrying the
 * headline figure. Indices 0 and 1 keep their meaning, so any consumer that
 * only reads [canal, nota] keeps working.
 */
export type AsIsFila = [string, string] | [string, string, AsIsCifra];

export interface AsIs {
  de_donde_llegan: AsIsFila[];
  por_donde_pasan: AsIsFila[];
  donde_queda: AsIsFila[];
}

export interface Fuga {
  id: string;
  titulo: string;
  estado: EstadoFuga;
  dominante?: boolean;
  cuantificacion: { valor: number | string };
  /** Required when estado === "mitigable". */
  depende_de_tercero?: boolean;
  /** Full prose for the client document (optional). */
  texto?: string;
  /** Verbatim client quote for the client document (optional). */
  evidencia_textual?: string;
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
  /** Optional benefit/description shown beneath the name in the client doc. */
  beneficio?: string;
  /**
   * Whether this feature is shown in the plano. Absent/true = shown; false =
   * removed by the consultant but KEPT in the data (recoverable from the
   * inventory). Excluded features never reach the plano or the client snapshot.
   */
  incluido?: boolean;
  /**
   * Courtesy grant: the (lower) plan into which this higher-tier feature is
   * gifted for THIS proposal. Its natural `plan` is preserved, so it renders
   * unlocked with a "cortesía" gift while still showing which tier it came
   * from. Absent = no courtesy.
   */
  cortesiaPlan?: PlanNombre;
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

/**
 * The commercial condition applied at send time, computed and frozen.
 * `autor` appears to the client (in the condition line); `aprobador` and
 * `motivo` are audit-only and NEVER reach the client document.
 */
export interface AppliedCondition {
  /** null = no discount exists at all (client never sees the word). */
  descuentoPct: number | null;
  /** ISO timestamp; null when there is no discount. */
  vigencia: string | null;
  autor: string;
  aprobador: string | null;
  moneda: string;
  /** List price of the selected plan at send time (integer). */
  precioLista: number;
  /** Final price of the selected plan after discount (integer). */
  precioFinal: number;
  /** Final price per plan after discount (integers). */
  preciosFinales: { "1": number; "2": number; "3": number };
  /** Client-facing line, or null when there is no discount. */
  lineaCondicion: string | null;
}

/**
 * The frozen client document snapshot. Built by deep-copying the proposal and
 * stripping everything the client must never receive. Deliberately typed
 * loosely (it mirrors a sanitised Proposal plus `condicion_aplicada`); the
 * forbidden-keys test guards its contents.
 */
export interface ClientDocument {
  cliente: string;
  /** Brand / trade name, frozen into the snapshot at send time (or null). */
  marca?: string | null;
  condicion_aplicada: {
    plan_seleccionado: 1 | 2 | 3;
    descuento_pct: number | null;
    vigencia: string | null;
    linea_condicion: string | null;
    autor: string;
    moneda: string;
    precio_lista_seleccionado: number;
    precio_final_seleccionado: number;
    preciosFinales: { "1": number; "2": number; "3": number };
  };
  [key: string]: unknown;
}

/** The client's acceptance, recorded server-side at accept time. */
export interface Acceptance {
  at: string; // ISO
  nombre: string;
  correo: string;
  observaciones: string | null;
  /** Plan selected at accept time (may differ from the sent plan). */
  plan: 1 | 2 | 3;
  /** Effective price served at accept time (list or discounted). */
  precioEfectivo: number;
  moneda: string;
  ip: string | null;
  userAgent: string | null;
}

export type EstadoVersion = "enviada" | "aceptada";

/**
 * One immutable, sent version of a proposal, addressable by its token.
 *
 * Proposal MANAGEMENT (status, activity, decision signals) lives in Ropofy
 * (the GHL-based CRM). This app only freezes the snapshot, tokenizes it,
 * captures acceptance, and EMITS events. The only bookkeeping kept here is
 * what an event needs: the double-accept guard (estado + acceptance) and the
 * emission throttle/once flags below.
 */
export interface SentVersion {
  version: string; // "v1", "v2", ...
  token: string; // url-safe, unguessable
  sentAt: string; // ISO
  plan: 1 | 2 | 3;
  autor: string;
  aprobador: string | null;
  /** Internal only — never copied into the client document. */
  motivo: string | null;
  condicion: AppliedCondition;
  clientDocument: ClientDocument;
  /** Stored state. "expirada" is derived at display time, never stored. */
  estado: EstadoVersion;
  acceptance: Acceptance | null;
  /** Last time a `documento_abierto` event was emitted (throttle, 10 min). */
  lastOpenEmitAt: string | null;
  /** Whether `condicion_expirada` has already been emitted (fire once). */
  expiredEmitted: boolean;
}

/** A proposal as persisted by the storage layer. */
export interface StoredProposal {
  id: string;
  /** Legal name (razón social), from the proposal JSON. */
  cliente: string;
  /**
   * Brand / trade name (marca), editable by the consultant. The pipeline JSON
   * only carries the legal name in `cliente`; the brand is captured/corrected
   * here. null/absent = no brand set.
   */
  marca?: string | null;
  version: string;
  /** ISO-8601 timestamp of when it was loaded. */
  createdAt: string;
  /** Workflow state: "borrador" until a version is sent, then "enviada". */
  estado: string;
  data: Proposal;
  /** Immutable sent versions, oldest first. */
  sentVersions: SentVersion[];
}
