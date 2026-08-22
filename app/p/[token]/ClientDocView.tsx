"use client";

/**
 * The full client document. FULL text density — it travels alone to a
 * decision-maker who was not on the call, so it explains itself. Renders
 * only from the frozen snapshot VM (id-free, internal-free). Plan switching
 * is reactive; the price block reflects the frozen condition. No consultant
 * routes, no discount controls, no internal data.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { formatPrice } from "@/lib/rules";
import { gradeForPlan } from "@/lib/grade";
import { bloquePrecioEfectivo } from "@/lib/condition";
import { formatVigencia } from "@/lib/clientDocument";
import { isLocked, esCortesia, PLAN_RANK, PLAN_LABEL } from "@/lib/mapLayout";
import { brechaDePlan, normalizarGestionFila } from "@/lib/lienzo";
import type { ClientDocVM, ClientComp, FugaVM } from "@/lib/clientDocVM";
import type {
  Acceptance,
  Visibilidad,
  AsIsFila,
  AsIsGestionFila,
  CategoriaFuga,
} from "@/lib/types";
import RadarMadurez from "@/components/RadarMadurez";
import { aceptarPropuesta } from "./actions";
import { useTelemetria } from "./useTelemetria";

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

// Company-level social proof (shown to every client, like the legacy proposal).
const TESTIMONIOS: Array<{ quote: string; autor: string; cargo: string }> = [
  {
    quote:
      "Nuestra base de datos es el legado de 36 años de trabajo. Ropofy nos ayudó a organizarla de manera profesional y a darle un uso estratégico para conectar con nuestros clientes. Ahora, sin importar dónde esté nuestro equipo, pueden atender leads de inmediato y sin confusión.",
    autor: "Rafael Garay",
    cargo: "Cofounder, Palacio Bienes Raíces",
  },
  {
    quote:
      "Hicimos el evento de aniversario en otro lugar, un sábado que normalmente está lleno. Ese día facturamos el doble de lo que se factura en un día normal. Esta estrategia de verdad funciona.",
    autor: "Viviana Marín",
    cargo: "Estratega Comercial, Confuturo",
  },
];

// Ropofy's standard onboarding — deal-agnostic, so shown to every client.
const ARRANQUE_PASOS: Array<{ t: string; d: string }> = [
  {
    t: "Arranque y conexiones",
    d: "Arrancamos juntos y conectamos tus canales y herramientas.",
  },
  {
    t: "Implementación",
    d: "Configuramos y dejamos el sistema funcionando, con reuniones de seguimiento y acompañamiento.",
  },
  {
    t: "Órbita",
    d: "Ya operando: una reunión mensual con tu Project Manager para evaluar el avance.",
  },
];

const GARANTIA =
  "Si a los dos meses no estás satisfecho, te devolvemos el 100% de tu inversión.";

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
  /** When true (from the expediente's print link), open the print dialog. */
  autoPrint?: boolean;
}

export default function ClientDocView({
  vm,
  token,
  nowIso,
  acceptance,
  initialPlan,
  autoPrint,
}: Props) {
  const [plan, setPlanState] = useState<Plan>(
    initialPlan ?? vm.condicion.planSeleccionado,
  );
  const tel = useTelemetria(token, initialPlan ?? vm.condicion.planSeleccionado);
  const setPlan = useCallback(
    (p: Plan) => {
      setPlanState(p);
      tel.planCambiado(p);
    },
    [tel],
  );

  useEffect(() => {
    if (autoPrint && typeof window !== "undefined") {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [autoPrint]);

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
      <FloatingPlanes plan={plan} onSelect={setPlan} />
      <Portada vm={vm} />
      <Entendimos vm={vm} />
      <SistemaHoy vm={vm} />
      <Fugas vm={vm} onSenal={tel.observacionEscrita} />
      <Diagnostico vm={vm} />
      <ClaveDeLectura />
      <PlanoCompleto vm={vm} plan={plan} />
      <LosTresPlanes vm={vm} plan={plan} onSelect={setPlan} precioDe={precioDe} />
      <ADondeLlega vm={vm} plan={plan} />
      <BrechaCien vm={vm} plan={plan} />
      <CasosDeExito />
      <Condiciones vm={vm} />
      <ComoArrancamos />
      <Inversion
        vm={vm}
        plan={plan}
        token={token}
        nowIso={nowIso}
        acceptance={acceptance}
        onObservacion={tel.observacionEscrita}
      />
    </article>
  );
}

// --- Numbered section head ---------------------------------------------

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
    <div className="cd-sec-head">
      <span className="cd-sec-num" aria-hidden="true">
        {n}
      </span>
      <h2 className="cd-h2">{children}</h2>
      {small && <small className="cd-sec-small">{small}</small>}
    </div>
  );
}

