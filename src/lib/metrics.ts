import type { LoggedExercise, LoggedSet, Muscle, Session } from './types';
import { MUSCLES } from './types';

/* ────────────────────────────────────────────────────────────────────────────
 * Cómo se mide un entreno cuando los descansos no son uniformes
 *
 * El problema: en un gimnasio lleno el descanso lo decide la cola de la
 * prensa, no tú. Si el índice premiara hacer más trabajo por minuto, un día
 * de esperas se leería como un bajón de forma, que es exactamente lo
 * contrario de lo que pasó.
 *
 * La solución tiene tres piezas:
 *
 *   1. CURVA DE RECUPERACIÓN. Con el mismo peso, las repeticiones que puedes
 *      hacer dependen de cuánto llevas parado, y esa curva se satura. Sirve
 *      para predecir qué cabía esperar con el descanso que realmente tuviste.
 *   2. CAPACIDAD AJUSTADA. Cada serie se traduce a «lo que habrías hecho
 *      descansado», usando esa curva y el RIR. Comparar capacidades entre
 *      sesiones ya no depende del descanso.
 *   3. ATRIBUCIÓN. Al comparar dos sesiones se parte la diferencia en dos: la
 *      que explica el descanso y la que es cambio real. Es lo que permite
 *      decir «has subido un 8 %, pero 3 puntos son por haber descansado más».
 *
 * La densidad (trabajo por minuto) se sigue calculando, pero fuera del
 * índice: es una medida de cómo estaba el gimnasio, no de cómo estás tú.
 * ──────────────────────────────────────────────────────────────────────── */

/* ── 1. Curva de recuperación ────────────────────────────────────────────── */

/**
 * Fracción del rendimiento disponible tras `t` segundos de descanso, respecto
 * a estar fresco. Exponencial saturante: sube rápido al principio y se aplana.
 *
 *   t=60s → 0,71    t=120s → 0,83    t=180s → 0,90    t=300s → 0,97
 *
 * Los valores son coherentes con lo publicado sobre intervalos de descanso y
 * repeticiones sostenidas a carga fija. Es una media poblacional, no una
 * medida tuya: sirve para descontar el efecto del descanso, no para predecir
 * tu serie exacta.
 */
export const RECOVERY_FLOOR = 0.5;
export const RECOVERY_TAU = 110;

export function recovery(restSec: number): number {
  const t = Math.max(0, restSec);
  return RECOVERY_FLOOR + (1 - RECOVERY_FLOOR) * (1 - Math.exp(-t / RECOVERY_TAU));
}

/** Desgaste acumulado dentro del mismo ejercicio: aunque descanses de sobra,
 *  la cuarta serie no sale como la primera. */
const CUMULATIVE_FATIGUE = 0.97;

/**
 * Rendimiento esperado de la serie `index` (0 = primera) con el descanso que
 * tuvo, en fracción de lo que daría estando fresco.
 *
 * La primera serie de un ejercicio se toma como fresca: viene de cambiar de
 * máquina, y su descanso previo no es comparable con el de entre series.
 */
export function expectedPerformance(index: number, restSec: number | null): number {
  if (index === 0) return 1;
  const rest = restSec ?? 120;
  return recovery(rest) * CUMULATIVE_FATIGUE ** (index - 1);
}

/* ── 2. Capacidad ────────────────────────────────────────────────────────── */

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

/**
 * 1RM estimado contando las repeticiones que quedaban en la recámara.
 *
 * Una serie de 7 con 3 de margen demuestra más fuerza que una de 7 al fallo,
 * y sin el RIR las dos se apuntarían igual. Cuando no hay RIR se asume 0, que
 * es lo conservador: se cuenta solo lo demostrado.
 */
export function e1RMCapacity(weight: number, reps: number, rir: number | null): number {
  return e1RM(weight, reps + Math.max(0, rir ?? 0));
}

