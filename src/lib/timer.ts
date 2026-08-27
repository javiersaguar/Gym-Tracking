/**
 * Cronómetro de descanso.
 *
 * Vive fuera de React y se guarda en localStorage porque tiene que sobrevivir
 * a que se bloquee el móvil, se cierre la pestaña o Android mate la app en
 * segundo plano: se apunta el instante de arranque y el tiempo transcurrido
 * se deduce del reloj, nunca de un contador que se incrementa. Así no se
 * pierde ni un segundo aunque el navegador congele los temporizadores.
 */
const KEY = 'gym-tracking:timer';

export type TimerSnapshot = {
  startedAt: number | null;
  target: number;
  /** Qué serie va a rellenar este descanso, para volver a ella. */
  slot: { exIdx: number; setIdx: number } | null;
  /**
   * Descanso ya medido y a la espera de que se marque la serie siguiente.
   *
   * Existe porque parar el cronómetro y marcar la serie son dos gestos
   * distintos: se pulsa «Listo» al levantarse de la máquina y la serie se
   * marca al terminarla, medio minuto después. Sin esto, ese descanso —que
   * está medido— se perdería y la densidad saldría inventada.
   */
  pending: number | null;
};

let state: TimerSnapshot = load();
const listeners = new Set<() => void>();

const EMPTY: TimerSnapshot = { startedAt: null, target: 120, slot: null, pending: null };

function load(): TimerSnapshot {
  if (typeof localStorage === 'undefined') return { ...EMPTY };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const p = JSON.parse(raw) as Partial<TimerSnapshot>;
    return {
      startedAt: p.startedAt ?? null,
      target: p.target ?? 120,
      slot: p.slot ?? null,
      pending: p.pending ?? null,
    };
  } catch {
    return { ...EMPTY };
  }
}

function commit(next: TimerSnapshot) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* sin almacenamiento: el cronómetro sigue funcionando en memoria */
  }
  for (const l of listeners) l();
}

export function getTimer(): TimerSnapshot {
  return state;
}

export function subscribeTimer(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function startRest(target: number, slot: TimerSnapshot['slot'] = null): void {
  /* Un descanso nuevo invalida el anterior sin consumir: si no se marcó la
     serie, ese tiempo ya no corresponde a nada. */
  commit({ startedAt: Date.now(), target, slot, pending: null });
}

export function stopRest(): number {
  const elapsed = Math.round(elapsedSec());
  commit({ ...state, startedAt: null, slot: null, pending: elapsed });
  return elapsed;
}

/** Recoge el descanso parado a mano y lo da por gastado. */
export function takePending(): number | null {
  const { pending } = state;
  if (pending == null) return null;
  commit({ ...state, pending: null });
  return pending;
}

export function setTarget(target: number): void {
  commit({ ...state, target: Math.max(15, Math.min(900, target)) });
}

export function elapsedSec(now = Date.now()): number {
  if (!state.startedAt) return 0;
  return Math.max(0, (now - state.startedAt) / 1000);
}

/* ── Aviso al llegar al objetivo ─────────────────────────────────────────── */

let alerted = false;

export function resetAlert(): void {
  alerted = false;
}

/**
 * Pitido corto y vibración cuando el descanso llega al objetivo. Se sintetiza
 * con WebAudio en vez de cargar un mp3: un archivo de audio habría que
 * cachearlo, y esto pesa cero y funciona igual sin conexión.
 */
export function ring(): void {
  if (alerted) return;
  alerted = true;

  try {
    navigator.vibrate?.([120, 80, 120]);
  } catch {
    /* el navegador no vibra */
  }

  try {
    const Ctx = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    /* Dos notas cortas: se oye por encima del gimnasio sin ser una alarma. */
    for (const [i, freq] of [880, 1320].entries()) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = now + i * 0.16;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.22, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.16);
    }
    setTimeout(() => void ctx.close(), 600);
  } catch {
    /* audio bloqueado hasta que haya un gesto del usuario */
  }
}
