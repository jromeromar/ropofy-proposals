import { storage } from "@/lib/storage";
import { toPresentacionVM } from "@/lib/presentacionVM";
import { checklistConsultor } from "@/lib/checklist";
import PresentacionView from "./PresentacionView";
import "./presentacion.css";

export const dynamic = "force-dynamic";

export default async function PresentacionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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

  return (
    <PresentacionView
      id={id}
      vm={toPresentacionVM(stored.data)}
      marca={stored.marca ?? null}
      checklist={checklistConsultor(stored.data)}
      notasFugas={stored.notasFugas ?? []}
    />
  );
}
