import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { Button, Card, Pill, SectionTitle, Sheet, Stat, cx } from '../components/ui';
import { deleteSession } from '../lib/actions';
import { analyse, VERDICT_COPY, type Note } from '../lib/analysis';
import { clock, duration, hhmm, kg, longDate, signedPct, tonnage } from '../lib/format';
import type { MuscleProgress } from '../lib/metrics';
import { MUSCLE_LABEL, type Session, type Store } from '../lib/types';

/** Etiqueta del índice. Siempre con texto: el color por sí solo no informa. */
function indexTone(index: number | null) {
  if (index == null) return { tone: 'neutral' as const, label: 'Primera vez' };
  if (index >= 106) return { tone: 'up' as const, label: 'Por encima' };
  if (index >= 94) return { tone: 'neutral' as const, label: 'En línea' };
  return { tone: 'down' as const, label: 'Por debajo' };
}

const NOTE_ICON: Record<Note['kind'], { path: string; color: string; label: string }> = {
  good: { path: 'M4.5 10.5l3.6 3.6 7.4-8.2', color: 'text-up', label: 'A favor' },
  watch: { path: 'M10 5.5v5M10 14.2v.3', color: 'text-down', label: 'Atención' },
  info: { path: 'M10 9v5.5M10 5.8v.3', color: 'text-content-faint', label: 'Dato' },
};

