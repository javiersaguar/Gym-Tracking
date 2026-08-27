import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { Empty, Pill, ScaleDots, Segmented, cx } from '../components/ui';
import { duration, plural, relativeDay, tonnage } from '../lib/format';
import { muscleProgress, sessionIndex, sessionStats } from '../lib/metrics';
import { MUSCLE_LABEL, type Store } from '../lib/types';

type Filter = 'todos' | 'tiron' | 'empuje' | 'pierna';

export function Historial({ store, onOpen }: { store: Store; onOpen: (id: string) => void }) {
  const [filter, setFilter] = useState<Filter>('todos');

  const rows = useMemo(() => {
    const ordered = [...store.sessions].sort((a, b) => b.start - a.start);
    return ordered.map((s, i) => {
      const history = ordered.slice(i + 1);
      const progress = muscleProgress(s, history);
      return {
        session: s,
        stats: sessionStats(s),
        index: sessionIndex(progress),
        muscles: progress.slice(0, 3).map((p) => MUSCLE_LABEL[p.muscle]),
      };
    });
  }, [store.sessions]);

  const filtered = rows.filter((r) => {
    if (filter === 'todos') return true;
    const day = store.routine.days.find((d) => d.id === r.session.dayId);
    const short = (day?.short ?? '').toLowerCase();
    return filter === 'tiron' ? short === 'tirón' || short === 'brazo' : short === filter;
  });

  const totals = useMemo(() => {
    const stats = store.sessions.map(sessionStats);
    return {
      count: store.sessions.length,
      tonnage: stats.reduce((a, b) => a + b.tonnage, 0),
      time: stats.reduce((a, b) => a + b.durationSec, 0),
    };
  }, [store.sessions]);

  if (!store.sessions.length) {
    return (
      <Empty
        title="Sin entrenos guardados"
        body="Cada sesión que cierres queda aquí con su análisis: índice, récords y el reparto entre descanso y mejora real."
      />
    );
  }

  return (
    <div className="space-y-8 pb-8">
      <header>
        <h1 className="font-display text-display-lg">Análisis</h1>
        <p className="tnum mt-3 text-caption text-ink-muted">
          {plural(totals.count, 'entreno')} · {tonnage(totals.tonnage)} movidos · {duration(totals.time)} de gimnasio
        </p>
      </header>

      <Segmented
        className="w-full"
        options={[
          { value: 'todos', label: 'Todos' },
          { value: 'tiron', label: 'Tirón' },
          { value: 'empuje', label: 'Empuje' },
          { value: 'pierna', label: 'Pierna' },
        ]}
        value={filter}
        onChange={setFilter}
      />

      {/* Lista, no pila de tarjetas: una línea de un píxel separa mejor que
          diez cajas iguales, y deja que las cifras sean lo que destaque. */}
      <ul className="border-t border-line">
        {filtered.map((r, i) => (
          <motion.li
            key={r.session.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i, 8) * 0.04, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <button
              onClick={() => onOpen(r.session.id)}
              className="group flex w-full items-center gap-4 border-b border-line py-4 text-left transition-colors duration-press hover:bg-paper"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-micro text-ink-faint">
                    {relativeDay(r.session.start)} · Día {r.session.dayIndex}
                  </span>
                  {r.session.feel != null && <ScaleDots value={r.session.feel} />}
                </div>
                <p className="mt-1 truncate text-body-lg font-medium text-ink transition-colors duration-panel group-hover:text-accent">
                  {r.session.dayName}
                </p>
                <p className="tnum mt-1 truncate text-micro text-ink-muted">
                  {tonnage(r.stats.tonnage)} · {plural(r.stats.sets, 'serie')} · {duration(r.stats.durationSec)}
                </p>
                {r.muscles.length > 0 && (
                  <p className="mt-0.5 truncate text-micro text-ink-faint">{r.muscles.join(' · ')}</p>
                )}
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1.5">
                {r.index != null ? (
                  <>
                    <span
                      className={cx(
                        'tnum text-figure-lg font-medium',
                        r.index >= 106 ? 'text-good-ink' : r.index < 94 ? 'text-warn-ink' : 'text-ink',
                      )}
                    >
                      {r.index}
                    </span>
                    <Pill tone={r.index >= 106 ? 'good' : r.index < 94 ? 'warn' : 'neutral'}>
                      {r.index >= 106 ? 'Por encima' : r.index < 94 ? 'Por debajo' : 'En línea'}
                    </Pill>
                  </>
                ) : (
                  <Pill>Referencia</Pill>
                )}
              </div>
            </button>
          </motion.li>
        ))}
      </ul>

      {!filtered.length && (
        <p className="py-10 text-caption text-ink-faint">Ningún entreno de ese tipo todavía.</p>
      )}
    </div>
  );
}
