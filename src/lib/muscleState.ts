import { balance, muscleProgress, WEEKLY_TARGET, type Balance } from './metrics';
import { MUSCLE_LABEL, MUSCLES, type Muscle, type Session } from './types';

/* ────────────────────────────────────────────────────────────────────────────
 * Estado de cada grupo muscular
 *
 * El mapa de calor no pinta kilos: pinta si el grupo está bien atendido. Un
 * gemelo puede mover poco peso y estar perfectamente cubierto, y una espalda
 * mover mucho y estar entrenada a medias.
 *
 * Cuatro componentes, cada uno de 0 a 1, y siempre visibles por separado para
 * que el número compuesto no haya que creérselo a ciegas:
 *
 *   VOLUMEN     series efectivas por semana frente a la franja de referencia
 *   FRECUENCIA  cuántos días por semana se toca el grupo (dos es el ideal)
 *   INTENSIDAD  RIR medio: acercarse al fallo sin pasarse de largo
 *   PROGRESO    índice de las últimas sesiones de ese grupo
 *
 * Ninguno es una verdad absoluta; son referencias razonables. Por eso el mapa
 * enseña el desglose y no solo el color.
 * ──────────────────────────────────────────────────────────────────────── */

export type Component = {
  key: 'volumen' | 'frecuencia' | 'intensidad' | 'progreso';
  label: string;
  /** 0..1. Null cuando no hay datos suficientes para opinar. */
  score: number | null;
  /** Lo medido, ya formateado. */
  detail: string;
};

export type MuscleState = {
  muscle: Muscle;
  /** 0..100. Null si el grupo no se ha entrenado en la ventana. */
  score: number | null;
  components: Component[];
  /** Frase corta que dice qué hacer. */
  verdict: string;
  setsPerWeek: number;
  tonnage: number;
  sets: number;
};

/** Días por semana a los que se aspira por grupo. Dos sesiones reparten mejor
 *  el mismo volumen que una sola atracón. */
const IDEAL_FREQ = 2;

/** Ventana de RIR que se considera trabajo efectivo: ni sobrado ni al fallo
 *  en todas las series. */
const RIR_LOW = 0;
const RIR_HIGH = 3;

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** Puntúa una cantidad frente a una franja: 1 dentro, y cae al alejarse. */
function bandScore(value: number, [low, high]: [number, number]): number {
  if (value <= 0) return 0;
  if (value >= low && value <= high) return 1;
  if (value < low) return clamp01(value / low);
  /* Pasarse penaliza mucho menos que quedarse corto: más volumen del
     recomendado no es un fallo, solo deja de sumar. */
  return clamp01(1 - (value - high) / (high * 1.5));
}

function volumeComponent(b: Balance): Component {
  const target = WEEKLY_TARGET[b.muscle];
  return {
    key: 'volumen',
    label: 'Volumen',
    score: b.setsPerWeek > 0 ? bandScore(b.setsPerWeek, target) : 0,
    detail: `${b.setsPerWeek.toFixed(1)} de ${target[0]}–${target[1]} series/sem`,
  };
}

function frequencyComponent(b: Balance): Component {
  return {
    key: 'frecuencia',
    label: 'Frecuencia',
    score: b.freqPerWeek > 0 ? clamp01(b.freqPerWeek / IDEAL_FREQ) : 0,
    detail: `${b.freqPerWeek.toFixed(1)} días/sem`,
  };
}

function intensityComponent(b: Balance): Component {
  if (b.rirAvg == null) {
    return { key: 'intensidad', label: 'Intensidad', score: null, detail: 'sin RIR apuntado' };
  }
  return {
    key: 'intensidad',
    label: 'Intensidad',
    score: bandScore(RIR_HIGH + 1 - b.rirAvg, [RIR_HIGH + 1 - RIR_HIGH, RIR_HIGH + 1 - RIR_LOW]),
    detail: `RIR ${b.rirAvg.toFixed(1)} de media`,
  };
}

function progressComponent(index: number | null): Component {
  if (index == null) {
    return { key: 'progreso', label: 'Progreso', score: null, detail: 'sin referencia previa' };
  }
  /* 100 = igual que tu media reciente → medio punto. 120 o más satura arriba,
     80 o menos satura abajo. */
  return {
    key: 'progreso',
    label: 'Progreso',
    score: clamp01((index - 80) / 40),
    detail: `índice ${index}`,
  };
}

function verdictFor(components: Component[], score: number | null): string {
  if (score == null) return 'Sin trabajo en este periodo.';

  const weakest = components
    .filter((c): c is Component & { score: number } => c.score != null)
    .sort((a, b) => a.score - b.score)[0];

  if (!weakest) return 'Faltan datos para opinar.';
  if (score >= 75) return 'Bien cubierto.';

  switch (weakest.key) {
    case 'volumen':
      return 'Le faltan series a la semana.';
    case 'frecuencia':
      return 'Mucho en un día: reparte en dos sesiones.';
    case 'intensidad':
      return 'Te sobran repeticiones en la recámara: aprieta más.';
    case 'progreso':
      return 'El volumen está, pero no avanza: cambia carga o descanso.';
  }
}

/**
 * Estado de todos los grupos en una ventana de días. `sessions` completo: la
 * ventana se aplica dentro, y el progreso necesita mirar más atrás que la
 * propia ventana para tener con qué comparar.
 */
export function muscleStates(sessions: Session[], days: number, now = Date.now()): MuscleState[] {
  const bal = balance(sessions, days, now);
  const ordered = [...sessions].sort((a, b) => b.start - a.start);
  const from = now - days * 86_400_000;

  /* Índice de progreso por grupo: la mediana de los índices de las sesiones
     dentro de la ventana, cada una comparada contra lo que hubo antes. */
  const indices = new Map<Muscle, number[]>();
  ordered.forEach((s, i) => {
    if (s.start < from) return;
    for (const p of muscleProgress(s, ordered.slice(i + 1))) {
      if (p.index == null) continue;
      const list = indices.get(p.muscle) ?? [];
      list.push(p.index);
      indices.set(p.muscle, list);
    }
  });

  return MUSCLES.map((muscle) => {
    const b = bal.find((x) => x.muscle === muscle) as Balance;
    const idxList = indices.get(muscle) ?? [];
    const idx = idxList.length
      ? Math.round(idxList.reduce((a, c) => a + c, 0) / idxList.length)
      : null;

    const components = [
      volumeComponent(b),
      frequencyComponent(b),
      intensityComponent(b),
      progressComponent(idx),
    ];

    /* Los componentes sin dato no cuentan como cero: se reparte su peso entre
       los que sí hay, igual que en el índice de sesión. */
    const scored = components.filter((c): c is Component & { score: number } => c.score != null);
    const score = b.sets > 0 && scored.length
      ? Math.round((scored.reduce((a, c) => a + c.score, 0) / scored.length) * 100)
      : null;

    return {
      muscle,
      score,
      components,
      verdict: verdictFor(components, score),
      setsPerWeek: b.setsPerWeek,
      tonnage: b.tonnage,
      sets: b.sets,
    };
  }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}

export function stateLabel(score: number | null): string {
  if (score == null) return 'Sin datos';
  if (score >= 75) return 'Bien cubierto';
  if (score >= 50) return 'Aceptable';
  if (score >= 25) return 'Flojo';
  return 'Desatendido';
}

export { MUSCLE_LABEL };
