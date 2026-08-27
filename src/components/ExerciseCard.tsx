import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { addSet, patchSet, removeSet, toggleSkip, uncompleteSet } from '../lib/actions';
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
        'pressable grid h-12 w-12 shrink-0 place-items-center rounded-xl border transition-colors duration-press',
        done
          ? 'border-brand/45 bg-brand text-white shadow-glow-brand'
          : 'border-line bg-surface-sunken/80 text-content-faint hover:border-line-strong hover:text-content',
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

function SetRow({
  set,
  index,
  exIdx,
  exercise,
  reference,
  weightStep,
  isPr,
  onDone,
}: {
  set: LoggedSet;
  index: number;
  exIdx: number;
  exercise: LoggedExercise;
  reference: Reference | null;
  weightStep: number;
  isPr: boolean;
  onDone: (setIdx: number) => void;
}) {
  const ref = reference?.sets[index];
  const [low, high] = exercise.repRange;
  const inRange = set.reps >= low && set.reps <= high;

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginTop: 0 }}
      transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
      className={cx(
        'flex items-center gap-1.5 rounded-xl py-1',
        set.done && 'bg-white/[0.025]',
        isPr && 'animate-flash-pr',
      )}
    >
      <div className="w-5 shrink-0 text-center">
        <span
          className={cx(
            'tnum text-caption font-semibold',
            set.done ? 'text-brand-bright' : 'text-content-faint',
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
          tone={set.reps > 0 && inRange ? 'brand' : 'default'}
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
}: {
  exercise: LoggedExercise;
  exIdx: number;
  reference: Reference | null;
  weightStep: number;
  /** Mejor 1RM estimado histórico: sirve para marcar la serie que lo bate. */
  prE1RM: number | null;
  onSetDone: (exIdx: number, setIdx: number) => void;
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
      <header className="flex items-start gap-3 px-3.5 pb-2.5 pt-3.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-title font-semibold text-white">{exercise.name}</h3>
            {complete && !exercise.skipped && (
              <motion.span
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', bounce: 0.3, duration: 0.32 }}
              >
                <Pill tone="brand">Hecho</Pill>
              </motion.span>
            )}
          </div>
          {/* Una sola cadena: con separadores en elementos aparte, al saltar
              de línea se queda una viñeta huérfana al final. */}
          <p className="mt-1 truncate text-micro text-content-muted">
            {exercise.muscles.map((m) => MUSCLE_LABEL[m.muscle]).join(' · ')}
          </p>
          <p className="tnum mt-0.5 text-micro text-content-faint">
            {low}–{high} reps · {clock(exercise.targetRest)} de descanso
          </p>
        </div>

        <button
          onClick={() => {
            haptic(8);
            toggleSkip(exIdx);
          }}
          className="pressable shrink-0 rounded-lg border border-line px-2.5 py-1.5 text-micro font-semibold text-content-faint transition-colors duration-press hover:border-line-strong hover:text-content"
        >
          {exercise.skipped ? 'Recuperar' : 'Saltar'}
        </button>
      </header>

      {refLabel && !exercise.skipped && (
        <div className="mx-3.5 mb-2 flex items-center gap-2 rounded-lg bg-white/[0.03] px-2.5 py-1.5">
          <span className="text-micro font-semibold uppercase tracking-[0.07em] text-content-faint">
            {reference?.source === 'hoja' ? 'De la hoja' : 'Última vez'}
          </span>
          <span className="tnum truncate text-micro text-content-muted">{refLabel}</span>
        </div>
      )}

      {!exercise.skipped && (
        <>
          {/* Cabecera de columnas: así el número va limpio, sin una unidad
              encima que se solape con las cifras de tres dígitos. */}
          <div className="flex items-center gap-1.5 px-2.5 pb-1 pt-0.5">
            <span className="w-5 shrink-0" />
            <span className="flex-1 text-center text-micro font-semibold uppercase tracking-[0.08em] text-content-faint">
              kg
            </span>
            <span className="flex-1 text-center text-micro font-semibold uppercase tracking-[0.08em] text-content-faint">
              reps
            </span>
            <span className="w-12 shrink-0" />
          </div>

          <div className="space-y-1 px-2.5 pb-1">
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
                />
              ))}
            </AnimatePresence>
          </div>

          {/* Quitar afecta a la última serie: es como se piensa («hoy hago
              una menos»), y evita meter una equis en cada fila cuando el
              ancho de un móvil ya va justo. */}
          <div className="flex gap-2 px-3.5 pb-3 pt-1.5">
            <Button
              size="sm"
              variant="quiet"
              disabled={exercise.sets.length <= 1}
              onClick={() => {
                haptic(8);
                removeSet(exIdx, exercise.sets.length - 1);
              }}
              className="border border-dashed border-line px-3 hover:border-line-strong"
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
              className="border border-dashed border-line hover:border-line-strong"
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
        <p className="px-3.5 pb-4 text-caption text-content-faint">
          Fuera del entreno de hoy. La rutina no cambia.
        </p>
      )}
    </motion.section>
  );
}
