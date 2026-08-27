import { useMemo } from 'react';
import { ConsistencyGrid } from '../components/charts';
import { Button, Card, Rule, SectionTitle, Stat, cx } from '../components/ui';
import { cycleState } from '../lib/actions';
import { duration, plural, relativeDay, tonnage } from '../lib/format';
import { balance, sessionStats } from '../lib/metrics';
import { MUSCLE_LABEL, type Store } from '../lib/types';

export function Hoy({
  store,
  onStart,
  onResume,
  onNavigate,
}: {
  store: Store;
  onStart: (dayId: string) => void;
  onResume: () => void;
  onNavigate: (to: string) => void;
}) {
  const cycle = useMemo(() => cycleState(store), [store]);
  const active = store.active;
  const day = cycle.day;

  const week = useMemo(() => {
    const from = Date.now() - 7 * 86_400_000;
    const stats = store.sessions.filter((s) => s.start >= from).map(sessionStats);
    return {
      count: stats.length,
      tonnage: stats.reduce((a, b) => a + b.tonnage, 0),
      time: stats.reduce((a, b) => a + b.durationSec, 0),
      sets: stats.reduce((a, b) => a + b.sets, 0),
    };
  }, [store.sessions]);

  const focus = useMemo(() => balance(store.sessions, 14).filter((b) => b.sets > 0).slice(0, 4), [store.sessions]);

  const byDay = useMemo(() => {
    const m = new Map<number, number>();
    for (const s of store.sessions) {
      const d = new Date(s.start);
      d.setHours(0, 0, 0, 0);
      m.set(d.getTime(), (m.get(d.getTime()) ?? 0) + sessionStats(s).tonnage);
    }
    return m;
  }, [store.sessions]);

  return (
    <div className="space-y-12 pb-8">
      <header>
        <h1 className="font-display text-display-lg">
          {active
            ? 'Entreno en marcha'
            : cycle.trainedToday
              ? 'Ya has entrenado hoy'
              : day.rest
                ? 'Toca descansar'
                : 'Listo para entrenar'}
        </h1>
        <p className="mt-3 max-w-md text-body text-ink-muted">
          {active
            ? `${active.dayName}, empezado a las ${new Date(active.start).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}.`
            : day.rest
              ? `Día ${day.index} del ciclo. Si prefieres entrenar, elige otro día desde la rutina.`
              : cycle.trainedToday
                ? /* El ciclo ya ha avanzado: hay que decir que lo de abajo es
                     lo siguiente, no lo de hoy, o el botón engaña. */
                  `Lo siguiente es el día ${day.index}: ${day.name.toLowerCase()}.`
                : `Día ${day.index} del ciclo: ${day.name.toLowerCase()}.`}
        </p>

        <div className="mt-6 flex gap-2">
          {active ? (
            <Button variant="primary" size="lg" buzz onClick={onResume}>
              Seguir con el entreno
            </Button>
          ) : (
            <Button
              variant={cycle.trainedToday ? 'outline' : 'primary'}
              size="lg"
              buzz
              onClick={() => (day.rest ? onNavigate('/rutina') : onStart(day.id))}
            >
              {day.rest ? 'Elegir un día' : cycle.trainedToday ? `Empezar el día ${day.index}` : 'Empezar entreno'}
            </Button>
          )}
        </div>
      </header>

      {!active && !day.rest && (
        <section>
          <SectionTitle>Lo que toca</SectionTitle>
          <ol className="border-t border-line">
            {day.exercises.map((e) => (
              <li key={e.id} className="flex items-baseline justify-between gap-4 border-b border-line py-3">
                <span className="min-w-0 flex-1 truncate text-body text-ink">{e.name}</span>
                <span className="tnum shrink-0 text-caption text-ink-faint">
                  {e.plannedSets} × {e.repRange[0]}–{e.repRange[1]}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section>
        <SectionTitle>El ciclo</SectionTitle>
        <div className="no-scrollbar -mx-6 flex gap-2 overflow-x-auto px-6">
          {store.routine.days.map((d) => {
            const here = d.id === day.id;
            return (
              <button
                key={d.id}
                onClick={() => (active ? onResume() : d.rest ? onNavigate('/rutina') : onStart(d.id))}
                className={cx(
                  'pressable flex w-[86px] shrink-0 flex-col items-start gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors duration-panel',
                  here ? 'border-accent/40 bg-accent-wash' : 'border-line bg-paper hover:border-line-strong',
                )}
              >
                <span className={cx('tnum text-micro', here ? 'font-semibold text-accent-deep' : 'text-ink-faint')}>
                  {String(d.index).padStart(2, '0')}
                </span>
                <span className={cx('text-caption font-medium', d.rest ? 'text-ink-faint' : 'text-ink')}>{d.short}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <SectionTitle
          action={
            <button onClick={() => onNavigate('/progreso')} className="text-micro font-medium text-accent hover:underline">
              Ver progreso
            </button>
          }
        >
          Últimos 7 días
        </SectionTitle>
        <Card className="grid grid-cols-3 gap-4 p-6">
          <Stat label="Entrenos" value={week.count} hint={week.count ? plural(week.sets, 'serie') : 'Ninguno aún'} />
          <Stat label="Tonelaje" value={tonnage(week.tonnage)} tone="accent" />
          <Stat label="Tiempo" value={duration(week.time)} />
        </Card>
      </section>

      {focus.length > 0 && (
        <section>
          <SectionTitle>Lo más trabajado · 14 días</SectionTitle>
          <ul className="border-t border-line">
            {focus.map((b) => (
              <li key={b.muscle} className="flex items-center gap-4 border-b border-line py-3">
                <span className="w-24 shrink-0 truncate text-body text-ink">{MUSCLE_LABEL[b.muscle]}</span>
                <span className="h-[6px] flex-1 overflow-hidden rounded-[3px] bg-line-soft">
                  <span
                    className="block h-full rounded-[3px] bg-accent"
                    style={{ width: `${Math.min(100, (b.sharePct / (focus[0]?.sharePct || 1)) * 100)}%` }}
                  />
                </span>
                <span className="tnum w-16 shrink-0 text-right text-caption text-ink-muted">
                  {b.sets.toFixed(1)} ser.
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {store.sessions.length > 0 && (
        <section>
          <SectionTitle>Constancia</SectionTitle>
          <ConsistencyGrid days={byDay} weeks={12} />
        </section>
      )}

      {cycle.lastSession && (
        <section>
          <Rule className="mb-4" />
          <button
            onClick={() => onNavigate(`/sesion/${cycle.lastSession?.id}`)}
            className="group flex w-full items-center gap-4 text-left"
          >
            <span className="min-w-0 flex-1">
              <span className="label">Último entreno</span>
              <span className="mt-1.5 block truncate text-body font-medium text-ink">
                {relativeDay(cycle.lastSession.start)} · {cycle.lastSession.dayName}
              </span>
              <span className="tnum mt-0.5 block text-caption text-ink-faint">
                {tonnage(sessionStats(cycle.lastSession).tonnage)} ·{' '}
                {duration(sessionStats(cycle.lastSession).durationSec)}
              </span>
            </span>
            <span className="shrink-0 text-micro font-medium text-accent">Ver análisis</span>
          </button>
        </section>
      )}
    </div>
  );
}
