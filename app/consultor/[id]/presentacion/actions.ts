"use server";

/**
 * Inline content corrections from the presentation. The client only knows the
 * id-free view model, so edits arrive addressed by POSITIONAL index (a plain
 * number), which we resolve here against the draft — the internal component
 * keys never cross to the client. Re-validates with the same contract as
 * intake; the draft is untouched if validation fails.
 */

import { validateProposal } from "@/lib/validateProposal";
import { storage } from "@/lib/storage";
import type { NotaFuga, Proposal, PlanNombre } from "@/lib/types";

export type EdicionInline =
  | { campo: "titular" | "cliente" | "marca"; valor: string }
  | { campo: "fugaTitulo" | "fugaValor"; idx: number; valor: string }
  | { campo: "compNombre"; idx: number; valor: string }
  | { campo: "compIncluido"; idx: number; incluido: boolean }
  | { campo: "compPlan"; idx: number; plan: PlanNombre }
  | { campo: "compCortesia"; idx: number; cortesiaPlan: PlanNombre | null };

export type GuardarInlineResult = { ok: true } | { ok: false; errors: string[] };

export async function guardarInline(input: {
  id: string;
  ediciones: EdicionInline[];
}): Promise<GuardarInlineResult> {
  const stored = await storage.getProposal(input.id);
  if (!stored) {
    return { ok: false, errors: ["La propuesta no existe o fue eliminada."] };
  }

  const data = JSON.parse(JSON.stringify(stored.data)) as Proposal;
  const keys = Object.keys(data.componentes);
  let marca: string | null | undefined; // undefined = not edited

  for (const e of input.ediciones) {
    switch (e.campo) {
      case "titular":
        data.titular = e.valor;
        break;
      case "cliente":
        data.cliente = e.valor;
        break;
      case "marca":
        marca = e.valor.trim() || null;
        break;
      case "fugaTitulo":
        if (data.fugas[e.idx]) data.fugas[e.idx].titulo = e.valor;
        break;
      case "fugaValor":
        if (data.fugas[e.idx]) data.fugas[e.idx].cuantificacion.valor = e.valor;
        break;
      case "compNombre": {
        const k = keys[e.idx];
        if (k) data.componentes[k].nombre_cliente = e.valor;
        break;
      }
      case "compIncluido": {
        const k = keys[e.idx];
        if (k) data.componentes[k].incluido = e.incluido;
        break;
      }
      case "compPlan": {
        const k = keys[e.idx];
        if (k) data.componentes[k].plan = e.plan;
        break;
      }
      case "compCortesia": {
        const k = keys[e.idx];
        if (k) {
          if (e.cortesiaPlan) data.componentes[k].cortesiaPlan = e.cortesiaPlan;
          else delete data.componentes[k].cortesiaPlan;
        }
        break;
      }
    }
  }

  const result = validateProposal(data);
  if (!result.ok) return { ok: false, errors: result.errors };

  await storage.updateProposalData(input.id, data);
  if (marca !== undefined) await storage.setMarca(input.id, marca);
  return { ok: true };
}

/**
 * Record a leak confirmation and/or correction note during the presentation
 * (C10). Append-only and attributable: the note is stamped with the signed-in
 * consultant and the current time, and appended to the proposal's registry —
 * the original leak card in `data` is never overwritten. This is Atlas working
 * data, so it lives on the storage envelope, not inside `data`.
 */
export async function registrarNotaFuga(input: {
  id: string;
  fugaIdx: number;
  confirmada: boolean | null;
  nota: string | null;
}): Promise<
  { ok: true; nota: NotaFuga } | { ok: false; errors: string[] }
> {
  const stored = await storage.getProposal(input.id);
  if (!stored) {
    return { ok: false, errors: ["La propuesta no existe o fue eliminada."] };
  }
  const fuga = stored.data.fugas?.[input.fugaIdx];
  if (!fuga) {
    return { ok: false, errors: ["La fuga indicada no existe."] };
  }
  const notaTexto = input.nota?.trim() || null;
  if (input.confirmada == null && !notaTexto) {
    return { ok: false, errors: ["No hay nada que registrar."] };
  }

  // Imported lazily so the (next-auth) module graph is only pulled in when this
  // action actually runs on the server — keeps it out of unit-test bundles.
  const { auth } = await import("@/auth");
  const session = await auth();
  const autor = session?.user?.email ?? session?.user?.name ?? "consultor";
  const nota: NotaFuga = {
    at: new Date().toISOString(),
    autor,
    fugaIdx: input.fugaIdx,
    fugaTitulo: fuga.titulo,
    confirmada: input.confirmada,
    nota: notaTexto,
  };
  await storage.appendNotaFuga(input.id, nota);
  return { ok: true, nota };
}
