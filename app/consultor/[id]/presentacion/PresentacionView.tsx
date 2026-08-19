"use client";

/**
 * Consultant presentation view. LOW text density: headlines, big numbers and
 * chips — the consultant speaks, the screen supports. Selecting a plan
 * recalculates the map gating, the maturity bars and the price together.
 *
 * Receives a PresentacionVM (already stripped of every internal field on the
 * server) — never the raw proposal — so nothing forbidden can reach the client.
 * Exported plainly (no next/link) so it can be server-rendered in tests.
 */

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ElementType,
  type ReactNode,
} from "react";
import { formatPrice } from "@/lib/rules";
import { guardarInline, type EdicionInline } from "./actions";
import { gradeForPlan } from "@/lib/grade";
import { isLocked, PLAN_RANK, PLAN_LABEL, BAND_ORDER } from "@/lib/mapLayout";
import type {
  PresentacionVM,
  BandVM,
  CompVM,
  MadurezVM,
  InventarioItem,
} from "@/lib/presentacionVM";
import type { AsIs } from "@/lib/types";

type Plan = 1 | 2 | 3;
type PlanKey = "1" | "2" | "3";

const PLAN_PHRASES: Record<Plan, string> = {
  1: "Nada se pierde: cada conversación con dueño, origen y tarea.",
  2: "El sistema trabaja: atiende, agenda, firma y despierta tu base.",
  3: "El sistema persigue y decide: ningún lead se enfría.",
};

const INTEGRACION_BADGE: Record<string, { label: string; cls: string }> = {
  incluido: { label: "Incluido", cls: "badge-incluido" },
  consumo_variable: { label: "Consumo variable", cls: "badge-consumo" },
  licencia_del_cliente: { label: "Requiere su licencia", cls: "badge-licencia" },
  desarrollo_a_cotizar: { label: "Se cotiza aparte", cls: "badge-cotizar" },
};

interface Props {
  id: string;
  vm: PresentacionVM;
  /** Brand / trade name (or null); shown alongside the legal name. */
  marca?: string | null;
  /** Test/override hook; defaults to planRecomendado. */
  initialPlan?: Plan;
}

// Inline-edit context: lets deeply-nested fields become editable without
// threading props through every component.
interface EditCtx {
  editing: boolean;
  get: (k: string, fallback: string) => string;
  set: (k: string, v: string) => void;
}
const EditContext = createContext<EditCtx>({
  editing: false,
  get: (_k, f) => f,
  set: () => {},
});

/** A field that becomes contentEditable in edit mode; commits on blur. */
function Editable({
  k,
  value,
  as,
  className,
}: {
  k: string;
  value: string;
  as?: ElementType;
  className?: string;
}) {
  const { editing, get, set } = useContext(EditContext);
  const Tag = as ?? "span";
  const shown = get(k, value);
  if (!editing) return <Tag className={className}>{shown}</Tag>;
  return (
    <Tag
      className={`${className ? className + " " : ""}pv-ed-field`}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      onBlur={(e: React.FocusEvent<HTMLElement>) =>
        set(k, e.currentTarget.textContent ?? "")
      }
    >
      {shown}
    </Tag>
  );
}

