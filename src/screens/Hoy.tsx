import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { ConsistencyGrid } from '../components/charts';
import { Button, Card, Pill, SectionTitle, Stat, cx } from '../components/ui';
import { cycleState } from '../lib/actions';
import { duration, longDate, plural, relativeDay, tonnage } from '../lib/format';
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

  const week = useMemo(() => {
    const from = Date.now() - 7 * 86_400_000;
    const recent = store.sessions.filter((s) => s.start >= from);
    const stats = recent.map(sessionStats);
    return {
      count: recent.length,
      tonnage: stats.reduce((a, b) => a + b.tonnage, 0),
      time: stats.reduce((a, b) => a + b.durationSec, 0),
      sets: stats.reduce((a, b) => a + b.sets, 0),
    };
  }, [store.sessions]);

  const focus = useMemo(() => balance(store.sessions, 14).filter((b) => b.sets > 0).slice(0, 3), [store.sessions]);

  const byDay = useMemo(() => {
    const m = new Map<number, number>();
    for (const s of store.sessions) {
      const d = new Date(s.start);
      d.setHours(0, 0, 0, 0);
      m.set(d.getTime(), (m.get(d.getTime()) ?? 0) + sessionStats(s).tonnage);
    }
    return m;
  }, [store.sessions]);

  const day = cycle.day;

  return (
    <div className="space-y-6 pb-6">
      <header className="px-1 pt-1">
        <p className="text-caption font-medium text-content-faint">{longDate(Date.now())}</p>
        <h1 className="mt-0.5 text-display font-semibold">
          {active ? 'Entreno en marcha' : cycle.trainedToday ? 'Ya has entrenado' : day.rest ? 'Toca descansar' : 'Listo para entrenar'}
        </h1>
      </header>

      {/* Tarjeta principal: lo único que hay que hacer al abrir la app. */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.34, ease: [0.22, 0.68, 0.28, 1] }}>
        <Card className={cx('overflow-hidden', active && 'border-brand/35 shadow-glow-brand')}>
          <div className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Pill tone={active ? 'brand' : 'neutral'}>
                    Día {active ? active.dayIndex : day.index} de {store.routine.days.length}
                  </Pill>
                  {active && <Pill tone="brand">En curso</Pill>}
                </div>
                <h2 className="mt-2 text-title-lg font-semibold">{active ? active.dayName : day.name}</h2>
                <p className="mt-1 text-caption text-content-muted">
                  {active
                    ? `Empezado a las ${new Date(active.start).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`
                    : day.rest
                      ? 'Día de descanso del ciclo. Puedes entrenar igualmente eligiendo otro día.'
                      : `${plural(day.exercises.length, 'ejercicio')} · ${plural(day.exercises.reduce((a, e) => a + e.plannedSets, 0), 'serie')} previstas`}
                </p>
              </div>
            </div>

            {!active && !day.rest && (
              <ul className="mt-3.5 flex flex-wrap gap-1.5">
                {day.exercises.slice(0, 5).map((e) => (
                  <li key={e.id} className="rounded-lg border border-line bg-white/[0.03] px-2 py-1 text-micro text-content-muted">
                    {e.name}
                  </li>
                ))}
                {day.exercises.length > 5 && (
                  <li className="rounded-lg px-2 py-1 text-micro text-content-faint">+{day.exercises.length - 5} más</li>
                )}
              </ul>
            )}

            <div className="mt-4 flex gap-2">
              {active ? (
                <Button variant="primary" size="lg" block buzz onClick={onResume}>
                  Seguir con el entreno
                </Button>
              ) : (
                <>
                  <Button
                    variant={day.rest ? 'ghost' : 'primary'}
                    size="lg"
                    block
                    buzz
                    onClick={() => (day.rest ? onNavigate('/rutina') : onStart(day.id))}
                  >
                    {day.rest ? 'Elegir otro día' : 'Empezar entreno'}
                  </Button>
                  {!day.rest && (
                    <Button variant="ghost" size="lg" onClick={() => onNavigate('/rutina')} aria-label="Ver la rutina">
                      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M4 5.5h12M4 10h12M4 14.5h8" strokeLinecap="round" />
                      </svg>
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>

          {cycle.lastSession && !active && (
            <button
              onClick={() => onNavigate(`/sesion/${cycle.lastSession?.id}`)}
              className="hairline flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-press hover:bg-white/[0.03]"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-caption font-medium text-content">
                  {relativeDay(cycle.lastSession.start)} · {cycle.lastSession.dayName}
                </span>
                <span className="tnum block text-micro text-content-faint">
                  {tonnage(sessionStats(cycle.lastSession).tonnage)} · {duration(sessionStats(cycle.lastSession).durationSec)}
                </span>
              </span>
              <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-content-faint" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M7.5 4.5l5.5 5.5-5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </Card>
      </motion.div>

      {/* El ciclo entero, para saber dónde estás sin abrir la rutina. */}
      <section>
        <SectionTitle>El ciclo</SectionTitle>
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {store.routine.days.map((d) => {
            const isNext = d.id === day.id && !active;
            const isActive = active?.dayId === d.id;
            return (
              <button
                key={d.id}
                onClick={() => (active ? onResume() : d.rest ? onNavigate('/rutina') : onStart(d.id))}
                className={cx(
                  'pressable flex w-[92px] shrink-0 flex-col items-start gap-1 rounded-xl border px-2.5 py-2.5 text-left transition-colors duration-panel',
                  isActive || isNext
                    ? 'border-brand/40 bg-brand/10'
                    : d.rest
                      ? 'border-line bg-surface-sunken/60'
                      : 'border-line bg-surface/70 hover:border-line-strong',
                )}
              >
                <span className={cx('tnum text-micro font-semibold', isActive || isNext ? 'text-brand-bright' : 'text-content-faint')}>
                  Día {d.index}
                </span>
                <span className={cx('text-caption font-semibold', d.rest ? 'text-content-faint' : 'text-white')}>{d.short}</span>
                <span className="text-micro text-content-faint">{d.rest ? 'Descanso' : `${d.exercises.length} ej.`}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <SectionTitle action={<button onClick={() => onNavigate('/progreso')} className="text-micro font-semibold text-brand-bright">Ver progreso</button>}>
          Últimos 7 días
        </SectionTitle>
        <Card className="grid grid-cols-3 gap-3 p-4">
          <Stat label="Entrenos" value={week.count} hint={week.count ? plural(week.sets, 'serie') : 'Ninguno aún'} />
          <Stat label="Tonelaje" value={tonnage(week.tonnage)} tone="brand" />
          <Stat label="Tiempo" value={duration(week.time)} />
        </Card>
      </section>

      {focus.length > 0 && (
        <section>
          <SectionTitle>Lo más trabajado (14 días)</SectionTitle>
          <Card className="space-y-2.5 p-4">
            {focus.map((b) => (
              <div key={b.muscle} className="flex items-center gap-3">
                <span className="w-24 shrink-0 truncate text-caption font-medium text-content">{MUSCLE_LABEL[b.muscle]}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.055]">
                  <span
                    className="block h-full rounded-full bg-brand"
                    style={{ width: `${Math.min(100, (b.sharePct / (focus[0]?.sharePct || 1)) * 100)}%` }}
                  />
                </span>
                <span className="tnum w-16 shrink-0 text-right text-caption font-semibold text-white">
                  {b.sets.toFixed(1)} ser.
                </span>
              </div>
            ))}
          </Card>
        </section>
      )}

      {store.sessions.length > 0 && (
        <section>
          <SectionTitle>Constancia</SectionTitle>
          <Card className="p-4">
            <ConsistencyGrid days={byDay} weeks={12} />
          </Card>
        </section>
      )}
    </div>
  );
}