// --- 1. Portada (cabecera de marca) ------------------------------------

function Portada({ vm }: { vm: ClientDocVM }) {
  return (
    <section className="cd-hero">
      <span className="cd-orbita o1" aria-hidden="true" />
      <span className="cd-orbita o2" aria-hidden="true" />
      <div className="cd-hero-in">
        <div className="cd-wordmark">
          <span className="dot" aria-hidden="true" />
          Ropofy
        </div>
        <div className="cd-eyebrow">Arquitectura comercial</div>
        <h1 className="cd-titular">{vm.titular}</h1>
        <p className="cd-hero-nota">
          Este documento se explica solo: fue preparado para poder decidirse sin
          una reunión adicional.
        </p>
        <div className="cd-hero-meta">
          <span>
            Preparado para{" "}
            <b>{vm.marca ? `${vm.marca} (${vm.cliente})` : vm.cliente}</b>
          </span>
          <span>{formatFecha(vm.sentAt)}</span>
        </div>
      </div>
    </section>
  );
}

// --- selector de plan flotante -----------------------------------------

// A1: the floating selector switches plans but shows NO price — the price must
// not appear before the diagnosis. It surfaces for the first time in "Los tres
// planes", further down. So this selector carries plan names only.
function FloatingPlanes({
  plan,
  onSelect,
}: {
  plan: Plan;
  onSelect: (p: Plan) => void;
}) {
  const [ver, setVer] = useState(false);
  useEffect(() => {
    const onScroll = () => setVer(window.scrollY > 340);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div className={`cd-floating${ver ? " ver" : ""}`} aria-hidden={!ver}>
      <div className="cd-floating-in">
        <span className="cd-floating-lbl">Plan</span>
        {([1, 2, 3] as Plan[]).map((p) => (
          <button
            key={p}
            type="button"
            className={`cd-floating-btn${p === plan ? " activo" : ""}`}
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

// --- 2. Lo que entendimos ----------------------------------------------

function Entendimos({ vm }: { vm: ClientDocVM }) {
  return (
    <section className="cd-section">
      <SecHead n={1}>Lo que entendimos de su negocio</SecHead>
      <p className="cd-intro">
        Si algo aquí no es exacto, corregirlo cambia la propuesta — por eso va
        primero.
      </p>
      <div className="cd-two-col">
        <div className="cd-prose">
          {vm.resumen.parrafo && <p>{vm.resumen.parrafo}</p>}
          {vm.resumen.bullets.length > 0 && (
            <ul className="cd-resumen-bullets">
              {vm.resumen.bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          )}
          {vm.asIs.de_donde_llegan.length > 0 && (
            <div className="cd-pills">
              {vm.asIs.de_donde_llegan.map(([canal], i) => (
                <span className="cd-pill" key={i}>
                  {canal}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="cd-figures">
          {vm.stats.map((s, i) => (
            <div className="cd-figure-row" key={i}>
              <span className="cd-figure-label">{s.canal}</span>
              <span className="cd-figure-value">
                {s.cifra}
                {s.unidad ? ` ${s.unidad}` : ""}
              </span>
            </div>
          ))}
          {vm.datosQueFaltan.length > 0 && (
            <div className="cd-conflicto">
              <b>Lo que quedó por capturar — </b>
              {vm.datosQueFaltan.length} datos afinan esta propuesta en la
              próxima llamada. Los que más pesan:{" "}
              {vm.datosQueFaltan.slice(0, 3).join(" · ")}
            </div>
          )}
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
  items: AsIsFila[];
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

// B6: the middle axis renders the role as the primary item and its `detalle`
// as visually subordinate sub-items — never at the same level (that was the
// "Telefonistas" vs "toma el pedido" confusion). Accepts the legacy tuple form
// too (degrades to a flat item with no sub-items).
function GestionColumn({
  titulo,
  items,
}: {
  titulo: string;
  items: Array<AsIsFila | AsIsGestionFila>;
}) {
  return (
    <div className="cd-asis-col">
      <h3 className="cd-asis-title">{titulo}</h3>
      <ul>
        {items.map((fila, i) => {
          const g = normalizarGestionFila(fila);
          return (
            <li key={i}>
              <strong>{g.quien}</strong>
              {g.nota && <span className="cd-asis-note">{g.nota}</span>}
              {g.detalle.length > 0 && (
                <ul className="cd-asis-detalle">
                  {g.detalle.map((d, j) => (
                    <li key={j}>{d}</li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SistemaHoy({ vm }: { vm: ClientDocVM }) {
  return (
    <section className="cd-section">
      <SecHead
        n={2}
        small="¿Por dónde llega, cómo se gestiona, dónde queda el rastro?"
      >
        Su sistema comercial hoy
      </SecHead>
      <div className="cd-asis">
        <AsIsColumn titulo="¿Por dónde llega?" items={vm.asIs.de_donde_llegan} />
        <div className="cd-arrow" aria-hidden="true">→</div>
        <GestionColumn titulo="¿Cómo se gestiona?" items={vm.asIs.por_donde_pasan} />
        <div className="cd-arrow" aria-hidden="true">→</div>
        <AsIsColumn titulo="¿Dónde queda el rastro?" items={vm.asIs.donde_queda} />
      </div>
    </section>
  );
}

// --- 4. Las fugas -------------------------------------------------------

function FugaCard({
  f,
  dominante,
  onSenal,
}: {
  f: FugaVM;
  dominante?: boolean;
  onSenal?: () => void;
}) {
  const cls =
    f.estado === "mitigable"
      ? "cd-fuga mitigable"
      : f.estado === "fuera_de_alcance"
        ? "cd-fuga fuera"
        : "cd-fuga";
  const [deAcuerdo, setDeAcuerdo] = useState(false);
  const [comentando, setComentando] = useState(false);
  const [comentario, setComentario] = useState("");
  const senalado = useRef(false);
  function senal() {
    if (!senalado.current) {
      senalado.current = true;
      onSenal?.();
    }
  }
  return (
    <div className={`${cls}${dominante ? " dominante" : ""}`}>
      {/* C8: the title is the protagonist; the figure and the evidence quote
          are rendered smaller/lighter beneath it. C9: the word "fuga" never
          appears inside a card — only in the block header. */}
      <h3 className="cd-fuga-titulo">{f.titulo}</h3>
      {f.cifra &&
        (f.cifra.length <= 24 ? (
          <div className="cd-fuga-cifra">{f.cifra}</div>
        ) : (
          <div className="cd-fuga-cuant">{f.cifra}</div>
        ))}
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
      <div className="cd-asentir">
        <button
          type="button"
          className={`cd-asentir-btn${deAcuerdo ? " si" : ""}`}
          aria-pressed={deAcuerdo}
          onClick={() => {
            setDeAcuerdo((v) => !v);
            senal();
          }}
        >
          {deAcuerdo ? "✓ Sí, así nos pasa" : "¿Le pasa esto?"}
        </button>
        {!comentando && (
          <button
            type="button"
            className="cd-asentir-coment-link"
            onClick={() => setComentando(true)}
          >
            Comentar
          </button>
        )}
        {comentando && (
          <textarea
            className="cd-asentir-coment"
            value={comentario}
            placeholder="Un matiz, un detalle que agregar…"
            rows={2}
            onChange={(e) => {
              if (comentario === "" && e.target.value !== "") senal();
              setComentario(e.target.value);
            }}
          />
        )}
      </div>
    </div>
  );
}

// C7: three blocks, each with its own header, grouped by `categoria`.
const BLOQUES_FUGA: Array<{
  cat: CategoriaFuga;
  titulo: string;
  sub: string;
}> = [
  { cat: "fuga", titulo: "Las fugas", sub: "Por dónde se sale la plata" },
  { cat: "ceguera", titulo: "Las cegueras", sub: "Lo que no deja ver" },
  {
    cat: "restriccion",
    titulo: "Las restricciones",
    sub: "Lo que limita el crecimiento",
  },
];

function BloqueFugas({
  titulo,
  sub,
  fugas,
  onSenal,
}: {
  titulo: string;
  sub: string;
  fugas: FugaVM[];
  onSenal?: () => void;
}) {
  if (fugas.length === 0) return null;
  const dominante = fugas.find((f) => f.dominante) ?? null;
  const resto = fugas.filter((f) => !f.dominante);
  return (
    <div className="cd-fuga-bloque">
      <div className="cd-fuga-bloque-head">
        <h3 className="cd-fuga-bloque-titulo">{titulo}</h3>
        <span className="cd-fuga-bloque-sub">{sub}</span>
      </div>
      {dominante && <FugaCard f={dominante} dominante onSenal={onSenal} />}
      <div className="cd-fugas-grid">
        {resto.map((f, i) => (
          <FugaCard f={f} key={i} onSenal={onSenal} />
        ))}
      </div>
    </div>
  );
}

function Fugas({ vm, onSenal }: { vm: ClientDocVM; onSenal?: () => void }) {
  const porCategoria = (cat: CategoriaFuga) =>
    vm.fugas.filter((f) => f.categoria === cat);
  return (
    <section className="cd-section">
      <SecHead n={3} small="Confírmelas: díganos si le pasan">
        Lo que vimos
      </SecHead>
      {BLOQUES_FUGA.map((b) => (
        <BloqueFugas
          key={b.cat}
          titulo={b.titulo}
          sub={b.sub}
          fugas={porCategoria(b.cat)}
          onSenal={onSenal}
        />
      ))}
    </section>
  );
}

// --- 5. El diagnóstico --------------------------------------------------

const NIVEL_MAX = 4;

// Grade scale (mirror of lib/grade.ts thresholds), for the score strip.
const ESCALA_NOTA: Array<{ g: string; r: string }> = [
  { g: "A", r: "85+" },
  { g: "B", r: "70" },
  { g: "C", r: "55" },
  { g: "D", r: "40" },
  { g: "E", r: "25" },
  { g: "F", r: "0" },
];

function MadurezRow({
  nombre,
  hoy,
  meta,
  sector,
  top,
}: {
  nombre: string;
  hoy: number;
  meta?: number;
  sector?: number;
  top?: boolean;
}) {
  const hoyPct = (hoy / NIVEL_MAX) * 100;
  const metaVal = meta != null ? Math.max(meta, hoy) : hoy;
  const ganaPct = ((metaVal - hoy) / NIVEL_MAX) * 100;
  return (
    <div className={`cd-madurez-row${top ? " top" : ""}`}>
      <div className="cd-madurez-nombre">{nombre}</div>
      <div className="cd-salto-wrap">
        <div className="cd-salto-bar">
          <span className="cd-salto-hoy" style={{ width: `${hoyPct}%` }} />
          {ganaPct > 0 && (
            <span className="cd-salto-gana" style={{ width: `${ganaPct}%` }} />
          )}
        </div>
        {typeof sector === "number" && (
          <span
            className="cd-salto-sector"
            style={{ left: `${(sector / NIVEL_MAX) * 100}%` }}
            title={`Promedio del sector: ${sector}`}
          />
        )}
      </div>
      <div className="cd-salto-lbl">
        {meta != null ? (
          <>
            Hoy {hoy} · <b>meta {metaVal}</b>
          </>
        ) : (
          <>
            Nivel <b>{hoy}</b>/{NIVEL_MAX}
          </>
        )}
      </div>
    </div>
  );
}

function Diagnostico({ vm }: { vm: ClientDocVM }) {
  const ejes = vm.madurez.map((m) => ({
    m: m.m,
    hoy: m.hoy,
    sector: vm.benchmarkModulos?.[m.m] ?? null,
  }));
  return (
    <section className="cd-section">
      <SecHead n={4} small="Dónde está su operación comercial hoy">
        El diagnóstico
      </SecHead>
      <div className="cd-score-wrap">
        <div className="cd-score">
          <div className="cd-score-cap">Nota de madurez</div>
          <div className="cd-score-letra">{vm.nota.letra}</div>
          <div className="cd-score-pts">
            {vm.nota.puntos}/100
            {vm.puntosSector != null && (
              <> · promedio del sector: {vm.puntosSector}/100</>
            )}
          </div>
          <div className="cd-escala">
            {ESCALA_NOTA.map((e) => (
              <div key={e.g} className={e.g === vm.nota.letra ? "act" : ""}>
                <div className="g">{e.g}</div>
                <div className="r">{e.r}</div>
              </div>
            ))}
          </div>
          <div className="cd-escala-que">
            Cada módulo se califica de 1 a 4: <b>1 manual</b> · <b>2 cubierto</b>{" "}
            · <b>3 sistematizado</b> · <b>4 se anticipa</b>. La nota es la suma
            de los siete módulos sobre el máximo.
          </div>
        </div>
        {vm.benchmarkModulos ? (
          <div className="cd-radar-caja">
            <RadarMadurez ejes={ejes} />
            <div className="cd-radar-leg">
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
                  <b>Su operación hoy</b>
                  <small>lo que nos contaron en la sesión</small>
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="cd-madurez">
            {vm.madurez.map((m, i) => (
              <MadurezRow key={i} nombre={m.m} hoy={m.hoy} />
            ))}
          </div>
        )}
      </div>

      {/* Per-module detail: level + the reason behind it. */}
      <div className="cd-madtabla">
        {vm.madurez.map((m, i) => (
          <div className="cd-madtabla-row" key={i}>
            <div className="cd-madtabla-mod">{m.m}</div>
            <div className="cd-nivel" aria-label={`Nivel ${m.hoy} de 4`}>
              {[0, 1, 2, 3].map((seg) => (
                <span
                  key={seg}
                  className={seg < m.hoy ? "cd-nivel-i on" : "cd-nivel-i"}
                />
              ))}
            </div>
            <div className="cd-madtabla-porque">{m.porQue ?? ""}</div>
          </div>
        ))}
      </div>
      {/* D13: the "Recomendación: Plan X" paragraph is NOT shown here — it is
          redundant with Arquitectura Comercial, where the recommended plan is
          already labelled. The freed space is taken by the per-module grade. */}
    </section>
  );
}

// --- 6. Clave de lectura ------------------------------------------------

function ClaveDeLectura() {
  return (
    <section className="cd-section">
      <SecHead n={5}>Cómo leer su plano</SecHead>
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

function CompCard({
  comp,
  plan,
  verEngranaje,
}: {
  comp: ClientComp;
  plan: Plan;
  verEngranaje: boolean;
}) {
  const locked = isLocked(comp.plan, plan, comp.cortesiaPlan);
  const cortesia = esCortesia(comp.plan, plan, comp.cortesiaPlan);
  // E15: the card shows the one-line synthesis; the full detail is raised in
  // the specifications session, not drawn here. Falls back to `beneficio`.
  const linea = comp.sintesis ?? comp.beneficio;
  return (
    <div
      className={`cd-card${locked ? " locked" : ""}${cortesia ? " cortesia" : ""}`}
    >
      <div className="cd-card-nombre">{comp.nombre}</div>
      {linea && <div className="cd-card-beneficio">{linea}</div>}
      {verEngranaje && comp.conectaCon.length > 0 && (
        <div className="cd-card-conecta">
          <span className="cd-conecta-flecha" aria-hidden="true">↳</span>
          alimenta a {comp.conectaCon.join(", ")}
        </div>
      )}
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
      {cortesia ? (
        <div className="cd-cortesia">
          🎁 Cortesía · normalmente en {PLAN_LABEL[PLAN_RANK[comp.plan]]}
        </div>
      ) : (
        locked && (
          <div className="cd-lock">🔒 {PLAN_LABEL[PLAN_RANK[comp.plan]]}</div>
        )
      )}
    </div>
  );
}

function AINode({ entries, plan }: { entries: ClientComp[]; plan: Plan }) {
  const allLocked = entries.every((e) => isLocked(e.plan, plan, e.cortesiaPlan));
  return (
    <div className={`cd-ai-node${allLocked ? " locked" : ""}`}>
      <div className="cd-ai-title">Su asistente de IA — uno solo, con habilidades</div>
      <div className="cd-ai-chips">
        {entries.map((e) => {
          const locked = isLocked(e.plan, plan, e.cortesiaPlan);
          const cortesia = esCortesia(e.plan, plan, e.cortesiaPlan);
          return (
            <span
              className={`cd-ai-chip${locked ? " locked" : ""}${cortesia ? " cortesia" : ""}`}
              key={e.key}
            >
              {e.nombre}
              {cortesia && <em> 🎁 cortesía</em>}
              {locked && <em> 🔒 {PLAN_LABEL[PLAN_RANK[e.plan]]}</em>}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function PlanoCompleto({ vm, plan }: { vm: ClientDocVM; plan: Plan }) {
  // E16: the "engranaje" (how each capability feeds the next) is off by default
  // — a toggle reveals it only if the consultant/reader wants it. Only shown
  // when the contract actually carries `conecta_con` data. Ligereza sobre
  // completitud: no arrows are drawn, just the light "alimenta a …" line, so it
  // can never dirty the canvas.
  const [verEngranaje, setVerEngranaje] = useState(false);
  const hayEngranaje = vm.bands.some((b) =>
    b.regular.some((c) => c.conectaCon.length > 0),
  );
  return (
    <section className="cd-section">
      <div className="cd-plano-head">
        <SecHead n={6} small="Todo lo que se pone a trabajar por usted">
          El plano completo
        </SecHead>
        {hayEngranaje && (
          <button
            type="button"
            className={`cd-engranaje-toggle${verEngranaje ? " on" : ""}`}
            aria-pressed={verEngranaje}
            onClick={() => setVerEngranaje((v) => !v)}
          >
            {verEngranaje ? "Ocultar el engranaje" : "Ver el engranaje"}
          </button>
        )}
      </div>
      <div className="cd-lienzo">
        <div className="cd-bands">
          {vm.bands.map((band) => (
            <div className="cd-band" key={band.name}>
              <div className="cd-band-head">
                <span className="cd-band-num">{band.numero}</span>
                <span className="cd-band-name">{band.name}</span>
              </div>
              <div className="cd-band-grid">
                {band.regular.map((c) => (
                  <CompCard
                    key={c.key}
                    comp={c}
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

      {/* E17: integrations and external costs stay INSIDE the plano — they show
          at which point of the journey each is needed. Not moved. */}
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
      {/* E18: "No se dibujan en su plano" (no_aplican) is removed from the
          client canvas — it lost the reader. It now lives in the consultant's
          internal panel. */}
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
      <SecHead n={7} small="Elija hasta dónde llevar el sistema">
        Los tres planes
      </SecHead>
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
            {/* E14: personalised phrase from the contract, falling back to the
                built-in default when the pipeline hasn't sent one. */}
            <div className="cd-plan-frase">
              {vm.planFrases[String(p) as PlanKey] ?? PLAN_PHRASES[p]}
            </div>
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
  // Highlight the module that gains the most with this plan (lime bar).
  let maxGana = 0;
  for (const m of vm.madurez) maxGana = Math.max(maxGana, m.p[key] - m.hoy);
  return (
    <section className="cd-section">
      <div className="cd-adonde-head">
        <SecHead n={8}>A dónde llega con cada plan</SecHead>
        <div className="cd-grade-arrow">
          {vm.nota.letra} <span aria-hidden="true">→</span>{" "}
          <strong>{proyectada.letra}</strong>
        </div>
      </div>
      <div className="cd-madurez">
        {vm.madurez.map((m, i) => {
          const gana = m.p[key] - m.hoy;
          return (
            <MadurezRow
              key={i}
              nombre={m.m}
              hoy={m.hoy}
              meta={m.p[key]}
              sector={vm.benchmarkModulos?.[m.m]}
              top={maxGana > 0 && gana === maxGana}
            />
          );
        })}
        {vm.benchmarkModulos && (
          <p className="cd-bar-legend">La línea marca el promedio del sector.</p>
        )}
      </div>
    </section>
  );
}

// --- Brecha para el 100 (F20) ------------------------------------------

// Shown only when the selected plan does NOT take the client to 100 — the
// pipeline decides this by sending a reading for that plan (and null when the
// plan reaches 100). The renderer NEVER computes the gap; it reads and, when
// the plan changes, resolves the reading for the new plan. Tone: a roadmap for
// the client, not a disclaimer.
function BrechaCien({ vm, plan }: { vm: ClientDocVM; plan: Plan }) {
  const brecha = brechaDePlan(vm.brechaFuera, plan);
  if (!brecha) return null;
  return (
    <section className="cd-section cd-brecha">
      <SecHead n={9} small="Qué falta para llegar al 100 — y cómo se cierra">
        El tramo que le queda al {PLAN_LABEL[plan]}
      </SecHead>
      {brecha.lectura && <p className="cd-brecha-lectura">{brecha.lectura}</p>}
      {brecha.modulos.length > 0 && (
        <div className="cd-brecha-grid">
          {brecha.modulos.map((m, i) => (
            <div className="cd-brecha-card" key={i}>
              <div className="cd-brecha-mod">{m.modulo}</div>
              <div className="cd-brecha-accion">{m.accion}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// --- 9. Casos de éxito (prueba social) ---------------------------------

function CasosDeExito() {
  return (
    <section className="cd-section">
      <SecHead n={9} small="No lo decimos solo nosotros">
        Empresas que ya trabajan con nosotros
      </SecHead>
      <div className="cd-testimonios">
        {TESTIMONIOS.map((t, i) => (
          <figure className="cd-testimonio" key={i}>
            <blockquote>«{t.quote}»</blockquote>
            <figcaption>
              <strong>{t.autor}</strong>
              <span>{t.cargo}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

// --- 11. Cómo arrancamos y garantía ------------------------------------

function ComoArrancamos() {
  return (
    <section className="cd-section">
      <SecHead n={11} small="Qué pasa después de aceptar">
        Cómo arrancamos y nuestro acompañamiento
      </SecHead>
      <div className="cd-arranque">
        {ARRANQUE_PASOS.map((p, i) => (
          <div className="cd-arranque-paso" key={i}>
            <span className="cd-arranque-num" aria-hidden="true">
              {i + 1}
            </span>
            <div>
              <div className="cd-arranque-titulo">{p.t}</div>
              <div className="cd-arranque-nota">{p.d}</div>
            </div>
          </div>
        ))}
      </div>
      <p className="cd-arranque-soporte">
        Nuestro acompañamiento no termina con la entrega: soporte continuo,
        mantenimiento y actualizaciones para que el sistema evolucione con tu
        negocio.
      </p>
      <div className="cd-garantia">
        <span className="cd-garantia-sello" aria-hidden="true">
          ✓
        </span>
        <div>
          <div className="cd-garantia-titulo">Garantía</div>
          <p>{GARANTIA}</p>
        </div>
      </div>
    </section>
  );
}

// --- 10. Condiciones de arranque ---------------------------------------

function Condiciones({ vm }: { vm: ClientDocVM }) {
  if (vm.advertencias.length === 0) return null;
  return (
    <section className="cd-section">
      <SecHead n={10}>Antes de arrancar</SecHead>
      <p className="cd-intro">{introAdvertencias(vm.advertencias.length)}</p>
      {/* F21: one idea per card — lighter than a dense block of text. */}
      <div className="cd-condiciones">
        {vm.advertencias.map((a, i) => (
          <div className="cd-condicion-card" key={i}>
            <span className="cd-condicion-num" aria-hidden="true">
              {i + 1}
            </span>
            <p>{a}</p>
          </div>
        ))}
      </div>
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
  onObservacion,
}: {
  vm: ClientDocVM;
  plan: Plan;
  token: string;
  nowIso: string;
  acceptance: Acceptance | null;
  onObservacion: () => void;
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
      <SecHead n={12}>Inversión y aceptación</SecHead>

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
            onChange={(e) => {
              if (observaciones === "" && e.target.value !== "") onObservacion();
              setObservaciones(e.target.value);
            }}
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
