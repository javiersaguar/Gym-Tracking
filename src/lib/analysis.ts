import { clock, duration, kg, plural, tonnage } from './format';
import {
  attribution,
  exerciseStats,
  isFilled,
  muscleProgress,
  prsInSession,
  sessionIndex,
  sessionStats,
  type Attribution,
  type MuscleProgress,
  type PrHit,
  type SessionStats,
} from './metrics';
import { MUSCLE_LABEL, type LoggedExercise, type Session } from './types';

export type Verdict = 'record' | 'progreso' | 'sostenido' | 'bajon' | 'primera';

export const VERDICT_COPY: Record<Verdict, { title: string; tone: 'up' | 'flat' | 'down' | 'pr' }> = {
  record: { title: 'Sesión de récord', tone: 'pr' },
  progreso: { title: 'Has ido a más', tone: 'up' },
  sostenido: { title: 'Sesión sostenida', tone: 'flat' },
  bajon: { title: 'Sesión por debajo', tone: 'down' },
  primera: { title: 'Primera referencia', tone: 'flat' },
};

export type Note = {
  kind: 'good' | 'watch' | 'info';
  text: string;
};

export type ExerciseReview = {
  exerciseId: string;
  name: string;
  sets: number;
  tonnage: number;
  topE1RM: number;
  best: string;
  /** Comparación con la última vez que se hizo el ejercicio. */
  deltaPct: number | null;
  restAvg: number | null;
  rirAvg: number | null;
  /** Capacidad ajustada por descanso y RIR. Es la cifra de fuerza limpia. */
  capacity: number;
  advice: { move: 'sube' | 'mantiene' | 'baja' | 'nuevo'; text: string };
};

export type Analysis = {
  stats: SessionStats;
  index: number | null;
  verdict: Verdict;
  headline: string;
  muscles: MuscleProgress[];
  prs: PrHit[];
  notes: Note[];
  exercises: ExerciseReview[];
  /** Reparto del cambio entre descanso y mejora real. Null la primera vez. */
  attribution: Attribution | null;
};

function lastTimeStats(history: Session[], exerciseId: string) {
  for (const s of history) {
    const ex = s.exercises.find((e) => e.exerciseId === exerciseId);
    if (!ex) continue;
    const st = exerciseStats(ex);
    if (st.sets > 0) return st;
  }
  return null;
}

/**
 * Qué hacer la próxima vez con este ejercicio. La regla es la progresión
 * doble de toda la vida: primero llenas el rango de repeticiones, y cuando
 * todas las series llegan arriba, subes el peso.
 *
 * El RIR manda por encima del rango: si cerraste el rango pero te sobraban
 * tres repeticiones, el peso se queda corto aunque el número diga que vas
 * bien.
 */
function advise(ex: LoggedExercise, step: number): ExerciseReview['advice'] {
  const done = ex.sets.filter(isFilled);
  if (!done.length) return { move: 'nuevo', text: 'Sin series registradas.' };

  const [low, high] = ex.repRange;
  const allTop = done.every((s) => s.reps >= high);
  const anyBelow = done.some((s) => s.reps < low);
  const topWeight = Math.max(...done.map((s) => s.weight));

  const rirs = done.map((s) => s.rir).filter((x): x is number => x != null);
  const minRir = rirs.length ? Math.min(...rirs) : null;

  if (minRir != null && minRir >= 3 && !anyBelow) {
    return {
      move: 'sube',
      text: `Ni en la serie más dura bajaste de RIR ${minRir}: el peso te queda corto. Sube a ${kg(topWeight + step * 2)} kg.`,
    };
  }

  if (allTop) {
    return {
      move: 'sube',
      text: `Todas las series llegaron a ${high}. Sube a ${kg(topWeight + step)} kg y vuelve a ${low}-${low + 1}.`,
    };
  }
  if (anyBelow) {
    const worst = Math.min(...done.map((s) => s.reps));
    return {
      move: 'baja',
      text: `Te quedaste en ${worst} repeticiones con ${kg(topWeight)} kg. Baja a ${kg(Math.max(step, topWeight - step))} kg y cierra el rango.`,
    };
  }
  const best = Math.max(...done.map((s) => s.reps));
  return {
    move: 'mantiene',
    text: `Mantén ${kg(topWeight)} kg y busca ${Math.min(best + 1, high)} repeticiones en la primera serie.`,
  };
}

/**
 * Análisis completo de una sesión: qué ha pasado, contra qué se compara y qué
 * conviene hacer la próxima vez. `history` son las sesiones anteriores
 * ordenadas de más reciente a más antigua, sin incluir esta.
 */
