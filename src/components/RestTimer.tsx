import { AnimatePresence, motion } from 'framer-motion';
import { clock } from '../lib/format';
import { haptic, type RestTimer as RestTimerState } from '../lib/hooks';
import { setTarget } from '../lib/timer';
import { Button, cx } from './ui';

/** Anillo de progreso del descanso. Al pasarse del objetivo se completa y
 *  cambia de color en vez de seguir girando: ya no hay nada que medir. */
function Ring({ ratio, over, size = 46 }: { ratio: number; over: boolean; size?: number }) {
  const r = size / 2 - 3.5;
  const c = 2 * Math.PI * r;
  const filled = Math.min(1, ratio);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.10)" strokeWidth="3" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={over ? '#F2B33D' : '#2E7BFF'}
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - filled)}
        style={{ transition: 'stroke-dashoffset 220ms cubic-bezier(.23,1,.32,1), stroke 240ms ease' }}
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
          initial={{ opacity: 0, y: 12, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: 12, filter: 'blur(6px)' }}
          transition={{ type: 'spring', bounce: 0.16, duration: 0.4 }}
          className={cx(
            'chrome-solid rounded-2xl border px-3 py-2.5 shadow-lift',
            over ? 'border-down/40' : 'border-brand/35',
          )}
        >
          {/* Dos filas: el tiempo y el botón de cerrar arriba, los ajustes
              debajo. En una sola fila no caben en un teléfono sin que la
              cifra grande —lo único que se mira de reojo entre serie y
              serie— quede aplastada. */}
          <div className="flex items-center gap-3">
            <div className="relative grid shrink-0 place-items-center">
              <Ring ratio={elapsed / target} over={over} size={42} />
              <span className={cx('absolute h-1.5 w-1.5 rounded-full', over ? 'bg-down' : 'bg-brand')}>
                <span
                  className={cx('absolute inset-0 animate-pulse2 rounded-full', over ? 'bg-down' : 'bg-brand')}
                />
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <span className="tnum block text-display-lg font-semibold leading-none tracking-tightest text-white">
                {clock(elapsed)}
              </span>
              <p className="mt-1 truncate text-micro text-content-muted">
                {over ? (
                  <span className="text-down">Objetivo superado por {clock(elapsed - target)}</span>
                ) : (
                  contextLabel ?? 'Descanso'
                )}
              </p>
            </div>

            <Button size="md" variant="primary" buzz onClick={() => onFinish(timer.stop())} className="h-12 shrink-0 px-5">
              Listo
            </Button>
          </div>

          <div className="mt-2 flex items-center gap-2 border-t border-line pt-2">
            <span className="tnum flex-1 truncate text-micro text-content-faint">
              Objetivo {clock(target)}
            </span>
            <TargetNudge delta={-15} onNudge={() => setTarget(target - 15)} />
            <TargetNudge delta={15} onNudge={() => setTarget(target + 15)} />
          </div>
        </motion.div>
      ) : (
        <motion.div
          key="idle"
          layout
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
          className="chrome flex items-center gap-2 rounded-2xl border border-line px-3 py-2"
        >
          <button
            onClick={() => {
              haptic();
              timer.start(defaultTarget);
            }}
            className="pressable flex flex-1 items-center gap-2.5 rounded-xl py-1.5 text-left"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line bg-white/5 text-content-muted">
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7">
                <circle cx="10" cy="11" r="6.2" />
                <path d="M10 8.2V11l1.9 1.2M8 2.6h4M10 2.6v2" strokeLinecap="round" />
              </svg>
            </span>
            <span className="min-w-0">
              <span className="block text-body font-semibold text-white">Empezar descanso</span>
              <span className="block truncate text-micro text-content-faint">
                Objetivo {clock(defaultTarget)} · también arranca solo al marcar una serie
              </span>
            </span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function TargetNudge({ delta, onNudge }: { delta: number; onNudge: () => void }) {
  return (
    <button
      onClick={() => {
        haptic(8);
        onNudge();
      }}
      aria-label={`${delta > 0 ? 'Añadir' : 'Quitar'} ${Math.abs(delta)} segundos al objetivo`}
      className="pressable tnum grid h-8 w-12 shrink-0 place-items-center rounded-lg border border-line bg-white/[0.04] text-micro font-semibold text-content-muted transition-colors duration-press hover:bg-white/8 hover:text-white"
    >
      {delta > 0 ? '+15' : '−15'}
    </button>
  );
}
