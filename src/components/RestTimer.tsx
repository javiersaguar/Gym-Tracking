import { AnimatePresence, motion } from 'framer-motion';
import { clock } from '../lib/format';
import { haptic, type RestTimer as RestTimerState } from '../lib/hooks';
import { setTarget } from '../lib/timer';
import { Button, cx } from './ui';

/** Anillo de progreso del descanso. Al pasarse del objetivo se completa y
 *  cambia de color en vez de seguir girando: ya no hay nada que medir. */
function Ring({ ratio, over, size = 40 }: { ratio: number; over: boolean; size?: number }) {
  const r = size / 2 - 2.5;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 shrink-0" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E6E6E1" strokeWidth="2.5" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={over ? '#956400' : '#2B5AC0'}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.min(1, ratio))}
        style={{ transition: 'stroke-dashoffset 220ms cubic-bezier(.16,1,.3,1), stroke 240ms ease' }}
      />
    </svg>
  );
}

/**
 * Barra flotante del cronómetro de descanso.
 *
 * Cuenta hacia arriba, no hacia atrás: el objetivo es una referencia, no un
 * límite, y saber que llevas 2:40 cuando apuntabas a 2:00 es más útil que ver
 * un cero parado. El arranque es automático al marcar una serie, pero también
 * se puede lanzar a mano — a veces el descanso empieza antes de apuntar nada.
 */
export function RestTimer({
  timer,
  contextLabel,
  onFinish,
  defaultTarget,
}: {
  timer: RestTimerState;
  /** Qué ejercicio toca después, para no perder el hilo. */
  contextLabel?: string;
  /** Se llama con los segundos medidos al cerrar el descanso. */
  onFinish: (elapsed: number) => void;
  defaultTarget: number;
}) {
  const { running, elapsed, target } = timer;
  const over = running && elapsed >= target;

  return (
    <AnimatePresence mode="popLayout" initial={false}>
      {running ? (
        <motion.div
          key="run"
          layout
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ type: 'spring', bounce: 0.12, duration: 0.4 }}
          className={cx(
            'chrome-solid rounded-xl border shadow-float',
            over ? 'border-warn-ink/30' : 'border-accent/25',
          )}
        >
          {/* Dos filas: el tiempo y el botón de cerrar arriba, el objetivo
              debajo. En una sola no caben en un teléfono sin aplastar la
              cifra grande, que es lo único que se mira de reojo entre serie
              y serie. */}
          <div className="flex items-center gap-3 px-3 py-2.5">
            <Ring ratio={elapsed / target} over={over} />

            <div className="min-w-0 flex-1">
              <span className="tnum block text-figure-xl font-medium leading-none tracking-tightest text-ink">
                {clock(elapsed)}
              </span>
              <p className="mt-1.5 truncate text-micro text-ink-muted">
                {over ? (
                  <span className="text-warn-ink">Objetivo superado por {clock(elapsed - target)}</span>
                ) : (
                  (contextLabel ?? 'Descanso')
                )}
              </p>
            </div>

            <Button variant="primary" buzz onClick={() => onFinish(timer.stop())} className="h-11 shrink-0 px-5">
              Listo
            </Button>
          </div>

          <div className="flex items-center gap-2 border-t border-line px-3 py-2">
            <span className="tnum flex-1 truncate text-micro text-ink-faint">Objetivo {clock(target)}</span>
            <Nudge delta={-15} onNudge={() => setTarget(target - 15)} />
            <Nudge delta={15} onNudge={() => setTarget(target + 15)} />
          </div>
        </motion.div>
      ) : (
        <motion.div
          key="idle"
          layout
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="chrome-solid rounded-xl border border-line shadow-float"
        >
          <button
            onClick={() => {
              haptic();
              timer.start(defaultTarget);
            }}
            className="pressable flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-line bg-canvas text-ink-muted">
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7">
                <circle cx="10" cy="11.2" r="6" />
                <path d="M10 8.4v2.8l1.9 1.2M8 2.8h4M10 2.8v2" strokeLinecap="round" />
              </svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-body font-medium text-ink">Empezar descanso</span>
              <span className="tnum block truncate text-micro text-ink-faint">
                Objetivo {clock(defaultTarget)} · también arranca solo al marcar una serie
              </span>
            </span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Nudge({ delta, onNudge }: { delta: number; onNudge: () => void }) {
  return (
    <button
      onClick={() => {
        haptic(8);
        onNudge();
      }}
      aria-label={`${delta > 0 ? 'Añadir' : 'Quitar'} ${Math.abs(delta)} segundos al objetivo`}
      className="pressable tnum grid h-7 w-11 shrink-0 place-items-center rounded-md border border-line text-micro font-medium text-ink-muted transition-colors duration-press hover:border-line-strong hover:bg-sunken hover:text-ink"
    >
      {delta > 0 ? '+15' : '−15'}
    </button>
  );
}
