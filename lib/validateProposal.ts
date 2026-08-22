/**
 * Structural validation of a `propuesta.json` before anything is rendered.
 *
 * Pure function: no I/O, no throwing. It reports EVERY problem it finds
 * (not fail-fast) so the consultant fixes the whole file in one pass.
 *
 * Hardening contract:
 *  - `null` is treated the same as an absent key for optional fields.
 *  - enum values (estado, plan, vis, etiqueta, letra) are trimmed before
 *    comparison, so stray whitespace never rejects a valid value.
 *  - when a field has the wrong TYPE, the message says which type arrived
 *    ("«cliente» debe ser texto y llegó un objeto").
 *  - every message includes the offending VALUE it actually read.
 * All messages are in Spanish.
 */

const PLANES = ["fundamental", "avanzado", "inteligente"];
const VIS = ["front", "back", "ambos"];
const ESTADOS_FUGA = ["activa", "mitigable", "fuera_de_alcance"];
const LETRAS_NOTA = ["A", "B", "C", "D", "E", "F"];
const ETIQUETAS_INTEGRACION = [
  "incluido",
  "consumo_variable",
  "licencia_del_cliente",
  "desarrollo_a_cotizar",
];

/** A nombre that IS an internal id: lowercase words joined by hyphens. */
const INTERNAL_ID_EXACT = /^[a-z]{2,}(?:-[a-z]{2,})+$/;

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

// --- type helpers -------------------------------------------------------

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function isString(v: unknown): v is string {
  return typeof v === "string";
}
function isInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v);
}
function isNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}
/** Optional keys: null and undefined both mean "absent". */
function isAbsent(v: unknown): boolean {
  return v === null || v === undefined;
}
/** Spanish name of the runtime type that arrived. */
function tipoEs(v: unknown): string {
  if (v === null) return "nulo";
  if (v === undefined) return "ausente";
  if (Array.isArray(v)) return "un arreglo";
  switch (typeof v) {
    case "string":
      return "texto";
    case "number":
      return "un número";
    case "boolean":
      return "un booleano";
    case "object":
      return "un objeto";
    default:
      return typeof v;
  }
}
/** A short, safe rendering of the offending value for a message. */
function muestra(v: unknown): string {
  if (v === undefined) return "ausente";
  if (v === null) return "nulo";
  if (typeof v === "string") {
    const s = v.length > 40 ? `${v.slice(0, 40)}…` : v;
    return `«${s}»`;
  }
  try {
    const s = JSON.stringify(v);
    return s.length > 60 ? `${s.slice(0, 60)}…` : s;
  } catch {
    return String(v);
  }
}
function trimEnum(v: unknown): string | null {
  return typeof v === "string" ? v.trim() : null;
}

// --- reusable field checkers (push type-aware, value-bearing messages) --

function checkTexto(v: unknown, nombre: string, errors: string[]): boolean {
  if (typeof v !== "string") {
    errors.push(`El bloque «${nombre}» debe ser texto y llegó ${tipoEs(v)} (${muestra(v)}).`);
    return false;
  }
  if (v.trim() === "") {
    errors.push(`El bloque «${nombre}» no puede estar vacío.`);
    return false;
  }
  return true;
}

function checkEnum(
  v: unknown,
  nombre: string,
  allowed: string[],
  errors: string[],
): void {
  if (typeof v !== "string") {
    errors.push(
      `El bloque «${nombre}» debe ser texto (uno de: ${allowed.join(", ")}) y llegó ${tipoEs(v)} (${muestra(v)}).`,
    );
    return;
  }
  if (!allowed.includes(v.trim())) {
    errors.push(
      `El bloque «${nombre}» tiene un valor inválido (${muestra(v)}); debe ser uno de: ${allowed.join(", ")}.`,
    );
  }
}

function checkRango(
  v: unknown,
  nombre: string,
  min: number,
  max: number,
  errors: string[],
): void {
  if (!isNumber(v)) {
    errors.push(`El bloque «${nombre}» debe ser un número y llegó ${tipoEs(v)} (${muestra(v)}).`);
    return;
  }
  if (v < min || v > max) {
    errors.push(`El bloque «${nombre}» debe estar entre ${min} y ${max} (llegó ${v}).`);
  }
}