/**
 * Capacidad demostrada por una serie: el 1RM estimado contando el RIR.
 *
 * A propósito **no** se divide por la curva de recuperación. Normalizar aquí
 * parecía elegante y estaba mal: convertía «he hecho lo mismo descansando
 * más» en una caída de fuerza del 20 %, con lo que el índice seguía bailando
 * al ritmo de la cola de la prensa, solo que al revés. La fuerza es lo que
 * levantaste; el efecto del descanso vive en el volumen, que es donde de
 * verdad manda, y allí se descuenta.
 */
export function demonstratedCapacity(set: LoggedSet): number {
  return e1RMCapacity(set.weight, set.reps, set.rir);
}

/**
 * Cuánto limitó de verdad la fatiga a esta serie, de 0 a 1.
 *
 * Es la pieza que faltaba. Las series de esta rutina son prescritas: paras a
 * las 8 porque pone 8, no porque no puedas más. Si te sobraban tres
 * repeticiones, el descanso no decidió nada y no hay nada que descontar; solo
 * cuando acabas cerca del fallo el descanso explica el resultado.
 *
 * Sin RIR apuntado se aplica un valor intermedio: ni se ignora el descanso ni
 * se le atribuye todo el mérito.
 */
export function fatigueLimited(rir: number | null): number {
  if (rir == null) return 0.6;
  if (rir <= 1) return 1;
  if (rir >= 4) return 0;
  return (4 - rir) / 3;
}

export function isFilled(s: LoggedSet): boolean {
  return s.done && s.reps > 0;
}

/* ── Estadísticas por ejercicio ──────────────────────────────────────────── */

export type ExerciseStats = {
  exerciseId: string;
  name: string;
  sets: number;
  reps: number;
  tonnage: number;
  topE1RM: number;
  topSet: LoggedSet | null;
  heaviest: number;
  /** Mejor capacidad demostrada (1RM estimado con el RIR dentro). */
  capacity: number;
  restAvg: number | null;
  /** Descansos medidos, en orden de serie. */
  rests: (number | null)[];
  rirAvg: number | null;
  timeSec: number;
  density: number;
  /** Suma de lo que cabía esperar de cada serie según su descanso. Es el
   *  denominador de la atribución. */
  expectedSum: number;
};

export function exerciseStats(ex: LoggedExercise): ExerciseStats {
  const done = ex.sets.filter(isFilled);
  let tonnage = 0;
  let reps = 0;
  let topE1RM = 0;
  let topSet: LoggedSet | null = null;
  let heaviest = 0;
  let capacity = 0;
  let timeSec = 0;
  let expectedSum = 0;
  const restsMeasured: number[] = [];
  const rirs: number[] = [];
  const rests: (number | null)[] = [];

  done.forEach((s, i) => {
    tonnage += s.weight * s.reps;
    reps += s.reps;
    heaviest = Math.max(heaviest, s.weight);

    const est = e1RM(s.weight, s.reps);
    if (est > topE1RM) {
      topE1RM = est;
      topSet = s;
    }
    capacity = Math.max(capacity, demonstratedCapacity(s));
    expectedSum += expectedPerformance(i, s.restSec);

    timeSec += workSeconds(s.reps) + (s.restSec ?? 0);
    rests.push(s.restSec);
    if (s.restSec != null) restsMeasured.push(s.restSec);
    if (s.rir != null) rirs.push(s.rir);
  });

  return {
    exerciseId: ex.exerciseId,
    name: ex.name,
    sets: done.length,
    reps,
    tonnage,
    topE1RM,
    topSet,
    heaviest,
    capacity,
    restAvg: restsMeasured.length ? restsMeasured.reduce((a, b) => a + b, 0) / restsMeasured.length : null,
    rests,
    rirAvg: rirs.length ? rirs.reduce((a, b) => a + b, 0) / rirs.length : null,
    timeSec,
    density: timeSec > 0 ? tonnage / (timeSec / 60) : 0,
    expectedSum,
  };
}

/* ── Estadísticas por grupo muscular ─────────────────────────────────────── */

