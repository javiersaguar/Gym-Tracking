import type { LoggedExercise, LoggedSet, Muscle, Session } from './types';
import { MUSCLES } from './types';

/* ────────────────────────────────────────────────────────────────────────────
 * Cómo se mide un entreno
 *
 * Tres números distintos, porque «progresar» no es una sola cosa:
 *
 *   1. TONELAJE   Σ peso × repeticiones. El trabajo mecánico total.
 *   2. INTENSIDAD el mejor 1RM estimado (Epley). La fuerza pura.
 *   3. DENSIDAD   tonelaje ÷ tiempo, contando el descanso real. Cuánto
 *                 trabajo metes por minuto de gimnasio.
 *
 * Los tres se comparan contra la mediana de las últimas sesiones que tocaron
 * ese grupo y se resumen en un ÍNDICE DE PROGRESO donde 100 = igual que tu
 * media reciente. La mediana y no la media porque una sesión mala no debe
 * hundir el listón de las tres siguientes.
 * ──────────────────────────────────────────────────────────────────────── */

/** Segundos de trabajo estimados para una serie. Solo se mide el descanso;
 *  el tiempo bajo la barra se estima a ritmo estándar (~3,5 s por repetición
 *  más la entrada y salida de la máquina). */
export function workSeconds(reps: number): number {
  return Math.max(0, reps) * 3.5 + 10;
}

/** 1RM estimado por la fórmula de Epley. Por encima de 15 repeticiones la
 *  fórmula se dispara, así que ahí se corta: deja de ser un dato de fuerza. */
export function e1RM(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  return weight * (1 + Math.min(reps, 15) / 30);
}

export function isFilled(s: LoggedSet): boolean {
  return s.done && s.reps > 0;
}

export type ExerciseStats = {
  exerciseId: string;
  name: string;
  sets: number;
  reps: number;
  tonnage: number;
  topE1RM: number;
  topSet: LoggedSet | null;
  heaviest: number;
  restAvg: number | null;
  timeSec: number;
  density: number;
};

export function exerciseStats(ex: LoggedExercise): ExerciseStats {
  const done = ex.sets.filter(isFilled);
  let tonnage = 0;
  let reps = 0;
  let topE1RM = 0;
  let topSet: LoggedSet | null = null;
  let heaviest = 0;
  let timeSec = 0;
  const rests: number[] = [];

  for (const s of done) {
    tonnage += s.weight * s.reps;
    reps += s.reps;
    heaviest = Math.max(heaviest, s.weight);
    const est = e1RM(s.weight, s.reps);
    if (est > topE1RM) {
      topE1RM = est;
      topSet = s;
    }
    timeSec += workSeconds(s.reps) + (s.restSec ?? 0);
    if (s.restSec != null) rests.push(s.restSec);
  }

  return {
    exerciseId: ex.exerciseId,
    name: ex.name,
    sets: done.length,
    reps,
    tonnage,
    topE1RM,
    topSet,
    heaviest,
    restAvg: rests.length ? rests.reduce((a, b) => a + b, 0) / rests.length : null,
    timeSec,
    density: timeSec > 0 ? tonnage / (timeSec / 60) : 0,
  };
}

export type MuscleStats = {
  muscle: Muscle;
  /** Series efectivas: cada serie cuenta según cuánto del ejercicio recae
   *  sobre este grupo, no 1 entera para todos los que participan. */
  sets: number;
  tonnage: number;
  /** Mejor 1RM estimado entre los ejercicios en los que este grupo es el
   *  principal (share ≥ 0,5). Sin ellos no hay dato de fuerza fiable. */
  intensity: number;
  timeSec: number;
  density: number;
};

