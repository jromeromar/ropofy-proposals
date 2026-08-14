import Link from "next/link";

// Placeholder. La vista de presentación se construye en el prompt 2.
// Es una ruta del consultor (/consultor/...): NUNCA es el documento del
// cliente, que vivirá bajo /p/ como una respuesta distinta.
export default async function PresentacionStub({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <main className="container stack">
      <h1>Vista de presentación</h1>
      <div className="card card-muted">
        <p style={{ marginTop: 0 }}>
          Esta pantalla aún no está construida. Se implementará en una etapa
          posterior.
        </p>
        <p className="muted" style={{ marginBottom: 0 }}>
          Propuesta: <code>{id}</code>
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
