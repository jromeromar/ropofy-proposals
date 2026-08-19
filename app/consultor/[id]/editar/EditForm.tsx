"use client";

/**
 * Content-correction form. Consultant-only. Edits a curated set of error-prone
 * text fields of the proposal DRAFT and saves them in place (no version bump).
 * All user-facing text stays in Spanish; nothing internal is exposed — this is
 * the consultant editing their own proposal data.
 */

import { useMemo, useState } from "react";
import type { Proposal, AsIsCifra, Fuga, Componente } from "@/lib/types";
import { guardarContenido } from "./actions";

type AsIsColKey = "de_donde_llegan" | "por_donde_pasan" | "donde_queda";

const AS_IS_TITULOS: Record<AsIsColKey, string> = {
  de_donde_llegan: "Por dónde llegan",
  por_donde_pasan: "Quién recibe",
  donde_queda: "Dónde queda el rastro",
};

const PLAN_LABELS: Record<string, string> = {
  fundamental: "Fundamental",
  avanzado: "Avanzado",
  inteligente: "Inteligente",
};

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export default function EditForm({
  id,
  data,
  marca,
}: {
  id: string;
  data: Proposal;
  marca: string | null;
}) {
  const [p, setP] = useState<Proposal>(() => clone(data));
  const [marcaStr, setMarcaStr] = useState(marca ?? "");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  const componentes = useMemo(
    () => Object.entries(p.componentes) as Array<[string, Componente]>,
    [p.componentes],
  );

  // Immutable update: clone, mutate, set.
  function edit(mutator: (draft: Proposal) => void) {
    setSaved(false);
    setP((prev) => {
      const next = clone(prev);
      mutator(next);
      return next;
    });
  }

  function normalizado(): Proposal {
    const out = clone(p);
    // Drop empty as_is figures so a blank cifra becomes a plain [canal, nota].
    for (const col of Object.keys(AS_IS_TITULOS) as AsIsColKey[]) {
      out.as_is[col] = out.as_is[col].map((fila) => {
        const extra = fila[2] as AsIsCifra | undefined;
        const cifra = extra?.cifra?.trim() ?? "";
        if (!cifra) return [fila[0], fila[1]];
        const unidad = extra?.unidad?.trim();
        return unidad ? [fila[0], fila[1], { cifra, unidad }] : [fila[0], fila[1], { cifra }];
      });
    }
    return out;
  }

  async function handleSave() {
    setErrors([]);
    setSaving(true);
    try {
      const res = await guardarContenido({
        id,
        data: normalizado(),
        marca: marcaStr.trim() || null,
      });
      if (res.ok) setSaved(true);
      else setErrors(res.errors);
    } catch {
      setErrors(["No se pudieron guardar los cambios. Intenta de nuevo."]);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="container stack ed">
      <div className="header-row">
        <div>
          <h1>Editar contenido</h1>
          <p className="muted">
            Corrige el texto de la propuesta en vivo. Los cambios se guardan en
            el borrador; los documentos ya enviados no cambian.
          </p>
        </div>
        <div className="list-item-actions">
          <a href={`/consultor/${id}/presentacion`} className="btn btn-secondary">
            Ver presentación
          </a>
          <a href="/consultor" className="btn btn-secondary">
            Listado
          </a>
        </div>
      </div>

      {/* Identidad */}
      <section className="card stack ed-sec">
        <h2>Identidad</h2>
        <div className="ed-grid2">
          <Campo label="Razón social">
            <input
              type="text"
              value={p.cliente}
              onChange={(e) => edit((d) => (d.cliente = e.target.value))}
            />
          </Campo>
          <Campo label="Marca (nombre comercial)">
            <input
              type="text"
              value={marcaStr}
              onChange={(e) => {
                setSaved(false);
                setMarcaStr(e.target.value);
              }}
              placeholder="Opcional"
            />
          </Campo>
        </div>
        <Campo label="Titular (frase de portada)">
          <textarea
            className="ed-ta-corta"
            value={p.titular}
            onChange={(e) => edit((d) => (d.titular = e.target.value))}
          />
        </Campo>
      </section>

      {/* Resumen */}
      <section className="card stack ed-sec">
        <h2>Resumen</h2>
        <Campo label="Resumen del negocio">
          <textarea
            value={p.resumen}
            onChange={(e) => edit((d) => (d.resumen = e.target.value))}
          />
        </Campo>
      </section>

      {/* Sistema hoy (as-is) */}
      <section className="card stack ed-sec">
        <h2>Su sistema comercial hoy</h2>
        {(Object.keys(AS_IS_TITULOS) as AsIsColKey[]).map((col) => (
          <div key={col} className="ed-subsec">
            <h3>{AS_IS_TITULOS[col]}</h3>
            {p.as_is[col].map((fila, i) => {
              const extra = fila[2] as AsIsCifra | undefined;
              return (
                <div key={i} className="ed-asis-row">
                  <Campo label="Canal">
                    <input
                      type="text"
                      value={fila[0]}
                      onChange={(e) => edit((d) => (d.as_is[col][i][0] = e.target.value))}
                    />
                  </Campo>
                  <Campo label="Nota">
                    <input
                      type="text"
                      value={fila[1]}
                      onChange={(e) => edit((d) => (d.as_is[col][i][1] = e.target.value))}
                    />
                  </Campo>
                  <Campo label="Cifra">
                    <input
                      type="text"
                      value={extra?.cifra ?? ""}
                      placeholder="—"
                      onChange={(e) =>
                        edit((d) => {
                          const row = d.as_is[col][i] as [string, string, AsIsCifra];
                          const cur = (row[2] as AsIsCifra | undefined) ?? { cifra: "" };
                          row[2] = { ...cur, cifra: e.target.value };
                        })
                      }
                    />
                  </Campo>
                  <Campo label="Unidad">
                    <input
                      type="text"
                      value={extra?.unidad ?? ""}
                      placeholder="p. ej. leads/mes"
                      onChange={(e) =>
                        edit((d) => {
                          const row = d.as_is[col][i] as [string, string, AsIsCifra];
                          const cur = (row[2] as AsIsCifra | undefined) ?? { cifra: "" };
                          row[2] = { ...cur, unidad: e.target.value };
                        })
                      }
                    />
                  </Campo>
                </div>
              );
            })}
          </div>
        ))}
      </section>

      {/* Fugas */}
      <section className="card stack ed-sec">
        <h2>Las fugas</h2>
        {p.fugas.map((f: Fuga, i) => (
          <div key={f.id ?? i} className="ed-subsec">
            <h3>
              Fuga {i + 1}
              <span className="ed-tag">{f.estado}</span>
              {f.dominante ? <span className="ed-tag ed-tag-dom">dominante</span> : null}
            </h3>
            <div className="ed-grid2">
              <Campo label="Título">
                <input
                  type="text"
                  value={f.titulo}
                  onChange={(e) => edit((d) => (d.fugas[i].titulo = e.target.value))}
                />
              </Campo>
              <Campo label="Cifra (cuantificación)">
                <input
                  type="text"
                  value={String(f.cuantificacion?.valor ?? "")}
                  onChange={(e) =>
                    edit((d) => (d.fugas[i].cuantificacion.valor = e.target.value))
                  }
                />
              </Campo>
            </div>
            <Campo label="Texto (documento del cliente)">
              <textarea
                className="ed-ta-corta"
                value={f.texto ?? ""}
                onChange={(e) => edit((d) => (d.fugas[i].texto = e.target.value))}
              />
            </Campo>
            <Campo label="Evidencia textual (cita)">
              <textarea
                className="ed-ta-corta"
                value={f.evidencia_textual ?? ""}
                onChange={(e) =>
                  edit((d) => (d.fugas[i].evidencia_textual = e.target.value))
                }
              />
            </Campo>
          </div>
        ))}
      </section>

      {/* Componentes */}
      <section className="card stack ed-sec">
        <h2>Componentes ({componentes.length})</h2>
        <p className="muted" style={{ marginTop: -8 }}>
          Nombre visible para el cliente y su beneficio. El resto (plan,
          instancias, journey) se mantiene tal como llegó del pipeline.
        </p>
        {componentes.map(([key, comp]) => (
          <div key={key} className="ed-comp">
            <div className="ed-comp-head">
              <span className="ed-tag">{PLAN_LABELS[comp.plan] ?? comp.plan}</span>
              {comp.instancias > 1 && <span className="ed-tag">×{comp.instancias}</span>}
            </div>
            <Campo label="Nombre visible">
              <input
                type="text"
                value={comp.nombre_cliente}
                onChange={(e) =>
                  edit((d) => (d.componentes[key].nombre_cliente = e.target.value))
                }
              />
            </Campo>
            <Campo label="Beneficio">
              <input
                type="text"
                value={comp.beneficio ?? ""}
                placeholder="Opcional"
                onChange={(e) => edit((d) => (d.componentes[key].beneficio = e.target.value))}
              />
            </Campo>
          </div>
        ))}
      </section>

      {/* Condiciones de arranque */}
      {p.advertencias.length > 0 && (
        <section className="card stack ed-sec">
          <h2>Condiciones de arranque</h2>
          {p.advertencias.map((a, i) => (
            <Campo key={i} label={`Condición ${i + 1}`}>
              <textarea
                className="ed-ta-corta"
                value={a}
                onChange={(e) => edit((d) => (d.advertencias[i] = e.target.value))}
              />
            </Campo>
          ))}
        </section>
      )}

      {errors.length > 0 && (
        <div className="errors" role="alert">
          <h3>No se pudo guardar</h3>
          <ul>
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Sticky save bar for quick corrections during the presentation. */}
      <div className="ed-savebar">
        {saved && <span className="ed-saved">Cambios guardados ✓</span>}
        <a
          href={`/consultor/${id}/presentacion`}
          className="btn btn-secondary"
        >
          Volver a la presentación
        </a>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </main>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="ed-campo">
      <span className="ed-campo-label">{label}</span>
      {children}
    </label>
  );
}
