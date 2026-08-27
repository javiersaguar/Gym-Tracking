import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { ExerciseCard } from '../components/ExerciseCard';
import { RestTimer } from '../components/RestTimer';
import { Button, Card, Scale, Sheet } from '../components/ui';
import { addExerciseToSession, completeSet, discardSession, finishSession } from '../lib/actions';
import { clock, duration, plural } from '../lib/format';
import { haptic, useKeepAwake, useRestTimer, useTick } from '../lib/hooks';
import { personalBests } from '../lib/metrics';
import { referenceFor } from '../lib/reference';
import { CATALOG_IDS, catalogName } from '../lib/routine';
import type { Session, Store } from '../lib/types';

/* Escala ordinal, sin caritas: en una interfaz de datos los emojis leen como
   decoración y el orden se entiende mejor si lo dibuja el propio control. */
const FEELINGS = [
  { value: 1, label: 'Fatal' },
  { value: 2, label: 'Flojo' },
  { value: 3, label: 'Normal' },
  { value: 4, label: 'Bien' },
  { value: 5, label: 'Brutal' },
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
      <div className="chrome safe-top sticky top-0 z-30 -mx-6 mb-5 border-b border-line px-6 pb-2.5">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <button
            onClick={onExit}
            aria-label="Volver"
            className="pressable -ml-2 grid h-9 w-9 shrink-0 place-items-center rounded-md text-ink-faint transition-colors hover:bg-sunken hover:text-ink"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9">
              <path d="M11.5 4.5L6 10l5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-title font-medium">{active.dayName}</h1>
            <p className="tnum text-micro text-ink-faint">
              {clock(elapsed)} · {live.done}/{live.total} series
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setClosing(true)}>
            Terminar
          </Button>
        </div>
        <div className="mx-auto mt-2 h-[3px] max-w-lg overflow-hidden rounded-full bg-line-soft">
          <motion.span
            className="block h-full rounded-full bg-accent"
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

        <Button variant="quiet" block onClick={() => setAdding(true)} className="h-auto border border-dashed border-line py-5 text-ink-faint hover:text-ink">
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10 4.5v11M4.5 10h11" strokeLinecap="round" />
          </svg>
          Añadir un ejercicio a este entreno
        </Button>

        <button
          onClick={() => setConfirmDiscard(true)}
          className="w-full py-3 text-center text-micro text-ink-faint transition-colors hover:text-bad-ink"
        >
          Descartar este entreno
        </button>
      </div>

      {/* Cronómetro y cierre, flotando por encima del contenido. */}
      <div className="safe-bottom fixed inset-x-0 bottom-0 z-40 mx-auto max-w-lg px-4 pb-3">
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
            <Button variant="outline" block onClick={() => setClosing(false)}>
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
          <Card className="grid grid-cols-3 gap-4 p-5">
            <div>
              <p className="label">Duración</p>
              <p className="tnum mt-1.5 text-figure font-medium">{duration(elapsed)}</p>
            </div>
            <div>
              <p className="label">Series</p>
              <p className="tnum mt-1.5 text-figure font-medium">
                {live.done}
                <span className="text-caption text-ink-faint">/{live.total}</span>
              </p>
            </div>
            <div>
              <p className="label">Descanso medio</p>
              <p className="tnum mt-1.5 text-figure font-medium">{avgRestLabel(active)}</p>
            </div>
          </Card>

          <div>
            <p className="mb-2.5 text-caption font-medium text-ink">¿Cómo ha ido?</p>
            <Scale options={FEELINGS} value={feel} onChange={setFeel} />
          </div>

          <div>
            <label htmlFor="nota" className="mb-1.5 block text-caption font-medium text-ink">
              Nota <span className="font-normal text-ink-faint">(opcional)</span>
            </label>
            <textarea
              id="nota"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Molestia en el hombro, mucha cola en la prensa…"
              className="w-full resize-none rounded-lg border border-line bg-paper px-3.5 py-2.5 text-body text-ink outline-none transition duration-200 placeholder:text-ink-faint/70 focus:border-accent/50 focus:ring-4 focus:ring-accent/12"
            />
          </div>

          {live.done < live.total && (
            <p className="text-caption text-ink-muted">
              Quedan {plural(live.total - live.done, 'serie')} sin marcar. No se guardan: el análisis solo cuenta lo
              hecho.
            </p>
          )}
        </div>
      </Sheet>

      <Sheet open={confirmDiscard} onClose={() => setConfirmDiscard(false)} title="Descartar el entreno">
        <p className="pb-4 text-body text-ink-muted">
          Se borra todo lo apuntado en esta sesión y no se puede recuperar.
        </p>
        <div className="flex gap-2 pb-4">
          <Button variant="outline" block onClick={() => setConfirmDiscard(false)}>
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
      <p className="pb-4 text-caption text-ink-muted">Solo para el entreno de hoy. La rutina no se toca.</p>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar…"
        className="mb-3 w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-body text-ink outline-none transition duration-200 placeholder:text-ink-faint/70 focus:border-accent/50 focus:ring-4 focus:ring-accent/12"
      />
      <ul className="border-t border-line pb-4">
        <AnimatePresence initial={false}>
          {list.map((x) => (
            <motion.li key={x.id} layout="position" exit={{ opacity: 0 }}>
              <button
                onClick={() => {
                  haptic();
                  addExerciseToSession(x.id, 2);
                  onClose();
                }}
                className="flex w-full items-center justify-between gap-3 border-b border-line py-3.5 text-left transition-colors duration-press hover:bg-canvas"
              >
                <span className="truncate text-body text-ink">{x.name}</span>
                <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-ink-faint" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M10 4.8v10.4M4.8 10h10.4" strokeLinecap="round" />
                </svg>
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
        {!list.length && <li className="py-8 text-caption text-ink-faint">Nada con ese nombre.</li>}
      </ul>
    </Sheet>
  );
}
