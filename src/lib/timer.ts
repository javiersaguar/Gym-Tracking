/**
 * Cronómetro de descanso.
 *
 * Cuenta hacia arriba y sin objetivo: en un gimnasio lleno el descanso lo
 * decide la cola de la prensa, no una cifra configurada, así que el reloj
 * informa y lo paras tú cuando vas a la siguiente serie.
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
  /** Qué serie va a rellenar este descanso, para volver a ella. */
  slot: { exIdx: number; setIdx: number } | null;
  /**
   * Descanso ya medido y a la espera de que se marque la serie siguiente.
   *
   * Existe porque parar el cronómetro y marcar la serie son dos gestos
   * distintos: se pulsa «Listo» al levantarse de la máquina y la serie se
   * marca al terminarla, medio minuto después. Sin esto, ese descanso —que
   * está medido— se perdería.
   */
  pending: number | null;
};

const EMPTY: TimerSnapshot = { startedAt: null, slot: null, pending: null };

let state: TimerSnapshot = load();
const listeners = new Set<() => void>();

function load(): TimerSnapshot {
  if (typeof localStorage === 'undefined') return { ...EMPTY };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const p = JSON.parse(raw) as Partial<TimerSnapshot>;
    return { startedAt: p.startedAt ?? null, slot: p.slot ?? null, pending: p.pending ?? null };
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

export function startRest(slot: TimerSnapshot['slot'] = null): void {
  /* Un descanso nuevo invalida el anterior sin consumir: si no se marcó la
     serie, ese tiempo ya no corresponde a nada. */
  commit({ startedAt: Date.now(), slot, pending: null });
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

export function clearTimer(): void {
  commit({ ...EMPTY });
}

export function elapsedSec(now = Date.now()): number {
  if (!state.startedAt) return 0;
  return Math.max(0, (now - state.startedAt) / 1000);
}

/** Vibración corta al parar el descanso. Sin sonidos: ya no hay objetivo al
 *  que llegar, así que no hay nada que anunciar. */
export function buzz(pattern: number | number[] = 12): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* sin motor de vibración */
  }
}
