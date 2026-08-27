import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { Button, Card, Empty, Pill, cx } from '../components/ui';
import { toCsv } from '../lib/csv';
import { clock, duration, hhmm, kg, longDate, plural, tonnage } from '../lib/format';
import { haptic } from '../lib/hooks';
import { exerciseStats, isFilled, sessionStats } from '../lib/metrics';
import { markBackedUp } from '../lib/storage';
import type { Session, Store } from '../lib/types';

/**
 * Registro completo.
 *
 * Todo lo apuntado, serie a serie, sin resumir: ejercicio, peso,
 * repeticiones, RIR y el descanso que la precedió. Es el sitio al que se
 * viene a comprobar un dato concreto, así que prima la densidad de
 * información sobre el aire, al revés que el resto de la app.
 */
export function Registro({ store, onToast }: { store: Store; onToast: (m: string) => void }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const sessions = useMemo(() => [...store.sessions].sort((a, b) => b.start - a.start), [store.sessions]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter(
      (s) =>
        s.dayName.toLowerCase().includes(q) ||
        s.exercises.some((e) => e.name.toLowerCase().includes(q)),
    );
  }, [sessions, query]);

  const totals = useMemo(() => {
    let sets = 0;
    let reps = 0;
    let tons = 0;
    for (const s of sessions) {
      const st = sessionStats(s);
      sets += st.sets;
      reps += st.reps;
      tons += st.tonnage;
    }
    return { sets, reps, tons };
  }, [sessions]);

  const download = () => {
    const csv = toCsv(store.sessions);
    /* El BOM es lo que hace que Excel en español abra los acentos bien; sin
       él, «Jalón» llega como «JalÃ³n». */
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gym-tracking-registro-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    markBackedUp();
    onToast('Registro descargado en CSV');
  };

  if (!sessions.length) {
    return (
      <div className="space-y-8 pb-8">
        <header>
          <h1 className="font-display text-display-lg">Registro</h1>
        </header>
        <Empty
          title="Todavía no hay nada apuntado"
          body="Cada serie que marques queda aquí con su peso, repeticiones, RIR y el descanso que la precedió."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      <header>
        <h1 className="font-display text-display-lg">Registro</h1>
        <p className="tnum mt-3 text-caption text-ink-muted">
          {plural(sessions.length, 'entreno')} · {plural(Math.round(totals.sets), 'serie')} ·{' '}
          {totals.reps.toLocaleString('es-ES')} repeticiones · {tonnage(totals.tons)}
        </p>
      </header>

      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar ejercicio o día…"
          className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-3.5 py-2.5 text-body text-ink outline-none transition duration-200 placeholder:text-ink-faint/70 focus:border-accent/50 focus:ring-4 focus:ring-accent/12"
        />
        <Button variant="outline" onClick={download}>
          CSV
        </Button>
      </div>

      <ul className="space-y-2">
        {filtered.map((s) => (
          <SessionEntry key={s.id} session={s} open={open === s.id} onToggle={() => setOpen(open === s.id ? null : s.id)} />
        ))}
      </ul>

      {!filtered.length && <p className="py-10 text-caption text-ink-faint">Nada coincide con esa búsqueda.</p>}
    </div>
  );
}

function SessionEntry({
  session,
  open,
  onToggle,
}: {
  session: Session;
  open: boolean;
  onToggle: () => void;
}) {
  const stats = sessionStats(session);

  return (
    <Card as="li" className="overflow-hidden">
      <button
        onClick={() => {
          haptic(8);
          onToggle();
        }}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-4 text-left transition-colors duration-press hover:bg-canvas"
      >
        <div className="min-w-0 flex-1">
          <p className="text-micro text-ink-faint">
            {longDate(session.start)} · {hhmm(session.start)}
          </p>
          <p className="mt-1 truncate text-body font-medium text-ink">{session.dayName}</p>
          <p className="tnum mt-1 text-micro text-ink-muted">
            {tonnage(stats.tonnage)} · {plural(stats.sets, 'serie')} · {duration(stats.durationSec)}
            {stats.restAvg != null && ` · descanso medio ${clock(stats.restAvg)}`}
          </p>
        </div>
        <svg
          viewBox="0 0 20 20"
          className={cx(
            'h-4 w-4 shrink-0 text-ink-faint transition-transform duration-panel ease-out',
            open && 'rotate-90',
          )}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M7.5 4.5L13 10l-5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-line">
              {session.exercises.map((ex, i) => {
                const done = ex.sets.filter(isFilled);
                if (!done.length) return null;
                const st = exerciseStats(ex);
                return (
                  <div key={`${ex.exerciseId}-${i}`} className="border-b border-line px-4 py-3 last:border-b-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate text-caption font-medium text-ink">{ex.name}</p>
                      <p className="tnum shrink-0 text-micro text-ink-faint">{tonnage(st.tonnage)}</p>
                    </div>

                    {/* Tabla real: una fila por serie con todo lo apuntado. */}
                    <table className="mt-2 w-full">
                      <thead>
                        <tr className="text-left">
                          <th className="label w-7 pb-1 font-semibold">#</th>
                          <th className="label pb-1 font-semibold">Peso</th>
                          <th className="label pb-1 font-semibold">Reps</th>
                          <th className="label pb-1 font-semibold">RIR</th>
                          <th className="label pb-1 text-right font-semibold">Descanso</th>
                        </tr>
                      </thead>
                      <tbody className="tnum text-caption text-ink">
                        {done.map((set, n) => (
                          <tr key={set.id} className="border-t border-line-soft">
                            <td className="py-1 text-ink-faint">{n + 1}</td>
                            <td className="py-1">{kg(set.weight)} kg</td>
                            <td className="py-1">{set.reps}</td>
                            <td className="py-1 text-ink-muted">{set.rir ?? '—'}</td>
                            <td className="py-1 text-right text-ink-muted">
                              {set.restSec != null ? clock(set.restSec) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}

              {session.note && (
                <p className="border-t border-line px-4 py-3 text-caption italic text-ink-muted">«{session.note}»</p>
              )}
              {session.feel != null && (
                <div className="border-t border-line px-4 py-3">
                  <Pill>Sensación {session.feel} de 5</Pill>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
