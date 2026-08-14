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

/** A component is locked when its plan sits ABOVE the selected plan. */
export function isLocked(compPlan: PlanNombre, selectedPlan: number): boolean {
  return PLAN_RANK[compPlan] > selectedPlan;
}

/** The AI components collapse into one node. Detect them by `tipo`. */
export function isAIComponent(comp: Componente): boolean {
  const tipo = String((comp as { tipo?: string }).tipo ?? "").toLowerCase();
  return tipo.includes("chatbot_ia") || tipo.includes("ia");
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
export function buildLayout(
  componentes: Record<string, Componente>,
): BandLayout[] {
  const buckets = new Map<BandName, { regular: CompEntry[]; ai: CompEntry[] }>();
  for (const name of BAND_ORDER) buckets.set(name, { regular: [], ai: [] });

  for (const [id, comp] of Object.entries(componentes)) {
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
