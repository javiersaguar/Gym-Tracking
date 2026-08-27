import { defaultRoutine, seedReferences } from './routine';
import type { Session, Settings, Store } from './types';

const KEY = 'gym-tracking:v1';
const VERSION = 1;

export const DEFAULT_SETTINGS: Settings = {
  defaultRest: 120,
  restAlert: true,
  weightStep: 2.5,
  keepAwake: true,
};

function emptyStore(): Store {
  return {
    version: VERSION,
    routine: defaultRoutine(),
    sessions: [],
    active: null,
    seedRefs: seedReferences(),
    settings: { ...DEFAULT_SETTINGS },
  };
}

/**
 * Todo vive en localStorage. Es síncrono, no pide permisos y no necesita
 * red: exactamente lo que hace falta en un sótano sin cobertura. El volumen
 * de datos de un año de entrenos ronda unos pocos cientos de KB, muy por
 * debajo del límite del navegador.
 */
function read(): Store {
  if (typeof localStorage === 'undefined') return emptyStore();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as Partial<Store>;
    const base = emptyStore();
    return {
      version: VERSION,
      routine: parsed.routine ?? base.routine,
      sessions: parsed.sessions ?? [],
      active: parsed.active ?? null,
      seedRefs: parsed.seedRefs ?? base.seedRefs,
      settings: { ...base.settings, ...(parsed.settings ?? {}) },
    };
  } catch {
    /* Un JSON corrupto no puede dejar la app en blanco para siempre: se
       guarda a un lado por si se puede rescatar a mano y se sigue. */
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) localStorage.setItem(`${KEY}:corrupto:${Date.now()}`, raw);
    } catch {
      /* sin espacio para la copia: seguimos igualmente */
    }
    return emptyStore();
  }
}

let state: Store = read();
const listeners = new Set<() => void>();
let writeTimer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  writeTimer = null;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* Cuota llena o modo privado. La sesión en curso sigue en memoria; no se
       pierde el entreno por no poder escribir. */
  }
}

/** Escribe agrupando ráfagas: teclear un peso no debe serializar 8 veces. */
function persist() {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(flush, 120);
}

export function getStore(): Store {
  return state;
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function update(fn: (s: Store) => Store): void {
  state = fn(state);
  persist();
  for (const l of listeners) l();
}

/** Fuerza el guardado inmediato. Se llama al cerrar u ocultar la pestaña. */
export function flushNow(): void {
  if (writeTimer) clearTimeout(writeTimer);
  flush();
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushNow);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushNow();
  });
  /* Otra pestaña de la misma app tocando los datos. Raro, pero si pasa, la
     alternativa es escribir encima de lo que hizo la otra. */
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY || !e.newValue) return;
    state = read();
    for (const l of listeners) l();
  });
}

/* ── Importar / exportar ─────────────────────────────────────────────────── */

export function exportJson(): string {
  return JSON.stringify(state, null, 2);
}

export function importJson(raw: string): { ok: true } | { ok: false; error: string } {
  let parsed: Partial<Store>;
  try {
    parsed = JSON.parse(raw) as Partial<Store>;
  } catch {
    return { ok: false, error: 'El archivo no es un JSON válido.' };
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.sessions) || !parsed.routine) {
    return { ok: false, error: 'El archivo no parece una copia de Gym Tracking.' };
  }
  const base = emptyStore();
  update(() => ({
    version: VERSION,
    routine: parsed.routine ?? base.routine,
    sessions: (parsed.sessions ?? []) as Session[],
    active: parsed.active ?? null,
    seedRefs: parsed.seedRefs ?? base.seedRefs,
    settings: { ...base.settings, ...(parsed.settings ?? {}) },
  }));
  return { ok: true };
}

export function resetAll(): void {
  update(() => emptyStore());
  flushNow();
}

export function resetRoutine(): void {
  update((s) => ({ ...s, routine: defaultRoutine() }));
}
