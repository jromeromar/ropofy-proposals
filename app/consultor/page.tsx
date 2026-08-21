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
      versiones: p.sentVersions.length,
      archivado: Boolean(p.archivado),
    };
  });

  return <ProposalsTable filas={filas} />;
}
