import { useMemo, useState } from 'react';
import { BarList, Spark, TrendLine, type BarDatum } from '../components/charts';
import { Card, Empty, Pill, SectionTitle, Segmented, Stat, cx } from '../components/ui';
import { duration, kg, signedPct, tonnage } from '../lib/format';
import {
  balance,
  exerciseSeries,
  muscleSeries,
  personalBests,
  sessionStats,
  trendPct,
  WEEKLY_TARGET,
} from '../lib/metrics';
import { catalogName } from '../lib/routine';
import { MUSCLE_LABEL, MUSCLES, type Muscle, type Store } from '../lib/types';

type Window = '14' | '30' | '90';
const WINDOWS: { value: Window; label: string }[] = [
  { value: '14', label: '14 días' },
  { value: '30', label: '30 días' },
  { value: '90', label: '90 días' },
];

export function Progreso({ store }: { store: Store }) {
  const [win, setWin] = useState<Window>('30');
  const [muscle, setMuscle] = useState<Muscle | null>(null);
  const [exerciseId, setExerciseId] = useState<string | null>(null);

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

  const bars = useMemo(() => balance(store.sessions, days), [store.sessions, days]);

  const volumeData: BarDatum[] = bars
    .filter((b) => b.sets > 0)
    .map((b) => ({
      key: b.muscle,
      label: MUSCLE_LABEL[b.muscle],
      value: b.tonnage,
      display: tonnage(b.tonnage),
      note: `${b.sets.toFixed(1)} series · ${b.sharePct.toFixed(0)} % del total`,
    }));

  /* Ordenado de más a menos: lo que estás dejando de entrenar queda abajo,
     que es justo donde se busca cuando se abre esta lista. */
  const weeklyData: BarDatum[] = MUSCLES.map((m) => {
    const b = bars.find((x) => x.muscle === m);
    const target = WEEKLY_TARGET[m];
    const perWeek = b?.setsPerWeek ?? 0;
    return {
      key: m,
      label: MUSCLE_LABEL[m],
      value: perWeek,
      display: `${perWeek.toFixed(1)}/sem`,
      band: target,
      note: statusNote(perWeek, target),
    };
  }).sort((a, b) => b.value - a.value);

  /* Ejercicios con al menos dos sesiones: son los únicos que pueden dibujar
     una progresión. */
  const trackable = useMemo(() => {
    const count = new Map<string, number>();
    for (const s of store.sessions) {
      for (const ex of s.exercises) {
        if (ex.sets.some((x) => x.done && x.reps > 0)) count.set(ex.exerciseId, (count.get(ex.exerciseId) ?? 0) + 1);
      }
    }
    return [...count.entries()]
      .filter(([, n]) => n >= 2)
      .map(([id, n]) => ({ id, name: catalogName(id), sessions: n }))
      .sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name, 'es'));
  }, [store.sessions]);

  const pbs = useMemo(() => personalBests(store.sessions, store.seedRefs), [store.sessions, store.seedRefs]);

  const selectedExercise = exerciseId ?? trackable[0]?.id ?? null;
  const series = useMemo(
    () => (selectedExercise ? exerciseSeries(store.sessions, selectedExercise) : null),
    [store.sessions, selectedExercise],
  );
  const trend = series ? trendPct(series.e1rm) : null;

  const selectedMuscle = muscle ?? bars.find((b) => b.sets > 0)?.muscle ?? null;
  const mSeries = useMemo(
    () => (selectedMuscle ? muscleSeries(store.sessions, selectedMuscle) : []),
    [store.sessions, selectedMuscle],
  );
  const mTrend = trendPct(mSeries);

  if (!store.sessions.length) {
    return (
      <Empty
        title="Todavía no hay nada que medir"
        body="En cuanto cierres el primer entreno aparecerán aquí el reparto por grupo muscular y la progresión de cada ejercicio."
      />
    );
  }

  return (
    <div className="space-y-6 pb-6">
      <header className="flex items-end justify-between gap-3 px-1 pt-1">
        <h1 className="text-display font-semibold">Progreso</h1>
        <Segmented options={WINDOWS} value={win} onChange={setWin} />
      </header>

      <Card className="grid grid-cols-2 gap-x-3 gap-y-4 p-4 sm:grid-cols-4">
        <Stat label="Entrenos" value={totals.sessions} />
        <Stat label="Tonelaje" value={tonnage(totals.tonnage)} tone="brand" />
        <Stat label="Series" value={Math.round(totals.sets)} />
        <Stat label="Tiempo" value={duration(totals.time)} />
      </Card>

      <section>
        <SectionTitle>Qué has trabajado más</SectionTitle>
        <Card className="p-4">
          <p className="mb-3.5 text-caption text-content-muted">
            Tonelaje repartido por grupo. Cada serie cuenta según cuánto recae sobre cada músculo, no entera para todos
            los que participan.
          </p>
          <BarList data={volumeData} />
        </Card>
      </section>

      <section>
        <SectionTitle>Series semanales</SectionTitle>
        <Card className="p-4">
          <p className="mb-3.5 text-caption text-content-muted">
            Media de series efectivas por semana en los últimos {days} días.
          </p>
          <BarList data={weeklyData} bandLabel="Franja de referencia semanal" max={24} />
        </Card>
      </section>

      {trackable.length > 0 && series && (
        <section>
          <SectionTitle>Fuerza por ejercicio</SectionTitle>
          <Card className="p-4">
            <div className="no-scrollbar -mx-4 mb-3.5 flex gap-1.5 overflow-x-auto px-4">
              {trackable.map((x) => (
                <button
                  key={x.id}
                  onClick={() => setExerciseId(x.id)}
                  className={cx(
                    'pressable shrink-0 rounded-lg border px-2.5 py-1.5 text-micro font-semibold transition-colors duration-press',
                    x.id === selectedExercise
                      ? 'border-brand/45 bg-brand/12 text-brand-bright'
                      : 'border-line bg-surface-sunken/60 text-content-muted hover:border-line-strong hover:text-content',
                  )}
                >
                  {x.name}
                </button>
              ))}
            </div>

            <div className="mb-1 flex items-end justify-between gap-3">
              <div>
                <p className="text-caption font-medium text-content">1RM estimado</p>
                <p className="text-micro text-content-faint">
                  Fórmula de Epley sobre tu mejor serie de cada sesión
                </p>
              </div>
              {trend != null && (
                <Pill tone={trend > 1 ? 'up' : trend < -1 ? 'down' : 'neutral'}>{signedPct(trend, 1)}</Pill>
              )}
            </div>

            <TrendLine points={series.e1rm} format={(v) => `${kg(v, 0)} kg`} />

            {selectedExercise && pbs.get(selectedExercise) && (
              <p className="tnum mt-2 border-t border-line pt-2.5 text-micro text-content-muted">
                Mejor marca: {kg(pbs.get(selectedExercise)!.weight)} kg × {pbs.get(selectedExercise)!.reps}
                <span className="text-content-faint"> · 1RM estimado {kg(pbs.get(selectedExercise)!.e1rm, 0)} kg</span>
              </p>
            )}
          </Card>
        </section>
      )}

      {selectedMuscle && mSeries.length > 1 && (
        <section>
          <SectionTitle>Volumen por grupo, sesión a sesión</SectionTitle>
          <Card className="p-4">
            <div className="no-scrollbar -mx-4 mb-3.5 flex gap-1.5 overflow-x-auto px-4">
              {bars
                .filter((b) => b.sets > 0)
                .map((b) => (
                  <button
                    key={b.muscle}
                    onClick={() => setMuscle(b.muscle)}
                    className={cx(
                      'pressable shrink-0 rounded-lg border px-2.5 py-1.5 text-micro font-semibold transition-colors duration-press',
                      b.muscle === selectedMuscle
                        ? 'border-brand/45 bg-brand/12 text-brand-bright'
                        : 'border-line bg-surface-sunken/60 text-content-muted hover:border-line-strong hover:text-content',
                    )}
                  >
                    {MUSCLE_LABEL[b.muscle]}
                  </button>
                ))}
            </div>

            <div className="mb-1 flex items-end justify-between gap-3">
              <p className="text-caption font-medium text-content">Tonelaje de {MUSCLE_LABEL[selectedMuscle].toLowerCase()}</p>
              {mTrend != null && (
                <Pill tone={mTrend > 1 ? 'up' : mTrend < -1 ? 'down' : 'neutral'}>{signedPct(mTrend, 1)}</Pill>
              )}
            </div>
            <TrendLine points={mSeries} format={(v) => tonnage(v)} />
          </Card>
        </section>
      )}

      {trackable.length > 0 && (
        <section>
          <SectionTitle>Mejores marcas</SectionTitle>
          <Card className="divide-y divide-line p-0">
            {trackable.slice(0, 8).map((x) => {
              const pb = pbs.get(x.id);
              const s = exerciseSeries(store.sessions, x.id).e1rm;
              if (!pb) return null;
              return (
                <div key={x.id} className="flex items-center gap-3 p-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body font-medium text-content">{x.name}</p>
                    <p className="tnum text-micro text-content-faint">
                      {kg(pb.weight)} kg × {pb.reps} · 1RM {kg(pb.e1rm, 0)} kg
                    </p>
                  </div>
                  <Spark points={s.map((p) => p.value)} />
                </div>
              );
            })}
          </Card>
        </section>
      )}

      <p className="px-2 pb-2 text-micro leading-relaxed text-content-faint">
        <span className="font-semibold text-content-muted">Cómo se calcula. </span>
        El tonelaje es la suma de peso × repeticiones. La intensidad es el 1RM estimado por Epley sobre tu mejor serie.
        La densidad es el tonelaje dividido entre el tiempo total, descansos incluidos. El índice de cada sesión compara
        los tres contra la mediana de tus últimas tres sesiones de ese grupo, y 100 significa «igual que tu media
        reciente».
      </p>
    </div>
  );
}

function statusNote(perWeek: number, [low, high]: [number, number]): string {
  if (perWeek <= 0) return 'Sin trabajo en la ventana';
  if (perWeek < low) return `Por debajo de la franja (${low}–${high})`;
  if (perWeek > high) return `Por encima de la franja (${low}–${high})`;
  return `Dentro de la franja (${low}–${high})`;
}
