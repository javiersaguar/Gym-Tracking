import { useState } from 'react';
import type { Muscle } from '../lib/types';
import { MUSCLE_LABEL } from '../lib/types';
import { cx } from './ui';

/* ────────────────────────────────────────────────────────────────────────────
 * Mapa de calor muscular
 *
 * Dos siluetas, delante y detrás, con una región por grupo. El color no es el
 * tonelaje: es la puntuación compuesta (volumen, frecuencia, intensidad y
 * progreso), porque un gemelo puede mover poco peso y estar perfectamente
 * atendido mientras una espalda mueve mucho y va a medias.
 *
 * La figura se compone de elipses y rectángulos redondeados en vez de un
 * contorno anatómico: a 150 px de ancho en un móvil, lo que importa es
 * reconocer de un vistazo dónde cae cada mancha, no el detalle del músculo.
 *
 * Rampa secuencial de un solo tono validada sobre papel blanco. Lo que no se
 * ha entrenado se deja en gris: «sin datos» no es un valor bajo, es la
 * ausencia de valor.
 * ──────────────────────────────────────────────────────────────────────── */

const RAMP = ['#DCE5F7', '#9DB6E6', '#7196DC', '#4A78D2', '#2B5AC0', '#1B3F9E'] as const;
const EMPTY = '#E9E9E4';
const BODY = '#F2F2EE';
const BODY_LINE = '#E0E0DA';

function fillFor(score: number | null): string {
  if (score == null) return EMPTY;
  const i = Math.min(RAMP.length - 1, Math.floor((score / 100) * RAMP.length));
  return RAMP[i] as string;
}

type Shape =
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; rot?: number }
  | { kind: 'rect'; x: number; y: number; w: number; h: number; r: number; rot?: number };

type Region = { muscle: Muscle; shapes: Shape[] };

/** Espejo horizontal respecto al eje del cuerpo (x = 50). */
function mirror(s: Shape): Shape {
  if (s.kind === 'ellipse') return { ...s, cx: 100 - s.cx, rot: s.rot ? -s.rot : undefined };
  return { ...s, x: 100 - s.x - s.w, rot: s.rot ? -s.rot : undefined };
}

/** Un grupo y su reflejo, que es como se dibuja casi todo el cuerpo. */
function pair(muscle: Muscle, shapes: Shape[]): Region {
  return { muscle, shapes: [...shapes, ...shapes.map(mirror)] };
}

const FRONT: Region[] = [
  pair('hombro', [{ kind: 'ellipse', cx: 31, cy: 36, rx: 7, ry: 8 }]),
  pair('pecho', [{ kind: 'rect', x: 37, y: 32, w: 12, h: 20, r: 5 }]),
  pair('biceps', [{ kind: 'ellipse', cx: 26, cy: 60, rx: 5, ry: 11 }]),
  pair('abdomen', [{ kind: 'rect', x: 41.5, y: 56, w: 8, h: 34, r: 3.5 }]),
  pair('aductor', [{ kind: 'ellipse', cx: 45, cy: 116, rx: 4.5, ry: 16 }]),
  pair('cuadriceps', [{ kind: 'ellipse', cx: 39.5, cy: 122, rx: 7, ry: 26 }]),
  pair('gemelo', [{ kind: 'ellipse', cx: 39, cy: 176, rx: 5.5, ry: 16 }]),
];

const BACK: Region[] = [
  pair('hombro', [{ kind: 'ellipse', cx: 31, cy: 36, rx: 7, ry: 8 }]),
  pair('espalda', [
    { kind: 'rect', x: 36, y: 31, w: 13, h: 24, r: 5 },
    { kind: 'ellipse', cx: 42, cy: 66, rx: 8, ry: 13 },
  ]),
  pair('triceps', [{ kind: 'ellipse', cx: 26, cy: 60, rx: 5, ry: 11 }]),
  pair('gluteo', [{ kind: 'ellipse', cx: 43.5, cy: 98, rx: 8, ry: 9 }]),
  pair('femoral', [{ kind: 'ellipse', cx: 40, cy: 128, rx: 7, ry: 22 }]),
  pair('gemelo', [{ kind: 'ellipse', cx: 39, cy: 176, rx: 5.5, ry: 16 }]),
];

