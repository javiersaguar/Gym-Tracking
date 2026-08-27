import { defaultRoutine, seedReferences } from './routine';
import type { Session, Settings, Store } from './types';

const KEY = 'gym-tracking:v1';
const VERSION = 2;

export const DEFAULT_SETTINGS: Settings = {
  weightStep: 2.5,
  keepAwake: true,
  backupEvery: 8,
  lastBackupCount: 0,
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
    return migrate(parsed);
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

/**
 * Sube los datos guardados a la versión actual del modelo.
 *
 * La v2 quitó el descanso objetivo por ejercicio —el gimnasio decide el
 * descanso, no un ajuste— y añadió el RIR por serie. Nada de esto invalida un
 * histórico anterior: los campos que sobran se ignoran y los que faltan
 * entran a null, que el algoritmo ya sabe tratar como «sin dato».
 */
function migrate(parsed: Partial<Store>): Store {
  const base = emptyStore();
  const fixSession = (s: Session): Session => ({
    ...s,
    exercises: (s.exercises ?? []).map((ex) => {
      const { targetRest: _drop, ...rest } = ex as typeof ex & { targetRest?: number };
      return {
        ...rest,
        sets: (ex.sets ?? []).map((set) => ({ ...set, rir: set.rir ?? null })),
      };
    }),
  });

  const routine = parsed.routine ?? base.routine;

  return {
    version: VERSION,
    routine: {
      ...routine,
      days: (routine.days ?? []).map((d) => ({
        ...d,
        exercises: (d.exercises ?? []).map((ex) => {
          const { targetRest: _drop, ...rest } = ex as typeof ex & { targetRest?: number };
          return rest;
        }),
      })),
    },
    sessions: (parsed.sessions ?? []).map(fixSession),
    active: parsed.active ? fixSession(parsed.active) : null,
    seedRefs: parsed.seedRefs ?? base.seedRefs,
    settings: { ...base.settings, ...(parsed.settings ?? {}) },
  };
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
  update(() => migrate(parsed));
  return { ok: true };
}

export function resetAll(): void {
  update(() => emptyStore());
  flushNow();
}

export function resetRoutine(): void {
  update((s) => ({ ...s, routine: defaultRoutine() }));
}


/* ── Almacenamiento duradero ─────────────────────────────────────────────── */

/**
 * Pide al navegador que no borre estos datos para hacer sitio.
 *
 * Sin esto, el almacenamiento de un sitio web es «best effort»: si el móvil
 * anda justo de espacio, puede desaparecer un año de entrenos sin avisar. Con
 * la app instalada en la pantalla de inicio, los navegadores suelen conceder
 * el permiso sin preguntar nada.
 */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function storageInfo(): Promise<{ persisted: boolean; usedKB: number | null }> {
  let persisted = false;
  let usedKB: number | null = null;
  try {
    persisted = (await navigator.storage?.persisted?.()) ?? false;
    const est = await navigator.storage?.estimate?.();
    if (est?.usage != null) usedKB = Math.round(est.usage / 1024);
  } catch {
    /* el navegador no expone el dato */
  }
  if (usedKB == null) {
    try {
      usedKB = Math.round(new Blob([localStorage.getItem(KEY) ?? '']).size / 1024);
    } catch {
      usedKB = null;
    }
  }
  return { persisted, usedKB };
}

/** Cuántas sesiones se han guardado desde la última copia descargada. */
export function sessionsSinceBackup(s: Store = state): number {
  return Math.max(0, s.sessions.length - s.settings.lastBackupCount);
}

export function markBackedUp(): void {
  update((s) => ({ ...s, settings: { ...s.settings, lastBackupCount: s.sessions.length } }));
  flushNow();
}
