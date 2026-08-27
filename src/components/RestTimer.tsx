import { AnimatePresence, motion } from 'framer-motion';
import { clock } from '../lib/format';
import { haptic, type RestTimer as RestTimerState } from '../lib/hooks';
import { Button, cx } from './ui';

/**
 * Cronómetro de descanso.
 *
 * Cuenta hacia arriba y sin objetivo. En un gimnasio lleno el descanso lo
 * decide la cola de la prensa, no un ajuste, así que el reloj informa y lo
 * paras tú al ir a la siguiente serie. El anillo no marca progreso hacia
 * ninguna meta: solo da una referencia visual de la escala de minutos.
 */
function Dial({ elapsed }: { elapsed: number }) {
  const size = 40;
  const r = size / 2 - 2.5;
  const c = 2 * Math.PI * r;
  /* Una vuelta completa por minuto: se lee de un vistazo si llevas medio
     minuto o dos y medio, sin necesidad de un objetivo. */
  const turn = (elapsed % 60) / 60;
  const minutes = Math.floor(elapsed / 60);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" aria-hidden>
      <g className="origin-center -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E6E6E1" strokeWidth="2.5" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#2B5AC0"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - turn)}
          style={{ transition: 'stroke-dashoffset 260ms cubic-bezier(.16,1,.3,1)' }}
        />
      </g>
      {minutes > 0 && (
        <text
          x="50%"
          y="50%"
          dominantBaseline="central"
          textAnchor="middle"
          className="fill-accent text-[11px] font-semibold"
        >
          {minutes}′
        </text>
      )}
    </svg>
  );
}

export function RestTimer({
  timer,
  contextLabel,
  onFinish,
}: {
  timer: RestTimerState;
  /** Qué toca después, para no perder el hilo. */
  contextLabel?: string;
  /** Se llama con los segundos medidos y la serie a la que corresponden. */
  onFinish: (elapsed: number, slot: { exIdx: number; setIdx: number } | null) => void;
}) {
  const { running, elapsed } = timer;
  /* A partir de cinco minutos deja de ser un descanso y pasa a ser una
     espera: se dice, sin regañar, porque cambia cómo leer la serie siguiente. */
  const long = running && elapsed >= 300;

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
          className="rounded-xl border border-accent/30 bg-paper shadow-float"
        >
          <div className="flex items-center gap-3 px-3 py-2.5">
            <Dial elapsed={elapsed} />

            <div className="min-w-0 flex-1">
              <span className="tnum block text-figure-xl font-medium leading-none tracking-tightest text-ink">
                {clock(elapsed)}
              </span>
              <p className="mt-1.5 truncate text-micro text-ink-muted">
                {long ? (
                  <span className="text-accent">Descanso largo · se descuenta al comparar</span>
                ) : (
                  (contextLabel ?? 'Descansando')
                )}
              </p>
            </div>

            <Button
              variant="primary"
              buzz
              onClick={() => {
                /* El slot hay que leerlo antes: `stop` lo borra. Y el tiempo
                   sale de `stop`, que mira el reloj, no del último repintado. */
                const slot = timer.slot;
                onFinish(timer.stop(), slot);
              }}
              className="h-11 shrink-0 px-5"
            >
              Listo
            </Button>
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
          className="rounded-xl border border-line bg-paper shadow-float"
        >
          <button
            onClick={() => {
              haptic();
              timer.start();
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
              <span className="block truncate text-micro text-ink-faint">
                También arranca solo al marcar una serie
              </span>
            </span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Cronómetro de la sesión entera. Va en la cabecera y no se para: mide desde
 * que empiezas hasta que cierras, esperas incluidas.
 */
export function SessionClock({ elapsed, className }: { elapsed: number; className?: string }) {
  return (
    <span className={cx('tnum inline-flex items-center gap-1.5', className)}>
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        <span className="absolute inset-0 animate-breathe rounded-full bg-accent" />
      </span>
      {clock(elapsed)}
    </span>
  );
}
