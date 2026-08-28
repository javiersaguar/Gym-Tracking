import { defaultRoutine, seedReferences } from './routine';
import { DEFAULT_SETTINGS, enterDemo, exitDemo } from './storage';
import type { LoggedExercise, LoggedSet, Session, Store } from './types';

/* ────────────────────────────────────────────────────────────────────────────
 * Datos de ejemplo
 *
 * Una app de seguimiento vacía no se puede juzgar: el mapa de calor sale gris,
 * las gráficas no tienen línea y la tabla de récords está en blanco. Esto
 * genera un histórico completo —catorce semanas del ciclo de diez días— para
 * poder verla llena antes de tener datos propios.
 *
 * No es ruido aleatorio. Está construido para que se vea lo que la app sabe
 * hacer, con los mismos fenómenos que tiene un histórico de verdad:
 *
 *   · **Progresión que se aplana.** Los primeros kilos suben rápido y luego
 *     cuesta, que es como se progresa de verdad y lo que hace que la gráfica
 *     de fuerza tenga forma en vez de ser una recta.
 *   · **Una semana de descarga.** A mitad del periodo baja el peso y sube el
 *     RIR. En las gráficas es un valle del que se sale más arriba.
 *   · **Dos semanas con el gimnasio lleno.** Los descansos se van al doble sin
 *     que cambie nada más. Es justo el caso que el algoritmo separa: el
 *     análisis de esas sesiones dice cuánto del bajón es la cola de la prensa
 *     y cuánto es forma.
 *   · **Grupos desatendidos.** Los aductores y el abdomen se saltan a menudo,
 *     así que el mapa los deja fríos: un mapa donde todo está en verde no
 *     enseña para qué sirve el mapa.
 *
 * Los números salen de un generador con semilla fija: el mismo ejemplo hoy y
 * dentro de un mes, y por tanto una captura que se puede comparar.
 * ──────────────────────────────────────────────────────────────────────── */

/** Generador con semilla: el ejemplo tiene que ser el mismo cada vez. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Punto de partida de cada ejercicio y cómo se comporta.
 *
 * `w` es el peso del primer día, `reps` el centro de su horquilla, `gain` lo
 * que llega a subir en catorce semanas —un press sube mucho menos en
 * proporción que una prensa—, `step` el escalón de la máquina y `rest` el
 * descanso típico en segundos.
 */
const START: Record<string, { w: number; reps: number; gain: number; step: number; rest: number }> = {
  'remo-t': { w: 40, reps: 8, gain: 0.22, step: 2.5, rest: 170 },
  'remo-t-densidad': { w: 35, reps: 10, gain: 0.24, step: 2.5, rest: 95 },
  'jalon-cerrado': { w: 52, reps: 7, gain: 0.2, step: 2, rest: 160 },
  'jalon-pecho': { w: 50, reps: 8, gain: 0.2, step: 2, rest: 160 },
  'gironda-uni': { w: 23, reps: 8, gain: 0.26, step: 1, rest: 130 },
  'pull-over': { w: 18, reps: 10, gain: 0.28, step: 1, rest: 110 },
  'hombro-posterior': { w: 12, reps: 13, gain: 0.3, step: 1, rest: 80 },
  'predicador-maquina': { w: 41, reps: 7, gain: 0.18, step: 2, rest: 110 },
  'curl-bayesian': { w: 12, reps: 10, gain: 0.3, step: 1, rest: 90 },
  'press-inclinado': { w: 30, reps: 6, gain: 0.16, step: 2.5, rest: 190 },
  'press-plano-maquina': { w: 30, reps: 8, gain: 0.2, step: 2.5, rest: 170 },
  'press-plano-smith': { w: 40, reps: 7, gain: 0.18, step: 2.5, rest: 190 },
  'press-inclinado-maquina': { w: 35, reps: 8, gain: 0.2, step: 2.5, rest: 170 },
  'laterales-polea': { w: 8, reps: 14, gain: 0.34, step: 1, rest: 75 },
  'cruces-polea-inclinado': { w: 10, reps: 12, gain: 0.3, step: 1, rest: 85 },
  'contractora': { w: 35, reps: 11, gain: 0.24, step: 2.5, rest: 90 },
  'extension-triceps': { w: 25, reps: 11, gain: 0.28, step: 1, rest: 90 },
  aductor: { w: 45, reps: 13, gain: 0.22, step: 5, rest: 80 },
  'gemelo-pie': { w: 60, reps: 14, gain: 0.26, step: 5, rest: 65 },
  'rumano-maquina': { w: 50, reps: 10, gain: 0.24, step: 2.5, rest: 140 },
  prensa: { w: 150, reps: 9, gain: 0.3, step: 10, rest: 210 },
  'femoral-sentado': { w: 45, reps: 11, gain: 0.24, step: 2.5, rest: 110 },
  'extension-cuadriceps': { w: 50, reps: 12, gain: 0.26, step: 2.5, rest: 100 },
  'abs-maquina': { w: 30, reps: 14, gain: 0.24, step: 2.5, rest: 70 },
};

/** Los que se saltan a menudo, para que el mapa tenga zonas frías. */
const NEGLECTED = new Set(['aductor', 'abs-maquina']);

const DAY = 86_400_000;
/** Semanas de histórico. Catorce llenan el tramo de 90 días y dejan cola. */
const WEEKS = 14;
/** Semana de descarga, contando desde el principio. */
const DELOAD = 8;
/** Semanas con el gimnasio a tope: los descansos se disparan. */
const CROWDED = [10, 11];

