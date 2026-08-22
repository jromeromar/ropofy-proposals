/**
 * Pure, framework-free normalizers for the canvas revision (ago-2026).
 *
 * Every function here READS from the contract and degrades gracefully when a
 * new field has not arrived yet — the renderer never infers, completes or
 * calculates. Kept out of the view models so it can be reasoned about and
 * unit-tested in isolation.
 */

import type {
  Resumen,
  PlanFrase,
  PlanNombre,
  CategoriaFuga,
  BrechaFueraDeAlcance,
  BrechaPlan,
  AsIsFila,
  AsIsGestionFila,
} from "./types";

const PLAN_POR_NOMBRE: Record<PlanNombre, 1 | 2 | 3> = {
  fundamental: 1,
  avanzado: 2,
  inteligente: 3,
};

/**
 * Map the pipeline's `categoria` to one of the three display blocks (C7). The
 * contract vocabulary is richer than the three block names — e.g. the pipeline
 * emits `friccion_propia` for a self-imposed restriction — so several raw
 * values fold into "restriccion". Anything unrecognised (or absent) degrades to
 * "fuga", the general case.
 */
export function bloqueDeCategoria(raw: unknown): CategoriaFuga {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (v === "ceguera" || v === "cegueras") return "ceguera";
  if (
    v === "restriccion" ||
    v === "restricciones" ||
    v === "friccion_propia" ||
    v === "friccion" ||
    v === "friccion_externa"
  )
    return "restriccion";
  return "fuga";
}

export interface ResumenVM {
  parrafo: string;
  bullets: string[];
}

/**
 * Normalize `resumen` (B4): a string degrades to just the paragraph; an object
 * yields { parrafo, bullets }. Anything else → empty.
 */
export function normalizarResumen(resumen: Resumen | undefined | null): ResumenVM {
  if (typeof resumen === "string") return { parrafo: resumen, bullets: [] };
  if (resumen && typeof resumen === "object") {
    const parrafo = typeof resumen.parrafo === "string" ? resumen.parrafo : "";
    const bullets = Array.isArray(resumen.bullets)
      ? resumen.bullets.filter((b): b is string => typeof b === "string")
      : [];
    return { parrafo, bullets };
  }
  return { parrafo: "", bullets: [] };
}

/**
 * The personalised one-liner for a plan (E14), or null when the pipeline has
 * not sent one — the caller then uses its built-in default. Entries are keyed
 * by `plan` (1|2|3) or `nivel` (name); when neither is present, by position.
 */
export function fraseDePlan(
  planes: PlanFrase[] | undefined | null,
  plan: 1 | 2 | 3,
): string | null {
  if (!Array.isArray(planes)) return null;
  for (let i = 0; i < planes.length; i++) {
    const p = planes[i];
    if (!p || typeof p !== "object") continue;
    const num =
      p.plan === 1 || p.plan === 2 || p.plan === 3
        ? p.plan
        : p.nivel && p.nivel in PLAN_POR_NOMBRE
          ? PLAN_POR_NOMBRE[p.nivel]
          : i + 1;
    if (num === plan && typeof p.frase === "string" && p.frase.trim() !== "") {
      return p.frase;
    }
  }
  return null;
}

export interface BenchmarkFuenteVM {
  /** The label to show, or null when there is nothing safe to show. */
  texto: string | null;
  /**
   * True when the pipeline's `fuente` carried digits (a sample size). Per D12
   * the sample size must NEVER be shown; the renderer suppresses the text and
   * the consultant checklist flags it as a pipeline error.
   */
  tieneDigitos: boolean;
}

/**
 * The benchmark source label (D12), read from `benchmark.fuente`. If it carries
 * digits it is treated as a pipeline error: the text is suppressed (texto:null)
 * and `tieneDigitos` is raised so the checklist can report it.
 */
export function benchmarkFuente(benchmark: unknown): BenchmarkFuenteVM {
  if (
    benchmark &&
    typeof benchmark === "object" &&
    !Array.isArray(benchmark) &&
    typeof (benchmark as { fuente?: unknown }).fuente === "string"
  ) {
    const fuente = (benchmark as { fuente: string }).fuente.trim();
    if (fuente === "") return { texto: null, tieneDigitos: false };
    const tieneDigitos = /\d/.test(fuente);
    return { texto: tieneDigitos ? null : fuente, tieneDigitos };
  }
  return { texto: null, tieneDigitos: false };
}

/**
 * Resolve the gap-to-100 reading for a plan (F20). Accepts the per-plan keyed
 * shape ({ "1": ..., "2": ..., "3": ... }, where null means the plan reaches
 * 100 → hide) or a single flat reading used for every plan. Returns null when
 * there is nothing to show (absent, or that plan reaches 100). The renderer
 * NEVER computes the gap — this only READS what the pipeline sent.
 */
export function brechaDePlan(
  brecha: BrechaFueraDeAlcance | undefined | null,
  plan: 1 | 2 | 3,
): BrechaPlan | null {
  if (!brecha || typeof brecha !== "object") return null;
  const keyed = brecha as Record<string, unknown>;
  const perPlan =
    "1" in keyed || "2" in keyed || "3" in keyed;
  const candidate = perPlan
    ? (keyed[String(plan)] as unknown)
    : (brecha as unknown);
  if (!candidate || typeof candidate !== "object") return null;
  const c = candidate as { lectura?: unknown; modulos?: unknown };
  const lectura = typeof c.lectura === "string" ? c.lectura : "";
  const modulos = Array.isArray(c.modulos)
    ? c.modulos
        .filter(
          (m): m is { modulo: unknown; accion: unknown } =>
            !!m && typeof m === "object",
        )
        .map((m) => ({
          modulo: String((m as { modulo?: unknown }).modulo ?? ""),
          accion: String((m as { accion?: unknown }).accion ?? ""),
        }))
        .filter((m) => m.modulo !== "" || m.accion !== "")
    : [];
  if (lectura === "" && modulos.length === 0) return null;
  return { lectura, modulos };
}

export interface GestionFilaVM {
  quien: string;
  nota: string | null;
  detalle: string[];
}

/**
 * Normalize a middle-axis row (B6). The hierarchical { quien, nota, detalle[] }
 * keeps the role as the primary item and details as subordinate sub-items; the
 * legacy [canal, nota] tuple degrades to a flat item (no sub-items).
 */
export function normalizarGestionFila(
  fila: AsIsFila | AsIsGestionFila,
): GestionFilaVM {
  if (Array.isArray(fila)) {
    return {
      quien: String(fila[0] ?? ""),
      nota: fila[1] != null && String(fila[1]).trim() !== "" ? String(fila[1]) : null,
      detalle: [],
    };
  }
  const f = fila as AsIsGestionFila;
  return {
    quien: String(f.quien ?? ""),
    nota: f.nota != null && String(f.nota).trim() !== "" ? String(f.nota) : null,
    detalle: Array.isArray(f.detalle)
      ? f.detalle.filter((d): d is string => typeof d === "string")
      : [],
  };
}
