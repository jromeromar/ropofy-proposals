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
import RadarMadurez from "@/components/RadarMadurez";
import {
  type ChecklistConsultor,
  checklistTieneContenido,
} from "@/lib/checklist";
import { guardarInline, registrarNotaFuga, type EdicionInline } from "./actions";
import { gradeForPlan } from "@/lib/grade";
import { brechaDePlan } from "@/lib/lienzo";
import {
  isLocked,
  esCortesia,
  PLAN_RANK,
  PLAN_LABEL,
  BAND_ORDER,
} from "@/lib/mapLayout";
import type {
  PresentacionVM,
  BandVM,
  CompVM,
  MadurezVM,
  InventarioItem,
  FugaVM,
} from "@/lib/presentacionVM";
import type { AsIs, CategoriaFuga, NotaFuga, PlanNombre } from "@/lib/types";

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
  /** Consultant-only checklist (never shown to the client). */
  checklist?: ChecklistConsultor;
  /** Leak confirmations/corrections recorded so far (C10 registry). */
  notasFugas?: NotaFuga[];
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

// Numeric plan → contract plan name.
const PLAN_NOMBRE: Record<Plan, PlanNombre> = {
  1: "fundamental",
  2: "avanzado",
  3: "inteligente",
};

// Courtesy grant/remove from the plano (click the lock to gift, the gift to
// undo). Consultant-only; the client document renders the gift read-only.
interface CortesiaCtx {
  ocupadoIdx: number | null;
  setCortesia: (idx: number, plan: PlanNombre | null) => void;
}
const CortesiaContext = createContext<CortesiaCtx>({
  ocupadoIdx: null,
  setCortesia: () => {},
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

export default function PresentacionView({
  id,
  vm,
  marca,
  checklist,
  notasFugas,
  initialPlan,
}: Props) {
  const [plan, setPlan] = useState<Plan>(initialPlan ?? vm.planRecomendado);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const hayChecklist = !!checklist && checklistTieneContenido(checklist);
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
  const [planPend, setPlanPend] = useState<Record<number, PlanNombre>>({});
  const [invSaving, setInvSaving] = useState(false);
  const invIncluido = (idx: number, base: boolean) =>
    idx in invPend ? invPend[idx] : base;
  const invPlan = (idx: number, base: PlanNombre) =>
    idx in planPend ? planPend[idx] : base;

  async function aplicarInventario() {
    const ediciones: EdicionInline[] = [];
    for (const it of vm.inventario) {
      const inc = invIncluido(it.idx, it.incluido);
      if (inc !== it.incluido)
        ediciones.push({ campo: "compIncluido", idx: it.idx, incluido: inc });
      // The plan selector is a courtesy: choosing a tier BELOW the natural plan
      // gifts it there; choosing the natural tier (or above) removes the gift.
      const base = it.cortesiaPlan ?? it.plan;
      const chosen = invPlan(it.idx, base);
      const desiredCortesia =
        PLAN_RANK[chosen] < PLAN_RANK[it.plan] ? chosen : null;
      if (desiredCortesia !== it.cortesiaPlan)
        ediciones.push({
          campo: "compCortesia",
          idx: it.idx,
          cortesiaPlan: desiredCortesia,
        });
    }
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

  // Grant/remove a courtesy (extend a plan's scope with a higher-tier feature).
  const [ocupadoIdx, setOcupadoIdx] = useState<number | null>(null);
  async function setCortesia(idx: number, cortesiaPlan: PlanNombre | null) {
    setOcupadoIdx(idx);
    try {
      const res = await guardarInline({
        id,
        ediciones: [{ campo: "compCortesia", idx, cortesiaPlan }],
      });
      if (res.ok && typeof window !== "undefined") window.location.reload();
      else setOcupadoIdx(null);
    } catch {
      setOcupadoIdx(null);
    }
  }
  const cortesiaCtx: CortesiaCtx = { ocupadoIdx, setCortesia };

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
    <CortesiaContext.Provider value={cortesiaCtx}>
    <div className={`pv${editing ? " pv-editando" : ""}`}>
      <Portada cliente={vm.cliente} marca={marca ?? null} titular={vm.titular} />

      {/* A1: the top/sticky and floating selectors switch plans but show NO
          price — the price must not appear before the diagnosis. It surfaces
          for the first time in "Los planes", further down. */}
      <div ref={switcherRef}>
        <PlanSwitcher plan={plan} onSelect={setPlan} sticky />
      </div>

      <FloatingSwitcher visible={showFloating} plan={plan} onSelect={setPlan} />

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
                setPlanPend({});
                setInvOpen(true);
              }}
            >
              Funcionalidades
            </button>
            {hayChecklist && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setChecklistOpen(true)}
              >
                Checklist
              </button>
            )}
            <a
              href={`/consultor/${id}/editar`}
              className="btn btn-secondary btn-sm"
            >
              Editar todo →
            </a>
          </>
        )}
      </div>

      {checklist && (
        <ChecklistDrawer
          open={checklistOpen}
          checklist={checklist}
          onCerrar={() => setChecklistOpen(false)}
        />
      )}

      <InventarioDrawer
        open={invOpen}
        inventario={vm.inventario}
        incluidoDe={invIncluido}
        planDe={invPlan}
        onToggle={(idx, v) => setInvPend((prev) => ({ ...prev, [idx]: v }))}
        onPlan={(idx, pl) => setPlanPend((prev) => ({ ...prev, [idx]: pl }))}
        onAplicar={aplicarInventario}
        onCerrar={() => setInvOpen(false)}
        saving={invSaving}
      />

      <Entendimos asIs={vm.asIs} />
      <Fugas vm={vm} id={id} notasFugas={notasFugas ?? []} />
      <LaNota vm={vm} />
      <LosPlanes vm={vm} plan={plan} onSelect={setPlan} precioDe={precioDe} />
      <ElPlano vm={vm} plan={plan} />
      <ADondeLlega vm={vm} plan={plan} />
      <BrechaCien vm={vm} plan={plan} />
      <Cierre id={id} plan={plan} precio={precio} />
    </div>
    </CortesiaContext.Provider>
    </EditContext.Provider>
  );
}

