"use client";

import { useState } from "react";

/** Copies the absolute /p/ URL to the clipboard. Consultant-only. */
export default function CopyLink({ path }: { path: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    const url =
      typeof window !== "undefined" ? `${window.location.origin}${path}` : path;
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <button type="button" className="exp-copy" onClick={copiar}>
      {copiado ? "¡Copiado!" : "Copiar enlace"}
    </button>
  );
}
