import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { BodyMap, ComponentBar } from '../components/BodyMap';
import { BarList, Spark, TrendLine, type BarDatum } from '../components/charts';
import { MiniBars, RestScatter } from '../components/charts-extra';
import { Card, Empty, Pill, SectionTitle, Segmented, Stat, cx } from '../components/ui';
import { duration, kg, plural, signedPct, tonnage } from '../lib/format';
import { haptic } from '../lib/hooks';
import {
  balance,
  exerciseSeries,
  exerciseVolumes,
  muscleSeries,
  personalBests,
  repMaxTable,
  restVsPerformance,
  sessionStats,
  trendPct,
} from '../lib/metrics';
import { muscleStates, stateLabel } from '../lib/muscleState';
import { catalogName } from '../lib/routine';
import { MUSCLE_LABEL, type Muscle, type Store } from '../lib/types';

/** Tramos de días. El usuario elige cuánto mira hacia atrás en cada apartado. */
const WINDOWS = [
  { value: '7', label: '7 d' },
  { value: '14', label: '14 d' },
  { value: '30', label: '30 d' },
  { value: '90', label: '90 d' },
  { value: '365', label: 'Año' },
] as const;

type Win = (typeof WINDOWS)[number]['value'];

type Tab = 'mapa' | 'kilos' | 'fuerza' | 'descanso';

const TABS: { value: Tab; label: string }[] = [
  { value: 'mapa', label: 'Mapa' },
  { value: 'kilos', label: 'Kilos' },
  { value: 'fuerza', label: 'Fuerza' },
  { value: 'descanso', label: 'Descanso' },
];

