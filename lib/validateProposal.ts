/**
 * Structural validation of a `propuesta.json` before anything is rendered.
 *
 * Pure function: no I/O, no throwing. It reports EVERY problem it finds
 * (not fail-fast) so the consultant fixes the whole file in one pass.
 * All messages are in Spanish; each names exactly which block is missing
 * or malformed.
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

// --- small predicates ---------------------------------------------------

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
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
/** A [label, note] pair: array of two strings. */
function isPair(v: unknown): v is [string, string] {
  return Array.isArray(v) && v.length === 2 && isString(v[0]) && isString(v[1]);
}
function inRange(v: unknown, min: number, max: number): boolean {
  return isNumber(v) && v >= min && v <= max;
}

// --- main ---------------------------------------------------------------

export function validateProposal(input: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isPlainObject(input)) {
    return {
      ok: false,
      errors: ["El archivo no es un objeto JSON válido de propuesta."],
    };
  }
  const p = input;

  // cliente, titular, resumen
  if (!isNonEmptyString(p.cliente))
    errors.push('Falta o es inválido el bloque «cliente» (debe ser un texto no vacío).');
  if (!isNonEmptyString(p.titular))
    errors.push('Falta o es inválido el bloque «titular» (debe ser un texto no vacío).');
  if (!isNonEmptyString(p.resumen))
    errors.push('Falta o es inválido el bloque «resumen» (debe ser un texto no vacío).');

  // modo
  if (p.modo !== "A" && p.modo !== "B")
    errors.push('El bloque «modo» debe ser "A" o "B".');

  // as_is
  validateAsIs(p.as_is, errors);

  // fugas
  validateFugas(p.fugas, errors);

  // madurez
  validateMadurez(p.madurez, errors);

  // nota
  validateNota(p.nota, errors);

  // componentes
  validateComponentes(p.componentes, errors);

  // no_aplican
  validateNoAplican(p.no_aplican, errors);

  // integraciones
  validateIntegraciones(p.integraciones, errors);

  // multiplicador_calculado
  validateMultiplicador(p.multiplicador_calculado, errors);

  // condicion_comercial
  validateCondicionComercial(p.condicion_comercial, errors);

  // plan_recomendado
  validatePlanRecomendado(p.plan_recomendado, errors);

  // advertencias
  if (!Array.isArray(p.advertencias) || !p.advertencias.every(isString))
    errors.push('El bloque «advertencias» debe ser un arreglo de textos.');

  return { ok: errors.length === 0, errors };
}

// --- block validators ---------------------------------------------------

function validateAsIs(asIs: unknown, errors: string[]): void {
  if (!isPlainObject(asIs)) {
    errors.push('Falta o es inválido el bloque «as_is».');
    return;
  }
  const columnas: Array<keyof typeof asIs> = [
    "de_donde_llegan",
    "por_donde_pasan",
    "donde_queda",
  ];
  for (const col of columnas) {
    const val = asIs[col];
    if (!Array.isArray(val) || !val.every(isPair)) {
      errors.push(
        `El bloque «as_is.${String(col)}» debe ser un arreglo de pares [etiqueta, nota].`,
      );
    }
  }
}

function validateFugas(fugas: unknown, errors: string[]): void {
  if (!Array.isArray(fugas) || fugas.length === 0) {
    errors.push('Falta o es inválido el bloque «fugas» (debe ser un arreglo no vacío).');
    return;
  }

  let dominantes = 0;
  fugas.forEach((f, i) => {
    const etiqueta = `fugas[${i}]`;
    if (!isPlainObject(f)) {
      errors.push(`El elemento «${etiqueta}» no es un objeto válido.`);
      return;
    }
    if (f.dominante === true) dominantes++;
    if (!isNonEmptyString(f.id))
      errors.push(`El elemento «${etiqueta}» no tiene «id» válido.`);
    if (!isNonEmptyString(f.titulo))
      errors.push(`El elemento «${etiqueta}» no tiene «titulo» válido.`);
    if (typeof f.estado !== "string" || !ESTADOS_FUGA.includes(f.estado))
      errors.push(
        `El elemento «${etiqueta}» tiene «estado» inválido (debe ser activa, mitigable o fuera_de_alcance).`,
      );
    if (
      !isPlainObject(f.cuantificacion) ||
      !("valor" in f.cuantificacion) ||
      f.cuantificacion.valor === null ||
      f.cuantificacion.valor === undefined
    )
      errors.push(`El elemento «${etiqueta}» no tiene «cuantificacion.valor».`);
    if (f.estado === "mitigable" && typeof f.depende_de_tercero !== "boolean")
      errors.push(
        `El elemento «${etiqueta}» tiene estado mitigable pero le falta «depende_de_tercero».`,
      );
  });

  if (dominantes !== 1)
    errors.push(
      `El bloque «fugas» debe tener exactamente una fuga con «dominante: true» (se encontraron ${dominantes}).`,
    );
}

