"use server";

/**
 * The send action. This is where the client version is GENERATED and frozen.
 * Runs server-side only: it re-validates authoritatively (never trusting the
 * client), builds the stripped client snapshot, and persists an immutable
 * sent version addressable by an unguessable token.
 */

import { storage, hashData } from "@/lib/storage";
import { construirCondicion, buildClientDocument } from "@/lib/clientDocument";
import { requiereAprobacion } from "@/lib/pricing";
import { formatPrice } from "@/lib/rules";
import { PLAN_LABEL } from "@/lib/mapLayout";

export interface EnviarInput {
  id: string;
  plan: 1 | 2 | 3;
  descuentoPct: number | null;
  /** datetime-local string from the form, or null. */
  vigencia: string | null;
  autor: string;
  aprobador: string | null;
  motivo: string | null;
}

export type EnviarResult =
  | {
      ok: true;
      token: string;
      version: string;
      link: string;
      resumen: string;
    }
  | { ok: false; errors: string[] };

export async function enviarPropuesta(input: EnviarInput): Promise<EnviarResult> {
  const stored = await storage.getProposal(input.id);
  if (!stored) {
    return { ok: false, errors: ["La propuesta no existe o fue eliminada."] };
  }

  const errors: string[] = [];
  const data = stored.data;
  const autor = (input.autor ?? "").trim();
  const aprobador = (input.aprobador ?? "").trim();
  const motivo = (input.motivo ?? "").trim();

  if (!autor) errors.push("El campo «autor» es obligatorio.");

  let descuentoPct = input.descuentoPct;
  if (descuentoPct != null) {
    if (
      typeof descuentoPct !== "number" ||
      !Number.isFinite(descuentoPct) ||
      descuentoPct < 0 ||
      descuentoPct > 100
    ) {
      errors.push("El descuento debe ser un porcentaje entre 0 y 100.");
      descuentoPct = null;
    }
  }

  let vigenciaIso: string | null = null;
  if (descuentoPct != null) {
    if (!input.vigencia) {
      errors.push("La vigencia es obligatoria cuando hay descuento.");
    } else {
      const d = new Date(input.vigencia);
      if (Number.isNaN(d.getTime())) {
        errors.push("La vigencia no es una fecha válida.");
      } else if (d.getTime() <= Date.now()) {
        errors.push("La vigencia debe estar en el futuro.");
      } else {
        vigenciaIso = d.toISOString();
      }
    }
  }

  const limite = data.condicion_comercial.limite_descuento_sin_aprobacion;
  const necesitaAprobacion = requiereAprobacion(descuentoPct, limite);
  if (necesitaAprobacion && !aprobador) {
    errors.push(
      `Un descuento por encima del ${Math.round(limite * 100)}% requiere la aprobación de un segundo usuario.`,
    );
  }

  if (errors.length > 0) return { ok: false, errors };

  const condicion = construirCondicion(data, input.plan, {
    descuentoPct,
    vigencia: vigenciaIso,
    autor,
    aprobador: necesitaAprobacion ? aprobador : aprobador || null,
  });

  const clientDocument = buildClientDocument(data, condicion, input.plan);

  const sent = await storage.saveSentVersion(input.id, {
    plan: input.plan,
    autor,
    aprobador: aprobador || null,
    motivo: motivo || null,
    condicion,
    clientDocument,
    sourceHash: hashData(data),
  });

  const resumen = [
    `Plan ${PLAN_LABEL[input.plan]}`,
    descuentoPct != null
      ? `${descuentoPct}% de descuento`
      : "sin descuento",
    formatPrice(condicion.precioFinal, condicion.moneda),
  ].join(" · ");

  return {
    ok: true,
    token: sent.token,
    version: sent.version,
    link: `/p/${sent.token}`,
    resumen,
  };
}
