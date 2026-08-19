import { storage } from "@/lib/storage";
import EditForm from "./EditForm";
import "./editar.css";

export const dynamic = "force-dynamic";

/**
 * Content-correction screen. Consultant-only. Lets the consultant fix the
 * error-prone text of a proposal (a mistyped brand, a wrong figure, a garbled
 * quote) live during the presentation. Writes to the draft; sent versions stay
 * frozen.
 */
export default async function EditarPage({
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

  return <EditForm id={id} data={stored.data} marca={stored.marca ?? null} />;
}