function validateMadurez(madurez: unknown, errors: string[]): void {
  if (!Array.isArray(madurez)) {
    errors.push('Falta o es inválido el bloque «madurez» (debe ser un arreglo).');
    return;
  }
  if (madurez.length !== 7)
    errors.push(
      `El bloque «madurez» debe tener exactamente 7 elementos (tiene ${madurez.length}).`,
    );

  madurez.forEach((m, i) => {
    const etiqueta = `madurez[${i}]`;
    if (!isPlainObject(m)) {
      errors.push(`El elemento «${etiqueta}» no es un objeto válido.`);
      return;
    }
    if (!isNonEmptyString(m.m))
      errors.push(`El elemento «${etiqueta}» no tiene «m» válido.`);
    if (!inRange(m.hoy, 0, 4))
      errors.push(`El elemento «${etiqueta}» tiene «hoy» fuera de rango (0-4).`);
    if (!isNonEmptyString(m.por_que))
      errors.push(`El elemento «${etiqueta}» no tiene «por_que» válido.`);
    if (!isPlainObject(m.p)) {
      errors.push(`El elemento «${etiqueta}» no tiene el objeto «p» de planes.`);
    } else {
      for (const plan of ["1", "2", "3"] as const) {
        if (!inRange(m.p[plan], 0, 4))
          errors.push(
            `El elemento «${etiqueta}.p.${plan}» está ausente o fuera de rango (0-4).`,
          );
      }
    }
  });
}

function validateNota(nota: unknown, errors: string[]): void {
  if (!isPlainObject(nota)) {
    errors.push('Falta o es inválido el bloque «nota».');
    return;
  }
  if (!inRange(nota.puntos, 0, 100))
    errors.push('El bloque «nota.puntos» debe ser un número entre 0 y 100.');
  if (typeof nota.letra !== "string" || !LETRAS_NOTA.includes(nota.letra))
    errors.push('El bloque «nota.letra» debe ser una letra entre A y F.');
}

function validateComponentes(componentes: unknown, errors: string[]): void {
  if (!isPlainObject(componentes)) {
    errors.push('Falta o es inválido el bloque «componentes» (debe ser un objeto).');
    return;
  }
  for (const [id, comp] of Object.entries(componentes)) {
    const etiqueta = `componentes.${id}`;
    if (!isPlainObject(comp)) {
      errors.push(`El componente «${etiqueta}» no es un objeto válido.`);
      continue;
    }
    if (!isNonEmptyString(comp.nombre_cliente))
      errors.push(`El componente «${etiqueta}» no tiene «nombre_cliente» válido.`);
    if (typeof comp.plan !== "string" || !PLANES.includes(comp.plan))
      errors.push(
        `El componente «${etiqueta}» tiene «plan» inválido (debe ser fundamental, avanzado o inteligente).`,
      );
    if (!isInt(comp.instancias) || comp.instancias < 1)
      errors.push(`El componente «${etiqueta}» debe tener «instancias» entera >= 1.`);
    if (typeof comp.vis !== "string" || !VIS.includes(comp.vis))
      errors.push(
        `El componente «${etiqueta}» tiene «vis» inválido (debe ser front, back o ambos).`,
      );
    if (!isNumber(comp.journey))
      errors.push(`El componente «${etiqueta}» debe tener «journey» numérico.`);
    // cuota is optional; if present it must be a string or null.
    if (
      "cuota" in comp &&
      comp.cuota !== null &&
      typeof comp.cuota !== "string"
    )
      errors.push(`El componente «${etiqueta}» tiene «cuota» inválida (texto o null).`);
  }
}

