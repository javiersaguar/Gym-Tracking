import { catalogName, makeExercise, type CatalogId } from './routine';
import { prefillWeights } from './reference';
import { getStore, update } from './storage';
import type { Day, Exercise, LoggedExercise, LoggedSet, Session, Settings, Store } from './types';
import { daysBetween } from './format';

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function emptySet(): LoggedSet {
  return { id: uid(), weight: 0, reps: 0, restSec: null, at: 0, done: false, rir: null };
}

/**
 * Congela un ejercicio de la rutina dentro de la sesión. Se copia en vez de
 * referenciarse porque la rutina se puede editar después y el histórico no
 * debe reescribirse solo.
 *
 * Los pesos vienen ya puestos con los de la última vez: casi siempre repites
 * carga o la subes un escalón, así que arrancar en blanco obliga a teclear
 * dos cifras por serie para nada.
 */
function snapshot(ex: Exercise, prefill: number[] = []): LoggedExercise {
  const carry = prefill.length ? (prefill[prefill.length - 1] as number) : 0;
  return {
    exerciseId: ex.id,
    name: ex.name,
    muscles: ex.muscles.map((m) => ({ ...m })),
    loadKind: ex.loadKind,
    repRange: [...ex.repRange] as [number, number],
    sets: Array.from({ length: ex.plannedSets }, (_, i) => ({ ...emptySet(), weight: prefill[i] ?? carry })),
    skipped: false,
  };
}

/* ── Dónde estoy en el ciclo ─────────────────────────────────────────────── */

export type CycleState = {
  day: Day;
  trainedToday: boolean;
  lastSession: Session | null;
  daysSinceLast: number | null;
};

/**
 * Qué toca hoy. Se calcula, no se guarda: el ciclo avanza un día por cada día
 * de calendario transcurrido desde el último entreno, así que si te saltas
 * tres días no te quedas eternamente atascado en el día 4.
 */
export function cycleState(store: Store, now = Date.now()): CycleState {
  const days = store.routine.days;
  const first = days[0] as Day;
  const last = [...store.sessions].sort((a, b) => b.start - a.start)[0] ?? null;
  if (!last) return { day: first, trainedToday: false, lastSession: null, daysSinceLast: null };

  const elapsed = daysBetween(last.start, now);
  const pos = days.findIndex((d) => d.id === last.dayId);
  const from = pos >= 0 ? pos : 0;
  const step = Math.max(1, elapsed);
  const day = days[(from + step) % days.length] as Day;

  return { day, trainedToday: elapsed === 0, lastSession: last, daysSinceLast: elapsed };
}

/* ── Sesión ──────────────────────────────────────────────────────────────── */

export function startSession(dayId: string): void {
  update((s) => {
    if (s.active) return s;
    const day = s.routine.days.find((d) => d.id === dayId);
    if (!day) return s;
    const active: Session = {
      id: uid(),
      dayId: day.id,
      dayIndex: day.index,
      dayName: day.name,
      start: Date.now(),
      end: null,
      exercises: day.exercises.map((ex) => snapshot(ex, prefillWeights(s.sessions, s.seedRefs, ex.id))),
      feel: null,
    };
    return { ...s, active };
  });
}

/** Cierra la sesión y la manda al histórico. Devuelve el id para poder abrir
 *  el análisis justo después. */
export function finishSession(feel: number | null, note?: string): string | null {
  const active = getStore().active;
  if (!active) return null;
  const id = active.id;
  update((s) => {
    if (!s.active) return s;
    const closed: Session = {
      ...s.active,
      end: Date.now(),
      feel,
      ...(note ? { note } : {}),
      /* Las series a medio rellenar no entran: contarían como cero peso y
         ensuciarían el tonelaje del grupo. */
      exercises: s.active.exercises.map((ex) => ({ ...ex, sets: ex.sets.filter((set) => set.done && set.reps > 0) })),
    };
    return { ...s, active: null, sessions: [closed, ...s.sessions] };
  });
  return id;
}

