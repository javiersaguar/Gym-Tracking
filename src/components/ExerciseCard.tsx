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

/** Círculo de confirmación de la serie. Es el objetivo táctil más pulsado de
 *  la app, así que ocupa 44 px reales aunque el dibujo sea más pequeño. */
function DoneButton({ done, onToggle }: { done: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      aria-label={done ? 'Deshacer serie' : 'Marcar serie'}
      aria-pressed={done}
      className={cx(
        'pressable grid h-12 w-12 shrink-0 place-items-center rounded-lg border transition-colors duration-press',
        done
          ? 'border-accent bg-accent text-paper'
          : 'border-line bg-paper text-ink-faint hover:border-line-strong hover:text-ink-muted',
      )}
    >
      <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2.4">
        <motion.path
          d="M4.5 10.5l3.6 3.6 7.4-8.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ pathLength: done ? 1 : 0.001, opacity: done ? 1 : 0.45 }}
          transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
        />
      </svg>
    </button>
  );
}

/**
 * Selector de repeticiones en la recámara.
 *
 * Siempre visible, no escondido tras un menú: es el dato que separa «7 y
 * podía con dos más» de «7 y me morí», y sin él no hay forma de saber si una
 * sesión floja fue falta de fuerza o falta de ganas. Cinco botones, un toque.
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
    <div className="flex items-center gap-1.5 pl-6 pr-1">
      <span className="w-9 shrink-0 text-micro text-ink-faint">RIR</span>
      <div className="flex flex-1 gap-1" role="group" aria-label={`Repeticiones en recámara de la serie ${setNumber}`}>
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
                'pressable h-7 flex-1 rounded-md border text-micro font-medium transition-colors duration-press',
                active
                  ? 'border-accent bg-accent text-paper'
                  : 'border-line bg-paper text-ink-faint hover:border-line-strong hover:text-ink',
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
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className={cx(
        'rounded-lg py-1.5',
        set.done && 'bg-accent-wash/60',
        isPr && 'animate-flash-pr',
      )}
    >
      <div className="flex items-center gap-1.5">
      <div className="w-5 shrink-0 text-center">
        <span
          className={cx(
            'tnum text-caption font-medium',
            set.done ? 'text-accent' : 'text-ink-faint',
          )}
        >
          {index + 1}
        </span>
      </div>

      <div className="min-w-0 flex-1">
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
      </div>

      <div className="min-w-0 flex-1">
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
      </div>

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

      <div className="mt-1.5">
        <RirPicker
          value={set.rir}
          setNumber={index + 1}
          onPick={(v) => setRir(exIdx, index, v)}
        />
      </div>

      {set.done && set.restSec != null && (
        <p className="tnum mt-1 pl-6 text-micro text-ink-faint">Descanso previo {clock(set.restSec)}</p>
      )}
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
      /* Marcar una serie vacía no confirma nada: se pone el foco donde falta
         el dato en vez de guardar un cero. */
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
      className={cx(
        'card overflow-hidden transition-opacity duration-panel',
        exercise.skipped && 'opacity-45',
      )}
    >
      <header className="flex items-start gap-3 px-4 pb-3 pt-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-title font-medium text-ink">{exercise.name}</h3>
            {complete && !exercise.skipped && (
              <motion.span
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', bounce: 0.3, duration: 0.32 }}
              >
                <Pill tone="accent">Hecho</Pill>
              </motion.span>
            )}
          </div>
          {/* Una sola cadena: con separadores en elementos aparte, al saltar
              de línea se queda una viñeta huérfana al final. */}
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
        <div className="mx-4 mb-2 flex items-center gap-2 border-t border-line pt-2">
          <span className="label">{reference?.source === 'hoja' ? 'De la hoja' : 'Última vez'}</span>
          <span className="tnum truncate text-micro text-ink-muted">{refLabel}</span>
        </div>
      )}

      {!exercise.skipped && (
        <>
          {/* Cabecera de columnas: así el número va limpio, sin una unidad
              encima que se solape con las cifras de tres dígitos. */}
          <div className="flex items-center gap-1.5 px-3 pb-1.5 pt-1">
            <span className="w-5 shrink-0" />
            <span className="label flex-1 text-center">kg</span>
            <span className="label flex-1 text-center">reps</span>
            <span className="w-12 shrink-0" />
          </div>

          <div className="space-y-1 px-3 pb-1">
            <AnimatePresence initial={false}>
              {exercise.sets.map((set, i) => (
                <SetRow
                  key={set.id}
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
              ))}
            </AnimatePresence>
          </div>

          {/* Quitar afecta a la última serie: es como se piensa («hoy hago
              una menos»), y evita meter una equis en cada fila cuando el
              ancho de un móvil ya va justo. */}
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
                <path d="M4.5 10h11" strokeLinecap="round" />
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
                <path d="M10 4.5v11M4.5 10h11" strokeLinecap="round" />
              </svg>
              Añadir serie
            </Button>
          </div>
        </>
      )}

      {exercise.skipped && (
        <p className="px-4 pb-4 text-caption text-ink-faint">
          Fuera del entreno de hoy. La rutina no cambia.
        </p>
      )}
    </motion.section>
  );
}
