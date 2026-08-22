/**
 * Layout logic for "El plano del sistema" (section 6 of the presentation).
 *
 * Pure, framework-free: turns the flat `componentes` map into ordered bands
 * (derived from each component's `journey`), separates the AI components that
 * collapse into a single node, and exposes the plan-gating helpers. Kept out
 * of the component so it can be reasoned about and reused.
 */

import type { Componente, PlanNombre } from "./types";

export type BandName =
  | "Atracción"
  | "Gestión"
  | "Nutrición"
  | "Cierre"
  | "Reactivación"
  | "Referidos y Fidelización"
  | "Tableros";

/** Canonical top-to-bottom order of the journey bands. */
export const BAND_ORDER: BandName[] = [
  "Atracción",
  "Gestión",
  "Nutrición",
  "Cierre",
  "Reactivación",
  "Referidos y Fidelización",
  "Tableros",
];

/** Derive the band a component belongs to from its journey position. */
export function bandFromJourney(journey: number): BandName {
  if (journey <= 9) return "Atracción";
  if (journey <= 49) return "Gestión";
  if (journey <= 69) return "Nutrición";
  if (journey <= 89) return "Cierre";
  if (journey <= 104) return "Reactivación";
  if (journey <= 129) return "Referidos y Fidelización";
  return "Tableros";
}

/** Plan ranking used for gating: higher rank = higher plan. */
export const PLAN_RANK: Record<PlanNombre, 1 | 2 | 3> = {
  fundamental: 1,
  avanzado: 2,
  inteligente: 3,
};

/** Human labels for the numeric plans. */
export const PLAN_LABEL: Record<1 | 2 | 3, string> = {
  1: "Fundamental",
  2: "Avanzado",
  3: "Inteligente",
};

/**
 * Effective unlock rank: a courtesy grant lowers the tier at which a feature
 * unlocks (to the lower of its natural plan and the courtesy plan).
 */
export function planUnlockRank(
  compPlan: PlanNombre,
  cortesiaPlan?: PlanNombre | null,
): number {
  const r = PLAN_RANK[compPlan];
  return cortesiaPlan ? Math.min(r, PLAN_RANK[cortesiaPlan]) : r;
}

/**
 * A component is locked when its EFFECTIVE unlock rank sits above the selected
 * plan (a courtesy grant can unlock it below its natural tier).
 */
export function isLocked(
  compPlan: PlanNombre,
  selectedPlan: number,
  cortesiaPlan?: PlanNombre | null,
): boolean {
  return planUnlockRank(compPlan, cortesiaPlan) > selectedPlan;
}

/**
 * True when a feature is shown ONLY thanks to a courtesy: its natural tier is
 * above the selected plan, but the courtesy grant unlocks it here — so it
 * renders unlocked with a "cortesía" gift.
 */
export function esCortesia(
  compPlan: PlanNombre,
  selectedPlan: number,
  cortesiaPlan?: PlanNombre | null,
): boolean {
  return (
    !!cortesiaPlan &&
    PLAN_RANK[compPlan] > selectedPlan &&
    PLAN_RANK[cortesiaPlan] <= selectedPlan
  );
}

/**
 * The AI components collapse into one node. Detect them by `tipo`: an "ia"
 * token (e.g. "chatbot_ia"), NOT the substring — otherwise "telefonia" would
 * be misread as AI.
 */
export function isAIComponent(comp: Componente): boolean {
  const tipo = String((comp as { tipo?: string }).tipo ?? "").toLowerCase();
  return tipo.includes("chatbot_ia") || /(?:^|_)ia(?:$|_)/.test(tipo);
}

export interface CompEntry {
  id: string;
  comp: Componente;
}

export interface BandLayout {
  name: BandName;
  /** 1-based number among the rendered (non-empty) bands. */
  numero: number;
  /** Non-AI components in this band. */
  regular: CompEntry[];
  /** AI components in this band (collapse into a single node). */
  ai: CompEntry[];
}

