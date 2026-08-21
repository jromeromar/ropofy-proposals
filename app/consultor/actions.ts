"use server";

/** Archive / unarchive a proposal from the consultant list. */

import { storage } from "@/lib/storage";

export async function archivarPropuesta(
  id: string,
  archivado: boolean,
): Promise<{ ok: boolean }> {
  const existing = await storage.getProposal(id);
  if (!existing) return { ok: false };
  await storage.setArchivado(id, archivado);
  return { ok: true };
}