function checkEntero(
  v: unknown,
  nombre: string,
  errors: string[],
  min?: number,
): void {
  if (!isNumber(v)) {
    errors.push(`El bloque «${nombre}» debe ser un entero y llegó ${tipoEs(v)} (${muestra(v)}).`);
    return;
  }
  if (!Number.isInteger(v)) {
    errors.push(`El bloque «${nombre}» debe ser un entero sin decimales (llegó ${v}).`);
    return;
  }
  if (min !== undefined && v < min) {
    errors.push(`El bloque «${nombre}» debe ser mayor o igual a ${min} (llegó ${v}).`);
  }
}

/** A [label, note] pair: array of exactly two strings. */
function isPair(v: unknown): v is [string, string] {
  return Array.isArray(v) && v.length === 2 && isString(v[0]) && isString(v[1]);
}

/**
 * An as_is row: [canal, nota] and an OPTIONAL third element { cifra: string,
 * unidad?: string }. Indices 0 and 1 are always two strings.
 */
function isAsIsFila(v: unknown): boolean {
  if (!Array.isArray(v) || v.length < 2 || v.length > 3) return false;
  if (!isString(v[0]) || !isString(v[1])) return false;
  if (v.length === 2) return true;
  const extra = v[2];
  if (!isPlainObject(extra)) return false;
  // `cifra` may arrive as text ("306") or a number (306) from the pipeline.
  if (!isString(extra.cifra) && typeof extra.cifra !== "number") return false;
  if ("unidad" in extra && extra.unidad != null && !isString(extra.unidad))
    return false;
  return true;
}

/**
 * `resumen` accepts the legacy string OR the new { parrafo, bullets? } object.
 * A string must be non-empty; an object must carry a non-empty `parrafo` and,
 * if present, `bullets` must be an array of strings.
 */
function checkResumen(v: unknown, errors: string[]): void {
  if (isString(v)) {
    checkTexto(v, "resumen", errors);
    return;
  }
  if (isPlainObject(v)) {
    checkTexto(v.parrafo, "resumen.parrafo", errors);
    if (!isAbsent(v.bullets)) {
      if (!Array.isArray(v.bullets)) {
        errors.push(
          `El bloque «resumen.bullets» debe ser un arreglo de textos y llegó ${tipoEs(v.bullets)}.`,
        );
      } else {
        v.bullets.forEach((b, i) => {
          if (!isString(b))
            errors.push(
              `El elemento «resumen.bullets[${i}]» debe ser texto y llegó ${tipoEs(b)}.`,
            );
        });
      }
    }
    return;
  }
  errors.push(
    `El bloque «resumen» debe ser texto o un objeto { parrafo, bullets? } y llegó ${tipoEs(v)} (${muestra(v)}).`,
  );
}

/**
 * The middle axis may arrive hierarchically as { quien, nota?, detalle?[] }.
 * `quien` is required; `nota` optional text; `detalle` optional string array.
 */
function isGestionFila(v: unknown): boolean {
  if (!isPlainObject(v)) return false;
  if (!isString(v.quien) || v.quien.trim() === "") return false;
  if ("nota" in v && v.nota != null && !isString(v.nota)) return false;
  if ("detalle" in v && v.detalle != null) {
    if (!Array.isArray(v.detalle)) return false;
    if (!v.detalle.every((d) => isString(d))) return false;
  }
  return true;
}

// --- main ---------------------------------------------------------------

