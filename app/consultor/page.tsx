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

function resumenCondicion(descuentoPct: number | null): string {
  return descuentoPct != null
    ? `${descuentoPct}% de descuento`
    : "sin descuento";
}

function estadoVersion(
  estado: string,
  vigencia: string | null,
  now: number,
): "aceptada" | "expirada" | "enviada" {
  if (estado === "aceptada") return "aceptada";
  if (vigencia && new Date(vigencia).getTime() < now) return "expirada";
  return "enviada";
}

const ESTADO_BADGE: Record<string, string> = {
  aceptada: "badge-aceptada",
  expirada: "badge-expirada",
  enviada: "badge-enviada",
};

export default async function ConsultorHome() {
  const proposals: StoredProposal[] = await storage.listProposals();
  const now = Date.now();

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
            <li key={p.id} className="list-item-block">
              <div className="header-row">
                <div>
                  <div>
                    <span className="accent-dot" aria-hidden="true" />
                    <Link href={`/consultor/${p.id}/presentacion`}>
                      <strong>{p.cliente}</strong>
                    </Link>
                  </div>
                  <div className="list-item-meta">
                    Cargada el {formatFecha(p.createdAt)}
                  </div>
                </div>
                <span className="badge">{p.estado}</span>
              </div>

              {p.sentVersions.length > 0 && (
                <ul className="versions">
                  {p.sentVersions.map((v) => {
                    const est = estadoVersion(
                      v.estado,
                      v.condicion.vigencia,
                      now,
                    );
                    return (
                      <li key={v.token} className="version-row">
                        <div>
                          <span className={`badge ${ESTADO_BADGE[est]}`}>{est}</span>{" "}
                          <strong>{v.version}</strong>{" "}
                          <span className="list-item-meta">
                            · {formatFecha(v.sentAt)} · {v.autor}
                            {v.aprobador ? ` · aprobó ${v.aprobador}` : ""} ·{" "}
                            {resumenCondicion(v.condicion.descuentoPct)}
                          </span>
                          {v.acceptance && (
                            <div className="list-item-meta version-accept">
                              Aceptada por {v.acceptance.nombre} (
                              {v.acceptance.correo}) el{" "}
                              {formatFecha(v.acceptance.at)}
                              {v.acceptance.observaciones
                                ? ` · «${v.acceptance.observaciones}»`
                                : ""}
                            </div>
                          )}
                        </div>
                        <a
                          className="version-link"
                          href={`/p/${v.token}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          /p/…{v.token.slice(-6)}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
