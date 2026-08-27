import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { Card, Empty, Pill, Segmented, cx } from '../components/ui';
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
        body="Cada sesión que cierres queda aquí con su análisis completo, y se puede volver a abrir cuando quieras."
      />
    );
  }

  return (
    <div className="space-y-5 pb-6">
      <header className="px-1 pt-1">
        <h1 className="text-display font-semibold">Historial</h1>
        <p className="tnum mt-1 text-caption text-content-muted">
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

      <ul className="space-y-2">
        {filtered.map((r, i) => (
          <motion.li
            key={r.session.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i, 8) * 0.025, duration: 0.28, ease: [0.22, 0.68, 0.28, 1] }}
          >
            <Card as="article" className="overflow-hidden">
              <button
                onClick={() => onOpen(r.session.id)}
                className="flex w-full items-center gap-3 p-3.5 text-left transition-colors duration-press hover:bg-white/[0.025]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-caption font-semibold text-content-faint">{relativeDay(r.session.start)}</span>
                    <span className="text-micro text-content-faint">· Día {r.session.dayIndex}</span>
                    {r.session.feel != null && <span className="text-caption">{['😵', '😕', '🙂', '💪', '🔥'][r.session.feel - 1]}</span>}
                  </div>
                  <p className="mt-0.5 truncate text-body font-semibold text-white">{r.session.dayName}</p>
                  <p className="tnum mt-1 truncate text-micro text-content-muted">
                    {tonnage(r.stats.tonnage)} · {plural(r.stats.sets, 'serie')} · {duration(r.stats.durationSec)}
                  </p>
                  {r.muscles.length > 0 && (
                    <p className="mt-1 truncate text-micro text-content-faint">{r.muscles.join(' · ')}</p>
                  )}
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  {r.index != null ? (
                    <>
                      <span
                        className={cx(
                          'tnum text-figure font-semibold',
                          r.index >= 106 ? 'text-up' : r.index < 94 ? 'text-down' : 'text-white',
                        )}
                      >
                        {r.index}
                      </span>
                      <Pill tone={r.index >= 106 ? 'up' : r.index < 94 ? 'down' : 'neutral'}>
                        {r.index >= 106 ? 'Por encima' : r.index < 94 ? 'Por debajo' : 'En línea'}
                      </Pill>
                    </>
                  ) : (
                    <Pill>Referencia</Pill>
                  )}
                </div>
              </button>
            </Card>
          </motion.li>
        ))}
      </ul>

      {!filtered.length && (
        <p className="py-10 text-center text-caption text-content-faint">Ningún entreno de ese tipo todavía.</p>
      )}
    </div>
  );
}