export function discardSession(): void {
  update((s) => ({ ...s, active: null }));
}

export function deleteSession(id: string): void {
  update((s) => ({ ...s, sessions: s.sessions.filter((x) => x.id !== id) }));
}

function withActive(fn: (a: Session) => Session) {
  update((s) => (s.active ? { ...s, active: fn(s.active) } : s));
}

function mapExercise(a: Session, exIdx: number, fn: (e: LoggedExercise) => LoggedExercise): Session {
  return { ...a, exercises: a.exercises.map((e, i) => (i === exIdx ? fn(e) : e)) };
}

export function patchSet(exIdx: number, setIdx: number, patch: Partial<LoggedSet>): void {
  withActive((a) =>
    mapExercise(a, exIdx, (e) => ({
      ...e,
      sets: e.sets.map((s, i) => (i === setIdx ? { ...s, ...patch } : s)),
    })),
  );
}

/**
 * Marca una serie como hecha. `restSec` es el descanso real medido por el
 * cronómetro desde la serie anterior; se guarda en la serie que acaba de
 * terminar porque es el descanso *previo* a ella.
 *
 * También se guarda en la primera serie de un ejercicio: ese es el descanso
 * de esperar a que se libere la máquina, y es justo el que más varía y el que
 * más falta hace para descontar su efecto del rendimiento.
 */
export function completeSet(exIdx: number, setIdx: number, restSec: number | null): void {
  withActive((a) =>
    mapExercise(a, exIdx, (e) => ({
      ...e,
      sets: e.sets.map((s, i) => (i === setIdx ? { ...s, done: true, at: Date.now(), restSec } : s)),
    })),
  );
}

/** Repeticiones que quedaban en la recámara. */
export function setRir(exIdx: number, setIdx: number, rir: number | null): void {
  patchSet(exIdx, setIdx, { rir });
}

export function setPartials(exIdx: number, setIdx: number, partials: number): void {
  patchSet(exIdx, setIdx, { partials: partials > 0 ? partials : null });
}

/**
 * Corrige a mano el descanso previo a una serie.
 *
 * El cronómetro es lo cómodo cuando uno se acuerda de darle, pero olvidarse es
 * lo normal, y un descanso mal apuntado no es un hueco: el algoritmo lo usa
 * para separar la mejora real del efecto del descanso. Poder escribirlo
 * después es lo que evita que una sesión entera quede mal medida.
 */
export function setRest(exIdx: number, setIdx: number, seconds: number | null): void {
  patchSet(exIdx, setIdx, { restSec: seconds == null ? null : Math.max(0, Math.round(seconds)) });
}

/** Empieza o deja de apuntar el ejercicio lado a lado. */
export function setPerSide(exIdx: number, perSide: boolean): void {
  withActive((a) =>
    mapExercise(a, exIdx, (e) => ({
      ...e,
      perSide,
      sets: perSide
        ? /* Al empezar a apuntar por lados, las series que aún no se han
             marcado copian el lado izquierdo en el derecho: lo normal es haber
             hecho lo mismo con los dos brazos, y así solo hay que corregir lo
             que se salga. Las ya marcadas no se tocan: doblarles el tonelaje a
             posteriori sería reescribir lo apuntado. */
          e.sets.map((x) => (x.done || x.right ? x : { ...x, right: { weight: x.weight, reps: x.reps } }))
        : /* Al dejar de apuntarlos, el lado derecho se borra: dejarlo escondido
             seguiría sumando al tonelaje sin que se vea. */
          e.sets.map((x) => ({ ...x, right: null })),
    })),
  );
}

export function uncompleteSet(exIdx: number, setIdx: number): void {
  patchSet(exIdx, setIdx, { done: false, at: 0 });
}

