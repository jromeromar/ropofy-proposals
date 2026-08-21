/**
 * Maturity radar (spider) chart — inline SVG, no dependencies. Compares the
 * client's current level ("hoy") against the sector average across the maturity
 * modules, both on the 0–4 scale. Pure/presentational, theme-agnostic.
 */

interface Eje {
  m: string;
  hoy: number;
  sector: number | null;
}

const MAX = 4;

function punto(cx: number, cy: number, r: number, ang: number): [number, number] {
  return [cx + r * Math.cos(ang), cy + r * Math.sin(ang)];
}

export default function RadarMadurez({
  ejes,
  colorHoy = "#485CC7",
  colorSector = "#708287",
}: {
  ejes: Eje[];
  colorHoy?: string;
  colorSector?: string;
}) {
  const n = ejes.length;
  if (n < 3) return null;

  const size = 260;
  const cx = size / 2;
  const cy = size / 2;
  const R = 80;
  const paso = (Math.PI * 2) / n;
  const ang = (i: number) => -Math.PI / 2 + i * paso;

  const poly = (valor: (e: Eje) => number) =>
    ejes
      .map((e, i) => {
        const v = Math.max(0, Math.min(MAX, valor(e)));
        const [x, y] = punto(cx, cy, (v / MAX) * R, ang(i));
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

  const haySector = ejes.some((e) => e.sector != null);
  const polyHoy = poly((e) => e.hoy);
  const polySector = poly((e) => e.sector ?? 0);

  // Short labels so the axes stay legible.
  const corta = (m: string) => (m.length > 12 ? m.split(" ")[0] : m);

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width="100%"
      role="img"
      aria-label="Radar de madurez: hoy vs. promedio del sector"
      style={{
        maxWidth: 300,
        display: "block",
        margin: "0 auto",
        overflow: "visible",
      }}
    >
      {/* rings */}
      {[1, 2, 3, 4].map((ring) => (
        <polygon
          key={ring}
          points={ejes
            .map((_, i) => {
              const [x, y] = punto(cx, cy, (ring / MAX) * R, ang(i));
              return `${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join(" ")}
          fill="none"
          stroke="#DCE2F7"
          strokeWidth={1}
        />
      ))}
      {/* axes + labels */}
      {ejes.map((e, i) => {
        const [ex, ey] = punto(cx, cy, R, ang(i));
        const [lx, ly] = punto(cx, cy, R + 16, ang(i));
        const anchor = lx < cx - 4 ? "end" : lx > cx + 4 ? "start" : "middle";
        return (
          <g key={e.m}>
            <line x1={cx} y1={cy} x2={ex} y2={ey} stroke="#DCE2F7" strokeWidth={1} />
            <text
              x={lx}
              y={ly}
              fontSize={8.5}
              fontWeight={800}
              fill="#708287"
              textAnchor={anchor}
              dominantBaseline="middle"
            >
              {corta(e.m)}
            </text>
          </g>
        );
      })}
      {/* sector polygon */}
      {haySector && (
        <polygon
          points={polySector}
          fill={colorSector}
          fillOpacity={0.12}
          stroke={colorSector}
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
      )}
      {/* hoy polygon */}
      <polygon
        points={polyHoy}
        fill={colorHoy}
        fillOpacity={0.22}
        stroke={colorHoy}
        strokeWidth={2}
      />
      {ejes.map((e, i) => {
        const [x, y] = punto(cx, cy, (Math.max(0, Math.min(MAX, e.hoy)) / MAX) * R, ang(i));
        return <circle key={e.m} cx={x} cy={y} r={2.6} fill={colorHoy} />;
      })}
    </svg>
  );
}