export default function PresentacionView({ id, vm, marca, initialPlan }: Props) {
  const [plan, setPlan] = useState<Plan>(initialPlan ?? vm.planRecomendado);
  const [showFloating, setShowFloating] = useState(false);
  const switcherRef = useRef<HTMLDivElement | null>(null);

  // Inline editing state.
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Feature inventory drawer state (pending include/exclude toggles by idx).
  const [invOpen, setInvOpen] = useState(false);
  const [invPend, setInvPend] = useState<Record<number, boolean>>({});
  const [invSaving, setInvSaving] = useState(false);
  const invIncluido = (idx: number, base: boolean) =>
    idx in invPend ? invPend[idx] : base;

  async function aplicarInventario() {
    const ediciones: EdicionInline[] = vm.inventario
      .filter((it) => invIncluido(it.idx, it.incluido) !== it.incluido)
      .map((it) => ({
        campo: "compIncluido" as const,
        idx: it.idx,
        incluido: invIncluido(it.idx, it.incluido),
      }));
    if (ediciones.length === 0) {
      setInvOpen(false);
      return;
    }
    setInvSaving(true);
    try {
      const res = await guardarInline({ id, ediciones });
      if (res.ok && typeof window !== "undefined") window.location.reload();
    } finally {
      setInvSaving(false);
    }
  }

  const editCtx: EditCtx = {
    editing,
    get: (kk, fallback) => (kk in edits ? edits[kk] : fallback),
    set: (kk, v) => setEdits((prev) => ({ ...prev, [kk]: v })),
  };

  function cancelarEdicion() {
    setEdits({});
    setEditing(false);
    setSaveError(null);
  }

  async function guardarEdicion() {
    const ediciones: EdicionInline[] = [];
    for (const [kk, valor] of Object.entries(edits)) {
      if (kk === "titular" || kk === "cliente" || kk === "marca") {
        ediciones.push({ campo: kk, valor });
      } else if (kk.startsWith("fuga:")) {
        const [, idxStr, campo] = kk.split(":");
        const idx = Number(idxStr);
        if (campo === "titulo") ediciones.push({ campo: "fugaTitulo", idx, valor });
        else if (campo === "valor") ediciones.push({ campo: "fugaValor", idx, valor });
      } else if (kk.startsWith("comp:")) {
        const idx = Number(kk.slice(5));
        ediciones.push({ campo: "compNombre", idx, valor });
      }
    }
    if (ediciones.length === 0) {
      cancelarEdicion();
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await guardarInline({ id, ediciones });
      if (res.ok) {
        setEdits({});
        setEditing(false);
        // Reload so the server rebuilds the VM from the corrected draft.
        if (typeof window !== "undefined") window.location.reload();
      } else {
        setSaveError(res.errors[0] ?? "No se pudo guardar.");
      }
    } catch {
      setSaveError("No se pudo guardar. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    const el = switcherRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      ([entry]) => setShowFloating(!entry.isIntersecting),
      { rootMargin: "-8px 0px 0px 0px", threshold: 0 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const precioDe = (p: Plan) =>
    formatPrice(vm.precioPorPlan[String(p) as PlanKey], vm.moneda);
  const precio = precioDe(plan);

  return (
    <EditContext.Provider value={editCtx}>
    <div className={`pv${editing ? " pv-editando" : ""}`}>
      <Portada cliente={vm.cliente} marca={marca ?? null} titular={vm.titular} />

      <div ref={switcherRef}>
        <PlanSwitcher plan={plan} onSelect={setPlan} precioDe={precioDe} sticky />
      </div>

      <FloatingSwitcher
        visible={showFloating}
        plan={plan}
        onSelect={setPlan}
        precio={precio}
      />

      <div className="pv-edit-toolbar">
        {editing ? (
          <>
            {saveError && <span className="pv-edit-error">{saveError}</span>}
            <span className="pv-edit-hint">Edición en vivo</span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={cancelarEdicion}
              disabled={saving}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={guardarEdicion}
              disabled={saving}
            >
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setEditing(true)}
            >
              Editar aquí
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setInvPend({});
                setInvOpen(true);
              }}
            >
              Funcionalidades
            </button>
            <a
              href={`/consultor/${id}/editar`}
              className="btn btn-secondary btn-sm"
            >
              Editar todo →
            </a>
          </>
        )}
      </div>

      <InventarioDrawer
        open={invOpen}
        inventario={vm.inventario}
        incluidoDe={invIncluido}
        onToggle={(idx, v) => setInvPend((prev) => ({ ...prev, [idx]: v }))}
        onAplicar={aplicarInventario}
        onCerrar={() => setInvOpen(false)}
        saving={invSaving}
      />

      <Entendimos asIs={vm.asIs} />
      <Fugas vm={vm} />
      <LaNota vm={vm} />
      <LosPlanes vm={vm} plan={plan} onSelect={setPlan} precioDe={precioDe} />
      <ElPlano vm={vm} plan={plan} />
      <ADondeLlega vm={vm} plan={plan} />
      <Cierre id={id} plan={plan} precio={precio} />
    </div>
    </EditContext.Provider>
  );
}

// --- feature inventory drawer (Power BI style) --------------------------

function InventarioDrawer({
  open,
  inventario,
  incluidoDe,
  onToggle,
  onAplicar,
  onCerrar,
  saving,
}: {
  open: boolean;
  inventario: InventarioItem[];
  incluidoDe: (idx: number, base: boolean) => boolean;
  onToggle: (idx: number, v: boolean) => void;
  onAplicar: () => void;
  onCerrar: () => void;
  saving: boolean;
}) {
  const grupos = BAND_ORDER.map((name) => ({
    name,
    items: inventario.filter((it) => it.banda === name),
  })).filter((g) => g.items.length > 0);
  const total = inventario.length;
  const seleccionadas = inventario.filter((it) =>
    incluidoDe(it.idx, it.incluido),
  ).length;

  return (
    <div className={`pv-drawer-wrap${open ? " open" : ""}`} aria-hidden={!open}>
      <div className="pv-drawer-overlay" onClick={onCerrar} />
      <aside className="pv-drawer" role="dialog" aria-label="Funcionalidades">
        <div className="pv-drawer-head">
          <div>
            <div className="pv-drawer-title">Funcionalidades</div>
            <div className="pv-drawer-sub">
              {seleccionadas} de {total} en el plano
            </div>
          </div>
          <button type="button" className="pv-drawer-x" onClick={onCerrar}>
            ✕
          </button>
        </div>

        <div className="pv-drawer-body">
          {grupos.map((g) => (
            <div key={g.name} className="pv-drawer-grupo">
              <div className="pv-drawer-banda">{g.name}</div>
              {g.items.map((it) => {
                const on = incluidoDe(it.idx, it.incluido);
                return (
                  <label
                    key={it.idx}
                    className={`pv-drawer-row${on ? "" : " off"}`}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => onToggle(it.idx, e.target.checked)}
                    />
                    <span className="pv-drawer-nombre">{it.nombre}</span>
                    <span className="pv-drawer-plan">{PLAN_LABEL[PLAN_RANK[it.plan]]}</span>
                  </label>
                );
              })}
            </div>
          ))}
        </div>

        <div className="pv-drawer-foot">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onCerrar}
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={onAplicar}
            disabled={saving}
          >
            {saving ? "Aplicando…" : "Aplicar"}
          </button>
        </div>
      </aside>
    </div>
  );
}