function validateNoAplican(noAplican: unknown, errors: string[]): void {
  if (!Array.isArray(noAplican)) {
    errors.push('Falta o es inválido el bloque «no_aplican» (debe ser un arreglo).');
    return;
  }
  noAplican.forEach((item, i) => {
    const etiqueta = `no_aplican[${i}]`;
    if (!isPair(item)) {
      errors.push(`El elemento «${etiqueta}» debe ser un par [nombre, razon].`);
      return;
    }
    const [nombre] = item;
    if (INTERNAL_ID_EXACT.test(nombre))
      errors.push(
        `El elemento «${etiqueta}» expone un id interno como nombre («${nombre}»); debe estar en lenguaje del cliente.`,
      );
  });
}

function validateIntegraciones(integraciones: unknown, errors: string[]): void {
  if (!Array.isArray(integraciones)) {
    errors.push('Falta o es inválido el bloque «integraciones» (debe ser un arreglo).');
    return;
  }
  integraciones.forEach((item, i) => {
    const etiqueta = `integraciones[${i}]`;
    if (
      !Array.isArray(item) ||
      item.length !== 3 ||
      !isString(item[0]) ||
      !isString(item[1])
    ) {
      errors.push(`El elemento «${etiqueta}» debe ser [nombre, nota, etiqueta].`);
      return;
    }
    if (typeof item[2] !== "string" || !ETIQUETAS_INTEGRACION.includes(item[2]))
      errors.push(
        `El elemento «${etiqueta}» tiene una etiqueta inválida (incluido, consumo_variable, licencia_del_cliente o desarrollo_a_cotizar).`,
      );
  });
}

function validateMultiplicador(mult: unknown, errors: string[]): void {
  if (!isPlainObject(mult)) {
    errors.push('Falta o es inválido el bloque «multiplicador_calculado».');
    return;
  }
  for (const plan of ["1", "2", "3"] as const) {
    const entry = mult[plan];
    if (!isPlainObject(entry) || !isInt(entry.piezas) || !isInt(entry.config))
      errors.push(
        `El bloque «multiplicador_calculado.${plan}» debe tener «piezas» y «config» enteros.`,
      );
  }
}

function validateCondicionComercial(cc: unknown, errors: string[]): void {
  if (!isPlainObject(cc)) {
    errors.push('Falta o es inválido el bloque «condicion_comercial».');
    return;
  }
  if (!isNonEmptyString(cc.moneda))
    errors.push('El bloque «condicion_comercial.moneda» debe ser un texto.');

  if (
    !isPlainObject(cc.base_por_plan) ||
    !["1", "2", "3"].every((k) => isNumber((cc.base_por_plan as Record<string, unknown>)[k]))
  )
    errors.push(
      'El bloque «condicion_comercial.base_por_plan» debe tener valores numéricos para los planes 1, 2 y 3.',
    );

  if (
    !Array.isArray(cc.tramos_factor) ||
    !cc.tramos_factor.every(
      (t) => Array.isArray(t) && t.length === 2 && isNumber(t[0]) && isNumber(t[1]),
    )
  )
    errors.push(
      'El bloque «condicion_comercial.tramos_factor» debe ser un arreglo de pares [limite, factor].',
    );

  if (!isPlainObject(cc.precio_por_plan)) {
    errors.push('El bloque «condicion_comercial.precio_por_plan» es inválido.');
  } else {
    for (const plan of ["1", "2", "3"] as const) {
      if (!isInt(cc.precio_por_plan[plan]))
        errors.push(
          `El bloque «condicion_comercial.precio_por_plan.${plan}» debe ser un entero (precio limpio, sin decimales).`,
        );
    }
  }

  if (!inRange(cc.limite_descuento_sin_aprobacion, 0, 1))
    errors.push(
      'El bloque «condicion_comercial.limite_descuento_sin_aprobacion» debe estar entre 0 y 1.',
    );
}

function validatePlanRecomendado(pr: unknown, errors: string[]): void {
  if (!isPlainObject(pr)) {
    errors.push('Falta o es inválido el bloque «plan_recomendado».');
    return;
  }
  if (pr.plan !== 1 && pr.plan !== 2 && pr.plan !== 3)
    errors.push('El bloque «plan_recomendado.plan» debe ser 1, 2 o 3.');
  if (!isNonEmptyString(pr.por_que))
    errors.push('El bloque «plan_recomendado.por_que» debe ser un texto.');
}
