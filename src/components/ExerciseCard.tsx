import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { addSet, patchSet, removeSet, setRir, toggleSkip, uncompleteSet } from '../lib/actions';
import { clock } from '../lib/format';
import { haptic } from '../lib/hooks';
import { e1RM } from '../lib/metrics';
import type { Reference } from '../lib/reference';
import { referenceLabel } from '../lib/reference';
import { MUSCLE_LABEL, type LoggedExercise, type LoggedSet } from '../lib/types';
import { NumberField } from './NumberField';
import { Button, Pill, cx } from './ui';

/**
 * Botón de confirmar la serie.
 *
 * Antes era una casilla con un tic y no se entendía qué hacía. Ahora es un
 * botón con su verbo escrito, del ancho del contenido, y cambia de palabra al
 * marcarse: «Hecha» con el tic relleno. Es el objetivo más pulsado de la app
 * y no puede depender de adivinar qué significa un icono.
 */
function DoneButton({ done, onToggle }: { done: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      aria-label={done ? 'Deshacer serie' : 'Marcar serie como hecha'}
      aria-pressed={done}
      className={cx(
        'pressable inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-caption font-medium',
        'transition-colors duration-press',
        done
          ? 'border-accent bg-accent text-paper'
          : 'border-accent/35 bg-accent-wash text-accent-deep hover:border-accent/60 hover:bg-accent/12',
      )}
    >
      <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2">
        <motion.path
          d="M4.6 10.4l3.5 3.5 7.2-8"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ pathLength: done ? 1 : 0.001, opacity: done ? 1 : 0.5 }}
          transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      {done ? 'Hecha' : 'Marcar'}
    </button>
  );
}

/**
 * Selector de repeticiones en la recámara.
 *
 * Con su etiqueta escrita entera —«¿Cuántas te quedaban?»— porque «RIR» a
 * secas no dice nada si no lo tienes en la cabeza. Cinco botones, un toque, y
 * volver a tocar el mismo lo borra.
 */
const RIR_OPTIONS = [0, 1, 2, 3, 4] as const;

