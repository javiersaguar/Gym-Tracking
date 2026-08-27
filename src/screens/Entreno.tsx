import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { ExerciseCard } from '../components/ExerciseCard';
import { RestTimer } from '../components/RestTimer';
import { Button, Card, Sheet, cx } from '../components/ui';
import { addExerciseToSession, completeSet, discardSession, finishSession } from '../lib/actions';
import { clock, duration } from '../lib/format';
import { haptic, useKeepAwake, useRestTimer, useTick } from '../lib/hooks';
import { personalBests } from '../lib/metrics';
import { referenceFor } from '../lib/reference';
import { CATALOG_IDS, catalogName } from '../lib/routine';
import type { Session, Store } from '../lib/types';

const FEELINGS = [
  { value: 1, label: 'Fatal', emoji: '😵' },
  { value: 2, label: 'Flojo', emoji: '😕' },
  { value: 3, label: 'Normal', emoji: '🙂' },
  { value: 4, label: 'Bien', emoji: '💪' },
  { value: 5, label: 'Brutal', emoji: '🔥' },
];

export function Entreno({
  store,
  active,
  onFinished,
  onExit,
}: {
  store: Store;
  active: Session;
  onFinished: (sessionId: string) => void;
  onExit: () => void;
}) {
  const timer = useRestTimer(store.settings.restAlert);
  const [adding, setAdding] = useState(false);
  const [closing, setClosing] = useState(false);
  const [feel, setFeel] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useKeepAwake(store.settings.keepAwake);
  useTick(1000);

  const pbs = useMemo(() => personalBests(store.sessions, store.seedRefs), [store.sessions, store.seedRefs]);

  const live = useMemo(() => {
    let done = 0;
    let total = 0;
    for (const ex of active.exercises) {
      if (ex.skipped) continue;
      total += ex.sets.length;
      done += ex.sets.filter((s) => s.done).length;
    }
    return { done, total, pct: total ? (done / total) * 100 : 0 };
  }, [active]);

  /* Qué toca después: la primera serie sin marcar. Es lo que se enseña en el
     cronómetro para no perder el hilo mientras descansas. */
  const nextUp = useMemo(() => {
    for (const ex of active.exercises) {
      if (ex.skipped) continue;
      const idx = ex.sets.findIndex((s) => !s.done);
      if (idx >= 0) return { name: ex.name, setNumber: idx + 1, targetRest: ex.targetRest };
    }
    return null;
  }, [active]);

  const handleSetDone = (exIdx: number, setIdx: number) => {
    const ex = active.exercises[exIdx];
    if (!ex) return;
    /* El descanso real que precede a esta serie: el que sigue corriendo, o
       el que se paró a mano con «Listo» hace un momento y todavía no se ha
       asignado a ninguna serie. */
    const rest = timer.running ? Math.round(timer.stop()) : timer.takePending();
    completeSet(exIdx, setIdx, rest);

    const isLastSet = setIdx === ex.sets.length - 1;
    const isLastExercise = exIdx === active.exercises.length - 1;
    /* Tras la última serie del entreno no hay nada que descansar. */
    if (!(isLastSet && isLastExercise)) timer.start(ex.targetRest, { exIdx, setIdx: setIdx + 1 });
  };

  const elapsed = (Date.now() - active.start) / 1000;

  return (
    <div className="pb-56">
      {/* Cabecera pegajosa: el reloj y el avance son lo único que hay que
          tener siempre a la vista. */}
      <div className="chrome safe-top sticky top-0 z-30 -mx-4 mb-4 border-b border-line px-4 pb-2.5">
        <div className="flex items-center gap-3">
          <button
            onClick={onExit}
            aria-label="Volver"
            className="pressable -ml-1.5 grid h-9 w-9 shrink-0 place-items-center rounded-full text-content-muted hover:bg-white/6 hover:text-content"
          >
            <svg viewBox="0 0 20 20" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 4.5L6.5 10l5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-title font-semibold">{active.dayName}</h1>
            <p className="tnum text-micro text-content-faint">
              {clock(elapsed)} · {live.done}/{live.total} series
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setClosing(true)}>
            Terminar
          </Button>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.06]">
          <motion.span
            className="block h-full rounded-full bg-brand"
            initial={false}
            animate={{ width: `${live.pct}%` }}
            transition={{ type: 'spring', bounce: 0, duration: 0.5 }}
          />
        </div>
      </div>

      <div className="space-y-3">
        {active.exercises.map((ex, i) => (
          <ExerciseCard
            key={`${ex.exerciseId}-${i}`}
            exercise={ex}
            exIdx={i}
            reference={referenceFor(store, ex.exerciseId, active.id)}
            weightStep={store.settings.weightStep}
            prE1RM={pbs.get(ex.exerciseId)?.e1rm ?? null}
            onSetDone={handleSetDone}
          />
        ))}

        <Button variant="quiet" block onClick={() => setAdding(true)} className="border border-dashed border-line py-6">
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10 4.5v11M4.5 10h11" strokeLinecap="round" />
          </svg>
          Añadir un ejercicio a este entreno
        </Button>

        <button
          onClick={() => setConfirmDiscard(true)}
          className="w-full py-3 text-center text-micro font-medium text-content-faint transition-colors hover:text-danger"
        >
          Descartar este entreno
        </button>
      </div>

      {/* Cronómetro y cierre, flotando por encima del contenido. */}
      <div className="safe-bottom fixed inset-x-0 bottom-0 z-40 mx-auto max-w-lg px-4 pb-2">
        <RestTimer
          timer={timer}
          contextLabel={nextUp ? `Luego: ${nextUp.name} · serie ${nextUp.setNumber}` : 'Última serie del entreno'}
          defaultTarget={nextUp?.targetRest ?? store.settings.defaultRest}
          onFinish={() => haptic(12)}
        />
      </div>

      <AddExerciseSheet open={adding} onClose={() => setAdding(false)} />

      <Sheet
        open={closing}
        onClose={() => setClosing(false)}
        title="Cerrar el entreno"
        footer={
          <div className="flex gap-2 pb-1">
            <Button variant="ghost" block onClick={() => setClosing(false)}>
              Seguir
            </Button>
            <Button
              variant="primary"
              block
              buzz
              onClick={() => {
                if (timer.running) timer.stop();
                const id = finishSession(feel, note.trim() || undefined);
                setClosing(false);
                if (id) onFinished(id);
              }}
            >
              Terminar y ver análisis
            </Button>
          </div>
        }
      >
        <div className="space-y-4 pb-2">
          <Card className="grid grid-cols-3 gap-3 p-3.5">
            <div>
              <p className="text-micro uppercase tracking-[0.08em] text-content-faint">Duración</p>
              <p className="tnum mt-0.5 text-title font-semibold text-white">{duration(elapsed)}</p>
            </div>
            <div>
              <p className="text-micro uppercase tracking-[0.08em] text-content-faint">Series</p>
              <p className="tnum mt-0.5 text-title font-semibold text-white">
                {live.done}
                <span className="text-caption text-content-faint">/{live.total}</span>
              </p>
            </div>
            <div>
              <p className="text-micro uppercase tracking-[0.08em] text-content-faint">Descanso medio</p>
              <p className="tnum mt-0.5 text-title font-semibold text-white">{avgRestLabel(active)}</p>
            </div>
          </Card>

          <div>
            <p className="mb-2 text-caption font-medium text-content">¿Cómo ha ido?</p>
            <div className="flex gap-1.5">
              {FEELINGS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => {
                    haptic(8);
                    setFeel(f.value);
                  }}
                  className={cx(
                    'pressable flex flex-1 flex-col items-center gap-1 rounded-xl border py-2.5 transition-colors duration-press',
                    feel === f.value ? 'border-brand/45 bg-brand/12' : 'border-line bg-surface-sunken/60 hover:border-line-strong',
                  )}
                >
                  <span className="text-body-lg">{f.emoji}</span>
                  <span className={cx('text-micro font-semibold', feel === f.value ? 'text-brand-bright' : 'text-content-faint')}>
                    {f.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="nota" className="mb-1.5 block text-caption font-medium text-content">
              Nota <span className="text-content-faint">(opcional)</span>
            </label>
            <textarea
              id="nota"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Molestia en el hombro, mucha cola en la prensa…"
              className="w-full resize-none rounded-xl border border-line bg-surface-sunken px-3.5 py-2.5 text-body text-content outline-none transition duration-200 placeholder:text-content-faint focus:border-brand/50 focus:ring-4 focus:ring-brand/10"
            />
          </div>

          {live.done < live.total && (
            <p className="text-caption text-content-muted">
              Quedan {live.total - live.done} series sin marcar. No se guardan: el análisis solo cuenta lo hecho.
            </p>
          )}
        </div>
      </Sheet>

      <Sheet open={confirmDiscard} onClose={() => setConfirmDiscard(false)} title="Descartar el entreno">
        <p className="pb-4 text-body text-content-muted">
          Se borra todo lo apuntado en esta sesión y no se puede recuperar.
        </p>
        <div className="flex gap-2 pb-4">
          <Button variant="ghost" block onClick={() => setConfirmDiscard(false)}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            block
            buzz
            onClick={() => {
              if (timer.running) timer.stop();
              discardSession();
              setConfirmDiscard(false);
              onExit();
            }}
          >
            Descartar
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

function avgRestLabel(session: Session): string {
  const rests: number[] = [];
  for (const ex of session.exercises) {
    for (const s of ex.sets) if (s.done && s.restSec != null) rests.push(s.restSec);
  }
  if (!rests.length) return '—';
  return clock(rests.reduce((a, b) => a + b, 0) / rests.length);
}

function AddExerciseSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CATALOG_IDS.map((id) => ({ id, name: catalogName(id) }))
      .filter((x) => !q || x.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [query]);

  return (
    <Sheet open={open} onClose={onClose} title="Añadir ejercicio">
      <p className="pb-3 text-caption text-content-muted">Solo para el entreno de hoy. La rutina no se toca.</p>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar…"
        className="mb-3 w-full rounded-xl border border-line bg-surface-sunken px-3.5 py-2.5 text-body text-content outline-none transition duration-200 placeholder:text-content-faint focus:border-brand/50 focus:ring-4 focus:ring-brand/10"
      />
      <ul className="space-y-1 pb-4">
        <AnimatePresence initial={false}>
          {list.map((x) => (
            <motion.li key={x.id} layout="position" exit={{ opacity: 0 }}>
              <button
                onClick={() => {
                  haptic();
                  addExerciseToSession(x.id, 2);
                  onClose();
                }}
                className="pressable flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-surface-sunken/60 px-3.5 py-3 text-left transition-colors duration-press hover:border-line-strong"
              >
                <span className="truncate text-body font-medium text-content">{x.name}</span>
                <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-content-faint" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10 4.5v11M4.5 10h11" strokeLinecap="round" />
                </svg>
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
        {!list.length && <li className="py-6 text-center text-caption text-content-faint">Nada con ese nombre.</li>}
      </ul>
    </Sheet>
  );
}
