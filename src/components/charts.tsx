import { useRef, useState } from 'react';
import { cx } from './ui';

/* ────────────────────────────────────────────────────────────────────────────
 * Reglas de los gráficos de esta app
 *
 * Un solo tono. Los grupos musculares son categorías nominales: cambiar su
 * orden no cambia el significado, así que darles un color a cada uno gastaría
 * el canal de identidad en repetir lo que ya dice la longitud de la barra —y
 * once azules distintos no se distinguirían igualmente. La identidad la lleva
 * la etiqueta, que está siempre escrita al lado.
 *
 * Verde, ámbar y rojo quedan reservados para estado (récord, atención,
 * peligro) y nunca aparecen como «serie 2». Cuando se usan, van con texto.
 *
 * Un solo eje, nunca dos escalas. Rejilla y ejes discretos, marcas finas y
 * cifras escritas donde hace falta en vez de una etiqueta en cada punto.
 * ──────────────────────────────────────────────────────────────────────── */

/* Rampa secuencial validada sobre papel blanco: un solo tono, L monótona,
   saltos de luminosidad ≥0,06 y el extremo claro por encima de 2:1. */
const RAMP = ['#9DB6E6', '#7196DC', '#4A78D2', '#2B5AC0', '#1B3F9E'] as const;
const ACCENT = '#2B5AC0';
const GRID = '#EFEFEA';

export type BarDatum = {
  key: string;
  label: string;
  value: number;
  /** Texto que se escribe al final de la fila. Es la cifra exacta. */
  display: string;
  /** Franja de referencia en las mismas unidades del eje, si la hay. */
  band?: [number, number];
  /** Nota corta bajo la etiqueta. */
  note?: string;
};

/**
 * Lista de barras horizontales. Es a la vez el gráfico y su tabla: cada fila
 * lleva su nombre y su cifra escritos, así que se lee igual sin distinguir
 * colores y no hace falta una vista de tabla aparte.
 */