export function analyse(
  session: Session,
  history: Session[],
  seedRefs: Record<string, { weight: number; reps: number }[]> = {},
  weightStep = 2.5,
): Analysis {
  const stats = sessionStats(session);
  const muscles = muscleProgress(session, history);
  const index = sessionIndex(muscles);
  const prs = prsInSession(session, history, seedRefs);

  const verdict: Verdict = prs.length
    ? 'record'
    : index == null
      ? 'primera'
      : index >= 106
        ? 'progreso'
        : index >= 94
          ? 'sostenido'
          : 'bajon';

  const exercises: ExerciseReview[] = session.exercises
    .map((ex) => {
      const st = exerciseStats(ex);
      if (st.sets === 0) return null;
      const prev = lastTimeStats(history, ex.exerciseId);
      const deltaPct = prev && prev.topE1RM > 0 ? ((st.topE1RM - prev.topE1RM) / prev.topE1RM) * 100 : null;
      return {
        exerciseId: ex.exerciseId,
        name: ex.name,
        sets: st.sets,
        tonnage: st.tonnage,
        topE1RM: st.topE1RM,
        best: st.topSet ? `${kg(st.topSet.weight)} × ${st.topSet.reps}` : '—',
        deltaPct,
        restAvg: st.restAvg,
        rirAvg: st.rirAvg,
        capacity: st.capacity,
        advice: advise(ex, weightStep),
      } satisfies ExerciseReview;
    })
    .filter((x): x is ExerciseReview => x !== null);

  const attr = attribution(session, history);
  const notes = buildNotes({ session, history, stats, muscles, prs, exercises, attr });
  const headline = buildHeadline(verdict, index, stats, prs, muscles);

  return { stats, index, verdict, headline, muscles, prs, notes, exercises, attribution: attr };
}

function buildHeadline(
  verdict: Verdict,
  index: number | null,
  stats: SessionStats,
  prs: PrHit[],
  muscles: MuscleProgress[],
): string {
  const top = muscles[0];
  const where = top ? MUSCLE_LABEL[top.muscle].toLowerCase() : 'el entreno';

  if (verdict === 'record') {
    /* Los nombres van tal cual: en minúsculas, «Remo en T» se convierte en
       «remo en t» y deja de leerse como el ejercicio que es. */
    const one = prs[0] as PrHit;
    return prs.length === 1
      ? `Récord en ${one.name}: ${kg(one.weight)} kg × ${one.reps}. ${tonnage(stats.tonnage)} en ${duration(stats.durationSec)}.`
      : `${prs.length} récords en una sola sesión, empezando por ${one.name}. ${tonnage(stats.tonnage)} en ${duration(stats.durationSec)}.`;
  }
  if (verdict === 'primera') {
    return `Primera vez que registras este día. ${tonnage(stats.tonnage)} en ${plural(stats.sets, 'serie')}: a partir de aquí ya hay con qué comparar.`;
  }
  if (verdict === 'progreso') {
    return `Índice ${index} sobre tu media reciente: has ido por encima, sobre todo en ${where}. ${tonnage(stats.tonnage)} en ${duration(stats.durationSec)}.`;
  }
  if (verdict === 'sostenido') {
    return `Índice ${index}: en línea con tus últimas sesiones. ${tonnage(stats.tonnage)} en ${duration(stats.durationSec)}, ${plural(stats.sets, 'serie')}.`;
  }
  return `Índice ${index}: por debajo de tu media reciente. Un día flojo no rompe nada, pero si se repite en ${where}, mira descanso y comida.`;
}