/**
 * Progresión de 0 a 1 a lo largo del periodo, con la curva aplanándose.
 * Los primeros kilos suben rápido; los últimos cuestan.
 */
const curve = (t: number) => 1 - Math.pow(1 - t, 1.9);

function round(value: number, step: number): number {
  return Math.round(value / step) * step;
}

export function demoSessions(now: number): Session[] {
  const routine = defaultRoutine();
  const days = routine.days;
  const random = rng(20260828);
  const sessions: Session[] = [];

  const totalDays = WEEKS * 7;
  let id = 0;

  for (let d = totalDays; d >= 1; d--) {
    const day = days[(totalDays - d) % days.length];
    if (!day || day.rest) continue;

    /* Alguna sesión se cae: la vida pasa, y una racha perfecta de catorce
       semanas no se parece a ningún histórico real. */
    if (random() < 0.07) continue;

    const week = Math.floor((totalDays - d) / 7) + 1;
    const t = curve((totalDays - d) / totalDays);
    const deload = week === DELOAD;
    const crowded = CROWDED.includes(week);

    /* Entrenos de tarde, con la hora bailando de un día a otro. */
    const start = now - d * DAY + (18.5 + random() * 1.5) * 3600_000;

    const exercises: LoggedExercise[] = [];
    for (const ex of day.exercises) {
      const spec = START[ex.id];
      if (!spec) continue;

      const skip = NEGLECTED.has(ex.id) ? random() < 0.55 : random() < 0.05;
      const sets: LoggedSet[] = [];

      if (!skip) {
        const base = spec.w * (1 + spec.gain * t) * (deload ? 0.86 : 1);
        for (let i = 0; i < ex.plannedSets; i++) {
          /* Las series de después pesan un poco menos y salen a menos
             repeticiones: es lo que pasa cuando se acumula fatiga. */
          const weight = Math.max(spec.step, round(base * (1 - i * 0.03), spec.step));
          const reps = Math.max(3, Math.round(spec.reps - i * 0.9 + (random() * 2 - 1)));
          const rest = Math.round(
            spec.rest * (crowded ? 1.9 + random() * 0.5 : 0.88 + random() * 0.3) + (i === 0 ? 25 : 0),
          );
          /* En descarga sobran repeticiones; el resto de semanas se aprieta,
             y la última serie de cada ejercicio va más cerca del fallo. */
          const rir = deload ? 3 : Math.max(0, Math.round(2.2 - i * 0.8 + (random() - 0.5)));
          sets.push({
            id: `demo-set-${id++}`,
            weight,
            reps,
            restSec: sessions.length === 0 && exercises.length === 0 && i === 0 ? null : rest,
            at: start + (exercises.length * 8 + i * 3) * 60_000,
            done: true,
            rir,
          });
        }
      }

      exercises.push({
        exerciseId: ex.id,
        name: ex.name,
        muscles: ex.muscles,
        loadKind: ex.loadKind,
        repRange: ex.repRange,
        sets,
        skipped: skip,
      });
    }

    const minutes = exercises.reduce((n, ex) => n + ex.sets.length * 3.2, 12);
    sessions.push({
      id: `demo-${d}`,
      dayId: day.id,
      dayIndex: day.index,
      dayName: day.name,
      start,
      end: start + minutes * 60_000,
      feel: deload ? 3 : crowded ? 3 : 4 + (random() < 0.3 ? 1 : 0),
      ...(deload
        ? { note: 'Semana de descarga: bajo el peso y me guardo repeticiones.' }
        : crowded && random() < 0.5
          ? { note: 'Gimnasio a tope, mucha cola en las máquinas.' }
          : {}),
      exercises,
    });
  }

  return sessions.sort((a, b) => b.start - a.start);
}

/* ── Encender y apagar el ejemplo ────────────────────────────────────────── */

/**
 * La marca de «estoy en el ejemplo» vive en `sessionStorage`.
 *
 * Los datos del ejemplo no se guardan nunca —se vuelven a generar—, pero la
 * marca sí, y solo mientras la pestaña siga abierta. Sin ella, recargar en
 * mitad del paseo devolvía la app vacía sin explicación; con ella, el ejemplo
 * aguanta la recarga y se acaba al cerrar la pestaña. Los datos reales siguen
 * sin tocarse en cualquier caso: lo que se guarda es un uno.
 */
const FLAG = 'gym-tracking:demo';

function flag(on: boolean): void {
  try {
    if (on) sessionStorage.setItem(FLAG, '1');
    else sessionStorage.removeItem(FLAG);
  } catch {
    /* Modo privado o sin permiso: el ejemplo funciona igual, solo que no
       sobrevive a una recarga. */
  }
}

export function startDemo(): void {
  flag(true);
  enterDemo(() => demoStore());
}

export function stopDemo(): void {
  flag(false);
  exitDemo();
}

/** Vuelve a poner el ejemplo tras una recarga, si estaba puesto. */
export function restoreDemo(): void {
  try {
    if (sessionStorage.getItem(FLAG) === '1') enterDemo(() => demoStore());
  } catch {
    /* sin sessionStorage no hay nada que restaurar */
  }
}

/** Almacén completo de ejemplo, listo para enseñar en lugar del real. */
export function demoStore(now = Date.now()): Store {
  const sessions = demoSessions(now);
  return {
    version: 2,
    routine: defaultRoutine(),
    sessions,
    active: null,
    seedRefs: seedReferences(),
    /* Sin aviso de copia de seguridad: en un ejemplo sería ruido, y además
       no hay nada que copiar. */
    settings: { ...DEFAULT_SETTINGS, lastBackupCount: sessions.length },
  };
}