export function validateProposal(input: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isPlainObject(input)) {
    return {
      ok: false,
      errors: [`El archivo no es un objeto JSON válido de propuesta (llegó ${tipoEs(input)}).`],
    };
  }
  const p = input;

  checkTexto(p.cliente, "cliente", errors);
  checkTexto(p.titular, "titular", errors);
  checkResumen(p.resumen, errors);
  checkEnum(p.modo, "modo", ["A", "B"], errors);

  validateAsIs(p.as_is, errors);
  validateFugas(p.fugas, errors);
  validateMadurez(p.madurez, errors);
  // `nota` is optional: newer pipeline builds omit it and the renderer derives
  // it from `madurez` (same formula). When present it must be well-formed.
  if (!isAbsent(p.nota)) validateNota(p.nota, errors);
  validateComponentes(p.componentes, errors);
  // `no_aplican` and `multiplicador_calculado` moved into `panel_interno` in
  // newer builds (both are consultant-internal). Validate only if still sent
  // at the top level, so both contract generations load.
  if (!isAbsent(p.no_aplican)) validateNoAplican(p.no_aplican, errors);
  validateIntegraciones(p.integraciones, errors);
  if (!isAbsent(p.multiplicador_calculado))
    validateMultiplicador(p.multiplicador_calculado, errors);
  validateCondicionComercial(p.condicion_comercial, errors);
  validatePlanRecomendado(p.plan_recomendado, errors);

  if (!Array.isArray(p.advertencias)) {
    errors.push(`El bloque «advertencias» debe ser un arreglo y llegó ${tipoEs(p.advertencias)}.`);
  } else {
    p.advertencias.forEach((a, i) => {
      if (!isString(a))
        errors.push(`El elemento «advertencias[${i}]» debe ser texto y llegó ${tipoEs(a)}.`);
    });
  }

  return { ok: errors.length === 0, errors };
}

// --- block validators ---------------------------------------------------

function validateAsIs(asIs: unknown, errors: string[]): void {
  if (!isPlainObject(asIs)) {
    errors.push(`El bloque «as_is» debe ser un objeto y llegó ${tipoEs(asIs)}.`);
    return;
  }
  const columnas = ["de_donde_llegan", "por_donde_pasan", "donde_queda"] as const;
  for (const col of columnas) {
    const val = asIs[col];
    if (!Array.isArray(val)) {
      errors.push(`El bloque «as_is.${col}» debe ser un arreglo y llegó ${tipoEs(val)}.`);
      continue;
    }
    // The middle axis also accepts the hierarchical { quien, nota?, detalle?[] }.
    const permiteGestion = col === "por_donde_pasan";
    val.forEach((fila, i) => {
      if (isAsIsFila(fila)) return;
      if (permiteGestion && isGestionFila(fila)) return;
      errors.push(
        permiteGestion
          ? `El elemento «as_is.${col}[${i}]» debe ser [etiqueta, nota] de textos (tercer elemento opcional { cifra, unidad? }) o { quien, nota?, detalle?[] } (llegó ${muestra(fila)}).`
          : `El elemento «as_is.${col}[${i}]» debe ser [etiqueta, nota] de textos, con un tercer elemento opcional { cifra, unidad? } (llegó ${muestra(fila)}).`,
      );
    });
  }
}

function validateFugas(fugas: unknown, errors: string[]): void {
  if (!Array.isArray(fugas)) {
    errors.push(`El bloque «fugas» debe ser un arreglo y llegó ${tipoEs(fugas)}.`);
    return;
  }
  if (fugas.length === 0) {
    errors.push("El bloque «fugas» no puede estar vacío.");
    return;
  }

  let dominantes = 0;
  fugas.forEach((f, i) => {
    const etiqueta = `fugas[${i}]`;
    if (!isPlainObject(f)) {
      errors.push(`El elemento «${etiqueta}» debe ser un objeto y llegó ${tipoEs(f)}.`);
      return;
    }
    if (f.dominante === true) dominantes++;

    checkTexto(f.id, `${etiqueta}.id`, errors);
    checkTexto(f.titulo, `${etiqueta}.titulo`, errors);

    const estado = trimEnum(f.estado);
    checkEnum(f.estado, `${etiqueta}.estado`, ESTADOS_FUGA, errors);

    if (
      !isPlainObject(f.cuantificacion) ||
      isAbsent((f.cuantificacion as Record<string, unknown>).valor)
    ) {
      errors.push(
        `El elemento «${etiqueta}» no tiene «cuantificacion.valor» (llegó ${muestra(f.cuantificacion)}).`,
      );
    }

    // depende_de_tercero: on a mitigable fuga this MUST be a non-empty string
    // — the third party's name, which the client document interpolates. A
    // boolean (as the old fixture invented) is a type error.
    if (estado === "mitigable") {
      const dep = f.depende_de_tercero;
      if (typeof dep !== "string") {
        errors.push(
          `El elemento «${etiqueta}.depende_de_tercero» debe ser el texto del tercero cuando el estado es mitigable, y llegó ${tipoEs(dep)} (${muestra(dep)}).`,
        );
      } else if (dep.trim() === "") {
        errors.push(
          `El elemento «${etiqueta}.depende_de_tercero» no puede estar vacío cuando el estado es mitigable.`,
        );
      }
    }
  });

  if (dominantes !== 1)
    errors.push(
      `El bloque «fugas» debe tener exactamente una fuga con «dominante: true» (se encontraron ${dominantes}).`,
    );
}

