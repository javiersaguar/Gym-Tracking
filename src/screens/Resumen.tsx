import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { Button, Card, Pill, Rule, SectionTitle, Sheet, Stat, cx } from '../components/ui';
import { deleteSession } from '../lib/actions';
import { analyse, VERDICT_COPY, type Note } from '../lib/analysis';
import { clock, duration, hhmm, kg, longDate, plural, signedPct, tonnage } from '../lib/format';
import type { MuscleProgress } from '../lib/metrics';
import { MUSCLE_LABEL, type Session, type Store } from '../lib/types';

/** Etiqueta del índice. Siempre con texto: el color por sí solo no informa. */
function indexTone(index: number | null) {
  if (index == null) return { tone: 'neutral' as const, label: 'Primera vez', text: 'text-ink' };
  if (index >= 106) return { tone: 'good' as const, label: 'Por encima', text: 'text-good-ink' };
  if (index >= 94) return { tone: 'neutral' as const, label: 'En línea', text: 'text-ink' };
  return { tone: 'warn' as const, label: 'Por debajo', text: 'text-warn-ink' };
}

const NOTE_ICON: Record<Note['kind'], { path: string; color: string; label: string }> = {
  good: { path: 'M4.8 10.4l3.5 3.5 7-7.8', color: 'text-good-ink', label: 'A favor' },
  watch: { path: 'M10 5.8v4.8M10 14v.3', color: 'text-warn-ink', label: 'Atención' },
  info: { path: 'M10 9.2v5.2M10 5.9v.3', color: 'text-ink-faint', label: 'Dato' },
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
    <div className="space-y-10 pb-8">
      <header>
        <p className="text-caption text-ink-faint">
          {longDate(session.start)} · {hhmm(session.start)}
        </p>
        <h1 className="mt-2 font-display text-display-lg">{copy.title}</h1>
        <p className="mt-2 text-caption text-ink-muted">
          Día {session.dayIndex} · {session.dayName}
        </p>
      </header>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
        <Card className={cx('overflow-hidden', verdict === 'record' && 'border-accent/35')}>
          <div className="flex items-start gap-5 p-6">
            <div className="shrink-0">
              <div className="label">Índice</div>
              <div
                className={cx(
                  'tnum mt-1.5 font-medium tracking-tightest',
                  index == null ? 'text-figure text-ink-faint' : 'text-figure-xl',
                  index != null && tone.text,
                )}
              >
                {index ?? 'sin dato'}
              </div>
              <Pill tone={tone.tone} className="mt-2">
                {tone.label}
              </Pill>
            </div>
            <p className="min-w-0 flex-1 text-body text-ink-muted">{headline}</p>
          </div>

          <div className="grid grid-cols-2 gap-y-5 border-t border-line px-6 py-5 sm:grid-cols-4">
            <Stat label="Duración" value={duration(stats.durationSec)} />
            <Stat label="Tonelaje" value={tonnage(stats.tonnage)} tone="accent" />
            <Stat label="Series" value={stats.sets} hint={`${stats.reps} reps`} />
            <Stat
              label="Descanso medio"
              value={stats.restAvg != null ? clock(stats.restAvg) : '—'}
              hint={`${Math.round(stats.density)} kg/min`}
            />
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
                transition={{ delay: 0.07 * i, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              >
                <Card className="flex items-center gap-4 border-accent/25 p-4">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-info-wash text-info-ink">
                    <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7">
                      <path d="M6.6 3.6h6.8v3.1a3.4 3.4 0 01-6.8 0V3.6zM6.6 4.7H4.4v1.1a2.5 2.5 0 002.5 2.5M13.4 4.7h2.2v1.1a2.5 2.5 0 01-2.5 2.5M10 10.2v3.3M7.5 16.4h5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body font-medium text-ink">{pr.name}</p>
                    <p className="tnum text-micro text-ink-muted">
                      {kg(pr.weight)} kg × {pr.reps} · 1RM estimado {kg(pr.e1rm, 0)} kg
                    </p>
                  </div>
                  <Pill tone="accent">{signedPct(((pr.e1rm - pr.prev) / pr.prev) * 100, 1)}</Pill>
                </Card>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionTitle>Por grupo muscular</SectionTitle>
        <div className="border-t border-line">
          {muscles.map((m) => (
            <MuscleRow key={m.muscle} progress={m} />
          ))}
          {!muscles.length && <p className="py-6 text-caption text-ink-faint">Ninguna serie registrada.</p>}
        </div>
      </section>

      {notes.length > 0 && (
        <section>
          <SectionTitle>Lectura del entreno</SectionTitle>
          <div className="border-t border-line">
            {notes.map((n, i) => {
              const icon = NOTE_ICON[n.kind];
              return (
                <div key={i} className="flex gap-3.5 border-b border-line py-4">
                  <span className={cx('mt-[3px] shrink-0', icon.color)} aria-label={icon.label}>
                    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9">
                      {n.kind === 'good' ? (
                        <path d={icon.path} strokeLinecap="round" strokeLinejoin="round" />
                      ) : (
                        <>
                          <circle cx="10" cy="10" r="7.4" strokeWidth="1.4" />
                          <path d={icon.path} strokeLinecap="round" />
                        </>
                      )}
                    </svg>
                  </span>
                  <p className="text-body text-ink-muted">{n.text}</p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <SectionTitle>Ejercicio a ejercicio</SectionTitle>
        <div className="space-y-2.5">
          {exercises.map((e) => (
            <Card key={e.exerciseId} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-body font-medium text-ink">{e.name}</p>
                  <p className="tnum mt-1 text-micro text-ink-faint">
                    {plural(e.sets, 'serie')} · mejor {e.best} · {tonnage(e.tonnage)}
                    {e.restAvg != null && ` · descanso ${clock(e.restAvg)}`}
                  </p>
                </div>
                {e.deltaPct != null && (
                  <Pill tone={e.deltaPct > 1 ? 'good' : e.deltaPct < -1 ? 'warn' : 'neutral'}>
                    {signedPct(e.deltaPct, 1)}
                  </Pill>
                )}
              </div>
              <p
                className={cx(
                  'mt-3 rounded-md px-3 py-2.5 text-caption',
                  e.advice.move === 'sube'
                    ? 'bg-good-wash text-good-ink'
                    : e.advice.move === 'baja'
                      ? 'bg-warn-wash text-warn-ink'
                      : 'bg-canvas text-ink-muted',
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
          <p className="border-l-2 border-line pl-4 font-display text-title-lg text-ink-muted">«{session.note}»</p>
        </section>
      )}

      <Rule />

      <div className="flex gap-2">
        {fresh ? (
          <Button variant="primary" block size="lg" onClick={() => onNavigate('/')}>
            Volver a la portada
          </Button>
        ) : (
          <>
            <Button variant="outline" block onClick={() => onNavigate('/historial')}>
              Volver al historial
            </Button>
            <Button variant="quiet" onClick={() => setConfirmDelete(true)} aria-label="Borrar sesión">
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7">
                <path d="M4.6 6h10.8M8 6V4.5h4V6M6.5 6l.6 9.3h5.8l.6-9.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Button>
          </>
        )}
      </div>

      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Borrar esta sesión">
        <p className="pb-4 text-body text-ink-muted">
          Desaparece del histórico y deja de contar en el progreso. No se puede deshacer.
        </p>
        <div className="flex gap-2 pb-4">
          <Button variant="outline" block onClick={() => setConfirmDelete(false)}>
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
    <div className="border-b border-line py-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-body font-medium text-ink">{MUSCLE_LABEL[progress.muscle]}</p>
          <p className="tnum mt-1 text-micro text-ink-faint">
            {progress.current.sets.toFixed(1)} series efectivas · {tonnage(progress.current.tonnage)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <span className={cx('tnum font-medium', progress.index == null ? 'text-caption text-ink-faint' : cx('text-figure', tone.text))}>
            {progress.index ?? 'sin dato'}
          </span>
          <Pill tone={tone.tone}>{tone.label}</Pill>
        </div>
      </div>

      {progress.baseline && (
        <dl className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-line bg-line">
          {parts.map(([label, r]) => (
            <div key={label} className="bg-paper px-3 py-2">
              <dt className="text-micro text-ink-faint">{label}</dt>
              <dd
                className={cx(
                  'tnum mt-0.5 text-caption font-medium',
                  r == null ? 'text-ink-faint' : r > 1.02 ? 'text-good-ink' : r < 0.98 ? 'text-warn-ink' : 'text-ink',
                )}
              >
                {r == null ? 'sin dato' : signedPct((r - 1) * 100)}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {!progress.baseline && (
        <p className="mt-2 text-micro text-ink-faint">
          Sin sesiones anteriores de este grupo: esta pasa a ser la referencia.
        </p>
      )}
    </div>
  );
}