/** Piezas del cuerpo, en gris muy claro, para apoyar las manchas. */
const FIGURE: Shape[] = [
  { kind: 'ellipse', cx: 50, cy: 13, rx: 8, ry: 9 },
  { kind: 'rect', x: 46.5, y: 21, w: 7, h: 8, r: 2 },
  { kind: 'rect', x: 33, y: 28, w: 34, h: 34, r: 9 },
  { kind: 'rect', x: 37, y: 56, w: 26, h: 36, r: 8 },
  { kind: 'rect', x: 35, y: 86, w: 30, h: 22, r: 8 },
  { kind: 'ellipse', cx: 26, cy: 60, rx: 6, ry: 18 },
  { kind: 'ellipse', cx: 74, cy: 60, rx: 6, ry: 18 },
  { kind: 'ellipse', cx: 23, cy: 88, rx: 4.5, ry: 15 },
  { kind: 'ellipse', cx: 77, cy: 88, rx: 4.5, ry: 15 },
  { kind: 'ellipse', cx: 40, cy: 126, rx: 9, ry: 31 },
  { kind: 'ellipse', cx: 60, cy: 126, rx: 9, ry: 31 },
  { kind: 'ellipse', cx: 39, cy: 178, rx: 6.5, ry: 22 },
  { kind: 'ellipse', cx: 61, cy: 178, rx: 6.5, ry: 22 },
  { kind: 'rect', x: 34, y: 197, w: 10, h: 6, r: 3 },
  { kind: 'rect', x: 56, y: 197, w: 10, h: 6, r: 3 },
];

function Piece({ shape, ...rest }: { shape: Shape } & Record<string, unknown>) {
  const transform =
    shape.rot != null
      ? `rotate(${shape.rot} ${shape.kind === 'ellipse' ? shape.cx : shape.x + shape.w / 2} ${
          shape.kind === 'ellipse' ? shape.cy : shape.y + shape.h / 2
        })`
      : undefined;

  return shape.kind === 'ellipse' ? (
    <ellipse cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} transform={transform} {...rest} />
  ) : (
    <rect x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx={shape.r} transform={transform} {...rest} />
  );
}

export type BodyMapProps = {
  /** Puntuación 0-100 por grupo. Null = sin trabajo en el periodo. */
  scores: Map<Muscle, number | null>;
  selected?: Muscle | null;
  onSelect?: (m: Muscle) => void;
};

export function BodyMap({ scores, selected, onSelect }: BodyMapProps) {
  const [hover, setHover] = useState<Muscle | null>(null);

  const view = (regions: Region[], label: string) => (
    <figure className="min-w-0 flex-1">
      <svg viewBox="0 0 100 208" className="block w-full" role="img" aria-label={`Vista ${label}`}>
        <g fill={BODY} stroke={BODY_LINE} strokeWidth="0.7">
          {FIGURE.map((sh, i) => (
            <Piece key={i} shape={sh} />
          ))}
        </g>

        {regions.map((r) => {
          const score = scores.get(r.muscle) ?? null;
          const on = selected === r.muscle || hover === r.muscle;
          return (
            <g
              key={r.muscle}
              className="cursor-pointer"
              onPointerEnter={() => setHover(r.muscle)}
              onPointerLeave={() => setHover(null)}
              onClick={() => onSelect?.(r.muscle)}
              fill={fillFor(score)}
              stroke={on ? '#17171A' : 'rgba(23,23,26,0.12)'}
              strokeWidth={on ? 1.1 : 0.5}
              style={{ transition: 'fill 320ms cubic-bezier(.16,1,.3,1), stroke 160ms ease' }}
            >
              <title>
                {MUSCLE_LABEL[r.muscle]}
                {score != null ? ` · ${score} de 100` : ' · sin trabajo'}
              </title>
              {r.shapes.map((sh, i) => (
                <Piece key={i} shape={sh} />
              ))}
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 text-center text-micro text-ink-faint">{label}</figcaption>
    </figure>
  );

  return (
    <div>
      <div className="flex gap-3">
        {view(FRONT, 'Delante')}
        {view(BACK, 'Detrás')}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line pt-3 text-micro text-ink-faint">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: EMPTY }} />
          Sin trabajo
        </span>
        <span className="flex items-center gap-1">
          Desatendido
          {RAMP.map((c) => (
            <span key={c} className="h-2.5 w-2.5 rounded-[2px]" style={{ background: c }} />
          ))}
          Bien cubierto
        </span>
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
            className="block h-full rounded-[3px] bg-accent"
            style={{ width: `${score * 100}%`, transition: 'width 420ms cubic-bezier(.16,1,.3,1)' }}
          />
        )}
      </div>
    </div>
  );
}
