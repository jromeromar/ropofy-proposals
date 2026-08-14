import Link from "next/link";
import { storage } from "@/lib/storage";
import type { StoredProposal } from "@/lib/types";

// Always read fresh from storage.
export const dynamic = "force-dynamic";

function formatFecha(iso: string): string {
  try {
    return new Intl.DateTimeFormat("es-CO", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default async function ConsultorHome() {
  const proposals: StoredProposal[] = await storage.listProposals();

  return (
    <main className="container stack">
      <div className="header-row">
        <div>
          <h1>Propuestas</h1>
          <p className="muted">Área del consultor</p>
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
            <li key={p.id} className="list-item">
              <div>
                <div>
                  <span className="accent-dot" aria-hidden="true" />
                  <Link href={`/consultor/${p.id}/presentacion`}>
                    <strong>{p.cliente}</strong>
                  </Link>
                </div>
                <div className="list-item-meta">
                  Versión {p.version} · Cargada el {formatFecha(p.createdAt)}
                </div>
              </div>
              <span className="badge">{p.estado}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