export function addSet(exIdx: number): void {
  withActive((a) =>
    mapExercise(a, exIdx, (e) => {
      /* La serie nueva hereda el peso de la última: en el 90 % de los casos
         es el mismo y ahorra teclear. */
      const prev = [...e.sets].reverse().find((s) => s.weight > 0);
      return { ...e, sets: [...e.sets, { ...emptySet(), weight: prev?.weight ?? 0 }] };
    }),
  );
}

export function removeSet(exIdx: number, setIdx: number): void {
  withActive((a) => mapExercise(a, exIdx, (e) => ({ ...e, sets: e.sets.filter((_, i) => i !== setIdx) })));
}

export function toggleSkip(exIdx: number): void {
  withActive((a) => mapExercise(a, exIdx, (e) => ({ ...e, skipped: !e.skipped })));
}

/** Añade un ejercicio suelto solo a la sesión de hoy, sin tocar la rutina. */
export function addExerciseToSession(catalogId: CatalogId | string, sets = 2): void {
  const store = getStore();
  const prefill = prefillWeights(store.sessions, store.seedRefs, catalogId);
  withActive((a) => ({ ...a, exercises: [...a.exercises, snapshot(makeExercise(catalogId, sets), prefill)] }));
}

export function moveExerciseInSession(from: number, to: number): void {
  withActive((a) => {
    const list = [...a.exercises];
    const [item] = list.splice(from, 1);
    if (!item) return a;
    list.splice(Math.max(0, Math.min(list.length, to)), 0, item);
    return { ...a, exercises: list };
  });
}

/* ── Rutina ──────────────────────────────────────────────────────────────── */

function mapDay(s: Store, dayId: string, fn: (d: Day) => Day): Store {
  return { ...s, routine: { ...s.routine, days: s.routine.days.map((d) => (d.id === dayId ? fn(d) : d)) } };
}

export function setPlannedSets(dayId: string, exIdx: number, sets: number): void {
  const n = Math.max(1, Math.min(10, Math.round(sets)));
  update((s) =>
    mapDay(s, dayId, (d) => ({
      ...d,
      exercises: d.exercises.map((e, i) => (i === exIdx ? { ...e, plannedSets: n } : e)),
    })),
  );
}

export function removeExerciseFromDay(dayId: string, exIdx: number): void {
  update((s) => mapDay(s, dayId, (d) => ({ ...d, exercises: d.exercises.filter((_, i) => i !== exIdx) })));
}

export function addExerciseToDay(dayId: string, catalogId: CatalogId | string, sets = 2): void {
  update((s) => mapDay(s, dayId, (d) => ({ ...d, exercises: [...d.exercises, makeExercise(catalogId, sets)] })));
}

export function moveExerciseInDay(dayId: string, from: number, to: number): void {
  update((s) =>
    mapDay(s, dayId, (d) => {
      const list = [...d.exercises];
      const [item] = list.splice(from, 1);
      if (!item) return d;
      list.splice(Math.max(0, Math.min(list.length, to)), 0, item);
      return { ...d, exercises: list };
    }),
  );
}

export function renameDay(dayId: string, name: string): void {
  update((s) => mapDay(s, dayId, (d) => ({ ...d, name: name.trim() || d.name })));
}

export function toggleRestDay(dayId: string): void {
  update((s) => mapDay(s, dayId, (d) => ({ ...d, rest: !d.rest, short: !d.rest ? 'Off' : d.short })));
}

export function updateSettings(patch: Partial<Settings>): void {
  update((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
}

/** Añade sesiones importadas sin pisar las que ya existen con el mismo id. */
export function addSessions(incoming: Session[]): number {
  let added = 0;
  update((s) => {
    const known = new Set(s.sessions.map((x) => x.id));
    const fresh = incoming.filter((x) => !known.has(x.id));
    added = fresh.length;
    if (!added) return s;
    return { ...s, sessions: [...fresh, ...s.sessions].sort((a, b) => b.start - a.start) };
  });
  return added;
}

/** Nombre legible de un ejercicio del catálogo, para los selectores. */
export const exerciseName = catalogName;