function validateMadurez(madurez: unknown, errors: string[]): void {
  if (!Array.isArray(madurez)) {
    errors.push(`El bloque «madurez» debe ser un arreglo y llegó ${tipoEs(madurez)}.`);
    return;
  }
  if (madurez.length !== 7)
    errors.push(
      `El bloque «madurez» debe tener exactamente 7 elementos (tiene ${madurez.length}).`,
    );

  madurez.forEach((m, i) => {
    const etiqueta = `madurez[${i}]`;
    if (!isPlainObject(m)) {
      errors.push(`El elemento «${etiqueta}» debe ser un objeto y llegó ${tipoEs(m)}.`);
      return;
    }
    checkTexto(m.m, `${etiqueta}.m`, errors);
    checkRango(m.hoy, `${etiqueta}.hoy`, 0, 4, errors);
    checkTexto(m.por_que, `${etiqueta}.por_que`, errors);
    if (!isPlainObject(m.p)) {
      errors.push(`El elemento «${etiqueta}.p» debe ser un objeto de planes y llegó ${tipoEs(m.p)}.`);
    } else {
      for (const plan of ["1", "2", "3"] as const) {
        checkRango(m.p[plan], `${etiqueta}.p.${plan}`, 0, 4, errors);
      }
    }
  });
}

function validateNota(nota: unknown, errors: string[]): void {
  if (!isPlainObject(nota)) {
    errors.push(`El bloque «nota» es obligatorio y debe ser un objeto (llegó ${tipoEs(nota)}).`);
    return;
  }
  checkRango(nota.puntos, "nota.puntos", 0, 100, errors);
  checkEnum(nota.letra, "nota.letra", LETRAS_NOTA, errors);
}

function validateComponentes(componentes: unknown, errors: string[]): void {
  if (!isPlainObject(componentes)) {
    errors.push(`El bloque «componentes» debe ser un objeto y llegó ${tipoEs(componentes)}.`);
    return;
  }
  for (const [id, comp] of Object.entries(componentes)) {
    const etiqueta = `componentes.${id}`;
    if (!isPlainObject(comp)) {
      errors.push(`El componente «${etiqueta}» debe ser un objeto y llegó ${tipoEs(comp)}.`);
      continue;
    }
    checkTexto(comp.nombre_cliente, `${etiqueta}.nombre_cliente`, errors);
    checkEnum(comp.plan, `${etiqueta}.plan`, PLANES, errors);
    checkEntero(comp.instancias, `${etiqueta}.instancias`, errors, 1);
    checkEnum(comp.vis, `${etiqueta}.vis`, VIS, errors);
    if (!isNumber(comp.journey))
      errors.push(
        `El componente «${etiqueta}.journey» debe ser un número y llegó ${tipoEs(comp.journey)} (${muestra(comp.journey)}).`,
      );
    // cuota is optional; null/absent is fine. If present it must be a string.
    if (!isAbsent(comp.cuota) && typeof comp.cuota !== "string")
      errors.push(
        `El componente «${etiqueta}.cuota» debe ser texto o estar ausente y llegó ${tipoEs(comp.cuota)}.`,
      );
  }
}

function validateNoAplican(noAplican: unknown, errors: string[]): void {
  if (!Array.isArray(noAplican)) {
    errors.push(`El bloque «no_aplican» debe ser un arreglo y llegó ${tipoEs(noAplican)}.`);
    return;
  }
  noAplican.forEach((item, i) => {
    const etiqueta = `no_aplican[${i}]`;
    if (!isPair(item)) {
      errors.push(`El elemento «${etiqueta}» debe ser un par [nombre, razon] de textos (llegó ${muestra(item)}).`);
      return;
    }
    const nombre = item[0].trim();
    if (INTERNAL_ID_EXACT.test(nombre))
      errors.push(
        `El elemento «${etiqueta}» expone un id interno como nombre (${muestra(item[0])}); debe estar en lenguaje del cliente.`,
      );
  });
}

