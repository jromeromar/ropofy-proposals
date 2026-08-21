import { storage } from "@/lib/storage";
import { estadoDe, ultimaVersion } from "@/lib/estadoPropuesta";
import ProposalsTable, { type FilaPropuesta } from "./ProposalsTable";
import "./consultor.css";

// Always read fresh from storage.
export const dynamic = "force-dynamic";

/**
 * Consultant home: the light status desk for proposals. Management proper lives
 * in Ropofy (the CRM); here the consultant sees each proposal's derived status,
 * searches and filters (by date, client, status), and archives.
 */
export default async function ConsultorHome() {
  const proposals = await storage.listProposals();
  const filas: FilaPropuesta[] = proposals.map((p) => {
    const last = ultimaVersion(p);
    return {
      id: p.id,
      cliente: p.cliente,
      marca: p.marca ?? null,
      createdAt: p.createdAt,
      estado: estadoDe(p),
      valor: last ? last.condicion.precioFinal : null,
      moneda: last ? last.condicion.moneda : null,
      vigencia: last ? last.condicion.vigencia : null,
      token: last ? last.token : null,
      archivado: Boolean(p.archivado),
      // Slim, client-safe per-version list (no internal `motivo`).
      versiones: p.sentVersions.map((v) => ({
        version: v.version,
        sentAt: v.sentAt,
        plan: v.plan,
        valor: v.condicion.precioFinal,
        moneda: v.condicion.moneda,
        vigencia: v.condicion.vigencia,
        token: v.token,
        aceptada: v.estado === "aceptada" || v.acceptance != null,
      })),
    };
  });

  return <ProposalsTable filas={filas} />;
}
