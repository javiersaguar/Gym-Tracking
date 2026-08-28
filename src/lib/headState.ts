import { HEADS, headSplit } from './heads';
import { exerciseStats, WEEKLY_TARGET } from './metrics';
import type { Muscle, Session } from './types';

/* ────────────────────────────────────────────────────────────────────────────
 * Estado de cada cabeza muscular
 *
 * El mapa general dice si un grupo está atendido; este dice cómo se reparte
 * ese trabajo dentro del grupo. Son preguntas distintas: se puede tener el
 * hombro «bien cubierto» y no haber tocado el deltoides posterior en un mes,
 * y eso solo se ve bajando un nivel.
 *
 * Cada serie reparte su volumen dos veces: primero entre grupos, con el reparto
 * del ejercicio, y después entre las cabezas de cada grupo con `headSplit`. La
 * referencia de cada cabeza es la franja semanal del grupo dividida a partes
 * iguales, y ese es el punto flojo conocido del cálculo: no todas las porciones
 * necesitan el mismo trabajo. Por eso la interfaz enseña las series de cada una
 * al lado del color, y marca cuándo el reparto es una estimación en vez de un
 * dato declarado del ejercicio.
 * ──────────────────────────────────────────────────────────────────────── */

export type HeadState = {
  id: string;
  muscle: Muscle;
  /** 0..100. Null si la cabeza no ha recibido trabajo en la ventana. */
  score: number | null;
  setsPerWeek: number;
  sets: number;
  tonnage: number;
  rirAvg: number | null;
  /** Días distintos con trabajo, por semana. */
  freqPerWeek: number;
  /** Falso cuando algún ejercicio no declara reparto y se ha estimado. */
  exact: boolean;
};

const IDEAL_FREQ = 2;
const RIR_LOW = 0;
const RIR_HIGH = 3;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

function bandScore(value: number, [low, high]: [number, number]): number {
  if (value <= 0) return 0;
  if (value >= low && value <= high) return 1;
  if (value < low) return clamp01(value / low);
  return clamp01(1 - (value - high) / (high * 1.5));
}

type Acc = {
  sets: number;
  tonnage: number;
  rirSum: number;
  rirN: number;
  days: Set<number>;
  exact: boolean;
};

/**
 * Estado de todas las cabezas de un grupo en una ventana de días.
 *
 * Devuelve siempre la lista completa del grupo, incluidas las cabezas sin
 * trabajo: en un mapa de reparto, el hueco es justo la información útil.
 */
export function headStates(
  sessions: Session[],
  muscle: Muscle,
  days: number,
  now = Date.now(),
): HeadState[] {
  const from = now - days * 86_400_000;
  const weeks = Math.max(days / 7, 1);
  const acc = new Map<string, Acc>();

  const get = (id: string) => {
    let v = acc.get(id);
    if (!v) {
      v = { sets: 0, tonnage: 0, rirSum: 0, rirN: 0, days: new Set(), exact: true };
      acc.set(id, v);
    }
    return v;
  };

  for (const s of sessions) {
    if (s.start < from) continue;
    const dayKey = new Date(s.start).setHours(0, 0, 0, 0);

    for (const ex of s.exercises) {
      if (ex.skipped) continue;
      const share = ex.muscles.find((m) => m.muscle === muscle)?.share;
      if (!share) continue;
      const st = exerciseStats(ex);
      if (st.sets === 0) continue;

      const { shares, exact } = headSplit(ex.exerciseId, muscle);
      for (const [id, part] of Object.entries(shares)) {
        if (part <= 0) continue;
        const v = get(id);
        v.sets += st.sets * share * part;
        v.tonnage += st.tonnage * share * part;
        if (!exact) v.exact = false;
        /* La frecuencia se cuenta cuando la cabeza recibe algo más que un
           roce: media serie repartida no es haber entrenado esa porción. */
        if (st.sets * share * part >= 0.5) v.days.add(dayKey);
        if (st.rirAvg != null) {
          v.rirSum += st.rirAvg;
          v.rirN += 1;
        }
      }
    }
  }

  const list = HEADS[muscle];
  const target = WEEKLY_TARGET[muscle];
  /* Referencia por cabeza: la franja del grupo repartida a partes iguales. */
  const per: [number, number] = [target[0] / list.length, target[1] / list.length];

  return list
    .map((h): HeadState => {
      const v = acc.get(h.id);
      const setsPerWeek = (v?.sets ?? 0) / weeks;
      const freqPerWeek = (v?.days.size ?? 0) / weeks;
      const rirAvg = v && v.rirN > 0 ? v.rirSum / v.rirN : null;

      const parts: number[] = [bandScore(setsPerWeek, per), clamp01(freqPerWeek / IDEAL_FREQ)];
      if (rirAvg != null) {
        parts.push(bandScore(RIR_HIGH + 1 - rirAvg, [1, RIR_HIGH + 1 - RIR_LOW]));
      }

      return {
        id: h.id,
        muscle,
        score: v && v.sets > 0 ? Math.round((parts.reduce((a, c) => a + c, 0) / parts.length) * 100) : null,
        setsPerWeek,
        sets: v?.sets ?? 0,
        tonnage: v?.tonnage ?? 0,
        rirAvg,
        freqPerWeek,
        exact: v?.exact ?? true,
      };
    })
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}
