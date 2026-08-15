import { storage } from "@/lib/storage";
import CotizarPanel from "./CotizarPanel";
import "./cotizar.css";

export const dynamic = "force-dynamic";

function clampPlan(value: unknown): 1 | 2 | 3 | null {
  const n = Number(value);
  return n === 1 || n === 2 || n === 3 ? (n as 1 | 2 | 3) : null;
}

export default async function CotizarPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ plan?: string }>;
}) {
  const { id } = await params;
  const { plan } = await searchParams;
  const stored = await storage.getProposal(id);

  if (!stored) {
    return (
      <main className="container stack">
        <h1>Propuesta no encontrada</h1>
        <div className="card card-muted">
          <p style={{ margin: 0 }}>
            No existe una propuesta con el identificador <code>{id}</code>.
          </p>
        </div>
        <div>
          <a href="/consultor" className="btn btn-secondary">
            Volver al listado
          </a>
        </div>
      </main>
    );
  }

  const cc = stored.data.condicion_comercial;
  const planInicial =
    clampPlan(plan) ?? (stored.data.plan_recomendado.plan as 1 | 2 | 3);

  // Only client-safe pricing metadata crosses to the panel.
  return (
    <CotizarPanel
      id={id}
      cliente={stored.data.cliente}
      moneda={cc.moneda}
      precioPorPlan={cc.precio_por_plan}
      limite={cc.limite_descuento_sin_aprobacion}
      planInicial={planInicial}
      versionesEnviadas={stored.sentVersions.length}
    />
  );
}
