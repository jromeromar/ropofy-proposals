"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Inline editor for a proposal's brand name (marca). Consultant/admin-only.
 * PATCHes /api/proposals?id=… and refreshes the server-rendered list.
 */
export default function EditMarca({
  id,
  marca,
}: {
  id: string;
  marca: string | null;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(marca ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(false);

  async function guardar() {
    setGuardando(true);
    setError(false);
    try {
      const res = await fetch(`/api/proposals?id=${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marca: valor.trim() || null }),
      });
      if (!res.ok) {
        setError(true);
        return;
      }
      setEditando(false);
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setGuardando(false);
    }
  }

  if (!editando) {
    return (
      <span className="marca-view">
        <span>Marca: {marca ? <strong>{marca}</strong> : "—"}</span>
        <button
          type="button"
          className="version-copy"
          onClick={() => {
            setValor(marca ?? "");
            setEditando(true);
          }}
        >
          {marca ? "Corregir" : "Agregar"}
        </button>
      </span>
    );
  }

  return (
    <span className="marca-edit">
      <input
        type="text"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        placeholder="Nombre comercial (marca)"
        aria-label="Marca"
      />
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={guardar}
        disabled={guardando}
      >
        {guardando ? "Guardando…" : "Guardar"}
      </button>
      <button
        type="button"
        className="version-copy"
        onClick={() => setEditando(false)}
        disabled={guardando}
      >
        Cancelar
      </button>
      {error && <span className="marca-error">No se pudo guardar</span>}
    </span>
  );
}