export type MuscleStats = {
  muscle: Muscle;
  /** Series efectivas: cada serie cuenta según cuánto del ejercicio recae
   *  sobre este grupo, no 1 entera para todos los que participan. */
  sets: number;
  tonnage: number;
  /** Mejor capacidad demostrada entre los ejercicios donde este grupo es el
   *  principal (share ≥ 0,5). Sin ellos no hay dato de fuerza fiable. */
  capacity: number;
  /** Mejor 1RM estimado bruto, sin ajustar. Para enseñar la marca tal cual. */
  intensity: number;
  rirAvg: number | null;
  timeSec: number;
  density: number;
  expectedSum: number;
};

export function muscleStats(session: Session): Map<Muscle, MuscleStats> {
  const out = new Map<Muscle, MuscleStats>();
  const rirAcc = new Map<Muscle, { sum: number; n: number }>();

  const get = (m: Muscle) => {
    let v = out.get(m);
    if (!v) {
      v = {
        muscle: m,
        sets: 0,
        tonnage: 0,
        capacity: 0,
        intensity: 0,
        rirAvg: null,
        timeSec: 0,
        density: 0,
        expectedSum: 0,
      };
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
      v.expectedSum += st.expectedSum * share;
      if (share >= 0.5) {
        v.capacity = Math.max(v.capacity, st.capacity);
        v.intensity = Math.max(v.intensity, st.topE1RM);
      }
      if (st.rirAvg != null) {
        const acc = rirAcc.get(muscle) ?? { sum: 0, n: 0 };
        acc.sum += st.rirAvg * share;
        acc.n += share;
        rirAcc.set(muscle, acc);
      }
    }
  }

  for (const v of out.values()) {
    v.density = v.timeSec > 0 ? v.tonnage / (v.timeSec / 60) : 0;
    const acc = rirAcc.get(v.muscle);
    v.rirAvg = acc && acc.n > 0 ? acc.sum / acc.n : null;
  }
  return out;
}

/* ── Estadísticas de sesión ──────────────────────────────────────────────── */

export type SessionStats = {
  durationSec: number;
  sets: number;
  reps: number;
  tonnage: number;
  restAvg: number | null;
  restTotal: number;
  rirAvg: number | null;
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
  let rirSum = 0;
  let rirCount = 0;

  for (const ex of session.exercises) {
    if (!ex.skipped) planned += 1;
    const st = exerciseStats(ex);
    if (st.sets > 0) exercisesDone += 1;
    sets += st.sets;
    reps += st.reps;
    tonnage += st.tonnage;
    estTime += st.timeSec;
    for (const s of ex.sets) {
      if (!isFilled(s)) continue;
      if (s.restSec != null) {
        restTotal += s.restSec;
        restCount += 1;
      }
      if (s.rir != null) {
        rirSum += s.rir;
        rirCount += 1;
      }
    }
  }

  /* El reloj de pared es la medida buena, pero acotada por los dos extremos
     absurdos: por abajo no se pueden hacer las series en menos tiempo del que
     ocupan; por arriba, una sesión que se quedó abierta toda la noche no duró
     nueve horas. */
  const wall = ((session.end ?? Date.now()) - session.start) / 1000;
  const durationSec = Math.min(Math.max(wall, estTime), estTime * 3 + 1800);

  return {
    durationSec,
    sets,
    reps,
    tonnage,
    restAvg: restCount ? restTotal / restCount : null,
    restTotal,
    rirAvg: rirCount ? rirSum / rirCount : null,
    density: durationSec > 0 ? tonnage / (durationSec / 60) : 0,
    exercisesDone,
    exercisesPlanned: planned,
  };
}

/* ── 3. Progreso con atribución del descanso ─────────────────────────────── */

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? (s[mid] as number) : (((s[mid - 1] as number) + (s[mid] as number)) / 2);
}

/** Cuántas sesiones anteriores forman el listón. */
export const BASELINE_WINDOW = 3;