export function muscleStats(session: Session): Map<Muscle, MuscleStats> {
  const out = new Map<Muscle, MuscleStats>();
  const get = (m: Muscle) => {
    let v = out.get(m);
    if (!v) {
      v = { muscle: m, sets: 0, tonnage: 0, intensity: 0, timeSec: 0, density: 0 };
      out.set(m, v);
    }
    return v;
  };

  for (const ex of session.exercises) {
    if (ex.skipped) continue;
    const st = exerciseStats(ex);
    if (st.sets === 0) continue;
    for (const { muscle, share } of ex.muscles) {
      const v = get(muscle);
      v.sets += st.sets * share;
      v.tonnage += st.tonnage * share;
      v.timeSec += st.timeSec * share;
      if (share >= 0.5) v.intensity = Math.max(v.intensity, st.topE1RM);
    }
  }

  for (const v of out.values()) {
    v.density = v.timeSec > 0 ? v.tonnage / (v.timeSec / 60) : 0;
  }
  return out;
}

export type SessionStats = {
  durationSec: number;
  sets: number;
  reps: number;
  tonnage: number;
  restAvg: number | null;
  restTotal: number;
  density: number;
  exercisesDone: number;
  exercisesPlanned: number;
};

export function sessionStats(session: Session): SessionStats {
  let sets = 0;
  let reps = 0;
  let tonnage = 0;
  let restTotal = 0;
  let restCount = 0;
  let exercisesDone = 0;
  let planned = 0;
  let estTime = 0;

  for (const ex of session.exercises) {
    if (!ex.skipped) planned += 1;
    const st = exerciseStats(ex);
    if (st.sets > 0) exercisesDone += 1;
    sets += st.sets;
    reps += st.reps;
    tonnage += st.tonnage;
    estTime += st.timeSec;
    for (const s of ex.sets) {
      if (isFilled(s) && s.restSec != null) {
        restTotal += s.restSec;
        restCount += 1;
      }
    }
  }

  /* El reloj de pared es la medida buena, pero acotada por los dos extremos
     absurdos: por abajo no se pueden hacer las series en menos tiempo del que
     ocupan (pasa al probar o al apuntar un entreno a posteriori, y dispararía
     la densidad a miles de kg/min); por arriba, una sesión que se quedó
     abierta toda la noche no duró nueve horas. */
  const wall = ((session.end ?? Date.now()) - session.start) / 1000;
  const durationSec = Math.min(Math.max(wall, estTime), estTime * 3 + 1800);

  return {
    durationSec,
    sets,
    reps,
    tonnage,
    restAvg: restCount ? restTotal / restCount : null,
    restTotal,
    density: durationSec > 0 ? tonnage / (durationSec / 60) : 0,
    exercisesDone,
    exercisesPlanned: planned,
  };
}

/* ── Índice de progreso ──────────────────────────────────────────────────── */

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? (s[mid] as number) : (((s[mid - 1] as number) + (s[mid] as number)) / 2);
}

/** Cuánto pesa cada componente en el índice. El tonelaje manda porque es lo
 *  que más se mueve sesión a sesión; la densidad puntúa poco porque un día
 *  con más cola en las máquinas no significa que hayas entrenado peor. */
const W = { tonnage: 0.45, intensity: 0.35, density: 0.2 } as const;

/** Cuántas sesiones anteriores forman el listón. */
export const BASELINE_WINDOW = 3;

export type MuscleProgress = {
  muscle: Muscle;
  current: MuscleStats;
  /** null en la primera sesión que toca ese grupo: no hay con qué comparar. */
  index: number | null;
  baseline: { tonnage: number; intensity: number; density: number; samples: number } | null;
  parts: { tonnage: number | null; intensity: number | null; density: number | null };
};

function ratio(now: number, base: number): number | null {
  if (base <= 0) return null;
  return Math.min(3, now / base);
}

/**
 * Compara una sesión contra las anteriores del histórico, grupo por grupo.
 * `history` debe venir ordenado de más reciente a más antiguo y **no** incluir
 * la sesión que se está evaluando.
 */
