import { useState } from 'react';
import { recovery, type RestPoint } from '../lib/metrics';
import { cx } from './ui';

const ACCENT = '#2B5AC0';
const GRID = '#EFEFEA';

/**
 * Nube de puntos de descanso frente a rendimiento, con la curva del modelo
 * encima.
 *
 * Es la gráfica que permite no fiarse de mi fórmula: cada punto es una serie
 * real tuya —cuánto descansaste y qué fracción de la primera serie sacaste—
 * y la línea es lo que el modelo predecía. Si tus puntos caen sistemáticamente
 * por encima o por debajo, la curva no te describe y hay que decirlo.
 */
export function RestScatter({
  points,
  height = 168,
}: {
  points: RestPoint[];
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);

  if (points.length < 3) {
    return (
      <p className="py-8 text-caption text-ink-faint">
        Hacen falta al menos tres series con el mismo peso y su descanso medido para dibujar la nube.
      </p>
    );
  }

  const W = 320;
  const H = height;
  const padL = 8;
  const padR = 8;
  const padT = 12;
  const padB = 22;

  const maxRest = Math.max(300, Math.ceil(Math.max(...points.map((p) => p.rest)) / 60) * 60);
  const ratios = points.map((p) => p.ratio);
  const loY = Math.min(0.5, Math.floor(Math.min(...ratios) * 10) / 10);
  const hiY = Math.max(1.2, Math.ceil(Math.max(...ratios) * 10) / 10);

  const x = (rest: number) => padL + (rest / maxRest) * (W - padL - padR);
  const y = (ratio: number) => padT + (1 - (ratio - loY) / (hiY - loY)) * (H - padT - padB);

  /* La curva del modelo, normalizada igual que los puntos: fracción respecto
     a la primera serie del día. */
  const curve = Array.from({ length: 41 }, (_, i) => {
    const t = (i / 40) * maxRest;
    return `${i === 0 ? 'M' : 'L'}${x(t).toFixed(1)},${y(recovery(t)).toFixed(1)}`;
  }).join(' ');

  const active = hover != null ? points[hover] : null;

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full"
        style={{ height }}
        role="img"
        aria-label={`${points.length} series comparadas con la curva de recuperación`}
      >
        {/* Referencia: rendir lo mismo que la primera serie. */}
        <line x1={padL} x2={W - padR} y1={y(1)} y2={y(1)} stroke={GRID} strokeWidth="1" />
        <text x={padL} y={y(1) - 4} className="fill-[#8E8E87] text-[8px]">
          igual que la 1ª serie
        </text>

        <path d={curve} fill="none" stroke={ACCENT} strokeWidth="2" strokeDasharray="4 3" opacity="0.55" />

        {points.map((p, i) => (
          <circle
            key={`${p.at}-${i}`}
            cx={x(p.rest)}
            cy={y(p.ratio)}
            r={hover === i ? 5.5 : 4}
            fill={ACCENT}
            stroke="#FFFFFF"
            strokeWidth="1.5"
            className="cursor-pointer"
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
          >
            <title>{`${p.rest}s de descanso · ${p.reps} reps con ${p.weight} kg`}</title>
          </circle>
        ))}

        {[0, maxRest / 2, maxRest].map((t) => (
          <text key={t} x={x(t)} y={H - 6} textAnchor="middle" className="fill-[#8E8E87] text-[8px]">
            {Math.round(t / 60)}′
          </text>
        ))}
      </svg>

      <p className="mt-1 text-micro text-ink-faint">
        {active ? (
          <span className="tnum text-ink">
            {Math.round(active.rest)} s → {active.reps} reps con {active.weight} kg (
            {Math.round(active.ratio * 100)} % de la primera)
          </span>
        ) : (
          <>
            Cada punto es una serie tuya; la línea de puntos es lo que predice el modelo. Eje horizontal: minutos de
            descanso.
          </>
        )}
      </p>
    </div>
  );
}

/** Barras verticales compactas: una por sesión, para ver ritmo de un vistazo. */
export function MiniBars({
  values,
  labels,
  format,
}: {
  values: number[];
  labels: string[];
  format: (v: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (!values.length) return null;
  const max = Math.max(...values, 1);

  return (
    <div>
      <div className="flex h-24 items-end gap-1">
        {values.map((v, i) => (
          <button
            key={i}
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
            onClick={() => setHover(i)}
            aria-label={`${labels[i]}: ${format(v)}`}
            className="group flex h-full flex-1 items-end"
          >
            <span
              className={cx(
                'block w-full rounded-t-[3px] transition-colors duration-press',
                hover === i ? 'bg-accent-deep' : 'bg-accent/75 group-hover:bg-accent',
              )}
              style={{ height: `${Math.max(4, (v / max) * 100)}%` }}
            />
          </button>
        ))}
      </div>
      <p className="tnum mt-1.5 text-micro text-ink-faint">
        {hover != null ? (
          <span className="text-ink">
            {labels[hover]} · {format(values[hover] as number)}
          </span>
        ) : (
          `${values.length} sesiones · máximo ${format(max)}`
        )}
      </p>
    </div>
  );
}
