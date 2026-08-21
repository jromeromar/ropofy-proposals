"use server";

/** Consultant desk actions: archive, manual status override, sign out. */

import { storage } from "@/lib/storage";
import { signOut } from "@/auth";

export async function cerrarSesion(): Promise<void> {
  await signOut({ redirectTo: "/api/auth/signin" });
}

export async function archivarPropuesta(
  id: string,
  archivado: boolean,
): Promise<{ ok: boolean }> {
  const existing = await storage.getProposal(id);
  if (!existing) return { ok: false };
  await storage.setArchivado(id, archivado);
  return { ok: true };
}

/** Mark a proposal declined, or clear the override (null) to re-derive. */
export async function marcarEstado(
  id: string,
  estado: "rechazada" | null,
): Promise<{ ok: boolean }> {
  const existing = await storage.getProposal(id);
  if (!existing) return { ok: false };
  await storage.setEstadoManual(id, estado);
  return { ok: true };
}