// --- numbered section head ----------------------------------------------

function SecHead({
  n,
  children,
  small,
}: {
  n: number;
  children: ReactNode;
  small?: string;
}) {
  return (
    <div className="pv-sec-head">
      <span className="pv-sec-num" aria-hidden="true">
        {n}
      </span>
      <h2 className="pv-h2">{children}</h2>
      {small && <small className="pv-sec-small">{small}</small>}
    </div>
  );
}

// Grade scale (mirror of lib/grade.ts thresholds).
const ESCALA_NOTA: Array<{ g: string; r: string }> = [
  { g: "A", r: "85+" },
  { g: "B", r: "70" },
  { g: "C", r: "55" },
  { g: "D", r: "40" },
  { g: "E", r: "25" },
  { g: "F", r: "0" },
];

// --- global controls ----------------------------------------------------

function PlanSwitcher({
  plan,
  onSelect,
  precioDe,
  sticky,
}: {
  plan: Plan;
  onSelect: (p: Plan) => void;
  precioDe: (p: Plan) => string;
  sticky?: boolean;
}) {
  return (
    <div className={`pv-switcher${sticky ? " pv-switcher-sticky" : ""}`}>
      {([1, 2, 3] as Plan[]).map((p) => (
        <button
          key={p}
          type="button"
          className={`pv-pill${p === plan ? " active" : ""}`}
          aria-pressed={p === plan}
          onClick={() => onSelect(p)}
        >
          <span>{PLAN_LABEL[p]}</span>
          <small>{precioDe(p)}</small>
        </button>
      ))}
    </div>
  );
}

function FloatingSwitcher({
  visible,
  plan,
  onSelect,
  precio,
}: {
  visible: boolean;
  plan: Plan;
  onSelect: (p: Plan) => void;
  precio: string;
}) {
  return (
    <div className={`pv-floating${visible ? " show" : ""}`} aria-hidden={!visible}>
      <div className="pv-floating-pills">
        {([1, 2, 3] as Plan[]).map((p) => (
          <button
            key={p}
            type="button"
            className={`pv-pill sm${p === plan ? " active" : ""}`}
            aria-pressed={p === plan}
            onClick={() => onSelect(p)}
          >
            {PLAN_LABEL[p]}
          </button>
        ))}
      </div>
      <div className="pv-floating-price">{precio}</div>
    </div>
  );
}