export function BarList({
  data,
  max,
  bandLabel,
  emptyLabel = 'Sin datos todavía',
}: {
  data: BarDatum[];
  max?: number;
  bandLabel?: string;
  emptyLabel?: string;
}) {
  const top = max ?? Math.max(...data.map((d) => Math.max(d.value, d.band?.[1] ?? 0)), 1);
  const visible = data.filter((d) => d.value > 0 || d.band);

  if (!visible.length) {
    return <p className="py-6 text-caption text-ink-faint">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-2.5">
      {bandLabel && (
        <p className="flex items-center gap-1.5 text-micro text-ink-faint">
          <span className="inline-block h-2.5 w-4 rounded-[2px] bg-accent/10 ring-1 ring-inset ring-accent/20" />
          {bandLabel}
        </p>
      )}
      <ul className="space-y-2.5">
        {visible.map((d) => {
          const pct = Math.min(100, (d.value / top) * 100);
          const band = d.band ? { from: (d.band[0] / top) * 100, to: (Math.min(d.band[1], top) / top) * 100 } : null;
          return (
            <li key={d.key}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <span className="truncate text-caption text-ink">{d.label}</span>
                <span className="tnum shrink-0 text-caption font-medium text-ink">{d.display}</span>
              </div>
              {/* La barra se ancla a la línea de base y remata en 4 px de
                  radio; el carril queda casi invisible para no competir. */}
              <div className="relative h-[6px] overflow-hidden rounded-[3px] bg-line-soft">
                {band && (
                  <span
                    aria-hidden
                    className="absolute inset-y-0 rounded-[2px] bg-accent/10 ring-1 ring-inset ring-accent/20"
                    style={{ left: `${band.from}%`, width: `${Math.max(0, band.to - band.from)}%` }}
                  />
                )}
                <span
                  className="absolute inset-y-0 left-0 rounded-[3px]"
                  style={{
                    width: `${pct}%`,
                    background: ACCENT,
                    transition: 'width 420ms cubic-bezier(.16,1,.3,1)',
                  }}
                />
              </div>
              {d.note && <p className="mt-1.5 text-micro text-ink-faint">{d.note}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ── Línea de evolución ──────────────────────────────────────────────────── */

export type LinePoint = { at: number; value: number };

function niceBounds(values: number[]): [number, number] {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (hi === lo) return [lo * 0.9, hi * 1.1 || 1];
  /* Un 12 % de aire arriba y abajo: pegar la línea al borde hace que una
     subida del 2 % parezca que se sale del gráfico. */
  const pad = (hi - lo) * 0.12;
  return [lo - pad, hi + pad];
}

/**
 * Serie única con área. Sin leyenda: el título dice qué es. La cruz de
 * seguimiento aparece al pasar el dedo o el ratón, que es como se lee un
 * punto concreto sin llenar el gráfico de etiquetas.
 */
export function TrendLine({
  points,
  format,
  height = 132,
  className,
}: {
  points: LinePoint[];
  format: (v: number) => string;
  height?: number;
  className?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);

  if (points.length < 2) {
    return (
      <p className="py-8 text-caption text-ink-faint">
        Hacen falta al menos dos sesiones para dibujar una tendencia.
      </p>
    );
  }

  const W = 320;
  const H = height;
  const padX = 8;
  const padY = 14;
  const [lo, hi] = niceBounds(points.map((p) => p.value));
  const x = (i: number) => padX + (i / (points.length - 1)) * (W - padX * 2);
  const y = (v: number) => padY + (1 - (v - lo) / (hi - lo)) * (H - padY * 2);

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(p.value).toFixed(2)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(2)},${H - padY} L${x(0).toFixed(2)},${H - padY} Z`;

  const active = hover != null ? points[hover] : null;
  const first = points[0] as LinePoint;
  const last = points[points.length - 1] as LinePoint;

  const pick = (clientX: number) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = (clientX - rect.left) / rect.width;
    const i = Math.round(ratio * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  };

  return (
    <div className={cx('relative', className)}>
      <div
        ref={box}
        className="relative touch-pan-y"
        onPointerDown={(e) => pick(e.clientX)}
        onPointerMove={(e) => {
          if (e.pointerType === 'mouse' || e.buttons > 0) pick(e.clientX);
        }}
        onPointerLeave={() => setHover(null)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" style={{ height }} role="img"
          aria-label={`Evolución de ${points.length} sesiones, de ${format(first.value)} a ${format(last.value)}`}>
          <defs>
            <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ACCENT} stopOpacity="0.14" />
              <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Rejilla discreta: tres líneas, nada de marco. */}
          {[0, 0.5, 1].map((t) => (
            <line
              key={t}
              x1={padX}
              x2={W - padX}
              y1={padY + t * (H - padY * 2)}
              y2={padY + t * (H - padY * 2)}
              stroke={GRID}
              strokeWidth="1"
            />
          ))}

          <path d={area} fill="url(#trend-fill)" />
          <path
            d={line}
            fill="none"
            stroke={ACCENT}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* El último punto siempre visible: es el dato que importa. */}
          <circle cx={x(points.length - 1)} cy={y(last.value)} r="4.5" fill={ACCENT} stroke="#FFFFFF" strokeWidth="2" />

          {active && hover != null && (
            <g>
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={padY}
                y2={H - padY}
                stroke="#D4D4CE"
                strokeWidth="1"
              />
              <circle cx={x(hover)} cy={y(active.value)} r="5" fill={ACCENT} stroke="#FFFFFF" strokeWidth="2" />
            </g>
          )}
        </svg>
      </div>

      <div className="mt-1 flex items-center justify-between text-micro text-ink-faint">
        {active ? (
          <>
            <span className="tnum font-medium text-ink">{format(active.value)}</span>
            <span className="tnum">
              {new Date(active.at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
            </span>
          </>
        ) : (
          <>
            <span className="tnum">{format(first.value)}</span>
            <span className="tnum font-medium text-ink-muted">{format(last.value)}</span>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Chispa ──────────────────────────────────────────────────────────────── */

/** Miniatura para tarjetas: sin ejes, sin interacción, solo la forma. La
 *  cifra exacta va escrita al lado en el propio componente que la usa. */
export function Spark({ points, className }: { points: number[]; className?: string }) {
  if (points.length < 2) return null;
  const W = 72;
  const H = 22;
  const lo = Math.min(...points);
  const hi = Math.max(...points);
  const span = hi - lo || 1;
  const d = points
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${((i / (points.length - 1)) * (W - 3) + 1.5).toFixed(1)},${(H - 2.5 - ((v - lo) / span) * (H - 5)).toFixed(1)}`)
    .join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cx('h-[22px] w-[72px] shrink-0', className)} aria-hidden>
      <path d={d} fill="none" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── Calendario de constancia ────────────────────────────────────────────── */

/**
 * Rejilla de las últimas semanas. Es una rampa secuencial de un solo tono
 * (más tonelaje, más claro), no una escala de colores distintos: aquí el color
 * codifica magnitud, no identidad.
 */
export function ConsistencyGrid({
  days,
  weeks = 12,
}: {
  /** Tonelaje por día en epoch-día → kg. */
  days: Map<number, number>;
  weeks?: number;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  /* La rejilla empieza en lunes para que cada columna sea una semana real. */
  const offsetToMonday = (today.getDay() + 6) % 7;
  const start = new Date(today);
  start.setDate(start.getDate() - offsetToMonday - (weeks - 1) * 7);

  const values = [...days.values()].filter((v) => v > 0);
  const p90 = values.length ? [...values].sort((a, b) => a - b)[Math.floor(values.length * 0.9)] ?? 1 : 1;

  const STEPS = [RAMP[0], RAMP[1], RAMP[2], RAMP[3]];
  const cells: { key: number; level: number; label: string }[] = [];

  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const date = new Date(start);
      date.setDate(start.getDate() + w * 7 + d);
      const key = date.getTime();
      const v = days.get(key) ?? 0;
      const level = v <= 0 ? 0 : Math.min(4, Math.ceil((v / (p90 || 1)) * 4));
      cells.push({
        key,
        level,
        label: `${date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}: ${v > 0 ? `${Math.round(v)} kg` : 'descanso'}`,
      });
    }
  }

  return (
    <div>
      <div className="grid grid-flow-col grid-rows-7 gap-[3px]" style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0,1fr))` }}>
        {cells.map((c) => (
          <span
            key={c.key}
            title={c.label}
            className="aspect-square rounded-[2px]"
            style={{
              background: c.level === 0 ? '#EFEFEA' : STEPS[c.level - 1],
              opacity: c.key > today.getTime() ? 0.25 : 1,
            }}
          />
        ))}
      </div>
      <div className="mt-2.5 flex items-center justify-between text-micro text-ink-faint">
        <span>Hace {weeks} semanas</span>
        <span className="flex items-center gap-1">
          Menos
          <span className="h-2.5 w-2.5 rounded-[2px] bg-line-soft" />
          {STEPS.map((step) => (
            <span key={step} className="h-2.5 w-2.5 rounded-[2px]" style={{ background: step }} />
          ))}
          Más
        </span>
      </div>
    </div>
  );
}