export function Resumen({
  store,
  session,
  fresh,
  onNavigate,
  onDeleted,
}: {
  store: Store;
  session: Session;
  /** Recién terminada: cambia el tono y ofrece volver al inicio. */
  fresh?: boolean;
  onNavigate: (to: string) => void;
  onDeleted: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const analysis = useMemo(() => {
    const history = store.sessions
      .filter((s) => s.id !== session.id && s.start < session.start)
      .sort((a, b) => b.start - a.start);
    return analyse(session, history, store.seedRefs, store.settings.weightStep);
  }, [store.sessions, store.seedRefs, store.settings.weightStep, session]);

  const { stats, index, verdict, headline, muscles, prs, notes, exercises } = analysis;
  const copy = VERDICT_COPY[verdict];
  const tone = indexTone(index);

  return (
    <div className="space-y-6 pb-8">
      <header className="px-1 pt-1">
        <p className="text-caption font-medium text-content-faint">
          {longDate(session.start)} · {hhmm(session.start)}
        </p>
        <h1 className="mt-0.5 text-display font-semibold">{copy.title}</h1>
        <p className="mt-1 text-caption text-content-muted">
          Día {session.dayIndex} · {session.dayName}
        </p>
      </header>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.34, ease: [0.22, 0.68, 0.28, 1] }}>
        <Card className={cx('overflow-hidden', verdict === 'record' && 'border-pr/35 shadow-glow-pr')}>
          <div className="flex items-start gap-4 p-4">
            <div className="shrink-0">
              <div className="text-micro font-semibold uppercase tracking-[0.09em] text-content-faint">Índice</div>
              <div
                className={cx(
                  'tnum mt-1 text-display-lg font-semibold tracking-tightest',
                  tone.tone === 'up' ? 'text-up' : tone.tone === 'down' ? 'text-down' : 'text-white',
                )}
              >
                {index ?? '—'}
              </div>
              <Pill tone={tone.tone} className="mt-1.5">
                {tone.label}
              </Pill>
            </div>
            <p className="min-w-0 flex-1 text-body text-content-muted">{headline}</p>
          </div>

          <div className="hairline grid grid-cols-2 gap-y-4 px-4 py-4 sm:grid-cols-4">
            <Stat label="Duración" value={duration(stats.durationSec)} />
            <Stat label="Tonelaje" value={tonnage(stats.tonnage)} tone="brand" />
            <Stat label="Series" value={stats.sets} hint={`${stats.reps} reps`} />
            <Stat label="Descanso medio" value={stats.restAvg != null ? clock(stats.restAvg) : '—'} hint={`${Math.round(stats.density)} kg/min`} />
          </div>
        </Card>
      </motion.div>

      {prs.length > 0 && (
        <section>
          <SectionTitle>Récords</SectionTitle>
          <div className="space-y-2">
            {prs.map((pr, i) => (
              <motion.div
                key={pr.exerciseId}
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.06 * i, type: 'spring', bounce: 0.24, duration: 0.42 }}
              >
                <Card className="flex items-center gap-3 border-pr/25 p-3.5">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-pr/12 text-pr">
                    <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7">
                      <path d="M6.5 3.5h7v3.2a3.5 3.5 0 01-7 0V3.5zM6.5 4.6H4.2v1.2a2.6 2.6 0 002.6 2.6M13.5 4.6h2.3v1.2a2.6 2.6 0 01-2.6 2.6M10 10.3v3.4M7.4 16.5h5.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body font-semibold text-white">{pr.name}</p>
                    <p className="tnum text-micro text-content-muted">
                      {kg(pr.weight)} kg × {pr.reps} · 1RM estimado {kg(pr.e1rm, 0)} kg
                    </p>
                  </div>
                  <Pill tone="pr">{signedPct(((pr.e1rm - pr.prev) / pr.prev) * 100, 1)}</Pill>
                </Card>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionTitle>Por grupo muscular</SectionTitle>
        <Card className="divide-y divide-line p-0">
          {muscles.map((m) => (
            <MuscleRow key={m.muscle} progress={m} />
          ))}
          {!muscles.length && <p className="p-5 text-center text-caption text-content-faint">Ninguna serie registrada.</p>}
        </Card>
      </section>

      {notes.length > 0 && (
        <section>
          <SectionTitle>Lectura del entreno</SectionTitle>
          <Card className="divide-y divide-line p-0">
            {notes.map((n, i) => {
              const icon = NOTE_ICON[n.kind];
              return (
                <div key={i} className="flex gap-3 p-3.5">
                  <span className={cx('mt-0.5 shrink-0', icon.color)} aria-label={icon.label}>
                    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                      {n.kind === 'good' ? (
                        <path d={icon.path} strokeLinecap="round" strokeLinejoin="round" />
                      ) : (
                        <>
                          <circle cx="10" cy="10" r="7.6" strokeWidth="1.5" />
                          <path d={icon.path} strokeLinecap="round" />
                        </>
                      )}
                    </svg>
                  </span>
                  <p className="text-body text-content-muted">{n.text}</p>
                </div>
              );
            })}
          </Card>
        </section>
      )}

      <section>
        <SectionTitle>Ejercicio a ejercicio</SectionTitle>
        <div className="space-y-2">
          {exercises.map((e) => (
            <Card key={e.exerciseId} className="p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-body font-semibold text-white">{e.name}</p>
                  <p className="tnum mt-0.5 text-micro text-content-faint">
                    {e.sets} series · mejor {e.best} · {tonnage(e.tonnage)}
                    {e.restAvg != null && ` · descanso ${clock(e.restAvg)}`}
                  </p>
                </div>
                {e.deltaPct != null && (
                  <Pill tone={e.deltaPct > 1 ? 'up' : e.deltaPct < -1 ? 'down' : 'neutral'}>{signedPct(e.deltaPct, 1)}</Pill>
                )}
              </div>
              <p
                className={cx(
                  'mt-2.5 rounded-lg px-2.5 py-2 text-caption',
                  e.advice.move === 'sube'
                    ? 'bg-up/8 text-up'
                    : e.advice.move === 'baja'
                      ? 'bg-down/8 text-down'
                      : 'bg-white/[0.03] text-content-muted',
                )}
              >
                <span className="font-semibold">La próxima vez: </span>
                {e.advice.text}
              </p>
            </Card>
          ))}
        </div>
      </section>

      {session.note && (
        <section>
          <SectionTitle>Tu nota</SectionTitle>
          <Card className="p-4">
            <p className="text-body italic text-content-muted">«{session.note}»</p>
          </Card>
        </section>
      )}

      <div className="flex gap-2 pt-1">
        {fresh ? (
          <Button variant="primary" block size="lg" onClick={() => onNavigate('/')}>
            Volver al inicio
          </Button>
        ) : (
          <>
            <Button variant="ghost" block onClick={() => onNavigate('/historial')}>
              Volver al historial
            </Button>
            <Button variant="quiet" onClick={() => setConfirmDelete(true)} aria-label="Borrar sesión">
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7">
                <path d="M4.5 6h11M8 6V4.4h4V6M6.4 6l.6 9.4h6l.6-9.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Button>
          </>
        )}
      </div>

      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Borrar esta sesión">
        <p className="pb-4 text-body text-content-muted">
          Desaparece del histórico y deja de contar en el progreso. No se puede deshacer.
        </p>
        <div className="flex gap-2 pb-4">
          <Button variant="ghost" block onClick={() => setConfirmDelete(false)}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            block
            buzz
            onClick={() => {
              deleteSession(session.id);
              setConfirmDelete(false);
              onDeleted();
            }}
          >
            Borrar
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

function MuscleRow({ progress }: { progress: MuscleProgress }) {
  const tone = indexTone(progress.index);
  const parts: [string, number | null][] = [
    ['Tonelaje', progress.parts.tonnage],
    ['Intensidad', progress.parts.intensity],
    ['Densidad', progress.parts.density],
  ];

  return (
    <div className="p-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-body font-semibold text-white">{MUSCLE_LABEL[progress.muscle]}</p>
          <p className="tnum mt-0.5 text-micro text-content-faint">
            {progress.current.sets.toFixed(1)} series efectivas · {tonnage(progress.current.tonnage)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={cx(
              'tnum text-figure font-semibold',
              tone.tone === 'up' ? 'text-up' : tone.tone === 'down' ? 'text-down' : 'text-white',
            )}
          >
            {progress.index ?? '—'}
          </span>
          <Pill tone={tone.tone}>{tone.label}</Pill>
        </div>
      </div>

      {progress.baseline && (
        <div className="mt-2.5 grid grid-cols-3 gap-2">
          {parts.map(([label, r]) => (
            <div key={label} className="rounded-lg bg-white/[0.03] px-2 py-1.5">
              <p className="text-micro text-content-faint">{label}</p>
              <p
                className={cx(
                  'tnum text-caption font-semibold',
                  r == null ? 'text-content-faint' : r > 1.02 ? 'text-up' : r < 0.98 ? 'text-down' : 'text-content',
                )}
              >
                {r == null ? 'sin dato' : signedPct((r - 1) * 100)}
              </p>
            </div>
          ))}
        </div>
      )}
      {!progress.baseline && (
        <p className="mt-2 text-micro text-content-faint">
          Sin sesiones anteriores de este grupo: esta pasa a ser la referencia.
        </p>
      )}
    </div>
  );
}