export function muscleProgress(session: Session, history: Session[]): MuscleProgress[] {
  const now = muscleStats(session);
  const prior = history.map((s) => muscleStats(s));

  const out: MuscleProgress[] = [];
  for (const [muscle, current] of now) {
    if (current.sets < 0.5) continue;

    const samples = prior
      .map((m) => m.get(muscle))
      .filter((v): v is MuscleStats => !!v && v.sets >= 0.5)
      .slice(0, BASELINE_WINDOW);

    if (!samples.length) {
      out.push({
        muscle,
        current,
        index: null,
        baseline: null,
        parts: { tonnage: null, intensity: null, density: null },
      });
      continue;
    }

    const baseline = {
      tonnage: median(samples.map((s) => s.tonnage)),
      intensity: median(samples.map((s) => s.intensity)),
      density: median(samples.map((s) => s.density)),
      samples: samples.length,
    };

    const parts = {
      tonnage: ratio(current.tonnage, baseline.tonnage),
      intensity: ratio(current.intensity, baseline.intensity),
      density: ratio(current.density, baseline.density),
    };

    /* Si falta un componente (p. ej. no hay dato de fuerza porque el grupo
       solo entró como secundario) se reparte su peso entre los que sí hay,
       en vez de contarlo como cero y castigar por un hueco. */
    let num = 0;
    let den = 0;
    for (const k of ['tonnage', 'intensity', 'density'] as const) {
      const r = parts[k];
      if (r == null) continue;
      num += W[k] * r;
      den += W[k];
    }

    out.push({
      muscle,
      current,
      index: den > 0 ? Math.round((num / den) * 100) : null,
      baseline,
      parts,
    });
  }

  out.sort((a, b) => b.current.tonnage - a.current.tonnage);
  return out;
}

/** Un único índice para la sesión: la media de los grupos, pesada por
 *  tonelaje, para que un gemelo no valga lo mismo que una prensa. */
export function sessionIndex(progress: MuscleProgress[]): number | null {
  let num = 0;
  let den = 0;
  for (const p of progress) {
    if (p.index == null) continue;
    const w = Math.max(p.current.tonnage, 1);
    num += p.index * w;
    den += w;
  }
  return den > 0 ? Math.round(num / den) : null;
}

/* ── Récords ─────────────────────────────────────────────────────────────── */

export type PersonalBest = { e1rm: number; weight: number; reps: number; at: number | null };

/**
 * Mejor marca histórica por ejercicio. `seedRefs` son las marcas apuntadas a
 * mano antes de instalar la app: cuentan como listón, pero sin fecha.
 */
export function personalBests(
  sessions: Session[],
  seedRefs: Record<string, { weight: number; reps: number }[]> = {},
): Map<string, PersonalBest> {
  const best = new Map<string, PersonalBest>();
  const offer = (id: string, weight: number, reps: number, at: number | null) => {
    const est = e1RM(weight, reps);
    if (est <= 0) return;
    const prev = best.get(id);
    if (!prev || est > prev.e1rm) best.set(id, { e1rm: est, weight, reps, at });
  };

  for (const [id, refs] of Object.entries(seedRefs)) {
    for (const r of refs) offer(id, r.weight, r.reps, null);
  }
  for (const s of sessions) {
    for (const ex of s.exercises) {
      for (const set of ex.sets) {
        if (isFilled(set)) offer(ex.exerciseId, set.weight, set.reps, set.at);
      }
    }
  }
  return best;
}

export type PrHit = { exerciseId: string; name: string; weight: number; reps: number; prev: number; e1rm: number };

/** Récords batidos *dentro* de esta sesión, comparando contra todo lo anterior. */
export function prsInSession(
  session: Session,
  history: Session[],
  seedRefs: Record<string, { weight: number; reps: number }[]> = {},
): PrHit[] {
  const before = personalBests(history, seedRefs);
  const hits: PrHit[] = [];

  for (const ex of session.exercises) {
    const st = exerciseStats(ex);
    if (!st.topSet || st.topE1RM <= 0) continue;
    const prev = before.get(ex.exerciseId);
    /* Sin marca previa no hay récord que batir: es simplemente la primera vez. */
    if (!prev) continue;
    if (st.topE1RM > prev.e1rm * 1.005) {
      hits.push({
        exerciseId: ex.exerciseId,
        name: ex.name,
        weight: st.topSet.weight,
        reps: st.topSet.reps,
        prev: prev.e1rm,
        e1rm: st.topE1RM,
      });
    }
  }
  return hits.sort((a, b) => b.e1rm / b.prev - a.e1rm / a.prev);
}