// --- 1. Portada ---------------------------------------------------------

function Portada({
  cliente,
  marca,
  titular,
}: {
  cliente: string;
  marca: string | null;
  titular: string;
}) {
  const { editing } = useContext(EditContext);
  const fecha = new Intl.DateTimeFormat("es-CO", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());
  return (
    <section className="pv-hero">
      <span className="pv-orbita o1" aria-hidden="true" />
      <span className="pv-orbita o2" aria-hidden="true" />
      <div className="pv-hero-in">
        <div className="pv-wordmark">
          <span className="dot" aria-hidden="true" />
          Ropofy
        </div>
        <div className="pv-eyebrow">Arquitectura comercial</div>
        <Editable k="titular" value={titular} as="h1" className="pv-titular" />
        <div className="pv-hero-meta">
          {editing ? (
            <>
              <span>
                Marca:{" "}
                <Editable k="marca" value={marca ?? ""} className="pv-ed-min" />
              </span>
              <span>
                Razón social: <Editable k="cliente" value={cliente} />
              </span>
            </>
          ) : (
            <span>
              <b>{marca ? `${marca} (${cliente})` : cliente}</b>
            </span>
          )}
          <span>{fecha}</span>
        </div>
      </div>
    </section>
  );
}

// --- 2. Lo que entendimos ----------------------------------------------

// Headline figures come from each row's explicit `cifra` (third element),
// never scraped from the note — so no phantom numbers. A row without a cifra
// shows no tile; the label is its unit, falling back to the channel name.
function extractStats(asIs: AsIs): { value: string; label: string }[] {
  const cols = [asIs.de_donde_llegan, asIs.por_donde_pasan, asIs.donde_queda];
  const out: { value: string; label: string }[] = [];
  for (const col of cols) {
    for (const fila of col) {
      const [canal, , extra] = fila;
      const cifra = extra?.cifra?.trim();
      if (!cifra) continue;
      out.push({ value: cifra, label: extra?.unidad?.trim() || canal });
    }
  }
  return out;
}

