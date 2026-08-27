import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { Button, Card, Pill, SectionTitle, Sheet, cx } from '../components/ui';
import {
  addExerciseToDay,
  moveExerciseInDay,
  removeExerciseFromDay,
  setPlannedSets,
  setTargetRest,
} from '../lib/actions';
import { clock, plural } from '../lib/format';
import { haptic } from '../lib/hooks';
import { CATALOG_IDS, catalogName } from '../lib/routine';
import { MUSCLE_LABEL, type Day, type Store } from '../lib/types';

export function Rutina({
  store,
  onStart,
  onNavigate,
}: {
  store: Store;
  onStart: (dayId: string) => void;
  onNavigate: (to: string) => void;
}) {
  const days = store.routine.days;
  const [dayId, setDayId] = useState<string>(days.find((d) => !d.rest)?.id ?? (days[0] as Day).id);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);

  const day = days.find((d) => d.id === dayId) ?? (days[0] as Day);
  const totalSets = day.exercises.reduce((a, e) => a + e.plannedSets, 0);
  const estimated = useMemo(
    () =>
      day.exercises.reduce((a, e) => a + e.plannedSets * (e.targetRest + 40), 0),
    [day],
  );

  return (
    <div className="space-y-8 pb-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-display-lg">Rutina</h1>
          <p className="mt-3 text-caption text-ink-muted">{store.routine.name} · se aplica al próximo entreno</p>
        </div>
        <button
          onClick={() => onNavigate('/ajustes')}
          aria-label="Ajustes"
          className="pressable grid h-10 w-10 shrink-0 place-items-center rounded-md border border-line bg-paper text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
            <circle cx="10" cy="10" r="2.5" />
            <path d="M10 2.8v1.7M10 15.5v1.7M17.2 10h-1.7M4.5 10H2.8M15.1 4.9l-1.2 1.2M6.1 13.9l-1.2 1.2M15.1 15.1l-1.2-1.2M6.1 6.1L4.9 4.9" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      {/* Selector de día. Se ve el ciclo entero de un vistazo. */}
      <div className="no-scrollbar -mx-6 flex gap-2 overflow-x-auto px-6">
        {days.map((d) => (
          <button
            key={d.id}
            onClick={() => {
              haptic(8);
              setDayId(d.id);
            }}
            className={cx(
              'pressable flex shrink-0 flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors duration-panel',
              d.id === dayId ? 'border-accent/40 bg-accent-wash' : 'border-line bg-paper hover:border-line-strong',
            )}
          >
            <span className={cx('tnum text-micro', d.id === dayId ? 'font-semibold text-accent-deep' : 'text-ink-faint')}>
              {String(d.index).padStart(2, '0')}
            </span>
            <span className={cx('text-caption font-medium', d.rest ? 'text-ink-faint' : 'text-ink')}>{d.short}</span>
          </button>
        ))}
      </div>

      <Card className="p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate font-display text-display">{day.name}</h2>
            <p className="tnum mt-2 text-caption text-ink-muted">
              {day.rest
                ? 'Día de descanso del ciclo'
                : `${plural(day.exercises.length, 'ejercicio')} · ${plural(totalSets, 'serie')} · ~${Math.round(estimated / 60)} min`}
            </p>
          </div>
          {!day.rest && (
            <Button size="sm" variant="primary" buzz onClick={() => onStart(day.id)}>
              Entrenar
            </Button>
          )}
        </div>
      </Card>

      {day.rest ? (
        <Card className="p-8">
          <p className="font-display text-display text-ink">Descanso</p>
          <p className="mt-3 max-w-sm text-body text-ink-muted">
            No hay nada que editar. Si algún día quieres entrenar igualmente, elige otro día del ciclo y dale a
            «Entrenar».
          </p>
        </Card>
      ) : (
        <>
          <SectionTitle>Ejercicios</SectionTitle>
          <ul className="space-y-2">
            <AnimatePresence initial={false}>
              {day.exercises.map((ex, i) => (
                <motion.li
                  key={`${ex.id}-${i}`}
                  layout="position"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0, marginTop: 0 }}
                  transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                >
                  <Card className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-body font-medium text-ink">{ex.name}</p>
                        <p className="mt-1 truncate text-micro text-ink-faint">
                          {ex.muscles.map((m) => `${MUSCLE_LABEL[m.muscle]} ${Math.round(m.share * 100)} %`).join(' · ')}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-0.5">
                        <IconBtn
                          label="Subir"
                          disabled={i === 0}
                          onClick={() => moveExerciseInDay(day.id, i, i - 1)}
                          d="M10 15.5v-11M5.5 9L10 4.5 14.5 9"
                        />
                        <IconBtn
                          label="Bajar"
                          disabled={i === day.exercises.length - 1}
                          onClick={() => moveExerciseInDay(day.id, i, i + 1)}
                          d="M10 4.5v11M5.5 11l4.5 4.5L14.5 11"
                        />
                        <IconBtn
                          label="Quitar"
                          danger
                          onClick={() => setRemoving(i)}
                          d="M5 5l10 10M15 5L5 15"
                        />
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Adjuster
                        label="Series"
                        value={String(ex.plannedSets)}
                        onDown={() => setPlannedSets(day.id, i, ex.plannedSets - 1)}
                        onUp={() => setPlannedSets(day.id, i, ex.plannedSets + 1)}
                        downDisabled={ex.plannedSets <= 1}
                        upDisabled={ex.plannedSets >= 10}
                      />
                      <Adjuster
                        label="Descanso"
                        value={clock(ex.targetRest)}
                        onDown={() => setTargetRest(day.id, i, ex.targetRest - 15)}
                        onUp={() => setTargetRest(day.id, i, ex.targetRest + 15)}
                        downDisabled={ex.targetRest <= 15}
                        upDisabled={ex.targetRest >= 600}
                      />
                    </div>

                    <p className="mt-2.5 text-micro text-ink-faint">
                      Objetivo {ex.repRange[0]}–{ex.repRange[1]} repeticiones
                      {ex.notes && <span className="text-ink-muted"> · {ex.notes}</span>}
                    </p>
                  </Card>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>

          <Button variant="quiet" block onClick={() => setAdding(true)} className="h-auto border border-dashed border-line py-4 text-ink-faint hover:text-ink">
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10 4.5v11M4.5 10h11" strokeLinecap="round" />
            </svg>
            Añadir ejercicio al día {day.index}
          </Button>

          <p className="max-w-md text-micro text-ink-faint">
            Los cambios aquí valen para los próximos entrenos. Las sesiones ya guardadas conservan lo que hiciste ese
            día.
          </p>
        </>
      )}

      <Sheet open={adding} onClose={() => setAdding(false)} title={`Añadir al día ${day.index}`}>
        <AddList
          onPick={(id) => {
            haptic();
            addExerciseToDay(day.id, id, 2);
            setAdding(false);
          }}
        />
      </Sheet>

      <Sheet open={removing != null} onClose={() => setRemoving(null)} title="Quitar de la rutina">
        <p className="pb-4 text-body text-ink-muted">
          {removing != null && day.exercises[removing]
            ? `«${day.exercises[removing]?.name}» deja de aparecer en el día ${day.index}. Tus sesiones anteriores no cambian.`
            : ''}
        </p>
        <div className="flex gap-2 pb-4">
          <Button variant="outline" block onClick={() => setRemoving(null)}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            block
            buzz
            onClick={() => {
              if (removing != null) removeExerciseFromDay(day.id, removing);
              setRemoving(null);
            }}
          >
            Quitar
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

function IconBtn({
  label,
  d,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  d: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        haptic(8);
        onClick();
      }}
      className={cx(
        'pressable grid h-8 w-8 place-items-center rounded-md transition-colors duration-press',
        'disabled:pointer-events-none disabled:opacity-25',
        danger ? 'text-ink-faint hover:bg-bad-wash hover:text-bad-ink' : 'text-ink-faint hover:bg-sunken hover:text-ink',
      )}
    >
      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
        <path d={d} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function Adjuster({
  label,
  value,
  onDown,
  onUp,
  downDisabled,
  upDisabled,
}: {
  label: string;
  value: string;
  onDown: () => void;
  onUp: () => void;
  downDisabled?: boolean;
  upDisabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-line bg-canvas p-1">
      <button
        aria-label={`Bajar ${label.toLowerCase()}`}
        disabled={downDisabled}
        onClick={() => {
          haptic(8);
          onDown();
        }}
        className="pressable grid h-9 w-9 shrink-0 place-items-center rounded-md text-ink-faint transition-colors duration-press hover:bg-paper hover:text-ink disabled:pointer-events-none disabled:opacity-25"
      >
        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4.8 10h10.4" strokeLinecap="round" />
        </svg>
      </button>
      <span className="min-w-0 flex-1 text-center">
        <span className="block text-micro text-ink-faint">{label}</span>
        <span className="tnum block text-caption font-medium text-ink">{value}</span>
      </span>
      <button
        aria-label={`Subir ${label.toLowerCase()}`}
        disabled={upDisabled}
        onClick={() => {
          haptic(8);
          onUp();
        }}
        className="pressable grid h-9 w-9 shrink-0 place-items-center rounded-md text-ink-faint transition-colors duration-press hover:bg-paper hover:text-ink disabled:pointer-events-none disabled:opacity-25"
      >
        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10 4.8v10.4M4.8 10h10.4" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

function AddList({ onPick }: { onPick: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CATALOG_IDS.map((id) => ({ id, name: catalogName(id) }))
      .filter((x) => !q || x.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [query]);

  return (
    <>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar ejercicio…"
        className="mb-3 w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-body text-ink outline-none transition duration-200 placeholder:text-ink-faint/70 focus:border-accent/50 focus:ring-4 focus:ring-accent/12"
      />
      <ul className="border-t border-line pb-4">
        {list.map((x) => (
          <li key={x.id}>
            <button
              onClick={() => onPick(x.id)}
              className="flex w-full items-center justify-between gap-3 border-b border-line py-3.5 text-left transition-colors duration-press hover:bg-canvas"
            >
              <span className="truncate text-body text-ink">{x.name}</span>
              <Pill>2 series</Pill>
            </button>
          </li>
        ))}
        {!list.length && <li className="py-8 text-caption text-ink-faint">Nada con ese nombre.</li>}
      </ul>
    </>
  );
}