// --- consultant checklist drawer (internal, never shown to the client) --

function ChecklistDrawer({
  open,
  checklist,
  onCerrar,
}: {
  open: boolean;
  checklist: ChecklistConsultor;
  onCerrar: () => void;
}) {
  const grafiaOk = checklist.grafiaEstado === "confirmada";
  return (
    <div className={`pv-drawer-wrap${open ? " open" : ""}`} aria-hidden={!open}>
      <div className="pv-drawer-overlay" onClick={onCerrar} />
      <aside className="pv-drawer" role="dialog" aria-label="Checklist del consultor">
        <div className="pv-drawer-head">
          <div>
            <div className="pv-drawer-title">Checklist del consultor</div>
            <div className="pv-drawer-sub">Interno · no lo ve el cliente</div>
          </div>
          <button type="button" className="pv-drawer-x" onClick={onCerrar}>
            ✕
          </button>
        </div>

        <div className="pv-drawer-body">
          {checklist.grafiaEstado && (
            <div className="pv-chk-grupo">
              <div className="pv-drawer-banda">Grafía del nombre</div>
              <div className={`pv-chk-grafia${grafiaOk ? " ok" : " alerta"}`}>
                {grafiaOk ? "✓" : "⚠"} {checklist.grafiaEstado} ·{" "}
                <b>{checklist.razonSocial}</b>
                {checklist.modo && <span> · modo {checklist.modo}</span>}
              </div>
            </div>
          )}

          {checklist.nombresPorConfirmar.length > 0 && (
            <div className="pv-chk-grupo">
              <div className="pv-drawer-banda">
                Nombres por confirmar ({checklist.nombresPorConfirmar.length})
              </div>
              <p className="pv-chk-nota">
                La transcripción de la sesión pudo distorsionarlos: confírmalos
                con el cliente.
              </p>
              {checklist.nombresPorConfirmar.map(([tipo, nombre], i) => (
                <div className="pv-chk-fila" key={i}>
                  <span className="pv-chk-nombre">{nombre}</span>
                  <span className="pv-chk-tipo">{tipo}</span>
                </div>
              ))}
            </div>
          )}

          {checklist.datosQueFaltan.length > 0 && (
            <div className="pv-chk-grupo">
              <div className="pv-drawer-banda">
                Agenda de la próxima llamada ({checklist.datosQueFaltan.length})
              </div>
              <ul className="pv-chk-lista">
                {checklist.datosQueFaltan.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
          )}

          {checklist.silencios.length > 0 && (
            <div className="pv-chk-grupo">
              <div className="pv-drawer-banda">
                Silencios de la sesión ({checklist.silencios.length})
              </div>
              {checklist.silencios.map((s, i) => (
                <div className="pv-chk-silencio" key={i}>
                  <div className="pv-chk-mod">{s.modulo}</div>
                  <div className="pv-chk-lectura">{s.lectura}</div>
                </div>
              ))}
            </div>
          )}

          {(checklist.sesiones.length > 0 || checklist.ventana) && (
            <div className="pv-chk-grupo">
              <div className="pv-drawer-banda">Sesión y arranque</div>
              <p className="pv-chk-nota">
                No se muestran en el lienzo del cliente; los tienes aquí para la
                conversación.
              </p>
              {checklist.sesiones.length > 0 && (
                <div className="pv-chk-fila">
                  <span className="pv-chk-nombre">
                    {checklist.sesiones.join(" · ")}
                  </span>
                  <span className="pv-chk-tipo">sesión de diagnóstico</span>
                </div>
              )}
              {checklist.ventana && (
                <div className="pv-chk-fila">
                  <span className="pv-chk-nombre">
                    {checklist.ventana} semanas desde la firma
                  </span>
                  <span className="pv-chk-tipo">arranque estimado</span>
                </div>
              )}
            </div>
          )}

          {checklist.noAplican.length > 0 && (
            <div className="pv-chk-grupo">
              <div className="pv-drawer-banda">
                No se dibuja en el plano ({checklist.noAplican.length})
              </div>
              <p className="pv-chk-nota">
                Fuera del lienzo del cliente. Úsalo si alguien pregunta por qué
                algo no está.
              </p>
              {checklist.noAplican.map(([nombre, razon], i) => (
                <div className="pv-chk-silencio" key={i}>
                  <div className="pv-chk-mod">{nombre}</div>
                  <div className="pv-chk-lectura">{razon}</div>
                </div>
              ))}
            </div>
          )}

          {checklist.benchmarkFuenteConDigitos && (
            <div className="pv-chk-grupo">
              <div className="pv-drawer-banda">Revisar con el pipeline</div>
              <div className="pv-chk-grafia alerta">
                ⚠ La fuente del benchmark trae dígitos (tamaño de muestra). No se
                muestra al cliente; corrige el texto en el pipeline.
              </div>
            </div>
          )}
        </div>

        <div className="pv-drawer-foot">
          <button type="button" className="btn btn-primary btn-sm" onClick={onCerrar}>
            Cerrar
          </button>
        </div>
      </aside>
    </div>
  );
}

// --- feature inventory drawer (Power BI style) --------------------------

const PLAN_OPCIONES: Array<{ v: PlanNombre; label: string }> = [
  { v: "fundamental", label: "Fundamental" },
  { v: "avanzado", label: "Avanzado" },
  { v: "inteligente", label: "Inteligente" },
];

function InventarioDrawer({
  open,
  inventario,
  incluidoDe,
  planDe,
  onToggle,
  onPlan,
  onAplicar,
  onCerrar,
  saving,
}: {
  open: boolean;
  inventario: InventarioItem[];
  incluidoDe: (idx: number, base: boolean) => boolean;
  planDe: (idx: number, base: PlanNombre) => PlanNombre;
  onToggle: (idx: number, v: boolean) => void;
  onPlan: (idx: number, plan: PlanNombre) => void;
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
              {seleccionadas} de {total} en el plano · baja el plan de una
              función para incluirla en un plan inferior
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
                const pl = planDe(it.idx, it.cortesiaPlan ?? it.plan);
                const esCortesia = PLAN_RANK[pl] < PLAN_RANK[it.plan];
                return (
                  <div
                    key={it.idx}
                    className={`pv-drawer-row${on ? "" : " off"}`}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      aria-label={`Incluir ${it.nombre}`}
                      onChange={(e) => onToggle(it.idx, e.target.checked)}
                    />
                    <span className="pv-drawer-nombre">
                      {esCortesia && <span title="Cortesía">🎁 </span>}
                      {it.nombre}
                    </span>
                    <select
                      className={`pv-drawer-plan-sel${esCortesia ? " cortesia" : ""}`}
                      value={pl}
                      aria-label={`Disponible desde el plan (${it.nombre})`}
                      title="Disponible desde este plan — elegir uno inferior lo regala como cortesía"
                      onChange={(e) => onPlan(it.idx, e.target.value as PlanNombre)}
                    >
                      {PLAN_OPCIONES.map((o) => (
                        <option key={o.v} value={o.v}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
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
  sticky,
}: {
  plan: Plan;
  onSelect: (p: Plan) => void;
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
        </button>
      ))}
    </div>
  );
}

function FloatingSwitcher({
  visible,
  plan,
  onSelect,
}: {
  visible: boolean;
  plan: Plan;
  onSelect: (p: Plan) => void;
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
      // The middle axis may carry hierarchical { quien, … } objects (no figure).
      if (!Array.isArray(fila)) continue;
      const [canal, , extra] = fila;
      // cifra may be text or a number; unidad is optional text.
      const cifra = extra?.cifra == null ? "" : String(extra.cifra).trim();
      if (!cifra) continue;
      const unidad = extra?.unidad == null ? "" : String(extra.unidad).trim();
      out.push({ value: cifra, label: unidad || canal });
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

// C7: three blocks grouped by `categoria`.
const BLOQUES_FUGA: Array<{ cat: CategoriaFuga; titulo: string; sub: string }> = [
  { cat: "fuga", titulo: "Las fugas", sub: "Por dónde se sale la plata" },
  { cat: "ceguera", titulo: "Las cegueras", sub: "Lo que no deja ver" },
  {
    cat: "restriccion",
    titulo: "Las restricciones",
    sub: "Lo que limita el crecimiento",
  },
];

function fmtNotaFecha(iso: string): string {
  try {
    return new Intl.DateTimeFormat("es-CO", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

// C10: per-card confirmation + correction note, recorded to the proposal's
// registry (append-only, attributable). The original card is never overwritten
// — recorded notes accrue beneath it and stay visible.
function FugaCardPV({
  f,
  id,
  notas,
  dominante,
}: {
  f: FugaVM;
  id: string;
  notas: NotaFuga[];
  dominante?: boolean;
}) {
  const { editing } = useContext(EditContext);
  const [locales, setLocales] = useState<NotaFuga[]>([]);
  const [nota, setNota] = useState("");
  const [anotando, setAnotando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const todas = [...notas, ...locales];
  const confirmada = todas.some((n) => n.confirmada === true);

  async function registrar(confirmar: boolean | null) {
    const texto = nota.trim() || null;
    if (confirmar == null && !texto) return;
    setGuardando(true);
    try {
      const res = await registrarNotaFuga({
        id,
        fugaIdx: f.idx,
        confirmada: confirmar,
        nota: texto,
      });
      if (res.ok) {
        setLocales((l) => [...l, res.nota]);
        setNota("");
        setAnotando(false);
      }
    } finally {
      setGuardando(false);
    }
  }

  const cls =
    f.estado === "mitigable"
      ? "pv-fuga mitigable"
      : f.estado === "fuera_de_alcance"
        ? "pv-fuga fuera"
        : "pv-fuga";
  return (
    <div className={`${cls}${dominante ? " dominante" : ""}${confirmada ? " confirmada" : ""}`}>
      {/* C8: title is the protagonist; the figure and the quote read smaller. */}
      <Editable
        k={`fuga:${f.idx}:titulo`}
        value={f.titulo}
        as="h3"
        className="pv-fuga-titulo"
      />
      {f.valor && (
        <Editable
          k={`fuga:${f.idx}:valor`}
          value={f.valor}
          as="div"
          className="pv-fuga-cifra"
        />
      )}
      {f.evidencia && (
        <blockquote className="pv-fuga-quote">«{f.evidencia}»</blockquote>
      )}
      {f.estado === "mitigable" && (
        <div className="pv-fuga-nota">
          Depende de: {f.dependeDeTercero ? "un tercero" : "nadie externo"}
        </div>
      )}
      {f.estado === "fuera_de_alcance" && (
        <div className="pv-fuga-nota">Lo corrige el cliente</div>
      )}

      {/* C10 controls — hidden while inline-editing the text. */}
      {!editing && (
        <div className="pv-fuga-asentir">
          <button
            type="button"
            className={`pv-fuga-confirmar${confirmada ? " si" : ""}`}
            disabled={guardando}
            onClick={() => registrar(true)}
          >
            {confirmada ? "✓ Confirmada" : "Confirmar «sí, así nos pasa»"}
          </button>
          {!anotando && (
            <button
              type="button"
              className="pv-fuga-anotar"
              onClick={() => setAnotando(true)}
            >
              Anotar corrección
            </button>
          )}
        </div>
      )}
      {!editing && anotando && (
        <div className="pv-fuga-nota-form">
          <textarea
            className="pv-fuga-nota-input"
            value={nota}
            rows={2}
            placeholder="Lo que el cliente matizó o corrigió…"
            onChange={(e) => setNota(e.target.value)}
          />
          <div className="pv-fuga-nota-acciones">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setAnotando(false);
                setNota("");
              }}
              disabled={guardando}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => registrar(null)}
              disabled={guardando || nota.trim() === ""}
            >
              {guardando ? "Guardando…" : "Guardar nota"}
            </button>
          </div>
        </div>
      )}

      {todas.length > 0 && (
        <div className="pv-fuga-registro">
          {todas.map((n, i) => (
            <div className="pv-fuga-registro-item" key={i}>
              {n.confirmada === true && (
                <span className="pv-fuga-reg-ok">✓ confirmada</span>
              )}
              {n.nota && <span className="pv-fuga-reg-nota">“{n.nota}”</span>}
              <span className="pv-fuga-reg-meta">
                {n.autor} · {fmtNotaFecha(n.at)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BloqueFugasPV({
  titulo,
  sub,
  fugas,
  id,
  notasPorIdx,
}: {
  titulo: string;
  sub: string;
  fugas: FugaVM[];
  id: string;
  notasPorIdx: Map<number, NotaFuga[]>;
}) {
  if (fugas.length === 0) return null;
  const dominante = fugas.find((f) => f.dominante) ?? null;
  const resto = fugas.filter((f) => !f.dominante);
  return (
    <div className="pv-fuga-bloque">
      <div className="pv-fuga-bloque-head">
        <h3 className="pv-fuga-bloque-titulo">{titulo}</h3>
        <span className="pv-fuga-bloque-sub">{sub}</span>
      </div>
      {dominante && (
        <FugaCardPV
          f={dominante}
          id={id}
          notas={notasPorIdx.get(dominante.idx) ?? []}
          dominante
        />
      )}
      <div className="pv-fugas-grid">
        {resto.map((f) => (
          <FugaCardPV
            key={f.idx}
            f={f}
            id={id}
            notas={notasPorIdx.get(f.idx) ?? []}
          />
        ))}
      </div>
    </div>
  );
}

function Fugas({
  vm,
  id,
  notasFugas,
}: {
  vm: PresentacionVM;
  id: string;
  notasFugas: NotaFuga[];
}) {
  const notasPorIdx = new Map<number, NotaFuga[]>();
  for (const n of notasFugas) {
    const arr = notasPorIdx.get(n.fugaIdx) ?? [];
    arr.push(n);
    notasPorIdx.set(n.fugaIdx, arr);
  }
  const porCategoria = (cat: CategoriaFuga) =>
    vm.fugas.filter((f) => f.categoria === cat);
  return (
    <section className="pv-section">
      <SecHead n={2} small="Confírmalas con el cliente y anota lo que corrija">
        Lo que vimos
      </SecHead>
      {BLOQUES_FUGA.map((b) => (
        <BloqueFugasPV
          key={b.cat}
          titulo={b.titulo}
          sub={b.sub}
          fugas={porCategoria(b.cat)}
          id={id}
          notasPorIdx={notasPorIdx}
        />
      ))}
    </section>
  );
}

// --- 4. La nota ---------------------------------------------------------

function LaNota({ vm }: { vm: PresentacionVM }) {
  const ejes = vm.madurez.map((m) => ({
    m: m.m,
    hoy: m.hoy,
    sector: vm.benchmarkModulos?.[m.m] ?? null,
  }));
  return (
    <section className="pv-section">
      <SecHead n={3} small="Dónde está la operación comercial hoy">
        El diagnóstico
      </SecHead>
      <div className="pv-diag-wrap">
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
        {vm.benchmarkModulos && (
          <div className="pv-radar-caja">
            <RadarMadurez ejes={ejes} />
            <div className="pv-radar-leg">
              <div>
                <i style={{ background: "#708287" }} aria-hidden="true" />
                <span>
                  <b>Promedio del sector</b>
                  <small>{vm.benchmarkFuente ?? "pymes comparables"}</small>
                </span>
              </div>
              <div>
                <i style={{ background: "#485CC7" }} aria-hidden="true" />
                <span>
                  <b>La operación hoy</b>
                  <small>lo que nos contaron</small>
                </span>
              </div>
            </div>
          </div>
        )}
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
            {/* E14: personalised phrase from the contract, else the default. */}
            <div className="pv-plan-frase">
              {vm.planFrases[String(p) as PlanKey] ?? PLAN_PHRASES[p]}
            </div>
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

function ComponentCard({
  comp,
  plan,
  verEngranaje,
}: {
  comp: CompVM;
  plan: Plan;
  verEngranaje: boolean;
}) {
  const { editing } = useContext(EditContext);
  const { ocupadoIdx, setCortesia } = useContext(CortesiaContext);
  const locked = isLocked(comp.plan, plan, comp.cortesiaPlan);
  const cortesia = esCortesia(comp.plan, plan, comp.cortesiaPlan);
  const busy = ocupadoIdx === comp.idx;
  return (
    <div
      className={`pv-card${locked ? " locked" : ""}${cortesia ? " cortesia" : ""}`}
    >
      <Editable
        k={`comp:${comp.idx}`}
        value={comp.nombre}
        as="div"
        className="pv-card-nombre"
      />
      {/* E15: one-line synthesis on the card; the full detail is raised in the
          specifications session, not drawn here. */}
      {comp.sintesis && <div className="pv-card-sintesis">{comp.sintesis}</div>}
      {verEngranaje && comp.conectaCon.length > 0 && (
        <div className="pv-card-conecta">
          <span aria-hidden="true">↳</span> alimenta a {comp.conectaCon.join(", ")}
        </div>
      )}
      <ComponentChips comp={comp} />
      {cortesia ? (
        <button
          type="button"
          className="pv-cortesia-badge"
          title={
            editing
              ? "Cortesía"
              : `Cortesía de ${PLAN_LABEL[PLAN_RANK[comp.plan]]} — clic para quitar`
          }
          onClick={() => !editing && setCortesia(comp.idx, null)}
          disabled={editing || busy}
        >
          🎁 Cortesía · {PLAN_LABEL[PLAN_RANK[comp.plan]]}
        </button>
      ) : (
        locked && (
          <button
            type="button"
            className="pv-lock pv-lock-btn"
            title={
              editing
                ? undefined
                : `Incluir como cortesía en ${PLAN_LABEL[plan]}`
            }
            onClick={() => !editing && setCortesia(comp.idx, PLAN_NOMBRE[plan])}
            disabled={editing || busy}
          >
            🔒 {PLAN_LABEL[PLAN_RANK[comp.plan]]}
          </button>
        )
      )}
    </div>
  );
}

function AINode({ entries, plan }: { entries: CompVM[]; plan: Plan }) {
  const { editing } = useContext(EditContext);
  const { ocupadoIdx, setCortesia } = useContext(CortesiaContext);
  const allLocked = entries.every((e) => isLocked(e.plan, plan, e.cortesiaPlan));
  return (
    <div className={`pv-ai-node${allLocked ? " locked" : ""}`}>
      <div className="pv-ai-title">Su asistente de IA — uno solo, con habilidades</div>
      <div className="pv-ai-chips">
        {entries.map((e) => {
          const locked = isLocked(e.plan, plan, e.cortesiaPlan);
          const cortesia = esCortesia(e.plan, plan, e.cortesiaPlan);
          const busy = ocupadoIdx === e.idx;
          return (
            <span
              className={`pv-ai-chip${locked ? " locked" : ""}${cortesia ? " cortesia" : ""}`}
              key={e.key}
            >
              <Editable k={`comp:${e.idx}`} value={e.nombre} />
              {cortesia && (
                <button
                  type="button"
                  className="pv-ai-cortesia"
                  title={
                    editing
                      ? "Cortesía"
                      : `Cortesía de ${PLAN_LABEL[PLAN_RANK[e.plan]]} — clic para quitar`
                  }
                  onClick={() => !editing && setCortesia(e.idx, null)}
                  disabled={editing || busy}
                >
                  🎁
                </button>
              )}
              {locked && (
                <button
                  type="button"
                  className="pv-ai-lock pv-ai-lock-btn"
                  title={
                    editing ? undefined : `Incluir como cortesía en ${PLAN_LABEL[plan]}`
                  }
                  onClick={() => !editing && setCortesia(e.idx, PLAN_NOMBRE[plan])}
                  disabled={editing || busy}
                >
                  🔒 {PLAN_LABEL[PLAN_RANK[e.plan]]}
                </button>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function ElPlano({ vm, plan }: { vm: PresentacionVM; plan: Plan }) {
  // E16: the "engranaje" is off by default and only ever adds a light
  // "alimenta a …" line — no arrows — so it can't dirty the canvas.
  const [verEngranaje, setVerEngranaje] = useState(false);
  const hayEngranaje = vm.bands.some((b) =>
    b.regular.some((c) => c.conectaCon.length > 0),
  );
  return (
    <section className="pv-section">
      <div className="pv-plano-head">
        <SecHead n={5} small="Todo lo que se pone a trabajar">
          El plano del sistema
        </SecHead>
        {hayEngranaje && (
          <button
            type="button"
            className={`pv-engranaje-toggle${verEngranaje ? " on" : ""}`}
            aria-pressed={verEngranaje}
            onClick={() => setVerEngranaje((v) => !v)}
          >
            {verEngranaje ? "Ocultar engranaje" : "Ver engranaje"}
          </button>
        )}
      </div>

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
                  <ComponentCard
                    key={comp.key}
                    comp={comp}
                    plan={plan}
                    verEngranaje={verEngranaje}
                  />
                ))}
              </div>
              {band.ai.length > 0 && <AINode entries={band.ai} plan={plan} />}
            </div>
          ))}
        </div>
      </div>

      {/* E17: integrations/costs stay inside the plano — not moved. */}
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
      {/* E18: "No se dibujan" (no_aplican) removed from the canvas; it lives in
          the consultant's internal Checklist drawer now. */}
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

// --- Brecha para el 100 (F20) ------------------------------------------

// Shown only when the selected plan does NOT reach 100 — the pipeline sends a
// reading for that plan (and null when it reaches 100). No calculation here;
// the section resolves the reading for the current plan and updates when the
// plan changes.
function BrechaCien({ vm, plan }: { vm: PresentacionVM; plan: Plan }) {
  const brecha = brechaDePlan(vm.brechaFuera, plan);
  if (!brecha) return null;
  return (
    <section className="pv-section pv-brecha">
      <SecHead n={7} small="Qué falta para el 100 — y cómo se cierra">
        El tramo que le queda al {PLAN_LABEL[plan]}
      </SecHead>
      {brecha.lectura && <p className="pv-brecha-lectura">{brecha.lectura}</p>}
      {brecha.modulos.length > 0 && (
        <div className="pv-brecha-grid">
          {brecha.modulos.map((m, i) => (
            <div className="pv-brecha-card" key={i}>
              <div className="pv-brecha-mod">{m.modulo}</div>
              <div className="pv-brecha-accion">{m.accion}</div>
            </div>
          ))}
        </div>
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