function validateIntegraciones(integraciones: unknown, errors: string[]): void {
  if (!Array.isArray(integraciones)) {
    errors.push(`El bloque «integraciones» debe ser un arreglo y llegó ${tipoEs(integraciones)}.`);
    return;
  }
  integraciones.forEach((item, i) => {
    const etiqueta = `integraciones[${i}]`;
    if (!Array.isArray(item) || item.length !== 3 || !isString(item[0]) || !isString(item[1])) {
      errors.push(
        `El elemento «${etiqueta}» debe ser [nombre, nota, etiqueta] de textos (llegó ${muestra(item)}).`,
      );
      return;
    }
    checkEnum(item[2], `${etiqueta}.etiqueta`, ETIQUETAS_INTEGRACION, errors);
  });
}

function validateMultiplicador(mult: unknown, errors: string[]): void {
  if (!isPlainObject(mult)) {
    errors.push(`El bloque «multiplicador_calculado» debe ser un objeto y llegó ${tipoEs(mult)}.`);
    return;
  }
  for (const plan of ["1", "2", "3"] as const) {
    const entry = mult[plan];
    if (!isPlainObject(entry)) {
      errors.push(
        `El bloque «multiplicador_calculado.${plan}» debe ser un objeto y llegó ${tipoEs(entry)}.`,
      );
      continue;
    }
    checkEntero(entry.piezas, `multiplicador_calculado.${plan}.piezas`, errors);
    checkEntero(entry.config, `multiplicador_calculado.${plan}.config`, errors);
  }
}

function validateCondicionComercial(cc: unknown, errors: string[]): void {
  if (!isPlainObject(cc)) {
    errors.push(`El bloque «condicion_comercial» debe ser un objeto y llegó ${tipoEs(cc)}.`);
    return;
  }
  checkTexto(cc.moneda, "condicion_comercial.moneda", errors);

  if (!isPlainObject(cc.base_por_plan)) {
    errors.push(
      `El bloque «condicion_comercial.base_por_plan» debe ser un objeto y llegó ${tipoEs(cc.base_por_plan)}.`,
    );
  } else {
    for (const plan of ["1", "2", "3"] as const) {
      if (!isNumber((cc.base_por_plan as Record<string, unknown>)[plan]))
        errors.push(
          `El bloque «condicion_comercial.base_por_plan.${plan}» debe ser un número (llegó ${muestra((cc.base_por_plan as Record<string, unknown>)[plan])}).`,
        );
    }
  }

  if (!Array.isArray(cc.tramos_factor)) {
    errors.push(
      `El bloque «condicion_comercial.tramos_factor» debe ser un arreglo de pares [limite, factor] y llegó ${tipoEs(cc.tramos_factor)}.`,
    );
  } else {
    cc.tramos_factor.forEach((t, i) => {
      if (!Array.isArray(t) || t.length !== 2 || !isNumber(t[0]) || !isNumber(t[1]))
        errors.push(
          `El elemento «condicion_comercial.tramos_factor[${i}]» debe ser un par [limite, factor] numérico (llegó ${muestra(t)}).`,
        );
    });
  }

  if (!isPlainObject(cc.precio_por_plan)) {
    errors.push(
      `El bloque «condicion_comercial.precio_por_plan» debe ser un objeto y llegó ${tipoEs(cc.precio_por_plan)}.`,
    );
  } else {
    for (const plan of ["1", "2", "3"] as const) {
      checkEntero(
        (cc.precio_por_plan as Record<string, unknown>)[plan],
        `condicion_comercial.precio_por_plan.${plan}`,
        errors,
      );
    }
  }

  checkRango(
    cc.limite_descuento_sin_aprobacion,
    "condicion_comercial.limite_descuento_sin_aprobacion",
    0,
    1,
    errors,
  );
}

function validatePlanRecomendado(pr: unknown, errors: string[]): void {
  if (!isPlainObject(pr)) {
    errors.push(`El bloque «plan_recomendado» debe ser un objeto y llegó ${tipoEs(pr)}.`);
    return;
  }
  if (pr.plan !== 1 && pr.plan !== 2 && pr.plan !== 3)
    errors.push(`El bloque «plan_recomendado.plan» debe ser 1, 2 o 3 (llegó ${muestra(pr.plan)}).`);
  checkTexto(pr.por_que, "plan_recomendado.por_que", errors);
}