export function Progreso({ store }: { store: Store }) {
  const [win, setWin] = useState<Win>('30');
  const [tab, setTab] = useState<Tab>('mapa');
  const days = Number(win);

  const totals = useMemo(() => {
    const from = Date.now() - days * 86_400_000;
    const inWindow = store.sessions.filter((s) => s.start >= from).map(sessionStats);
    return {
      sessions: inWindow.length,
      tonnage: inWindow.reduce((a, b) => a + b.tonnage, 0),
      sets: inWindow.reduce((a, b) => a + b.sets, 0),
      time: inWindow.reduce((a, b) => a + b.durationSec, 0),
    };
  }, [store.sessions, days]);

  if (!store.sessions.length) {
    return (
      <div className="space-y-8 pb-8">
        <header>
          <h1 className="font-display text-display-lg">Progreso</h1>
        </header>
        <Empty
          title="Todavía no hay nada que medir"
          body="En cuanto cierres el primer entreno aparecerán aquí el mapa muscular, los kilos por grupo y la evolución de cada ejercicio."
        />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-8">
      <header>
        <h1 className="font-display text-display-lg">Progreso</h1>
        <div className="no-scrollbar -mx-6 mt-4 flex gap-1.5 overflow-x-auto px-6">
          {WINDOWS.map((w) => (
            <button
              key={w.value}
              onClick={() => {
                haptic(8);
                setWin(w.value);
              }}
              aria-pressed={win === w.value}
              className={cx(
                'pressable shrink-0 rounded-md border px-3 py-1.5 text-caption font-medium transition-colors duration-press',
                win === w.value
                  ? 'border-accent bg-accent text-paper'
                  : 'border-line bg-paper text-ink-muted hover:border-line-strong hover:text-ink',
              )}
            >
              {w.label}
            </button>
          ))}
        </div>
      </header>

      <Card className="grid grid-cols-2 gap-x-4 gap-y-5 p-6 sm:grid-cols-4">
        <Stat label="Entrenos" value={totals.sessions} />
        <Stat label="Tonelaje" value={tonnage(totals.tonnage)} tone="accent" />
        <Stat label="Series" value={Math.round(totals.sets)} />
        <Stat label="Tiempo" value={duration(totals.time)} />
      </Card>

      <Segmented className="w-full" options={TABS} value={tab} onChange={setTab} />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="space-y-8"
        >
          {tab === 'mapa' && <MapaTab store={store} days={days} />}
          {tab === 'kilos' && <KilosTab store={store} days={days} />}
          {tab === 'fuerza' && <FuerzaTab store={store} />}
          {tab === 'descanso' && <DescansoTab store={store} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ── Mapa de calor ───────────────────────────────────────────────────────── */

function MapaTab({ store, days }: { store: Store; days: number }) {
  const states = useMemo(() => muscleStates(store.sessions, days), [store.sessions, days]);
  const [picked, setPicked] = useState<Muscle | null>(null);

  const scores = useMemo(() => new Map(states.map((s) => [s.muscle, s.score])), [states]);
  const detail = picked ? states.find((s) => s.muscle === picked) : null;

  return (
    <>
      <section>
        <SectionTitle>Estado por grupo</SectionTitle>
        <p className="mb-5 max-w-md text-caption text-ink-muted">
          El color no son los kilos: es cómo de atendido está el grupo, mezclando volumen semanal, frecuencia, RIR y
          progreso. Toca un músculo para ver el desglose.
        </p>
        <Card className="p-5">
          <BodyMap scores={scores} selected={picked} onSelect={(m) => setPicked(picked === m ? null : m)} />
        </Card>
      </section>

      <AnimatePresence initial={false}>
        {detail && (
          <motion.section
            key={detail.muscle}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
          >
            <Card className="p-5">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-title font-medium">{MUSCLE_LABEL[detail.muscle]}</h3>
                <div className="flex items-center gap-2">
                  <span className="tnum text-figure font-medium text-ink">{detail.score ?? '—'}</span>
                  <Pill tone={scoreTone(detail.score)}>{stateLabel(detail.score)}</Pill>
                </div>
              </div>
              <p className="mt-1.5 text-caption text-ink-muted">{detail.verdict}</p>

              <div className="mt-4 space-y-3">
                {detail.components.map((c) => (
                  <ComponentBar key={c.key} label={c.label} score={c.score} detail={c.detail} />
                ))}
              </div>
            </Card>
          </motion.section>
        )}
      </AnimatePresence>

      <section>
        <SectionTitle>Ranking</SectionTitle>
        <ul className="border-t border-line">
          {states.map((s) => (
            <li key={s.muscle}>
              <button
                onClick={() => setPicked(picked === s.muscle ? null : s.muscle)}
                className="flex w-full items-center gap-4 border-b border-line py-3 text-left transition-colors duration-press hover:bg-paper"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-body text-ink">{MUSCLE_LABEL[s.muscle]}</span>
                  <span className="tnum block text-micro text-ink-faint">
                    {s.sets > 0 ? `${s.setsPerWeek.toFixed(1)} series/sem · ${tonnage(s.tonnage)}` : 'sin trabajo'}
                  </span>
                </span>
                <span className="tnum w-9 shrink-0 text-right text-caption font-medium text-ink">
                  {s.score ?? '—'}
                </span>
                <span className="h-[6px] w-16 shrink-0 overflow-hidden rounded-[3px] bg-line-soft">
                  <span
                    className="block h-full rounded-[3px] bg-accent"
                    style={{ width: `${s.score ?? 0}%`, transition: 'width 420ms cubic-bezier(.16,1,.3,1)' }}
                  />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function scoreTone(score: number | null): 'neutral' | 'good' | 'warn' | 'bad' {
  if (score == null) return 'neutral';
  if (score >= 75) return 'good';
  if (score >= 50) return 'neutral';
  if (score >= 25) return 'warn';
  return 'bad';
}

/* ── Kilos ───────────────────────────────────────────────────────────────── */

function KilosTab({ store, days }: { store: Store; days: number }) {
  const bars = useMemo(() => balance(store.sessions, days), [store.sessions, days]);
  const byExercise = useMemo(() => exerciseVolumes(store.sessions, days), [store.sessions, days]);

  const muscleData: BarDatum[] = bars
    .filter((b) => b.tonnage > 0)
    .map((b) => ({
      key: b.muscle,
      label: MUSCLE_LABEL[b.muscle],
      value: b.tonnage,
      display: tonnage(b.tonnage),
      note: `${b.sets.toFixed(1)} series · ${b.sharePct.toFixed(0)} % del total`,
    }));

  const exerciseData: BarDatum[] = byExercise.map((e) => ({
    key: e.exerciseId,
    label: e.name,
    value: e.tonnage,
    display: tonnage(e.tonnage),
    note: `${plural(e.sets, 'serie')} · ${e.reps} reps · ${plural(e.sessions, 'sesión', 'sesiones')}`,
  }));

  const total = bars.reduce((a, b) => a + b.tonnage, 0);

  return (
    <>
      <section>
        <SectionTitle>Kilos por músculo</SectionTitle>
        <p className="mb-5 max-w-md text-caption text-ink-muted">
          Peso × repeticiones de cada serie, repartido según cuánto recae sobre cada músculo. Total del periodo:{' '}
          <span className="font-medium text-ink">{tonnage(total)}</span>.
        </p>
        <BarList data={muscleData} emptyLabel="Sin trabajo en este periodo" />
      </section>

      <section>
        <SectionTitle>Kilos por ejercicio</SectionTitle>
        <p className="mb-5 max-w-md text-caption text-ink-muted">
          Lo mismo, pero sin repartir: el tonelaje entero de cada ejercicio.
        </p>
        <BarList data={exerciseData} emptyLabel="Sin ejercicios en este periodo" />
      </section>
    </>
  );
}

/* ── Fuerza ──────────────────────────────────────────────────────────────── */

function FuerzaTab({ store }: { store: Store }) {
  const trackable = useMemo(() => {
    const count = new Map<string, number>();
    for (const s of store.sessions) {
      for (const ex of s.exercises) {
        if (ex.sets.some((x) => x.done && x.reps > 0)) count.set(ex.exerciseId, (count.get(ex.exerciseId) ?? 0) + 1);
      }
    }
    return [...count.entries()]
      .map(([id, n]) => ({ id, name: catalogName(id), sessions: n }))
      .sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name, 'es'));
  }, [store.sessions]);

  const [picked, setPicked] = useState<string | null>(null);
  const selected = picked ?? trackable[0]?.id ?? null;

  const pbs = useMemo(() => personalBests(store.sessions, store.seedRefs), [store.sessions, store.seedRefs]);
  const series = useMemo(() => (selected ? exerciseSeries(store.sessions, selected) : null), [store.sessions, selected]);
  const reps = useMemo(() => (selected ? repMaxTable(store.sessions, selected) : []), [store.sessions, selected]);
  const trend = series ? trendPct(series.e1rm) : null;

  const muscles = useMemo(() => balance(store.sessions, 3650).filter((b) => b.sets > 0), [store.sessions]);
  const [muscle, setMuscle] = useState<Muscle | null>(null);
  const selMuscle = muscle ?? muscles[0]?.muscle ?? null;
  const mSeries = useMemo(() => (selMuscle ? muscleSeries(store.sessions, selMuscle) : []), [store.sessions, selMuscle]);

  if (!trackable.length || !series || !selected) {
    return <Empty title="Sin ejercicios registrados" body="Cierra un entreno y aquí aparecerá su evolución." />;
  }

  return (
    <>
      <section>
        <SectionTitle>Por ejercicio</SectionTitle>
        <Chips items={trackable.map((t) => ({ id: t.id, label: t.name }))} value={selected} onPick={setPicked} />

        <div className="mt-5 flex items-end justify-between gap-3">
          <div>
            <p className="text-caption font-medium text-ink">1RM estimado</p>
            <p className="text-micro text-ink-faint">Epley sobre tu mejor serie de cada sesión</p>
          </div>
          {trend != null && (
            <Pill tone={trend > 1 ? 'good' : trend < -1 ? 'warn' : 'neutral'}>{signedPct(trend, 1)}</Pill>
          )}
        </div>
        <TrendLine points={series.e1rm} format={(v) => `${kg(v, 0)} kg`} />

        {series.tonnage.length > 1 && (
          <div className="mt-6">
            <p className="mb-2 text-caption font-medium text-ink">Tonelaje por sesión</p>
            <MiniBars
              values={series.tonnage.map((p) => p.value)}
              labels={series.tonnage.map((p) => new Date(p.at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }))}
              format={(v) => tonnage(v)}
            />
          </div>
        )}
      </section>

      {reps.length > 0 && (
        <section>
          <SectionTitle>Récords por repetición</SectionTitle>
          <p className="mb-4 max-w-md text-caption text-ink-muted">
            El mejor peso que has movido a cada número de repeticiones en este ejercicio.
          </p>
          <Card className="overflow-hidden p-0">
            <table className="w-full">
              <thead className="border-b border-line bg-canvas">
                <tr className="text-left">
                  <th className="label px-4 py-2 font-semibold">Reps</th>
                  <th className="label px-4 py-2 font-semibold">Peso</th>
                  <th className="label px-4 py-2 font-semibold">RIR</th>
                  <th className="label px-4 py-2 text-right font-semibold">Cuándo</th>
                </tr>
              </thead>
              <tbody className="tnum text-caption">
                {reps.map((r) => (
                  <tr key={r.reps} className="border-b border-line-soft last:border-b-0">
                    <td className="px-4 py-2 font-medium text-ink">{r.reps}</td>
                    <td className="px-4 py-2 text-ink">{kg(r.weight)} kg</td>
                    <td className="px-4 py-2 text-ink-muted">{r.rir ?? '—'}</td>
                    <td className="px-4 py-2 text-right text-ink-faint">
                      {new Date(r.at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          {pbs.get(selected) && (
            <p className="tnum mt-3 text-micro text-ink-muted">
              Mejor marca absoluta: {kg(pbs.get(selected)!.weight)} kg × {pbs.get(selected)!.reps} · 1RM{' '}
              {kg(pbs.get(selected)!.e1rm, 0)} kg
            </p>
          )}
        </section>
      )}

      {selMuscle && mSeries.length > 1 && (
        <section>
          <SectionTitle>Volumen por grupo</SectionTitle>
          <Chips
            items={muscles.map((m) => ({ id: m.muscle, label: MUSCLE_LABEL[m.muscle] }))}
            value={selMuscle}
            onPick={(id) => setMuscle(id as Muscle)}
          />
          <div className="mt-5">
            <TrendLine points={mSeries} format={(v) => tonnage(v)} />
          </div>
        </section>
      )}

      <section>
        <SectionTitle>Mejores marcas</SectionTitle>
        <div className="border-t border-line">
          {trackable.slice(0, 10).map((x) => {
            const pb = pbs.get(x.id);
            if (!pb) return null;
            const s = exerciseSeries(store.sessions, x.id).e1rm;
            return (
              <button
                key={x.id}
                onClick={() => setPicked(x.id)}
                className="flex w-full items-center gap-4 border-b border-line py-3.5 text-left transition-colors hover:bg-paper"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body text-ink">{x.name}</p>
                  <p className="tnum mt-0.5 text-micro text-ink-faint">
                    {kg(pb.weight)} kg × {pb.reps} · 1RM {kg(pb.e1rm, 0)} kg
                  </p>
                </div>
                <Spark points={s.map((p) => p.value)} />
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}

/* ── Descanso ────────────────────────────────────────────────────────────── */

function DescansoTab({ store }: { store: Store }) {
  const withData = useMemo(() => {
    const ids = new Set<string>();
    for (const s of store.sessions) for (const ex of s.exercises) ids.add(ex.exerciseId);
    return [...ids]
      .map((id) => ({ id, name: catalogName(id), points: restVsPerformance(store.sessions, id) }))
      .filter((x) => x.points.length >= 3)
      .sort((a, b) => b.points.length - a.points.length);
  }, [store.sessions]);

  const [picked, setPicked] = useState<string | null>(null);
  const selected = withData.find((x) => x.id === (picked ?? withData[0]?.id));

  const restsBySession = useMemo(
    () =>
      [...store.sessions]
        .sort((a, b) => a.start - b.start)
        .map((s) => ({ at: s.start, value: sessionStats(s).restAvg }))
        .filter((x): x is { at: number; value: number } => x.value != null),
    [store.sessions],
  );

  return (
    <>
      <section>
        <SectionTitle>Cómo te afecta el descanso</SectionTitle>
        <p className="mb-5 max-w-md text-caption text-ink-muted">
          Cada punto es una serie tuya con el mismo peso que la primera del día: cuánto descansaste y qué fracción de
          aquella primera serie sacaste. La línea de puntos es lo que predice el modelo que usa el índice. Si tus
          puntos caen sistemáticamente por encima o por debajo, el modelo no te describe bien.
        </p>

        {withData.length ? (
          <>
            <Chips
              items={withData.map((x) => ({ id: x.id, label: `${x.name} (${x.points.length})` }))}
              value={selected?.id ?? ''}
              onPick={setPicked}
            />
            <div className="mt-5">
              <RestScatter points={selected?.points ?? []} />
            </div>
          </>
        ) : (
          <Empty
            title="Aún no hay suficientes series"
            body="Hacen falta al menos tres series de un mismo ejercicio al mismo peso, con su descanso medido, para poder dibujar la relación."
          />
        )}
      </section>

      {restsBySession.length > 1 && (
        <section>
          <SectionTitle>Descanso medio por sesión</SectionTitle>
          <p className="mb-4 max-w-md text-caption text-ink-muted">
            Sirve para ver cuánto varía el gimnasio de un día a otro. El índice ya descuenta estas diferencias.
          </p>
          <MiniBars
            values={restsBySession.map((r) => r.value)}
            labels={restsBySession.map((r) =>
              new Date(r.at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
            )}
            format={(v) => `${Math.round(v)} s`}
          />
        </section>
      )}
    </>
  );
}

/* ── Selector horizontal ─────────────────────────────────────────────────── */

function Chips({
  items,
  value,
  onPick,
}: {
  items: { id: string; label: string }[];
  value: string;
  onPick: (id: string) => void;
}) {
  return (
    <div className="no-scrollbar -mx-6 flex gap-1.5 overflow-x-auto px-6">
      {items.map((x) => (
        <button
          key={x.id}
          onClick={() => {
            haptic(8);
            onPick(x.id);
          }}
          aria-pressed={x.id === value}
          className={cx(
            'pressable shrink-0 rounded-md border px-3 py-1.5 text-micro font-medium transition-colors duration-press',
            x.id === value
              ? 'border-accent/40 bg-accent-wash text-accent-deep'
              : 'border-line bg-paper text-ink-muted hover:border-line-strong hover:text-ink',
          )}
        >
          {x.label}
        </button>
      ))}
    </div>
  );
}