/**
 * Build the ordered, numbered bands. Only bands that actually hold at least
 * one component are returned; numbering follows the canonical band order.
 */
/**
 * Parse the pipeline's per-module `benchmark` ({ "Gestión": 1.3, ... }, values
 * on the 0-4 maturity scale) into a clean map. Returns null when the block is
 * absent or not the expected shape — the renderer then shows no sector marker
 * rather than inventing one. (The old fixture's { sector, fuente } shape is
 * simply ignored, so a legacy file degrades quietly.)
 */
export function benchmarkPorModulo(
  benchmark: unknown,
): Record<string, number> | null {
  if (typeof benchmark !== "object" || benchmark === null) return null;
  // Newer builds nest the per-module map under `por_modulo` (alongside
  // `fuente`); older ones put the numbers directly on the object. Read the
  // nested map when present, else the top-level numbers.
  const nested = (benchmark as { por_modulo?: unknown }).por_modulo;
  const source =
    nested && typeof nested === "object" && !Array.isArray(nested)
      ? (nested as Record<string, unknown>)
      : (benchmark as Record<string, unknown>);
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(source)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Anything that can be placed in a band and flagged as an AI component. */
export interface BandItem {
  journey: number;
  isAI: boolean;
}

export interface Band<T> {
  name: BandName;
  numero: number;
  regular: T[];
  ai: T[];
}

/**
 * Generic band grouping for pre-sanitised items (e.g. the client document's
 * id-free components, which carry a precomputed `isAI`). Same ordering and
 * numbering rules as `buildLayout`.
 */
export function bandsFrom<T extends BandItem>(items: T[]): Band<T>[] {
  const buckets = new Map<BandName, { regular: T[]; ai: T[] }>();
  for (const name of BAND_ORDER) buckets.set(name, { regular: [], ai: [] });

  for (const it of items) {
    const bucket = buckets.get(bandFromJourney(it.journey))!;
    (it.isAI ? bucket.ai : bucket.regular).push(it);
  }

  const byJourney = (a: T, b: T) => a.journey - b.journey;
  const bands: Band<T>[] = [];
  let numero = 0;
  for (const name of BAND_ORDER) {
    const bucket = buckets.get(name)!;
    if (bucket.regular.length === 0 && bucket.ai.length === 0) continue;
    numero += 1;
    bands.push({
      name,
      numero,
      regular: bucket.regular.sort(byJourney),
      ai: bucket.ai.sort(byJourney),
    });
  }
  return bands;
}

export function buildLayout(
  componentes: Record<string, Componente>,
): BandLayout[] {
  const buckets = new Map<BandName, { regular: CompEntry[]; ai: CompEntry[] }>();
  for (const name of BAND_ORDER) buckets.set(name, { regular: [], ai: [] });

  for (const [id, comp] of Object.entries(componentes)) {
    // Features the consultant removed stay in the data but leave the plano.
    if (comp.incluido === false) continue;
    const band = bandFromJourney(comp.journey);
    const bucket = buckets.get(band)!;
    if (isAIComponent(comp)) bucket.ai.push({ id, comp });
    else bucket.regular.push({ id, comp });
  }

  // Stable secondary ordering within a band by journey, then name.
  const byJourney = (a: CompEntry, b: CompEntry) =>
    a.comp.journey - b.comp.journey ||
    a.comp.nombre_cliente.localeCompare(b.comp.nombre_cliente);

  const bands: BandLayout[] = [];
  let numero = 0;
  for (const name of BAND_ORDER) {
    const bucket = buckets.get(name)!;
    if (bucket.regular.length === 0 && bucket.ai.length === 0) continue;
    numero += 1;
    bands.push({
      name,
      numero,
      regular: bucket.regular.sort(byJourney),
      ai: bucket.ai.sort(byJourney),
    });
  }
  return bands;
}
