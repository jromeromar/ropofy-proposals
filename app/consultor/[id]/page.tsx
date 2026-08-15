import Link from "next/link";
import { storage, hashData } from "@/lib/storage";
import { PLAN_LABEL } from "@/lib/mapLayout";
import {
  feedLineas,
  señalDecision,
  estadoVersion,
  resumenUserAgent,
} from "@/lib/expediente";
import { formatPrice } from "@/lib/rules";
import CopyLink from "./CopyLink";
import "./expediente.css";

export const dynamic = "force-dynamic";

function fechaHora(iso: string): string {
  try {
    return new Intl.DateTimeFormat("es-CO", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

const ESTADO_BADGE: Record<string, string> = {
  aceptada: "badge-aceptada",
  expirada: "badge-expirada",
  enviada: "badge-enviada",
};

export default async function ExpedientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const stored = await storage.getProposal(id);
  const now = Date.now();

  if (!stored) {
    return (
      <main className="container stack">
        <h1>Expediente no encontrado</h1>
        <div className="card card-muted">
          <p style={{ margin: 0 }}>
            No existe una propuesta con el identificador <code>{id}</code>.
          </p>
        </div>
        <div>
          <Link href="/consultor" className="btn btn-secondary">
            Volver al listado
          </Link>
        </div>
      </main>
    );
  }

  const data = stored.data;
  const versiones = stored.sentVersions;
  const ultima = versiones[versiones.length - 1];
  const draftDrift =
    ultima && ultima.sourceHash && ultima.sourceHash !== hashData(data);

  return (
    <main className="container stack">
      <div className="header-row">
        <div>
          <h1 style={{ marginBottom: 4 }}>{data.cliente}</h1>
          <p className="muted" style={{ margin: 0 }}>
            Nota {data.nota.letra} · {data.nota.puntos}/100 · Modo {data.modo} ·
            Estado: {stored.estado}
          </p>
        </div>
        <div className="header-row" style={{ gap: 8 }}>
          <Link href={`/consultor/${id}/presentacion`} className="btn btn-secondary">
            Presentación
          </Link>
          <Link href={`/consultor/${id}/cotizar`} className="btn btn-primary">
            Preparar / enviar
          </Link>
        </div>
      </div>

      {draftDrift && (
        <div className="exp-drift">
          Este borrador tiene cambios no enviados respecto a {ultima.version}.
        </div>
      )}

      {versiones.length === 0 ? (
        <div className="card card-muted">
          <p className="muted" style={{ margin: 0 }}>
            Aún no se ha enviado ninguna versión. Usa «Preparar / enviar» para
            generar la primera.
          </p>
        </div>
      ) : (
        <>
          <h2 className="exp-h2">Versiones enviadas</h2>
          <div className="exp-table-wrap">
            <table className="exp-table">
              <thead>
                <tr>
                  <th>Versión</th>
                  <th>Enviada</th>
                  <th>Autor</th>
                  <th>Condición</th>
                  <th>Estado</th>
                  <th>Enlace</th>
                </tr>
              </thead>
              <tbody>
                {[...versiones].reverse().map((v) => {
                  const est = estadoVersion(v, now);
                  return (
                    <tr key={v.token}>
                      <td>
                        <strong>{v.version}</strong>
                      </td>
                      <td>{fechaHora(v.sentAt)}</td>
                      <td>
                        {v.autor}
                        {v.aprobador ? ` · aprobó ${v.aprobador}` : ""}
                      </td>
                      <td>
                        {v.condicion.descuentoPct != null
                          ? `${v.condicion.descuentoPct}% de descuento`
                          : "sin descuento"}
                      </td>
                      <td>
                        <span className={`badge ${ESTADO_BADGE[est]}`}>{est}</span>
                      </td>
                      <td className="exp-link-cell">
                        <a href={`/p/${v.token}`} target="_blank" rel="noreferrer">
                          /p/…{v.token.slice(-6)}
                        </a>
                        <CopyLink path={`/p/${v.token}`} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {[...versiones].reverse().map((v) => {
            const señal = señalDecision(v, now);
            const lineas = feedLineas(v);
            const a = v.acceptance;
            return (
              <section className="exp-version card" key={`det-${v.token}`}>
                <div className="header-row">
                  <h3 style={{ margin: 0 }}>
                    {v.version} · plan {PLAN_LABEL[v.plan]}
                  </h3>
                  <span className="list-item-meta">
                    {señal.n7} aperturas en los últimos 7 días
                  </span>
                </div>

                {señal.mostrar && (
                  <div className="exp-signal">
                    Señal de decisión: el documento se abrió {señal.n7} veces esta
                    semana. Buen momento para llamar.
                  </div>
                )}

                {a && (
                  <div className="exp-accept">
                    <h4 className="exp-h4">Aceptación registrada</h4>
                    <ul className="exp-accept-list">
                      <li>
                        <strong>{a.nombre}</strong> · {a.correo}
                      </li>
                      <li>{fechaHora(a.at)}</li>
                      <li>
                        Precio efectivo servido: {formatPrice(a.precioEfectivo, a.moneda)}
                      </li>
                      <li>
                        Dispositivo: {resumenUserAgent(a.userAgent)}
                        {a.ip ? ` · IP ${a.ip}` : ""}
                      </li>
                      {a.observaciones && <li>Observaciones: «{a.observaciones}»</li>}
                    </ul>
                    <a
                      className="btn btn-secondary"
                      href={`/p/${v.token}?print=1`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Descargar orden (imprimir)
                    </a>
                  </div>
                )}

                <h4 className="exp-h4">Actividad</h4>
                {lineas.length === 0 ? (
                  <p className="list-item-meta">Sin actividad registrada todavía.</p>
                ) : (
                  <ul className="exp-feed">
                    {lineas.map((l, i) => (
                      <li key={i}>
                        <span className="exp-feed-when">{fechaHora(l.at)}</span>
                        <span className="exp-feed-what">{l.texto}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </>
      )}
    </main>
  );
}