function Entendimos({ asIs }: { asIs: AsIs }) {
  const stats = extractStats(asIs);
  return (
    <section className="pv-section">
      <SecHead n={1}>Lo que entendimos</SecHead>
      {stats.length > 0 && (
        <div className="pv-stats">
          {stats.map((s, i) => (
            <div className="pv-stat" key={i}>
              <div className="pv-stat-value">{s.value}</div>
              <div className="pv-stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      )}
      <div className="pv-chips">
        {asIs.de_donde_llegan.map(([label], i) => (
          <span className="pv-chip" key={i}>
            {label}
          </span>
        ))}
      </div>
    </section>
  );
}

// --- 3. Las fugas -------------------------------------------------------

function Fugas({ vm }: { vm: PresentacionVM }) {
  return (
    <section className="pv-section">
      <SecHead n={2}>Las fugas</SecHead>
      {vm.fugaDominante && (
        <div className="pv-fuga-dominante">
          <Editable
            k={`fuga:${vm.fugaDominante.idx}:titulo`}
            value={vm.fugaDominante.titulo}
            as="h3"
            className="pv-fuga-titulo"
          />
          <Editable
            k={`fuga:${vm.fugaDominante.idx}:valor`}
            value={vm.fugaDominante.valor}
            as="div"
            className="pv-fuga-cifra"
          />
        </div>
      )}
      <div className="pv-fugas-grid">
        {vm.fugasResto.map((f, i) => {
          const cls =
            f.estado === "mitigable"
              ? "pv-fuga mitigable"
              : f.estado === "fuera_de_alcance"
                ? "pv-fuga fuera"
                : "pv-fuga";
          return (
            <div className={cls} key={i}>
              <Editable
                k={`fuga:${f.idx}:titulo`}
                value={f.titulo}
                as="div"
                className="pv-fuga-min-titulo"
              />
              {f.estado === "mitigable" && (
                <div className="pv-fuga-nota">
                  Depende de: {f.dependeDeTercero ? "un tercero" : "nadie externo"}
                </div>
              )}
              {f.estado === "fuera_de_alcance" && (
                <div className="pv-fuga-nota">Lo corrige el cliente</div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// --- 4. La nota ---------------------------------------------------------

function LaNota({ vm }: { vm: PresentacionVM }) {
  return (
    <section className="pv-section">
      <SecHead n={3} small="Dónde está la operación comercial hoy">
        El diagnóstico
      </SecHead>
      <div className="pv-score">
        <div className="pv-score-cap">Nota de madurez</div>
        <div className="pv-score-letra">{vm.nota.letra}</div>
        <div className="pv-score-pts">{vm.nota.puntos}/100</div>
        <div className="pv-escala">
          {ESCALA_NOTA.map((e) => (
            <div key={e.g} className={e.g === vm.nota.letra ? "act" : ""}>
              <div className="g">{e.g}</div>
              <div className="r">{e.r}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// --- 5. Los planes ------------------------------------------------------

function LosPlanes({
  vm,
  plan,
  onSelect,
  precioDe,
}: {
  vm: PresentacionVM;
  plan: Plan;
  onSelect: (p: Plan) => void;
  precioDe: (p: Plan) => string;
}) {
  return (
    <section className="pv-section">
      <SecHead n={4} small="Elige hasta dónde llevar el sistema">
        Los planes
      </SecHead>
      <div className="pv-planes">
        {([1, 2, 3] as Plan[]).map((p) => (
          <button
            key={p}
            type="button"
            className={`pv-plan-card${p === plan ? " active" : ""}`}
            aria-pressed={p === plan}
            onClick={() => onSelect(p)}
          >
            {vm.planRecomendado === p && (
              <span className="pv-badge-reco">RECOMENDADO</span>
            )}
            <div className="pv-plan-nombre">{PLAN_LABEL[p]}</div>
            <div className="pv-plan-frase">{PLAN_PHRASES[p]}</div>
            <div className="pv-plan-precio">{precioDe(p)}</div>
          </button>
        ))}
      </div>
    </section>
  );
}

// --- 6. El plano del sistema -------------------------------------------

function ComponentChips({ comp }: { comp: CompVM }) {
  return (
    <div className="pv-card-chips">
      {comp.cuota && <span className="pv-chip-cuota">{comp.cuota}</span>}
      {comp.instancias > 1 && (
        <span
          className="pv-chip-inst"
          title={`${comp.instancias} configuraciones para su operación`}
        >
          ×{comp.instancias}
        </span>
      )}
    </div>
  );
}

function ComponentCard({ comp, plan }: { comp: CompVM; plan: Plan }) {
  const locked = isLocked(comp.plan, plan);
  return (
    <div className={`pv-card${locked ? " locked" : ""}`}>
      <Editable
        k={`comp:${comp.idx}`}
        value={comp.nombre}
        as="div"
        className="pv-card-nombre"
      />
      <ComponentChips comp={comp} />
      {locked && (
        <div className="pv-lock">🔒 {PLAN_LABEL[PLAN_RANK[comp.plan]]}</div>
      )}
    </div>
  );
}

function AINode({ entries, plan }: { entries: CompVM[]; plan: Plan }) {
  const allLocked = entries.every((e) => isLocked(e.plan, plan));
  return (
    <div className={`pv-ai-node${allLocked ? " locked" : ""}`}>
      <div className="pv-ai-title">Su asistente de IA — uno solo, con habilidades</div>
      <div className="pv-ai-chips">
        {entries.map((e) => {
          const locked = isLocked(e.plan, plan);
          return (
            <span className={`pv-ai-chip${locked ? " locked" : ""}`} key={e.key}>
              <Editable k={`comp:${e.idx}`} value={e.nombre} />
              {locked && <em className="pv-ai-lock"> 🔒 {PLAN_LABEL[PLAN_RANK[e.plan]]}</em>}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function ElPlano({ vm, plan }: { vm: PresentacionVM; plan: Plan }) {
  return (
    <section className="pv-section">
      <SecHead n={5} small="Todo lo que se pone a trabajar">
        El plano del sistema
      </SecHead>

      <div className="pv-lienzo">
        <div className="pv-bands">
          {vm.bands.map((band: BandVM) => (
            <div className="pv-band" key={band.name}>
              <div className="pv-band-head">
                <span className="pv-band-num">{band.numero}</span>
                <span className="pv-band-name">{band.name}</span>
              </div>
              <div className="pv-band-grid">
                {band.regular.map((comp) => (
                  <ComponentCard key={comp.key} comp={comp} plan={plan} />
                ))}
              </div>
              {band.ai.length > 0 && <AINode entries={band.ai} plan={plan} />}
            </div>
          ))}
        </div>
      </div>

      <div className="pv-rail">
        <h3 className="pv-h3">Integraciones y costos externos</h3>
        <div className="pv-rail-grid">
          {vm.integraciones.map(([nombre, nota, etiqueta], i) => {
            const badge = INTEGRACION_BADGE[etiqueta] ?? {
              label: etiqueta,
              cls: "badge-licencia",
            };
            return (
              <div className="pv-rail-card" key={i}>
                <div className="pv-rail-nombre">{nombre}</div>
                <div className="pv-rail-nota">{nota}</div>
                <span className={`pv-cost-badge ${badge.cls}`}>{badge.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {vm.noAplican.length > 0 && (
        <div className="pv-noaplican">
          <h3 className="pv-h3">No se dibujan en su plano</h3>
          <ul>
            {vm.noAplican.map(([nombre, razon], i) => (
              <li key={i}>
                <strong>{nombre}</strong> — {razon}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// --- 7. A dónde llega ---------------------------------------------------

function ADondeLlega({ vm, plan }: { vm: PresentacionVM; plan: Plan }) {
  const key = String(plan) as PlanKey;
  const proyectada = gradeForPlan(vm.madurez, plan);

  let maxGana = 0;
  for (const m of vm.madurez) maxGana = Math.max(maxGana, m.p[key] - m.hoy);

  return (
    <section className="pv-section">
      <div className="pv-adonde-head">
        <SecHead n={6}>A dónde llega</SecHead>
        <div className="pv-grade-arrow">
          {vm.nota.letra} <span aria-hidden="true">→</span>{" "}
          <strong>{proyectada.letra}</strong>
        </div>
      </div>
      <div className="pv-madurez">
        {vm.madurez.map((m: MadurezVM, i) => {
          const hoy = m.hoy;
          const meta = Math.max(m.p[key], hoy);
          const sector = vm.benchmarkModulos?.[m.m];
          const hoyPct = (hoy / 4) * 100;
          const ganaPct = ((meta - hoy) / 4) * 100;
          const top = maxGana > 0 && m.p[key] - hoy === maxGana;
          return (
            <div className={`pv-madurez-row${top ? " top" : ""}`} key={i}>
              <div className="pv-madurez-nombre">{m.m}</div>
              <div className="pv-salto-wrap">
                <div className="pv-salto-bar">
                  <span className="pv-salto-hoy" style={{ width: `${hoyPct}%` }} />
                  {ganaPct > 0 && (
                    <span
                      className="pv-salto-gana"
                      style={{ width: `${ganaPct}%` }}
                    />
                  )}
                </div>
                {typeof sector === "number" && (
                  <span
                    className="pv-salto-sector"
                    style={{ left: `${(sector / 4) * 100}%` }}
                    title={`Promedio del sector: ${sector}`}
                  />
                )}
              </div>
              <div className="pv-salto-lbl">
                Hoy {hoy} · <b>meta {meta}</b>
              </div>
            </div>
          );
        })}
      </div>
      {vm.benchmarkModulos && (
        <p className="pv-bar-legend">La línea marca el promedio del sector.</p>
      )}
    </section>
  );
}

// --- 8. Cierre ----------------------------------------------------------

function Cierre({ id, plan, precio }: { id: string; plan: Plan; precio: string }) {
  return (
    <section className="pv-section pv-cierre">
      <div className="pv-cierre-precio">{precio}</div>
      <a className="pv-cta" href={`/consultor/${id}/cotizar?plan=${plan}`}>
        Preparar propuesta →
      </a>
    </section>
  );
}
