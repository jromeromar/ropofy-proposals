import Link from "next/link";
import { storage } from "@/lib/storage";
import type { StoredProposal } from "@/lib/types";
import CopyLink from "./CopyLink";

// Always read fresh from storage.
export const dynamic = "force-dynamic";

function formatFecha(iso: string): string {
  try {
    return new Intl.DateTimeFormat("es-CO", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/**
 * Minimal technical admin fallback. Proposal MANAGEMENT lives in Ropofy (the
 * CRM) — this page exists only to find a proposal's id, its versions, and the
 * shareable /p/ link. No estados, activity feeds or decision signals here.
 */
export default async function ConsultorHome() {
  const proposals: StoredProposal[] = await storage.listProposals();

  return (
    <main className="container stack">
      <div className="header-row">
        <div>
          <h1>Propuestas</h1>
          <p className="muted">
            Lista técnica (respaldo). La gestión vive en Ropofy.
          </p>
        </div>
        <Link href="/consultor/nueva" className="btn btn-primary">
          Nueva propuesta
        </Link>
      </div>

      {proposals.length === 0 ? (
        <div className="card card-muted">
          <p className="muted" style={{ margin: 0 }}>
            Aún no hay propuestas cargadas. Empieza con{" "}
            <Link href="/consultor/nueva">Nueva propuesta</Link>.
          </p>
        </div>
      ) : (
        <ul className="list">
          {proposals.map((p) => (
            <li key={p.id} className="list-item-block">
              <div className="header-row">
                <div>
                  <div>
                    <span className="accent-dot" aria-hidden="true" />
                    <strong>{p.cliente}</strong>
                  </div>
                  <div className="list-item-meta">
                    <code>{p.id}</code> · cargada {formatFecha(p.createdAt)}
                  </div>
                </div>
                <Link href={`/consultor/${p.id}/cotizar`} className="btn btn-secondary">
                  Preparar / enviar
                </Link>
              </div>

              {p.sentVersions.length > 0 && (
                <ul className="versions">
                  {p.sentVersions.map((v) => (
                    <li key={v.token} className="version-row">
                      <div className="list-item-meta">
                        <strong>{v.version}</strong> · {formatFecha(v.sentAt)} ·{" "}
                        {v.autor}
                      </div>
                      <div className="version-actions">
                        <a href={`/p/${v.token}`} target="_blank" rel="noreferrer">
                          /p/…{v.token.slice(-6)}
                        </a>
                        <CopyLink path={`/p/${v.token}`} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
