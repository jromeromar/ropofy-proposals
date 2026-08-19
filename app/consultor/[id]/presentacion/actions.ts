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
import type { Proposal } from "@/lib/types";

export type EdicionInline =
  | { campo: "titular" | "cliente" | "marca"; valor: string }
  | { campo: "fugaTitulo" | "fugaValor"; idx: number; valor: string }
  | { campo: "compNombre"; idx: number; valor: string };

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
    }
  }

  const result = validateProposal(data);
  if (!result.ok) return { ok: false, errors: result.errors };

  await storage.updateProposalData(input.id, data);
  if (marca !== undefined) await storage.setMarca(input.id, marca);
  return { ok: true };
}
