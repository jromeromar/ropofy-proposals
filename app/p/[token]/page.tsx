import { headers } from "next/headers";
import { storage } from "@/lib/storage";
import { toClientDocVM } from "@/lib/clientDocVM";
import { emitirEvento, eventoCondicionExpirada } from "@/lib/events";
import { enlaceDe } from "@/lib/enlace";
import ClientDocView from "./ClientDocView";
import "./clientdoc.css";

export const dynamic = "force-dynamic";

/**
 * The client route. NO login, NO consultant logic. Resolves a token to its
 * FROZEN snapshot and renders the full client document from it (never from
 * the live draft). The interactive shell hydrates from an id-free VM only.
 */
export default async function ClientDocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  const { token } = await params;
  const { print } = await searchParams;
  const resolved = await storage.getByToken(token);

  if (!resolved) {
    return (
      <main className="cd-doc">
        <div className="cd-notfound">
          <h1>Documento no disponible</h1>
          <p>Este enlace no es válido o la propuesta ya no está disponible.</p>
        </div>
      </main>
    );
  }

  const sv = resolved.sentVersion;
  const vm = toClientDocVM(sv.clientDocument, sv.sentAt);
  const nowIso = new Date().toISOString();

  // Lazily emit condicion_expirada the first time an expired document is served.
  const c = sv.condicion;
  const expirada =
    c.descuentoPct != null &&
    c.vigencia != null &&
    new Date(c.vigencia).getTime() <= Date.now();
  if (expirada && (await storage.debeEmitirExpiracion(token))) {
    const h = await headers();
    emitirEvento(
      eventoCondicionExpirada({
        cliente: resolved.proposal.cliente,
        propuestaId: resolved.proposal.id,
        version: sv.version,
        enlace: enlaceDe(h, token),
        at: nowIso,
      }),
    );
  }

  return (
    <main className="cd-doc">
      <ClientDocView
        vm={vm}
        token={token}
        nowIso={nowIso}
        acceptance={sv.acceptance}
        autoPrint={print === "1"}
      />
    </main>
  );
}
