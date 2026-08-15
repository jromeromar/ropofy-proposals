"use client";

/**
 * The full client document. FULL text density — it travels alone to a
 * decision-maker who was not on the call, so it explains itself. Renders
 * only from the frozen snapshot VM (id-free, internal-free). Plan switching
 * is reactive; the price block reflects the frozen condition. No consultant
 * routes, no discount controls, no internal data.
 */

import { useState } from "react";
import { formatPrice } from "@/lib/rules";
import { gradeForPlan } from "@/lib/grade";
import { bloquePrecioEfectivo } from "@/lib/condition";
import { formatVigencia } from "@/lib/clientDocument";
import { isLocked, PLAN_RANK, PLAN_LABEL } from "@/lib/mapLayout";
import type { ClientDocVM, ClientComp, FugaVM } from "@/lib/clientDocVM";
import type { Acceptance, Visibilidad } from "@/lib/types";
import { aceptarPropuesta } from "./actions";

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

function visBadges(vis: Visibilidad): string[] {
  if (vis === "front") return ["tu cliente lo ve"];
  if (vis === "back") return ["tu equipo lo ve"];
  return ["tu cliente lo ve", "tu equipo lo ve"];
}

function formatFecha(iso: string): string {
  try {
    return new Intl.DateTimeFormat("es-CO", { dateStyle: "long" }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
}

function introAdvertencias(n: number): string {
  const palabras = [
    "Cero",
    "Una",
    "Dos",
    "Tres",
    "Cuatro",
    "Cinco",
    "Seis",
    "Siete",
    "Ocho",
    "Nueve",
    "Diez",
  ];
  const w = palabras[n] ?? String(n);
  const sustantivo = n === 1 ? "cosa" : n <= 3 ? "cosas" : "condiciones";
  return `${w} ${sustantivo} que acordamos decir por escrito:`;
}

interface Props {
  vm: ClientDocVM;
  token: string;
  nowIso: string;
  acceptance: Acceptance | null;
  initialPlan?: Plan;
}

export default function ClientDocView({
  vm,
  token,
  nowIso,
  acceptance,
  initialPlan,
}: Props) {
  const [plan, setPlan] = useState<Plan>(
    initialPlan ?? vm.condicion.planSeleccionado,
  );

  // Once the condition has expired the discount applies nowhere — every
  // displayed price reverts to list, so the client never sees a price they
  // can no longer get.
  const expirada =
    vm.condicion.pct != null && vm.condicion.vigencia
      ? new Date(vm.condicion.vigencia).getTime() <= new Date(nowIso).getTime()
      : false;
  const precioDe = (p: Plan): number =>
    expirada
      ? vm.precioListaPorPlan[String(p) as PlanKey]
      : vm.preciosFinales[String(p) as PlanKey];

  return (
    <article className="cd">
      <Portada vm={vm} />
      <PlanSwitcher plan={plan} onSelect={setPlan} moneda={vm.moneda} precioDe={precioDe} />
      <Entendimos vm={vm} />
      <SistemaHoy vm={vm} />
      <Fugas vm={vm} />
      <Diagnostico vm={vm} />
      <ClaveDeLectura />
      <PlanoCompleto vm={vm} plan={plan} />
      <LosTresPlanes vm={vm} plan={plan} onSelect={setPlan} precioDe={precioDe} />
      <ADondeLlega vm={vm} plan={plan} />
      <Condiciones vm={vm} />
      <Inversion
        vm={vm}
        plan={plan}
        token={token}
        nowIso={nowIso}
        acceptance={acceptance}
      />
    </article>
  );
}

// --- 1. Portada ---------------------------------------------------------

function Portada({ vm }: { vm: ClientDocVM }) {
  return (
    <section className="cd-section cd-portada">
      <h1 className="cd-titular">{vm.titular}</h1>
      <p className="cd-portada-meta">
        Preparado para {vm.cliente} · {formatFecha(vm.sentAt)}
      </p>
      <p className="cd-portada-nota">
        Este documento se explica solo: fue preparado para poder decidirse sin
        una reunión adicional.
      </p>
    </section>
  );
}

// --- plan switcher ------------------------------------------------------

function PlanSwitcher({
  plan,
  onSelect,
  moneda,
  precioDe,
}: {
  plan: Plan;
  onSelect: (p: Plan) => void;
  moneda: string;
  precioDe: (p: Plan) => number;
}) {
  return (
    <div className="cd-switcher">
      {([1, 2, 3] as Plan[]).map((p) => (
        <button
          key={p}
          type="button"
          className={`cd-pill${p === plan ? " active" : ""}`}
          aria-pressed={p === plan}
          onClick={() => onSelect(p)}
        >
          <span>{PLAN_LABEL[p]}</span>
          <small>{formatPrice(precioDe(p), moneda)}</small>
        </button>
      ))}
    </div>
  );
}

// --- 2. Lo que entendimos ----------------------------------------------

function Entendimos({ vm }: { vm: ClientDocVM }) {
  return (
    <section className="cd-section">
      <h2 className="cd-h2">Lo que entendimos de su negocio</h2>
      <p className="cd-intro">
        Si algo aquí no es exacto, corregirlo cambia la propuesta — por eso va
        primero.
      </p>
      <div className="cd-two-col">
        <div className="cd-prose">
          <p>{vm.resumen}</p>
        </div>
        <div className="cd-figures">
          {vm.stats.map((s, i) => (
            <div className="cd-figure-row" key={i}>
              <span className="cd-figure-label">{s.label}</span>
              <span className="cd-figure-value">{s.value}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// --- 3. Su sistema comercial hoy ---------------------------------------

function AsIsColumn({
  titulo,
  items,
}: {
  titulo: string;
  items: Array<[string, string]>;
}) {
  return (
    <div className="cd-asis-col">
      <h3 className="cd-asis-title">{titulo}</h3>
      <ul>
        {items.map(([label, note], i) => (
          <li key={i}>
            <strong>{label}</strong>
            <span className="cd-asis-note">{note}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SistemaHoy({ vm }: { vm: ClientDocVM }) {
  return (
    <section className="cd-section">
      <h2 className="cd-h2">Su sistema comercial hoy</h2>
      <div className="cd-asis">
        <AsIsColumn titulo="Por dónde llegan" items={vm.asIs.de_donde_llegan} />
        <div className="cd-arrow" aria-hidden="true">→</div>
        <AsIsColumn titulo="Quién recibe" items={vm.asIs.por_donde_pasan} />
        <div className="cd-arrow" aria-hidden="true">→</div>
        <AsIsColumn titulo="Dónde queda el rastro" items={vm.asIs.donde_queda} />
      </div>
    </section>
  );
}

// --- 4. Las fugas -------------------------------------------------------

function FugaCard({ f, dominante }: { f: FugaVM; dominante?: boolean }) {
  const cls =
    f.estado === "mitigable"
      ? "cd-fuga mitigable"
      : f.estado === "fuera_de_alcance"
        ? "cd-fuga fuera"
        : "cd-fuga";
  return (
    <div className={`${cls}${dominante ? " dominante" : ""}`}>
      <h3 className="cd-fuga-titulo">{f.titulo}</h3>
      {dominante && f.cifra && <div className="cd-fuga-cifra">{f.cifra}</div>}
      {f.texto && <p className="cd-fuga-texto">{f.texto}</p>}
      {f.evidencia && (
        <blockquote className="cd-fuga-quote">
          «{f.evidencia}»<cite>— de su propia sesión</cite>
        </blockquote>
      )}
      {f.estado === "mitigable" && (
        <p className="cd-fuga-estado">
          Depende de {f.dependeDe ?? "un tercero"}: se declara y se agiliza — no
          se promete cerrar lo que es de un tercero.
        </p>
      )}
      {f.estado === "fuera_de_alcance" && (
        <p className="cd-fuga-estado">
          Esta la corrige su equipo; mientras exista, afecta las mediciones.
        </p>
      )}
    </div>
  );
}

function Fugas({ vm }: { vm: ClientDocVM }) {
  return (
    <section className="cd-section">
      <h2 className="cd-h2">Las fugas</h2>
      {vm.fugaDominante && <FugaCard f={vm.fugaDominante} dominante />}
      <div className="cd-fugas-grid">
        {vm.fugasResto.map((f, i) => (
          <FugaCard f={f} key={i} />
        ))}
      </div>
    </section>
  );
}

// --- 5. El diagnóstico --------------------------------------------------

function Diagnostico({ vm }: { vm: ClientDocVM }) {
  const sector = vm.benchmarkSector;
  return (
    <section className="cd-section cd-diagnostico">
      <h2 className="cd-h2">El diagnóstico</h2>
      <div className="cd-nota">
        <div className="cd-nota-letra">{vm.nota.letra}</div>
        <div className="cd-nota-puntos">{vm.nota.puntos}/100</div>
      </div>
      {typeof sector === "number" && (
        <div className="cd-benchmark">
          <div className="cd-benchmark-track">
            <div className="cd-benchmark-fill" style={{ width: `${vm.nota.puntos}%` }} />
            <div className="cd-benchmark-mark" style={{ left: `${sector}%` }} />
          </div>
          <div className="cd-benchmark-label">
            <span>Su nota: {vm.nota.puntos}</span>
            <span>Promedio del sector: {sector}</span>
          </div>
        </div>
      )}
      <div className="cd-madurez">
        {vm.madurez.map((m, i) => (
          <div className="cd-madurez-row" key={i}>
            <div className="cd-madurez-nombre">{m.m}</div>
            <div className="cd-bar">
              {[0, 1, 2, 3].map((seg) => (
                <span className={seg < m.hoy ? "seg hoy" : "seg"} key={seg} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// --- 6. Clave de lectura ------------------------------------------------

function ClaveDeLectura() {
  return (
    <section className="cd-section">
      <div className="cd-clave">
        <h3 className="cd-clave-title">Cómo leer el plano que sigue</h3>
        <p>
          Cada tarjeta muestra la funcionalidad y, debajo, lo que hace por
          usted. Lo gris con 🔒 pertenece a un plan superior: no desaparece,
          porque es su camino de crecimiento. Lo ámbar depende de un tercero: se
          declara, no se promete. Las cantidades «hasta N» cambian con el plan.
          El número ×N indica cuántas veces se configura esa pieza para su
          operación. Y solo aparece lo que aplica a su negocio.
        </p>
      </div>
    </section>
  );
}

// --- 7. El plano completo ----------------------------------------------

function CompCard({ comp, plan }: { comp: ClientComp; plan: Plan }) {
  const locked = isLocked(comp.plan, plan);
  return (
    <div className={`cd-card${locked ? " locked" : ""}`}>
      <div className="cd-card-nombre">{comp.nombre}</div>
      {comp.beneficio && <div className="cd-card-beneficio">{comp.beneficio}</div>}
      <div className="cd-card-chips">
        {comp.cuota && <span className="cd-chip-cuota">{comp.cuota}</span>}
        {comp.instancias > 1 && (
          <span
            className="cd-chip-inst"
            title={`${comp.instancias} configuraciones para su operación`}
          >
            ×{comp.instancias}
          </span>
        )}
        {visBadges(comp.vis).map((b) => (
          <span className="cd-chip-vis" key={b}>
            {b}
          </span>
        ))}
      </div>
      {locked && <div className="cd-lock">🔒 {PLAN_LABEL[PLAN_RANK[comp.plan]]}</div>}
    </div>
  );
}

function AINode({ entries, plan }: { entries: ClientComp[]; plan: Plan }) {
  const allLocked = entries.every((e) => isLocked(e.plan, plan));
  return (
    <div className={`cd-ai-node${allLocked ? " locked" : ""}`}>
      <div className="cd-ai-title">Su asistente de IA — uno solo, con habilidades</div>
      <div className="cd-ai-chips">
        {entries.map((e) => {
          const locked = isLocked(e.plan, plan);
          return (
            <span className={`cd-ai-chip${locked ? " locked" : ""}`} key={e.key}>
              {e.nombre}
              {locked && <em> 🔒 {PLAN_LABEL[PLAN_RANK[e.plan]]}</em>}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function PlanoCompleto({ vm, plan }: { vm: ClientDocVM; plan: Plan }) {
  return (
    <section className="cd-section">
      <h2 className="cd-h2">El plano completo</h2>
      <div className="cd-bands">
        {vm.bands.map((band) => (
          <div className="cd-band" key={band.name}>
            <div className="cd-band-head">
              <span className="cd-band-num">{band.numero}</span>
              <span className="cd-band-name">{band.name}</span>
            </div>
            <div className="cd-band-grid">
              {band.regular.map((c) => (
                <CompCard key={c.key} comp={c} plan={plan} />
              ))}
            </div>
            {band.ai.length > 0 && <AINode entries={band.ai} plan={plan} />}
          </div>
        ))}
      </div>

      <div className="cd-rail">
        <h3 className="cd-h3">Integraciones y costos externos</h3>
        <div className="cd-rail-grid">
          {vm.integraciones.map(([nombre, nota, etiqueta], i) => {
            const badge = INTEGRACION_BADGE[etiqueta] ?? {
              label: etiqueta,
              cls: "badge-licencia",
            };
            return (
              <div className="cd-rail-card" key={i}>
                <div className="cd-rail-nombre">{nombre}</div>
                <div className="cd-rail-nota">{nota}</div>
                <span className={`cd-cost-badge ${badge.cls}`}>{badge.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {vm.noAplican.length > 0 && (
        <div className="cd-noaplican">
          <h3 className="cd-h3">No se dibujan en su plano</h3>
          <p className="cd-noaplican-intro">
            Solo le proponemos lo que aplica a su negocio — esto quedó fuera y le
            decimos por qué:
          </p>
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

// --- 8. Los tres planes -------------------------------------------------

function LosTresPlanes({
  vm,
  plan,
  onSelect,
  precioDe,
}: {
  vm: ClientDocVM;
  plan: Plan;
  onSelect: (p: Plan) => void;
  precioDe: (p: Plan) => number;
}) {
  return (
    <section className="cd-section">
      <h2 className="cd-h2">Los tres planes</h2>
      <div className="cd-planes">
        {([1, 2, 3] as Plan[]).map((p) => (
          <button
            key={p}
            type="button"
            className={`cd-plan-card${p === plan ? " active" : ""}`}
            aria-pressed={p === plan}
            onClick={() => onSelect(p)}
          >
            {vm.planRecomendado === p && (
              <span className="cd-badge-reco">RECOMENDADO</span>
            )}
            <div className="cd-plan-nombre">{PLAN_LABEL[p]}</div>
            <div className="cd-plan-frase">{PLAN_PHRASES[p]}</div>
            <div className="cd-plan-precio">{formatPrice(precioDe(p), vm.moneda)}</div>
          </button>
        ))}
      </div>
    </section>
  );
}

// --- 9. A dónde llega con cada plan ------------------------------------

function ADondeLlega({ vm, plan }: { vm: ClientDocVM; plan: Plan }) {
  const key = String(plan) as PlanKey;
  const proyectada = gradeForPlan(vm.madurez, plan);
  return (
    <section className="cd-section">
      <div className="cd-adonde-head">
        <h2 className="cd-h2">A dónde llega con cada plan</h2>
        <div className="cd-grade-arrow">
          {vm.nota.letra} <span aria-hidden="true">→</span>{" "}
          <strong>{proyectada.letra}</strong>
        </div>
      </div>
      <div className="cd-madurez">
        {vm.madurez.map((m, i) => {
          const meta = m.p[key];
          return (
            <div className="cd-madurez-row" key={i}>
              <div className="cd-madurez-nombre">{m.m}</div>
              <div className="cd-bar">
                {[0, 1, 2, 3].map((seg) => {
                  const cls =
                    seg < m.hoy ? "seg hoy" : seg < meta ? "seg meta" : "seg";
                  return <span className={cls} key={seg} />;
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// --- 10. Condiciones de arranque ---------------------------------------

function Condiciones({ vm }: { vm: ClientDocVM }) {
  if (vm.advertencias.length === 0) return null;
  return (
    <section className="cd-section">
      <h2 className="cd-h2">Condiciones de arranque</h2>
      <p className="cd-intro">{introAdvertencias(vm.advertencias.length)}</p>
      <ul className="cd-condiciones">
        {vm.advertencias.map((a, i) => (
          <li key={i}>{a}</li>
        ))}
      </ul>
    </section>
  );
}

// --- 11. Inversión y aceptación ----------------------------------------

function Inversion({
  vm,
  plan,
  token,
  nowIso,
  acceptance,
}: {
  vm: ClientDocVM;
  plan: Plan;
  token: string;
  nowIso: string;
  acceptance: Acceptance | null;
}) {
  const key = String(plan) as PlanKey;
  const bloque = bloquePrecioEfectivo(
    {
      descuentoPct: vm.condicion.pct,
      vigencia: vm.condicion.vigencia,
      precioLista: vm.precioListaPorPlan[key],
      precioFinal: vm.preciosFinales[key],
      lineaCondicion: vm.condicion.lineaCondicion,
      moneda: vm.moneda,
    },
    new Date(nowIso),
  );

  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [sending, setSending] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [aceptadaFecha, setAceptadaFecha] = useState<string | null>(
    acceptance ? formatVigencia(acceptance.at) : null,
  );

  async function handleAccept() {
    setErrors([]);
    setSending(true);
    try {
      const res = await aceptarPropuesta({
        token,
        plan,
        nombre: nombre.trim(),
        correo: correo.trim(),
        observaciones: observaciones.trim() || null,
      });
      if (res.ok) setAceptadaFecha(res.fecha);
      else if ("yaAceptada" in res) setAceptadaFecha(res.fecha);
      else setErrors(res.errors);
    } catch {
      setErrors(["No se pudo registrar la aceptación. Intente de nuevo."]);
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="cd-section cd-inversion">
      <h2 className="cd-h2">Inversión y aceptación</h2>

      <div className="cd-price-block">
        {bloque.tieneDescuento ? (
          <>
            <div className="cd-price-strike">
              {formatPrice(bloque.precioLista, bloque.moneda)}
            </div>
            <div className="cd-price-final">
              {formatPrice(bloque.precioMostrar, bloque.moneda)}
            </div>
            {bloque.lineaCondicion && (
              <div className="cd-price-line">{bloque.lineaCondicion}</div>
            )}
          </>
        ) : (
          <>
            <div className="cd-price-final">
              {formatPrice(bloque.precioMostrar, bloque.moneda)}
            </div>
            {bloque.expirada && vm.condicion.vigencia && (
              <div className="cd-price-expired">
                La condición anterior expiró el{" "}
                {formatVigencia(vm.condicion.vigencia)}; el valor vigente es el
                de lista.
              </div>
            )}
          </>
        )}
      </div>

      {aceptadaFecha ? (
        <div className="cd-accept-banner">
          Su aceptación quedó registrada el {aceptadaFecha}. Nada se cobra hasta
          la firma.
        </div>
      ) : (
        <div className="cd-accept">
          <label htmlFor="observaciones">Observaciones (opcional)</label>
          <textarea
            id="observaciones"
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            rows={3}
          />
          <p className="cd-accept-notice">
            Una observación no modifica el alcance por sí sola: se adjunta al
            pedido y su consultor la resuelve. Si implica cambio de alcance, se
            emite una nueva versión de la propuesta y usted acepta esa.
          </p>

          <div className="cd-accept-fields">
            <div>
              <label htmlFor="nombre">Nombre completo</label>
              <input
                id="nombre"
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="correo">Correo</label>
              <input
                id="correo"
                type="email"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
              />
            </div>
          </div>

          {errors.length > 0 && (
            <div className="errors" role="alert">
              <ul>
                {errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          <button
            className="cd-accept-btn"
            onClick={handleAccept}
            disabled={sending}
          >
            {sending ? "Registrando…" : `Aceptar el plan ${PLAN_LABEL[plan]} →`}
          </button>
        </div>
      )}
    </section>
  );
}
