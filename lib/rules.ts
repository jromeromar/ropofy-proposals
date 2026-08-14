/**
 * Hard, non-negotiable rules for what may ever reach a client's eyes.
 *
 * These are contractual, not stylistic. The renderer (any screen, any
 * audience) must obey them. `forbiddenContentCheck` is the automated guard:
 * point it at rendered output and it fails loudly if anything internal leaked.
 */

/**
 * Internal component ids are lowercase words joined by hyphens
 * (e.g. "gestion-base-contactos"). They are an implementation detail and
 * must never appear in client-facing output, nor as a public name in
 * `no_aplican`.
 */
export const INTERNAL_ID_PATTERN = /[a-z]{2,}(?:-[a-z]{2,})+/;

/** Global variant used to scan a whole document for internal ids. */
export const INTERNAL_ID_PATTERN_GLOBAL = /[a-z]{2,}(?:-[a-z]{2,})+/g;

/**
 * Words that expose the internal cost model. They belong to the consultant's
 * private math, never to the rendered document.
 */
export const FORBIDDEN_WORDS = ["esfuerzo", "jornadas", "multiplicador"] as const;

/**
 * The price formula (base × factor of the complexity tramo). Rendering the
 * arithmetic would reveal how the number is built; only the final price ships.
 */
export const PRICE_FORMULA_PATTERN = /base\s*[×x]\s*factor|config\s*\/\s*piezas/i;

/** Currency/number locale for every price shown anywhere. */
export const LOCALE = "es-CO";

export interface ForbiddenContentResult {
  ok: boolean;
  /** One human-readable Spanish reason per distinct violation. */
  violations: string[];
}

/**
 * Reduce HTML to the text a viewer actually reads: drop tags (and thus every
 * attribute — class names, hrefs, data-*, title tooltips), then collapse
 * whitespace. We scan this text, not the raw markup, so a kebab-case CSS
 * class or a slug in a link href never counts as leaked internal content.
 */
export function visibleText(html: string): string {
  return String(html ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Scan rendered output for anything that must never be shown to a client.
 * Pure function — no DOM, safe on the server and in tests. Only the visible
 * text is inspected (see `visibleText`).
 */
export function forbiddenContentCheck(html: string): ForbiddenContentResult {
  const violations: string[] = [];
  const haystack = visibleText(html);
  const lower = haystack.toLowerCase();

  for (const word of FORBIDDEN_WORDS) {
    if (lower.includes(word)) {
      violations.push(`Contenido prohibido: aparece la palabra interna «${word}».`);
    }
  }

  if (PRICE_FORMULA_PATTERN.test(haystack)) {
    violations.push("Contenido prohibido: se filtró la fórmula interna de precio.");
  }

  const idMatch = haystack.match(INTERNAL_ID_PATTERN_GLOBAL);
  if (idMatch) {
    // De-duplicate the offending tokens for a readable message.
    const unique = Array.from(new Set(idMatch));
    for (const token of unique) {
      violations.push(`Contenido prohibido: se filtró un id interno de componente («${token}»).`);
    }
  }

  return { ok: violations.length === 0, violations };
}

/**
 * Format a price as a clean integer with its currency, in es-CO locale.
 * Example: formatPrice(2070, "USD") -> "$2.070 USD".
 */
export function formatPrice(value: number, moneda: string): string {
  const rounded = Math.round(value);
  const grouped = new Intl.NumberFormat(LOCALE, {
    maximumFractionDigits: 0,
  }).format(rounded);
  return `$${grouped} ${moneda}`;
}
