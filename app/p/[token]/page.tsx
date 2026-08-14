import { storage } from "@/lib/storage";
import PlaceholderDoc from "./PlaceholderDoc";
import "./p.css";

export const dynamic = "force-dynamic";

/**
 * The client route. NO login, NO consultant logic. Resolves a token to its
 * frozen snapshot and renders a minimal placeholder (prompt 4 replaces this
 * with the full document). Rendered entirely on the server: nothing but the
 * final HTML reaches the browser.
 */
export default async function ClientDocumentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const resolved = await storage.getByToken(token);

  return (
    <main className="p-doc">
      {resolved ? (
        <PlaceholderDoc clientDocument={resolved.sentVersion.clientDocument} />
      ) : (
        <div className="p-card">
          <h1 className="p-title">Documento no disponible</h1>
          <p className="p-muted">
            Este enlace no es válido o la propuesta ya no está disponible.
          </p>
        </div>
      )}
    </main>
  );
}