/**
 * Cuánto pesa cada componente del índice.
 *
 * La densidad ya no entra: era justo la que castigaba esperar por una
 * máquina. El volumen sí, pero ya descontado el efecto del descanso.
 */
const W = { capacity: 0.55, volume: 0.45 } as const;

export type MuscleProgress = {
  muscle: Muscle;
  current: MuscleStats;
  /** null en la primera sesión que toca ese grupo: no hay con qué comparar. */
  index: number | null;
  baseline: { capacity: number; tonnage: number; expectedSum: number; samples: number } | null;
  parts: {
    /** Cambio de fuerza, ya limpio de descanso y con el RIR dentro. */
    capacity: number | null;
    /** Cambio de volumen tal cual, descanso incluido. */
    volume: number | null;
    /** Parte del cambio de volumen que explica solo la diferencia de descanso. */
    restEffect: number | null;
    /** Lo que queda del volumen una vez descontado el descanso. */
    volumeAdjusted: number | null;
  };
};

function ratio(now: number, base: number): number | null {
  if (base <= 0) return null;
  return Math.min(3, now / base);
}

/**
 * Compara una sesión contra las anteriores, grupo por grupo, separando lo que
 * explica el descanso de lo que es cambio real.
 *
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
        parts: { capacity: null, volume: null, restEffect: null, volumeAdjusted: null },
      });
      continue;
    }

    const baseline = {
      capacity: median(samples.map((s) => s.capacity)),
      tonnage: median(samples.map((s) => s.tonnage)),
      expectedSum: median(samples.map((s) => s.expectedSum)),
      samples: samples.length,
    };

    const capacityRatio = ratio(current.capacity, baseline.capacity);
    const volumeRatio = ratio(current.tonnage, baseline.tonnage);

    /* El efecto del descanso: cuánto trabajo cabía esperar hoy frente a lo que
       cabía esperar en la referencia, dados los descansos de cada día. Se
       amortigua según lo cerca del fallo que se llegara: si sobraban
       repeticiones, el descanso no limitó nada y no hay nada que descontar. */
    const raw = ratio(current.expectedSum, baseline.expectedSum);
    const damp = fatigueLimited(current.rirAvg);
    const restEffect = raw != null ? 1 + (raw - 1) * damp : null;

    const volumeAdjusted =
      volumeRatio != null && restEffect != null && restEffect > 0
        ? Math.min(3, volumeRatio / restEffect)
        : volumeRatio;

    let num = 0;
    let den = 0;
    if (capacityRatio != null) {
      num += W.capacity * capacityRatio;
      den += W.capacity;
    }
    if (volumeAdjusted != null) {
      num += W.volume * volumeAdjusted;
      den += W.volume;
    }

    out.push({
      muscle,
      current,
      index: den > 0 ? Math.round((num / den) * 100) : null,
      baseline,
      parts: { capacity: capacityRatio, volume: volumeRatio, restEffect, volumeAdjusted },
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

export type Attribution = {
  /** Cambio total de volumen frente a la referencia, en %. */
  totalPct: number;
  /** Parte explicada por haber descansado más o menos, en %. */
  restPct: number;
  /** Parte que no explica el descanso: cambio real, en %. */
  realPct: number;
  /** Diferencia de descanso medio frente a la referencia, en segundos. */
  restDeltaSec: number | null;
  /** Cuánto del movimiento total explica el descanso, de 0 a 1. */
  restShare: number;
};

/**
 * Reparte el cambio de volumen de una sesión entre lo que explica el descanso
 * y lo que es cambio real. Es la respuesta a «¿he mejorado o es que hoy había
 * cola en la prensa?».
 *
 * El reparto es multiplicativo —total = descanso × real— porque los efectos
 * se componen, no se suman; en porcentajes pequeños se lee casi igual.
 */
export function attribution(session: Session, history: Session[]): Attribution | null {
  const progress = muscleProgress(session, history);
  const usable = progress.filter((p) => p.parts.volume != null && p.parts.restEffect != null);
  if (!usable.length) return null;

  let wSum = 0;
  let total = 0;
  let rest = 0;
  for (const p of usable) {
    const w = Math.max(p.current.tonnage, 1);
    total += (p.parts.volume as number) * w;
    rest += (p.parts.restEffect as number) * w;
    wSum += w;
  }
  const totalRatio = total / wSum;
  const restRatio = rest / wSum;
  const realRatio = restRatio > 0 ? totalRatio / restRatio : totalRatio;

  const nowRest = sessionStats(session).restAvg;
  const baseRests = history
    .slice(0, BASELINE_WINDOW)
    .map((s) => sessionStats(s).restAvg)
    .filter((x): x is number => x != null);

  const totalPct = (totalRatio - 1) * 100;
  const restPct = (restRatio - 1) * 100;
  const realPct = (realRatio - 1) * 100;
  const magnitude = Math.abs(restPct) + Math.abs(realPct);

  return {
    totalPct,
    restPct,
    realPct,
    restDeltaSec: nowRest != null && baseRests.length ? nowRest - median(baseRests) : null,
    restShare: magnitude > 0 ? Math.abs(restPct) / magnitude : 0,
  };
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

/** Mejor peso levantado a cada número de repeticiones, para un ejercicio. */
export type RepRecord = { reps: number; weight: number; at: number; rir: number | null; e1rm: number };

export function repMaxTable(sessions: Session[], exerciseId: string): RepRecord[] {
  const best = new Map<number, RepRecord>();
  for (const s of sessions) {
    for (const ex of s.exercises) {
      if (ex.exerciseId !== exerciseId) continue;
      for (const set of ex.sets) {
        if (!isFilled(set)) continue;
        const prev = best.get(set.reps);
        if (!prev || set.weight > prev.weight) {
          best.set(set.reps, {
            reps: set.reps,
            weight: set.weight,
            at: set.at || s.start,
            rir: set.rir,
            e1rm: e1RM(set.weight, set.reps),
          });
        }
      }
    }
  }
  return [...best.values()].sort((a, b) => a.reps - b.reps);
}

/* ── Reparto de volumen a lo largo del tiempo ────────────────────────────── */

export type Balance = {
  muscle: Muscle;
  sets: number;
  tonnage: number;
  /** Series efectivas por semana dentro de la ventana consultada. */
  setsPerWeek: number;
  sharePct: number;
  /** Sesiones por semana que han tocado el grupo. */
  freqPerWeek: number;
  rirAvg: number | null;
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

  const acc = new Map<Muscle, { sets: number; tonnage: number; days: Set<number>; rirSum: number; rirN: number }>();
  for (const s of inWindow) {
    const dayKey = new Date(s.start).setHours(0, 0, 0, 0);
    for (const [m, st] of muscleStats(s)) {
      const v = acc.get(m) ?? { sets: 0, tonnage: 0, days: new Set<number>(), rirSum: 0, rirN: 0 };
      v.sets += st.sets;
      v.tonnage += st.tonnage;
      if (st.sets >= 0.5) v.days.add(dayKey);
      if (st.rirAvg != null) {
        v.rirSum += st.rirAvg;
        v.rirN += 1;
      }
      acc.set(m, v);
    }
  }

  const totalTonnage = [...acc.values()].reduce((a, b) => a + b.tonnage, 0);

  return MUSCLES.map((muscle) => {
    const v = acc.get(muscle);
    return {
      muscle,
      sets: v?.sets ?? 0,
      tonnage: v?.tonnage ?? 0,
      setsPerWeek: (v?.sets ?? 0) / weeks,
      sharePct: totalTonnage > 0 ? ((v?.tonnage ?? 0) / totalTonnage) * 100 : 0,
      freqPerWeek: (v?.days.size ?? 0) / weeks,
      rirAvg: v && v.rirN > 0 ? v.rirSum / v.rirN : null,
    };
  }).sort((a, b) => b.tonnage - a.tonnage);
}

/** Tonelaje total acumulado por ejercicio dentro de una ventana. */
export type ExerciseVolume = {
  exerciseId: string;
  name: string;
  tonnage: number;
  sets: number;
  reps: number;
  sessions: number;
  bestE1RM: number;
};

export function exerciseVolumes(sessions: Session[], days: number, now = Date.now()): ExerciseVolume[] {
  const from = now - days * 86_400_000;
  const acc = new Map<string, ExerciseVolume>();

  for (const s of sessions) {
    if (s.start < from) continue;
    for (const ex of s.exercises) {
      const st = exerciseStats(ex);
      if (st.sets === 0) continue;
      const v = acc.get(ex.exerciseId) ?? {
        exerciseId: ex.exerciseId,
        name: ex.name,
        tonnage: 0,
        sets: 0,
        reps: 0,
        sessions: 0,
        bestE1RM: 0,
      };
      v.tonnage += st.tonnage;
      v.sets += st.sets;
      v.reps += st.reps;
      v.sessions += 1;
      v.bestE1RM = Math.max(v.bestE1RM, st.topE1RM);
      acc.set(ex.exerciseId, v);
    }
  }
  return [...acc.values()].sort((a, b) => b.tonnage - a.tonnage);
}

/* ── Series temporales para los gráficos ─────────────────────────────────── */

export type Point = { at: number; value: number; label?: string };

/** Evolución del ejercicio, de más antiguo a más reciente. */
export function exerciseSeries(
  sessions: Session[],
  exerciseId: string,
): { e1rm: Point[]; tonnage: Point[]; capacity: Point[] } {
  const e1rm: Point[] = [];
  const tonnage: Point[] = [];
  const capacity: Point[] = [];
  const ordered = [...sessions].sort((a, b) => a.start - b.start);

  for (const s of ordered) {
    const ex = s.exercises.find((e) => e.exerciseId === exerciseId);
    if (!ex) continue;
    const st = exerciseStats(ex);
    if (st.sets === 0) continue;
    e1rm.push({ at: s.start, value: st.topE1RM });
    tonnage.push({ at: s.start, value: st.tonnage });
    capacity.push({ at: s.start, value: st.capacity });
  }
  return { e1rm, tonnage, capacity };
}

/** Evolución del tonelaje de un grupo muscular sesión a sesión. */
export function muscleSeries(sessions: Session[], muscle: Muscle): Point[] {
  return [...sessions]
    .sort((a, b) => a.start - b.start)
    .map((s) => ({ at: s.start, stats: muscleStats(s).get(muscle) }))
    .filter((x): x is { at: number; stats: MuscleStats } => !!x.stats && x.stats.sets >= 0.5)
    .map((x) => ({ at: x.at, value: x.stats.tonnage }));
}

/**
 * Puntos de descanso frente a rendimiento para un ejercicio: cada serie que
 * no sea la primera, con el descanso que la precedió y las repeticiones que
 * salieron respecto a la primera serie de ese día.
 *
 * Sirve para mirar con los ojos si la fórmula se parece a tu realidad, en vez
 * de tener que creérsela.
 */
export type RestPoint = { rest: number; ratio: number; at: number; weight: number; reps: number };

export function restVsPerformance(sessions: Session[], exerciseId: string): RestPoint[] {
  const points: RestPoint[] = [];
  for (const s of sessions) {
    for (const ex of s.exercises) {
      if (ex.exerciseId !== exerciseId) continue;
      const done = ex.sets.filter(isFilled);
      const first = done[0];
      if (!first || first.reps <= 0) continue;
      done.forEach((set, i) => {
        if (i === 0 || set.restSec == null) return;
        /* Solo tiene sentido comparar repeticiones a la misma carga. */
        if (Math.abs(set.weight - first.weight) > 0.01) return;
        points.push({
          rest: set.restSec,
          ratio: set.reps / first.reps,
          at: set.at || s.start,
          weight: set.weight,
          reps: set.reps,
        });
      });
    }
  }
  return points.sort((a, b) => a.rest - b.rest);
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