/* ── Reparto de volumen a lo largo del tiempo ────────────────────────────── */

export type Balance = {
  muscle: Muscle;
  sets: number;
  tonnage: number;
  /** Series efectivas por semana dentro de la ventana consultada. */
  setsPerWeek: number;
  sharePct: number;
};

/** Rango semanal de series efectivas que se toma como referencia razonable
 *  de mantenimiento/crecimiento. Sirve para colorear, no para mandar. */
export const WEEKLY_TARGET: Record<Muscle, [number, number]> = {
  espalda: [10, 20],
  pecho: [10, 20],
  hombro: [8, 18],
  biceps: [8, 16],
  triceps: [8, 16],
  cuadriceps: [8, 18],
  femoral: [6, 14],
  gluteo: [6, 14],
  gemelo: [6, 14],
  aductor: [4, 10],
  abdomen: [4, 12],
};

export function balance(sessions: Session[], days: number, now = Date.now()): Balance[] {
  const from = now - days * 86_400_000;
  const inWindow = sessions.filter((s) => s.start >= from);
  const weeks = Math.max(days / 7, 1);

  const acc = new Map<Muscle, { sets: number; tonnage: number }>();
  for (const s of inWindow) {
    for (const [m, st] of muscleStats(s)) {
      const v = acc.get(m) ?? { sets: 0, tonnage: 0 };
      v.sets += st.sets;
      v.tonnage += st.tonnage;
      acc.set(m, v);
    }
  }

  const totalTonnage = [...acc.values()].reduce((a, b) => a + b.tonnage, 0);

  return MUSCLES.map((muscle) => {
    const v = acc.get(muscle) ?? { sets: 0, tonnage: 0 };
    return {
      muscle,
      sets: v.sets,
      tonnage: v.tonnage,
      setsPerWeek: v.sets / weeks,
      sharePct: totalTonnage > 0 ? (v.tonnage / totalTonnage) * 100 : 0,
    };
  }).sort((a, b) => b.tonnage - a.tonnage);
}

/* ── Series temporales para los gráficos ─────────────────────────────────── */

export type Point = { at: number; value: number; label?: string };

/** Evolución del 1RM estimado de un ejercicio, de más antiguo a más reciente. */
export function exerciseSeries(sessions: Session[], exerciseId: string): { e1rm: Point[]; tonnage: Point[] } {
  const e1rm: Point[] = [];
  const tonnage: Point[] = [];
  const ordered = [...sessions].sort((a, b) => a.start - b.start);

  for (const s of ordered) {
    const ex = s.exercises.find((e) => e.exerciseId === exerciseId);
    if (!ex) continue;
    const st = exerciseStats(ex);
    if (st.sets === 0) continue;
    e1rm.push({ at: s.start, value: st.topE1RM });
    tonnage.push({ at: s.start, value: st.tonnage });
  }
  return { e1rm, tonnage };
}

/** Evolución del tonelaje de un grupo muscular sesión a sesión. */
export function muscleSeries(sessions: Session[], muscle: Muscle): Point[] {
  return [...sessions]
    .sort((a, b) => a.start - b.start)
    .map((s) => ({ at: s.start, stats: muscleStats(s).get(muscle) }))
    .filter((x): x is { at: number; stats: MuscleStats } => !!x.stats && x.stats.sets >= 0.5)
    .map((x) => ({ at: x.at, value: x.stats.tonnage }));
}

/** Tendencia simple por mínimos cuadrados. Devuelve el % de cambio entre el
 *  primer y el último punto de la recta ajustada. */
export function trendPct(points: Point[]): number | null {
  if (points.length < 3) return null;
  const n = points.length;
  const xs = points.map((_, i) => i);
  const ys = points.map((p) => p.value);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += ((xs[i] as number) - mx) * ((ys[i] as number) - my);
    den += ((xs[i] as number) - mx) ** 2;
  }
  if (den === 0) return null;
  const slope = num / den;
  const first = my + slope * (0 - mx);
  const last = my + slope * (n - 1 - mx);
  if (first <= 0) return null;
  return ((last - first) / first) * 100;
}
