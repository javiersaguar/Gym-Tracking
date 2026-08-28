/* ────────────────────────────────────────────────────────────────────────────
 * Escala térmica del mapa muscular
 *
 * Como la de un mapa del tiempo: azul lo menos entrenado, rojo lo más. Es la
 * convención que ya sabe leer cualquiera para este tipo de mapa, y por eso se
 * usa aquí en vez de la rampa azul del resto de la app.
 *
 * El arcoíris tiene mala fama en visualización porque el orden de los tonos no
 * es evidente y no es perceptualmente uniforme. Aquí se compensa de tres
 * formas: los tonos van además de oscuro a claro y de vuelta a saturado, cada
 * músculo lleva su cifra escrita en la lista de al lado, y la leyenda es un
 * degradado continuo con los dos extremos rotulados.
 * ──────────────────────────────────────────────────────────────────────── */

import { cx } from './ui';

/** Escala térmica, de menos a más entrenado: azul frío → rojo. */
const RAMP: [number, [number, number, number]][] = [
  [0.0, [40, 84, 178]],
  [0.18, [56, 146, 212]],
  [0.36, [74, 190, 184]],
  [0.52, [138, 198, 88]],
  [0.68, [232, 199, 62]],
  [0.84, [232, 142, 50]],
  [1.0, [206, 62, 52]],
];

const hex = (c: number[]) =>
  `#${c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;

/**
 * Color de la escala para un valor de 0 a 1, interpolando entre paradas.
 *
 * Devuelve hexadecimal a propósito: el mismo color va a CSS y al motor 3D, y
 * el `rgb(r g b)` con espacios que admite CSS moderno no lo sabe leer three.js,
 * que se quedaba con la figura entera en gris.
 */
export function thermal(t: number): string {
  const x = Math.max(0, Math.min(1, t));
  for (let i = 0; i < RAMP.length - 1; i++) {
    const [p0, c0] = RAMP[i] as [number, [number, number, number]];
    const [p1, c1] = RAMP[i + 1] as [number, [number, number, number]];
    if (x <= p1) {
      const k = p1 === p0 ? 0 : (x - p0) / (p1 - p0);
      return hex(c0.map((v, j) => v + ((c1[j] as number) - v) * k));
    }
  }
  const last = RAMP[RAMP.length - 1] as [number, [number, number, number]];
  return hex(last[1]);
}

/** Gris de lo que no se ha entrenado y de lo que la app no mide. */
const UNTRAINED = '#D8D8D2';

/**
 * Leyenda de la escala, rotulada como la de un mapa del tiempo: un degradado
 * continuo con las marcas numéricas debajo. Sin las cifras, el color solo
 * diría «más» o «menos»; con ellas se puede leer un músculo concreto.
 */
export function ThermalLegend({ className }: { className?: string }) {
  const gradient = RAMP.map(([p, c]) => `${hex(c)} ${Math.round(p * 100)}%`).join(', ');

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between">
        <span className="text-micro text-ink-muted">Menos entrenado</span>
        <span className="text-micro text-ink-muted">Más entrenado</span>
      </div>
      <span
        className="mt-1 block h-2.5 rounded-full"
        style={{ background: `linear-gradient(90deg, ${gradient})` }}
        aria-hidden
      />
      <div className="tnum mt-1 flex justify-between text-micro text-ink-faint">
        {[0, 25, 50, 75, 100].map((n) => (
          <span key={n}>{n}</span>
        ))}
      </div>
      <div className="mt-2.5 flex items-center gap-1.5 text-micro text-ink-faint">
        <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: UNTRAINED }} />
        Sin trabajo en este periodo
      </div>
    </div>
  );
}

/** Barra compacta de un componente de la puntuación. */
export function ComponentBar({
  label,
  score,
  detail,
}: {
  label: string;
  score: number | null;
  detail: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-micro text-ink-muted">{label}</span>
        <span className={cx('tnum text-micro', score == null ? 'text-ink-faint' : 'text-ink')}>{detail}</span>
      </div>
      <div className="mt-1 h-[5px] overflow-hidden rounded-[3px] bg-line-soft">
        {score != null && (
          <span
            className="block h-full rounded-[3px]"
            style={{
              width: `${score * 100}%`,
              background: thermal(score),
              transition: 'width 420ms cubic-bezier(.16,1,.3,1)',
            }}
          />
        )}
      </div>
    </div>
  );
}
