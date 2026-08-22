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
/**
 * Category of a leak-card. Groups the section into three visually distinct
 * blocks. Absent = "fuga" (backward compatible), so older files degrade into
 * the leaks block.
 */
export type CategoriaFuga = "fuga" | "ceguera" | "restriccion";
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

/**
 * The middle axis ("cómo se gestiona") in its hierarchical form: the role is
 * the primary item and `detalle` are subordinate sub-items — never rendered at
 * the same level as the role. Optional; a plain [canal, nota] tuple still works
 * (older files degrade to a flat item).
 */
export interface AsIsGestionFila {
  quien: string;
  nota?: string;
  detalle?: string[];
}

export interface AsIs {
  de_donde_llegan: AsIsFila[];
  /** Accepts the flat tuple form OR the hierarchical {quien, nota, detalle[]}. */
  por_donde_pasan: Array<AsIsFila | AsIsGestionFila>;
  donde_queda: AsIsFila[];
}

/**
 * The executive summary. The pipeline is moving from a single string to a
 * split {parrafo, bullets} so the renderer can show a short paragraph plus a
 * few bullets. A plain string still works (degrades to just the paragraph).
 */
export interface ResumenObjeto {
  parrafo: string;
  bullets?: string[];
}
export type Resumen = string | ResumenObjeto;

/** One plan's personalised one-liner, read from the pipeline (E14). */
export interface PlanFrase {
  /** 1|2|3 or the plan name; when absent, position (index+1) is used. */
  plan?: 1 | 2 | 3;
  nivel?: PlanNombre;
  frase?: string;
}

/** A concrete gap the client closes outside the CRM, for one module (F20). */
export interface BrechaModulo {
  modulo: string;
  accion: string;
}
/** The gap-to-100 reading for one plan: a global read + per-module actions. */
export interface BrechaPlan {
  /** Global reading: how many points remain and why (roadmap tone). */
  lectura: string;
  modulos: BrechaModulo[];
}
/**
 * The pipeline's flat gap shape: a `global` reading (string or { por_que })
 * plus `por_modulo` entries keyed by `m` + `por_que`. Normalised on read.
 */
export interface BrechaGlobalPorModulo {
  global: string | { por_que?: string };
  por_modulo: Array<{ m?: string; modulo?: string; por_que?: string; accion?: string }>;
}

/**
 * `brecha_fuera_de_alcance`: accepts the flat `{ global, por_modulo }` shape the
 * pipeline emits, a `{ lectura, modulos }` reading, OR a per-plan map (reactive:
 * null for a plan means it reaches 100 → the section hides). The renderer NEVER
 * computes the gap; the pipeline decides.
 */
export type BrechaFueraDeAlcance =
  | BrechaPlan
  | BrechaGlobalPorModulo
  | { "1"?: BrechaPlan | null; "2"?: BrechaPlan | null; "3"?: BrechaPlan | null };

export interface Fuga {
  id: string;
  titulo: string;
  estado: EstadoFuga;
  dominante?: boolean;
  /**
   * Which of the three blocks this card belongs to (C7). Absent = "fuga".
   */
  categoria?: CategoriaFuga;
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
   * One-line synthesis of the component (E15). The full spec is NOT drawn on
   * the canvas — it is raised in the specifications session. When present, the
   * canvas shows this single line (falling back to `beneficio`).
   */
  sintesis?: string;
  /**
   * Client-language names of the capabilities this one feeds into (E16), used
   * to draw the "engranaje" connectors behind a toggle. Optional.
   */
  conecta_con?: string[];
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
  resumen: Resumen;
  modo: Modo;
  as_is: AsIs;
  fugas: Fuga[];
  /**
   * Personalised plan one-liners (E14). Either an array or an object keyed by
   * "1"/"2"/"3" (the shape the pipeline actually emits). Optional; falls back
   * to the built-in defaults.
   */
  planes?: PlanFrase[] | Record<string, { frase?: string; frontera?: string }>;
  /** Gap-to-100 reading (F20); optional, section hidden when absent. */
  brecha_fuera_de_alcance?: BrechaFueraDeAlcance;
  madurez: Madurez[];
  /** Optional in newer builds — derived from `madurez` when absent. */
  nota?: Nota;
  componentes: Record<string, Componente>;
  /** Moved into `panel_interno` in newer builds; optional at the top level. */
  no_aplican?: Par[];
  integraciones: Array<[string, string, EtiquetaIntegracion]>;
  /** Moved into `panel_interno` in newer builds; optional at the top level. */
  multiplicador_calculado?: {
    "1": MultiplicadorPlan;
    "2": MultiplicadorPlan;
    "3": MultiplicadorPlan;
  };
  /** Consultant-only bundle (sessions, no_aplican, pricing internals, …). */
  panel_interno?: Record<string, unknown>;
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

/**
 * A note the consultant records against a leak-card DURING the presentation
 * (C10): a confirmation ("sí, así nos pasa") and/or a correction the client
 * volunteered. Append-only and attributable — the original card is never
 * overwritten; these accrue as a log visible in the proposal's registry.
 * This is Atlas working data, NOT part of the propuesta.json contract, so it
 * lives on the storage envelope, never inside `data`.
 */
export interface NotaFuga {
  /** ISO timestamp when recorded. */
  at: string;
  /** Who recorded it (the signed-in consultant, or "consultor" if unknown). */
  autor: string;
  /** Positional index of the leak in `data.fugas` (stable addressing). */
  fugaIdx: number;
  /** The leak's title at the time, so the registry reads without lookup. */
  fugaTitulo: string;
  /** Whether the client confirmed the leak ("sí, así nos pasa"). */
  confirmada: boolean | null;
  /** A correction/matiz the client volunteered, or null. */
  nota: string | null;
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
  /** Archived proposals are hidden from the active list (recoverable). */
  archivado?: boolean;
  /** Manual status override; only "rechazada" (declined) is set by hand. */
  estadoManual?: "rechazada" | null;
  /** Append-only log of the consultant's leak confirmations/corrections (C10). */
  notasFugas?: NotaFuga[];
  data: Proposal;
  /** Immutable sent versions, oldest first. */
  sentVersions: SentVersion[];
}
