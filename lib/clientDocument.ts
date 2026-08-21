/**
 * Snapshot builder for the send flow.
 *
 * `construirCondicion` computes the frozen commercial condition.
 * `buildClientDocument` produces the immutable client snapshot: a deep copy of
 * the proposal with every internal-only field removed and the commercial
 * condition embedded as fixed values. This is the ONLY object that ever
 * reaches the /p/ route, so nothing internal may survive here — the
 * forbidden-keys test guards it.
 */

import { precioFinal, preciosFinalesPorPlan } from "./pricing";
import { isAIComponent } from "./mapLayout";
import { razonSocialDe, marcaEfectiva } from "./identidad";
import type { Proposal, AppliedCondition, ClientDocument, Componente } from "./types";

export type PlanNumero = 1 | 2 | 3;

export interface CondicionInput {
  descuentoPct: number | null;
  vigencia: string | null;
  autor: string;
  aprobador: string | null;
}

/** Format a vigencia timestamp for the client, es-CO, date + time. */
export function formatVigencia(iso: string): string {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(iso));
}

/** Compute the frozen commercial condition for a plan at send time. */
export function construirCondicion(
  data: Proposal,
  plan: PlanNumero,
  input: CondicionInput,
): AppliedCondition {
  const cc = data.condicion_comercial;
  const key = String(plan) as "1" | "2" | "3";
  const precioLista = cc.precio_por_plan[key];
  const preciosFinales = preciosFinalesPorPlan(cc.precio_por_plan, input.descuentoPct);
  const lineaCondicion =
    input.descuentoPct != null && input.vigencia
      ? `Condición registrada por ${input.autor} · válida hasta ${formatVigencia(input.vigencia)}`
      : null;

  return {
    descuentoPct: input.descuentoPct,
    vigencia: input.vigencia,
    autor: input.autor,
    aprobador: input.aprobador,
    moneda: cc.moneda,
    precioLista,
    precioFinal: precioFinal(precioLista, input.descuentoPct),
    preciosFinales,
    lineaCondicion,
  };
}

/**
 * Deep-copy the proposal and strip everything the client must never receive,
 * then embed the fixed commercial condition. Returns the frozen snapshot.
 */
export function buildClientDocument(
  data: Proposal,
  condicion: AppliedCondition,
  plan: PlanNumero,
  marca?: string | null,
): ClientDocument {
  const doc = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;

  // Normalise identity into the snapshot: `cliente` = legal name, `marca` =
  // brand (manual override, else the pipeline's `cliente` when it sent a
  // separate `razon_social`).
  doc.cliente = razonSocialDe(data);
  doc.marca = marcaEfectiva(data, marca);

  // Internal, top-level: pricing internals and pipeline scaffolding.
  delete doc.multiplicador_calculado;
  delete doc.multiplicador;
  delete doc._fixture;
  delete doc._contrato;

  // Commercial internals: keep only moneda + list prices; drop the machinery.
  const cc = doc.condicion_comercial as Record<string, unknown> | undefined;
  if (cc) {
    delete cc.base_por_plan;
    delete cc.tramos_factor;
    delete cc.limite_descuento_sin_aprobacion;
    delete cc.desglose_interno;
  }

  // Components: re-key with opaque ids and keep only client-safe fields.
  // `isAI` is precomputed here (from the internal `tipo`) so the client
  // document can rebuild the AI node without ever carrying `tipo`.
  const safe: Record<string, unknown> = {};
  const componentes = (doc.componentes ?? {}) as Record<string, Record<string, unknown>>;
  let n = 0;
  for (const comp of Object.values(componentes)) {
    // Removed features never reach the client snapshot.
    if (comp.incluido === false) continue;
    n += 1;
    safe[`c${n}`] = {
      nombre_cliente: comp.nombre_cliente,
      beneficio: comp.beneficio ?? null,
      plan: comp.plan,
      cortesiaPlan: comp.cortesiaPlan ?? null,
      vis: comp.vis,
      journey: comp.journey,
      instancias: comp.instancias,
      cuota: comp.cuota ?? null,
      isAI: isAIComponent(comp as unknown as Componente),
    };
  }
  doc.componentes = safe;

  // Fugas: drop the internal id, keep client-facing prose and quote.
  const fugas = (doc.fugas ?? []) as Array<Record<string, unknown>>;
  doc.fugas = fugas.map((f) => ({
    titulo: f.titulo,
    estado: f.estado,
    dominante: Boolean(f.dominante),
    cuantificacion: f.cuantificacion,
    depende_de_tercero: f.depende_de_tercero ?? null,
    texto: f.texto ?? null,
    evidencia_textual: f.evidencia_textual ?? null,
  }));

  // Embed the fixed commercial condition (audit-only fields excluded).
  doc.condicion_aplicada = {
    plan_seleccionado: plan,
    descuento_pct: condicion.descuentoPct,
    vigencia: condicion.vigencia,
    linea_condicion: condicion.lineaCondicion,
    autor: condicion.autor,
    moneda: condicion.moneda,
    precio_lista_seleccionado: condicion.precioLista,
    precio_final_seleccionado: condicion.precioFinal,
    preciosFinales: condicion.preciosFinales,
  };

  return doc as ClientDocument;
}