function RirPicker({
  value,
  onPick,
  setNumber,
}: {
  value: number | null;
  onPick: (v: number | null) => void;
  setNumber: number;
}) {
  return (
    <div className="mt-2 rounded-lg border border-line bg-canvas px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-micro text-ink-muted">
          RIR <span className="text-ink-faint">· ¿cuántas te quedaban?</span>
        </span>
        {value != null && <span className="tnum text-micro font-medium text-accent">{value === 4 ? '4+' : value}</span>}
      </div>
      <div
        className="mt-1.5 flex gap-1"
        role="group"
        aria-label={`Repeticiones en recámara de la serie ${setNumber}`}
      >
        {RIR_OPTIONS.map((n) => {
          const active = value === n;
          return (
            <button
              key={n}
              type="button"
              aria-pressed={active}
              aria-label={n === 4 ? '4 o más repeticiones en recámara' : `${n} repeticiones en recámara`}
              onClick={() => {
                haptic(8);
                onPick(active ? null : n);
              }}
              className={cx(
                'pressable h-8 flex-1 rounded-md border text-caption font-medium transition-colors duration-press',
                active
                  ? 'border-accent bg-accent text-paper'
                  : 'border-line bg-paper text-ink-muted hover:border-accent/40 hover:text-ink',
              )}
            >
              {n === 4 ? '4+' : n}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Descanso medido, entre una serie y la siguiente.
 *
 * Aparece en cuanto paras el cronómetro y se queda ahí: al mirar la tarjeta
 * después se ve el ritmo real del ejercicio sin abrir nada. Entra con doce
 * píxeles y una curva larga, que es movimiento suficiente para que se note
 * que ha aparecido algo sin robar la atención.
 */
function RestDivider({ seconds }: { seconds: number }) {
  const long = seconds >= 300;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
      className="flex items-center gap-2 px-1 py-1.5"
    >
      <span className="h-px flex-1 bg-line" />
      <span
        className={cx(
          'tnum inline-flex items-center gap-1 rounded-full border px-2 py-[3px] text-micro font-medium',
          long ? 'border-warn-ink/25 bg-warn-wash text-warn-ink' : 'border-line bg-canvas text-ink-muted',
        )}
      >
        <svg viewBox="0 0 20 20" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="10" cy="11" r="6" />
          <path d="M10 8.2V11l1.8 1.1M8.2 3h3.6" strokeLinecap="round" />
        </svg>
        {clock(seconds)}
      </span>
      <span className="h-px flex-1 bg-line" />
    </motion.div>
  );
}

function SetRow({
  set,
  index,
  exIdx,
  exercise,
  reference,
  weightStep,
  isPr,
  onDone,
  rowRef,
}: {
  set: LoggedSet;
  index: number;
  exIdx: number;
  exercise: LoggedExercise;
  reference: Reference | null;
  weightStep: number;
  isPr: boolean;
  onDone: (setIdx: number) => void;
  rowRef?: (el: HTMLDivElement | null) => void;
}) {
  const ref = reference?.sets[index];
  const [low, high] = exercise.repRange;
  const inRange = set.reps >= low && set.reps <= high;

  return (
    <motion.div
      ref={rowRef}
      layout="position"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginTop: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className={cx('rounded-lg px-1 py-2', set.done && 'bg-accent-wash/55', isPr && 'animate-flash-pr')}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className={cx('text-caption font-medium', set.done ? 'text-accent-deep' : 'text-ink')}>
          Serie {index + 1}
          {ref && (
            <span className="tnum ml-2 font-normal text-ink-faint">
              antes {String(ref.weight).replace('.', ',')} × {ref.reps}
            </span>
          )}
        </span>
        <DoneButton
          done={set.done}
          onToggle={() => {
            if (set.done) {
              haptic(6);
              uncompleteSet(exIdx, index);
            } else {
              onDone(index);
            }
          }}
        />
      </div>

      <div className="flex items-stretch gap-2">
        <label className="min-w-0 flex-1">
          <span className="label mb-1 block text-center">kg</span>
          <NumberField
            noun="peso"
            context={`la serie ${index + 1}`}
            value={set.weight}
            onChange={(v) => patchSet(exIdx, index, { weight: v })}
            step={weightStep}
            max={500}
            decimals={1}
            placeholder={ref ? String(ref.weight).replace('.', ',') : '0'}
          />
        </label>
        <label className="min-w-0 flex-1">
          <span className="label mb-1 block text-center">reps</span>
          <NumberField
            noun="repeticiones"
            context={`la serie ${index + 1}`}
            value={set.reps}
            onChange={(v) => patchSet(exIdx, index, { reps: v })}
            step={1}
            max={100}
            decimals={0}
            tone={set.reps > 0 && inRange ? 'accent' : 'default'}
            placeholder={ref ? String(ref.reps) : String(low)}
          />
        </label>
      </div>

      <RirPicker value={set.rir} setNumber={index + 1} onPick={(v) => setRir(exIdx, index, v)} />
    </motion.div>
  );
}

export function ExerciseCard({
  exercise,
  exIdx,
  reference,
  weightStep,
  prE1RM,
  onSetDone,
  registerRow,
}: {
  exercise: LoggedExercise;
  exIdx: number;
  reference: Reference | null;
  weightStep: number;
  /** Mejor 1RM estimado histórico: sirve para marcar la serie que lo bate. */
  prE1RM: number | null;
  onSetDone: (exIdx: number, setIdx: number) => void;
  /** Registra cada fila para poder desplazarse a la siguiente sin marcar. */
  registerRow?: (exIdx: number, setIdx: number, el: HTMLDivElement | null) => void;
}) {
  const [justPr, setJustPr] = useState<string | null>(null);
  const doneCount = exercise.sets.filter((s) => s.done).length;
  const complete = doneCount > 0 && doneCount === exercise.sets.length;
  const refLabel = referenceLabel(reference);
  const [low, high] = exercise.repRange;

  const handleDone = (setIdx: number) => {
    const set = exercise.sets[setIdx];
    if (!set) return;
    if (set.reps <= 0) {
      /* Marcar una serie vacía no confirma nada: se avisa con una vibración
         doble en vez de guardar un cero que ensucie el tonelaje. */
      haptic([14, 60, 14]);
      return;
    }
    if (prE1RM != null && prE1RM > 0 && e1RM(set.weight, set.reps) > prE1RM * 1.005) {
      setJustPr(set.id);
      setTimeout(() => setJustPr(null), 1200);
      haptic([16, 50, 16, 50, 24]);
    } else {
      haptic(14);
    }
    onSetDone(exIdx, setIdx);
  };

  return (
    <motion.section
      layout="position"
      className={cx('card overflow-hidden transition-opacity duration-panel', exercise.skipped && 'opacity-45')}
    >
      <header className="flex items-start gap-3 px-4 pb-3 pt-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-title font-medium text-ink">{exercise.name}</h3>
            {complete && !exercise.skipped && (
              <motion.span
                initial={{ scale: 0.94, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', bounce: 0.28, duration: 0.34 }}
              >
                <Pill tone="accent">Hecho</Pill>
              </motion.span>
            )}
          </div>
          <p className="mt-1 truncate text-micro text-ink-muted">
            {exercise.muscles.map((m) => MUSCLE_LABEL[m.muscle]).join(' · ')}
          </p>
          <p className="tnum mt-0.5 text-micro text-ink-faint">
            {low}–{high} repeticiones
          </p>
        </div>

        <button
          onClick={() => {
            haptic(8);
            toggleSkip(exIdx);
          }}
          className="pressable shrink-0 rounded-md border border-line px-2.5 py-1.5 text-micro font-medium text-ink-faint transition-colors duration-press hover:border-line-strong hover:text-ink"
        >
          {exercise.skipped ? 'Recuperar' : 'Saltar'}
        </button>
      </header>

      {refLabel && !exercise.skipped && (
        <div className="mx-4 mb-1 flex items-center gap-2 border-t border-line pt-2">
          <span className="label">{reference?.source === 'hoja' ? 'De la hoja' : 'Última vez'}</span>
          <span className="tnum truncate text-micro text-ink-muted">{refLabel}</span>
        </div>
      )}

      {!exercise.skipped && (
        <>
          <div className="px-3 pb-1">
            <AnimatePresence initial={false}>
              {exercise.sets.map((set, i) => (
                <div key={set.id}>
                  {/* El descanso medido va justo donde ocurrió: entre la serie
                      anterior y esta. */}
                  {i > 0 && set.restSec != null && <RestDivider seconds={set.restSec} />}
                  <SetRow
                    set={set}
                    index={i}
                    exIdx={exIdx}
                    exercise={exercise}
                    reference={reference}
                    weightStep={weightStep}
                    isPr={justPr === set.id}
                    onDone={handleDone}
                    rowRef={registerRow ? (el) => registerRow(exIdx, i, el) : undefined}
                  />
                </div>
              ))}
            </AnimatePresence>
          </div>

          {/* Quitar afecta a la última serie: es como se piensa («hoy hago una
              menos»), y evita meter una equis en cada fila. */}
          <div className="flex gap-2 px-4 pb-4 pt-2">
            <Button
              size="sm"
              variant="quiet"
              disabled={exercise.sets.length <= 1}
              onClick={() => {
                haptic(8);
                removeSet(exIdx, exercise.sets.length - 1);
              }}
              className="border border-dashed border-line px-3 text-ink-faint hover:border-line-strong hover:text-ink"
            >
              <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4.8 10h10.4" strokeLinecap="round" />
              </svg>
              Quitar
            </Button>
            <Button
              size="sm"
              variant="quiet"
              block
              onClick={() => {
                haptic(8);
                addSet(exIdx);
              }}
              className="border border-dashed border-line text-ink-faint hover:border-line-strong hover:text-ink"
            >
              <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10 4.8v10.4M4.8 10h10.4" strokeLinecap="round" />
              </svg>
              Añadir serie
            </Button>
          </div>
        </>
      )}

      {exercise.skipped && (
        <p className="px-4 pb-4 text-caption text-ink-faint">Fuera del entreno de hoy. La rutina no cambia.</p>
      )}
    </motion.section>
  );
}