function buildNotes(input: {
  session: Session;
  history: Session[];
  stats: SessionStats;
  muscles: MuscleProgress[];
  prs: PrHit[];
  exercises: ExerciseReview[];
  attr: Attribution | null;
}): Note[] {
  const { session, history, stats, muscles, prs, exercises, attr } = input;
  const notes: Note[] = [];

  /* Lo primero de todo: repartir el movimiento entre el descanso y tú.
     Salta también cuando el volumen parece plano, porque el caso que más
     despista es justo ese: mismo tonelaje con el doble de descanso no es
     «igual que siempre», es haber rendido algo menos. */
  if (attr && (Math.abs(attr.totalPct) >= 3 || Math.abs(attr.realPct) >= 3)) {
    const pct = (n: number) => Math.abs(n).toFixed(0);
    const restBit =
      attr.restDeltaSec != null && Math.abs(attr.restDeltaSec) >= 15
        ? `descansaste ${clock(Math.abs(attr.restDeltaSec))} ${attr.restDeltaSec > 0 ? 'más' : 'menos'} de media`
        : 'los descansos cambiaron';

    if (Math.abs(attr.totalPct) < 3) {
      notes.push({
        kind: attr.realPct > 0 ? 'good' : 'watch',
        text: `El tonelaje sale casi igual que tu referencia, pero ${restBit}. Descontado el descanso, has rendido un ${pct(attr.realPct)} % ${attr.realPct > 0 ? 'por encima' : 'por debajo'}.`,
      });
    } else if (attr.restShare >= 0.35) {
      notes.push({
        kind: attr.realPct > 0 ? 'good' : 'watch',
        text: `Has ${attr.totalPct > 0 ? 'subido' : 'bajado'} un ${pct(attr.totalPct)} % de volumen. De eso, ${pct(attr.restPct)} puntos son porque ${restBit}; los otros ${pct(attr.realPct)} son cambio real.`,
      });
    } else {
      notes.push({
        kind: attr.realPct > 0 ? 'good' : 'watch',
        text: `Has ${attr.totalPct > 0 ? 'subido' : 'bajado'} un ${pct(attr.totalPct)} % y el descanso apenas lo explica: es cambio real.`,
      });
    }
  }

  for (const pr of prs.slice(0, 3)) {
    notes.push({
      kind: 'good',
      text: `Récord en ${pr.name}: ${kg(pr.weight)} kg × ${pr.reps}, un ${(((pr.e1rm - pr.prev) / pr.prev) * 100).toFixed(1)} % por encima de tu mejor marca.`,
    });
  }

  /* Cuánto variaron los descansos dentro de la propia sesión. No es bueno ni
     malo —depende de la cola que hubiera— pero explica por qué unas series
     salieron mejor que otras. */
  const allRests = session.exercises
    .flatMap((ex) => ex.sets.filter(isFilled).map((s) => s.restSec))
    .filter((x): x is number => x != null);
  if (allRests.length >= 4) {
    const min = Math.min(...allRests);
    const max = Math.max(...allRests);
    if (max - min > 120) {
      notes.push({
        kind: 'info',
        text: `Tus descansos fueron de ${clock(min)} a ${clock(max)}. El índice ya descuenta esa diferencia, así que la comparación con otros días sigue valiendo.`,
      });
    }
  }

  if (stats.rirAvg != null) {
    if (stats.rirAvg >= 3) {
      notes.push({
        kind: 'watch',
        text: `RIR medio de ${stats.rirAvg.toFixed(1)}: te has dejado bastante margen. Si buscabas estímulo, faltó apretar.`,
      });
    } else if (stats.rirAvg <= 0.5) {
      notes.push({
        kind: 'info',
        text: `RIR medio de ${stats.rirAvg.toFixed(1)}: casi todo al fallo. Rinde, pero es difícil de sostener muchas semanas seguidas.`,
      });
    }
  }

  /* Caída dentro del ejercicio: si la última serie pierde mucho respecto a la
     primera, o el peso no daba o llegaste ya fundido. */
  const collapses: string[] = [];
  for (const ex of session.exercises) {
    const done = ex.sets.filter(isFilled);
    if (done.length < 2) continue;
    const first = done[0] as { reps: number };
    const last = done[done.length - 1] as { reps: number };
    if (first.reps > 0 && last.reps / first.reps < 0.6) collapses.push(ex.name);
  }
  if (collapses.length) {
    notes.push({
      kind: 'watch',
      text:
        collapses.length === 1
          ? `En ${collapses[0]} la última serie cayó más de un 40 % respecto a la primera: o descansas más, o empiezas con algo menos de peso.`
          : `Caída fuerte entre la primera y la última serie en ${collapses.length} ejercicios (${collapses.slice(0, 2).join(', ')}…). Suele ser señal de descanso corto para el peso elegido.`,
    });
  }

  const sube = exercises.filter((e) => e.advice.move === 'sube');
  if (sube.length) {
    notes.push({
      kind: 'good',
      text: `Toca subir peso en ${sube.length === 1 ? sube[0]?.name : `${sube.length} ejercicios`}: cerraste el rango de repeticiones en todas las series.`,
    });
  }

  if (stats.exercisesDone < stats.exercisesPlanned) {
    const left = stats.exercisesPlanned - stats.exercisesDone;
    notes.push({
      kind: 'info',
      text: `Quedaron ${left} ejercicio${left === 1 ? '' : 's'} sin registrar. El índice solo cuenta lo hecho, así que no te penaliza — pero el volumen del grupo sí lo nota.`,
    });
  }

  const flojos = muscles.filter((m) => m.index != null && m.index < 90);
  if (flojos.length && !prs.length) {
    const names = flojos.map((m) => MUSCLE_LABEL[m.muscle].toLowerCase());
    notes.push({
      kind: 'watch',
      text: `Por debajo de tu media en ${names.join(' y ')}. Mira el desglose: si lo que baja es la intensidad y no el tonelaje, suele ser fatiga acumulada.`,
    });
  }

  const gap = history[0] ? Math.round((session.start - history[0].start) / 86_400_000) : null;
  if (gap != null && gap >= 7) {
    notes.push({
      kind: 'info',
      text: `Han pasado ${gap} días desde el entreno anterior. Es normal que el índice salga bajo tras un parón; no cambies la rutina por una sola sesión.`,
    });
  }

  if (stats.density > 0) {
    notes.push({
      kind: 'info',
      text: `Densidad de la sesión: ${Math.round(stats.density)} kg por minuto de gimnasio, descansos incluidos.`,
    });
  }

  return notes;
}
