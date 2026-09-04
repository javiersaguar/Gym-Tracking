import { useMemo } from 'react';
import { Wordmark } from '../components/Wordmark';
import { Button, cx } from '../components/ui';
import { cycleState } from '../lib/actions';
import { startDemo, stopDemo } from '../lib/demo';
import { isDemo } from '../lib/storage';
import { duration, longDate, plural, relativeDay, tonnage } from '../lib/format';
import { haptic } from '../lib/hooks';
import { sessionStats } from '../lib/metrics';
import type { Store } from '../lib/types';

/**
 * Portada: lo primero que se ve al abrir la app.
 *
 * No es un panel de control, es un vestíbulo. Dice qué día toca y a dónde se
 * puede ir, y nada más: una sola frase grande en serif, un botón, y las
 * secciones como una lista separada por líneas de un píxel. Las cifras del
 * pie están al final a propósito — son contexto, no la razón de abrir la app.
 */
export function Portada({
  store,
  onStart,
  onNavigate,
}: {
  store: Store;
  onStart: (dayId: string) => void;
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
    };
  }, [store.sessions]);

  const total = useMemo(() => {
    const stats = store.sessions.map(sessionStats);
    return { count: stats.length, tonnage: stats.reduce((a, b) => a + b.tonnage, 0) };
  }, [store.sessions]);

  const [firstLine, secondLine] = splitHeading(active ? active.dayName : day.rest ? 'Descanso' : day.name);

  const destinos = [
    { to: '/hoy', title: 'Hoy', body: 'El ciclo completo, la semana y la constancia' },
    { to: '/progreso', title: 'Progreso', body: 'Mapa muscular, kilos por grupo y fuerza' },
    {
      to: '/registro',
      title: 'Registro',
      body: total.count ? 'Cada serie con su peso, RIR y descanso' : 'Cada serie, cuando empieces a apuntar',
    },
    {
      to: '/historial',
      title: 'Análisis',
      body: total.count
        ? `${plural(total.count, 'entreno')} · ${tonnage(total.tonnage)} movidos`
        : 'Todavía sin entrenos guardados',
    },
    { to: '/rutina', title: 'Rutina', body: `${store.routine.name} · editable ejercicio a ejercicio` },
    { to: '/ajustes', title: 'Ajustes', body: 'Descansos, avisos y copia de tus datos' },
  ];

  return (
    <div className="flex min-h-[100dvh] flex-col px-6 safe-bottom">
      <header className="safe-top pb-16 pt-4">
        <Wordmark />
      </header>

      <main className="stagger flex-1">
        <p className="text-caption text-ink-muted" style={{ '--i': 0 } as React.CSSProperties}>
          {longDate(Date.now())}
        </p>

        <h1
          className="mt-4 font-display text-display-xl text-ink"
          style={{ '--i': 1 } as React.CSSProperties}
        >
          {firstLine}
          {secondLine && (
            <>
              <br />
              <span className="text-ink-muted">{secondLine}</span>
            </>
          )}
        </h1>

        <p className="mt-5 max-w-sm text-body text-ink-muted" style={{ '--i': 2 } as React.CSSProperties}>
          {active
            ? `Entreno en curso desde las ${new Date(active.start).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}. Te quedan ${plural(pendingSets(store), 'serie')} por marcar.`
            : cycle.trainedToday
              ? /* El titular grande es el día siguiente, no el de hoy: sin
                   decirlo, un «Descanso» enorme justo después de entrenar se
                   lee como si hoy tocara descansar. */
                `Ya has entrenado hoy. Lo siguiente es el día ${day.index}${day.rest ? ': descanso' : ''}.`
              : day.rest
                ? `Día ${day.index} del ciclo. Si prefieres entrenar, elige otro día desde la rutina.`
              : `Día ${day.index} del ciclo · ${plural(day.exercises.length, 'ejercicio')} · ${plural(
                  day.exercises.reduce((a, e) => a + e.plannedSets, 0),
                  'serie',
                )}`}
        </p>

        <div className="mt-8 flex flex-wrap gap-2" style={{ '--i': 3 } as React.CSSProperties}>
          {active ? (
            <Button variant="primary" size="lg" buzz onClick={() => onNavigate('/entreno')}>
              Seguir con el entreno
              <Arrow />
            </Button>
          ) : (
            <Button
              variant="primary"
              size="lg"
              buzz
              onClick={() => (day.rest ? onNavigate('/rutina') : onStart(day.id))}
            >
              {day.rest ? 'Elegir un día' : 'Empezar entreno'}
              <Arrow />
            </Button>
          )}
          {cycle.lastSession && !active && (
            <Button variant="quiet" size="lg" onClick={() => onNavigate(`/sesion/${cycle.lastSession?.id}`)}>
              Análisis de {relativeDay(cycle.lastSession.start).toLowerCase()}
            </Button>
          )}
        </div>

        {/* Las secciones, como un índice: solo líneas, sin cajas ni iconos. */}
        <nav className="mt-16 border-t border-line" style={{ '--i': 4 } as React.CSSProperties}>
          {destinos.map((d) => (
            <button
              key={d.to}
              onClick={() => {
                haptic(8);
                onNavigate(d.to);
              }}
              className="group flex w-full items-center gap-4 border-b border-line py-4 text-left transition-colors duration-panel hover:bg-paper"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-body-lg font-medium text-ink transition-colors duration-panel group-hover:text-accent">
                  {d.title}
                </span>
                <span className="mt-0.5 block truncate text-caption text-ink-faint transition-colors duration-panel group-hover:text-ink-muted">
                {d.body}
              </span>
              </span>
              <Arrow className="text-ink-faint transition-transform duration-panel ease-out group-hover:translate-x-0.5 group-hover:text-ink" />
            </button>
          ))}
        </nav>
      </main>

      {/* Abajo del todo, apartado del camino normal: una app de seguimiento
          vacía no se puede juzgar —el mapa sale gris y las gráficas sin
          línea—, así que hay una forma de verla llena antes de tener datos
          propios. Los de verdad no se tocan: el ejemplo vive en memoria. */}
      <section className="mt-16 border-t border-line pt-5" style={{ '--i': 5 } as React.CSSProperties}>
        {isDemo() ? (
          <>
            <p className="text-caption text-ink-muted">
              Estás viendo un histórico de ejemplo de catorce semanas. Tus datos siguen guardados y sin tocar.
            </p>
            <Button className="mt-3" variant="quiet" onClick={() => stopDemo()}>
              Salir del ejemplo
            </Button>
          </>
        ) : (
          <>
            <p className="text-caption text-ink-muted">
              ¿Quieres ver cómo queda con datos? Carga un histórico de ejemplo y recórrelo entero: mapa
              muscular, gráficas de fuerza, récords y registro. No se guarda nada.
            </p>
            <Button
              className="mt-3"
              variant="quiet"
              onClick={() => {
                haptic();
                startDemo();
                onNavigate('/progreso');
              }}
            >
              Ver la app con datos de ejemplo
              <Arrow />
            </Button>
          </>
        )}
      </section>

      <footer className="mt-14 flex items-baseline justify-between gap-4 border-t border-line pb-6 pt-4">
        <span className="label">Últimos 7 días</span>
        <span className={cx('tnum text-caption', week.count ? 'text-ink' : 'text-ink-faint')}>
          {week.count
            ? `${plural(week.count, 'entreno')} · ${tonnage(week.tonnage)} · ${duration(week.time)}`
            : 'Sin entrenos esta semana'}
        </span>
      </footer>
    </div>
  );
}

/* Palabras con las que una línea no puede terminar: dejar una «y» colgando
   al final del primer renglón canta mucho a este tamaño. */
const CONNECTORS = new Set(['y', 'e', 'de', 'del', 'la', 'el', 'en', 'con']);

/**
 * Parte el nombre del día en dos renglones equilibrados. En serif a 3,5 rem
 * una línea larga se sale o se encoge; dos cortas se leen de un vistazo.
 */
function splitHeading(text: string): [string, string] {
  const words = text.split(' ');
  if (words.length < 2) return [text, ''];

  let cut = Math.ceil(words.length / 2);
  while (cut > 1 && CONNECTORS.has((words[cut - 1] as string).toLowerCase())) cut -= 1;

  return [words.slice(0, cut).join(' '), words.slice(cut).join(' ')];
}

function pendingSets(store: Store): number {
  if (!store.active) return 0;
  let n = 0;
  for (const ex of store.active.exercises) {
    if (ex.skipped) continue;
    n += ex.sets.filter((s) => !s.done).length;
  }
  return n;
}

function Arrow({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={cx('h-4 w-4 shrink-0', className)} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 10h11M10.5 5.5L15 10l-4.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
