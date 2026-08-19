"use server";

/**
 * Live content correction. Re-validates the edited proposal against the SAME
 * contract as intake (contracts are never relaxed to let an edit through),
 * then updates the draft data IN PLACE — no version bump, sent versions stay
 * frozen. The brand lives on the record, so it is set separately.
 */

import { validateProposal } from "@/lib/validateProposal";
import { storage } from "@/lib/storage";
import type { Proposal } from "@/lib/types";

export interface GuardarInput {
  id: string;
  data: Proposal;
  marca: string | null;
}

export type GuardarResult = { ok: true } | { ok: false; errors: string[] };

export async function guardarContenido(
  input: GuardarInput,
): Promise<GuardarResult> {
  const existing = await storage.getProposal(input.id);
  if (!existing) {
    return { ok: false, errors: ["La propuesta no existe o fue eliminada."] };
  }

  const result = validateProposal(input.data);
  if (!result.ok) return { ok: false, errors: result.errors };

  await storage.updateProposalData(input.id, input.data);
  await storage.setMarca(input.id, input.marca);
  return { ok: true };
}
