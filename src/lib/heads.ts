import type { Muscle } from './types';

/* ────────────────────────────────────────────────────────────────────────────
 * Cabezas y porciones musculares
 *
 * El mapa general colorea once grupos. Al tocar uno se entra en su detalle, y
 * ahí hace falta saber qué parte del grupo trabaja cada ejercicio: un press
 * inclinado y unas cruces bajas son los dos «pecho», pero no cargan la misma
 * porción, y sin ese reparto el mapa de detalle solo repetiría el mismo color
 * en todas las cabezas, que no informa de nada.
 *
 * Los repartos de `EXERCISE_HEADS` son estimaciones razonables a partir de la
 * biomecánica de cada movimiento —ángulo del hombro, posición del codo,
 * flexión de cadera—, no medidas de electromiografía sobre ti. Sirven para
 * ver desequilibrios groseros («llevas tres semanas sin tocar la porción
 * clavicular»), no para afinar al uno por ciento.
 * ──────────────────────────────────────────────────────────────────────── */

export type Head = {
  id: string;
  label: string;
  /** Nombre corto para etiquetar sobre el dibujo. */
  short: string;
  /**
   * Capa profunda: en el cuerpo queda tapada por otro músculo. El mapa general
   * no la dibuja y el de detalle sí, levantada por encima del que la cubre,
   * como una lámina de una lámina de anatomía.
   */
  deep?: boolean;
};

export const HEADS: Record<Muscle, Head[]> = {
  pecho: [
    { id: 'pecho.clavicular', label: 'Porción clavicular', short: 'Superior' },
    { id: 'pecho.esternal', label: 'Porción esternocostal', short: 'Medio' },
    { id: 'pecho.abdominal', label: 'Porción abdominal', short: 'Inferior' },
  ],
  espalda: [
    { id: 'espalda.trapecio-sup', label: 'Trapecio superior', short: 'Trap. sup.' },
    { id: 'espalda.trapecio-med', label: 'Trapecio medio', short: 'Trap. medio' },
    { id: 'espalda.trapecio-inf', label: 'Trapecio inferior', short: 'Trap. inf.' },
    { id: 'espalda.dorsal', label: 'Dorsal ancho', short: 'Dorsal' },
    { id: 'espalda.redondo', label: 'Redondo mayor', short: 'Redondo' },
    { id: 'espalda.romboides', label: 'Romboides', short: 'Romboides', deep: true },
    { id: 'espalda.erectores', label: 'Erectores espinales', short: 'Lumbar' },
  ],
  hombro: [
    { id: 'hombro.anterior', label: 'Deltoides anterior', short: 'Anterior' },
    { id: 'hombro.lateral', label: 'Deltoides lateral', short: 'Lateral' },
    { id: 'hombro.posterior', label: 'Deltoides posterior', short: 'Posterior' },
  ],
  biceps: [
    { id: 'biceps.larga', label: 'Cabeza larga', short: 'Larga' },
    { id: 'biceps.corta', label: 'Cabeza corta', short: 'Corta' },
    { id: 'biceps.braquial', label: 'Braquial anterior', short: 'Braquial' },
  ],
  triceps: [
    { id: 'triceps.larga', label: 'Cabeza larga', short: 'Larga' },
    { id: 'triceps.lateral', label: 'Cabeza lateral', short: 'Lateral' },
    { id: 'triceps.medial', label: 'Cabeza medial', short: 'Medial' },
  ],
  cuadriceps: [
    { id: 'cuadriceps.recto', label: 'Recto femoral', short: 'Recto' },
    { id: 'cuadriceps.vasto-lateral', label: 'Vasto lateral', short: 'V. lateral' },
    { id: 'cuadriceps.vasto-medial', label: 'Vasto medial', short: 'V. medial' },
    { id: 'cuadriceps.vasto-intermedio', label: 'Vasto intermedio', short: 'V. intermedio', deep: true },
  ],
  femoral: [
    { id: 'femoral.biceps', label: 'Bíceps femoral', short: 'B. femoral' },
    { id: 'femoral.semitendinoso', label: 'Semitendinoso', short: 'Semitend.' },
    { id: 'femoral.semimembranoso', label: 'Semimembranoso', short: 'Semimemb.' },
  ],
  gluteo: [
    { id: 'gluteo.mayor', label: 'Glúteo mayor', short: 'Mayor' },
    { id: 'gluteo.medio', label: 'Glúteo medio', short: 'Medio' },
    { id: 'gluteo.menor', label: 'Glúteo menor', short: 'Menor', deep: true },
  ],
  gemelo: [
    { id: 'gemelo.gastro-lateral', label: 'Gastrocnemio lateral', short: 'Gastro lat.' },
    { id: 'gemelo.gastro-medial', label: 'Gastrocnemio medial', short: 'Gastro med.' },
    { id: 'gemelo.soleo', label: 'Sóleo', short: 'Sóleo' },
  ],
  aductor: [
    { id: 'aductor.mayor', label: 'Aductor mayor', short: 'Mayor' },
    { id: 'aductor.largo', label: 'Aductor largo y corto', short: 'Largo' },
    { id: 'aductor.gracil', label: 'Grácil', short: 'Grácil' },
  ],
  abdomen: [
    { id: 'abdomen.recto', label: 'Recto abdominal', short: 'Recto' },
    { id: 'abdomen.oblicuo', label: 'Oblicuo externo', short: 'Oblicuo' },
    { id: 'abdomen.serrato', label: 'Serrato anterior', short: 'Serrato' },
    { id: 'abdomen.transverso', label: 'Transverso', short: 'Transverso', deep: true },
  ],
};

/** Todas las cabezas, indexadas por id. */
export const HEAD_BY_ID: Record<string, Head & { muscle: Muscle }> = Object.fromEntries(
  Object.entries(HEADS).flatMap(([muscle, list]) =>
    list.map((h) => [h.id, { ...h, muscle: muscle as Muscle }]),
  ),
);

/**
 * Reparto por cabezas de cada ejercicio, dentro de cada grupo. Los valores de
 * un mismo grupo suman 1. Lo que no aparece aquí se reparte a partes iguales
 * y se marca como estimación en la interfaz.
 */
export type HeadSplit = Partial<Record<Muscle, Record<string, number>>>;

const T = (larga: number, lateral: number, medial: number) => ({
  'triceps.larga': larga,
  'triceps.lateral': lateral,
  'triceps.medial': medial,
});

const D = (anterior: number, lateral: number, posterior: number) => ({
  'hombro.anterior': anterior,
  'hombro.lateral': lateral,
  'hombro.posterior': posterior,
});

const B = (larga: number, corta: number, braquial: number) => ({
  'biceps.larga': larga,
  'biceps.corta': corta,
  'biceps.braquial': braquial,
});

const ESPALDA = (o: Partial<Record<string, number>>) => o as Record<string, number>;

export const EXERCISE_HEADS: Record<string, HeadSplit> = {
  /* ── Tirón ─────────────────────────────────────────────────────────────── */

  'remo-t': {
    espalda: ESPALDA({
      'espalda.dorsal': 0.4,
      'espalda.trapecio-med': 0.25,
      'espalda.romboides': 0.15,
      'espalda.redondo': 0.12,
      'espalda.trapecio-inf': 0.08,
    }),
    /* En remo el codo va pegado y el hombro extiende: manda la cabeza larga. */
    biceps: B(0.4, 0.25, 0.35),
  },
  'remo-t-densidad': {
    espalda: ESPALDA({
      'espalda.dorsal': 0.4,
      'espalda.trapecio-med': 0.25,
      'espalda.romboides': 0.15,
      'espalda.redondo': 0.12,
      'espalda.trapecio-inf': 0.08,
    }),
    biceps: B(0.4, 0.25, 0.35),
  },
  'jalon-cerrado': {
    /* Agarre cerrado y neutro: más dorsal bajo y redondo, menos trapecio. */
    espalda: ESPALDA({
      'espalda.dorsal': 0.62,
      'espalda.redondo': 0.18,
      'espalda.trapecio-inf': 0.12,
      'espalda.romboides': 0.08,
    }),
    biceps: B(0.35, 0.3, 0.35),
  },
  'jalon-pecho': {
    espalda: ESPALDA({
      'espalda.dorsal': 0.55,
      'espalda.redondo': 0.2,
      'espalda.trapecio-inf': 0.15,
      'espalda.romboides': 0.1,
    }),
    biceps: B(0.35, 0.3, 0.35),
  },
  'gironda-uni': {
    espalda: ESPALDA({
      'espalda.dorsal': 0.6,
      'espalda.redondo': 0.2,
      'espalda.trapecio-inf': 0.12,
      'espalda.romboides': 0.08,
    }),
    biceps: B(0.35, 0.3, 0.35),
  },
  'pull-over': {
    /* Hombro en flexión completa: dorsal casi puro, y la larga del tríceps
       porque cruza el hombro. */
    espalda: ESPALDA({ 'espalda.dorsal': 0.78, 'espalda.redondo': 0.16, 'espalda.trapecio-inf': 0.06 }),
    triceps: T(0.85, 0.08, 0.07),
  },
  'hombro-posterior': {
    hombro: D(0.05, 0.15, 0.8),
    espalda: ESPALDA({ 'espalda.trapecio-med': 0.45, 'espalda.romboides': 0.35, 'espalda.redondo': 0.2 }),
  },
  'predicador-maquina': {
    /* Hombro en flexión: la larga queda acortada y trabaja poco. */
    biceps: B(0.2, 0.45, 0.35),
  },
  'curl-bayesian': {
    /* Hombro en extensión detrás del cuerpo: es el que más estira la larga. */
    biceps: B(0.55, 0.25, 0.2),
  },

  /* ── Empuje ────────────────────────────────────────────────────────────── */

  'press-inclinado': {
    pecho: { 'pecho.clavicular': 0.55, 'pecho.esternal': 0.38, 'pecho.abdominal': 0.07 },
    hombro: D(0.75, 0.2, 0.05),
    triceps: T(0.3, 0.38, 0.32),
  },
  'press-inclinado-maquina': {
    pecho: { 'pecho.clavicular': 0.52, 'pecho.esternal': 0.4, 'pecho.abdominal': 0.08 },
    hombro: D(0.75, 0.2, 0.05),
    triceps: T(0.3, 0.38, 0.32),
  },
  'press-plano-maquina': {
    pecho: { 'pecho.clavicular': 0.25, 'pecho.esternal': 0.55, 'pecho.abdominal': 0.2 },
    hombro: D(0.7, 0.25, 0.05),
    triceps: T(0.3, 0.38, 0.32),
  },
  'press-plano-smith': {
    pecho: { 'pecho.clavicular': 0.24, 'pecho.esternal': 0.56, 'pecho.abdominal': 0.2 },
    hombro: D(0.7, 0.25, 0.05),
    triceps: T(0.3, 0.38, 0.32),
  },
  'laterales-polea': {
    hombro: D(0.12, 0.8, 0.08),
  },
  'cruces-polea-inclinado': {
    /* Cruce de abajo arriba: carga la porción clavicular. */
    pecho: { 'pecho.clavicular': 0.6, 'pecho.esternal': 0.35, 'pecho.abdominal': 0.05 },
    hombro: D(0.8, 0.15, 0.05),
  },
  contractora: {
    pecho: { 'pecho.clavicular': 0.25, 'pecho.esternal': 0.6, 'pecho.abdominal': 0.15 },
  },
  'extension-triceps': {
    /* Codo delante y hombro neutro: lateral y medial por delante de la larga. */
    triceps: T(0.22, 0.45, 0.33),
  },
  'triceps-nuca': {
    /* Codo por encima de la cabeza: la larga cruza el hombro y trabaja
       estirada, así que aquí manda ella. Es justo el reparto contrario al de
       la extensión con el codo delante, y por eso conviene tener las dos. */
    triceps: T(0.5, 0.28, 0.22),
  },

  /* ── Pierna ────────────────────────────────────────────────────────────── */

  aductor: {
    aductor: { 'aductor.mayor': 0.5, 'aductor.largo': 0.35, 'aductor.gracil': 0.15 },
  },
  'gemelo-pie': {
    /* Rodilla extendida: manda el gastrocnemio. */
    gemelo: { 'gemelo.gastro-lateral': 0.4, 'gemelo.gastro-medial': 0.42, 'gemelo.soleo': 0.18 },
  },
  'rumano-maquina': {
    femoral: { 'femoral.biceps': 0.4, 'femoral.semitendinoso': 0.32, 'femoral.semimembranoso': 0.28 },
    gluteo: { 'gluteo.mayor': 0.85, 'gluteo.medio': 0.12, 'gluteo.menor': 0.03 },
  },
  'hip-thrust-maquina': {
    /* Cadera extendiendo con la rodilla doblada: el femoral trabaja acortado y
       apenas aporta, así que el glúteo mayor se lleva casi todo. Es el
       ejercicio que más lo aísla de la rutina. */
    gluteo: { 'gluteo.mayor': 0.82, 'gluteo.medio': 0.14, 'gluteo.menor': 0.04 },
    femoral: { 'femoral.biceps': 0.38, 'femoral.semitendinoso': 0.34, 'femoral.semimembranoso': 0.28 },
    cuadriceps: {
      /* La rodilla se queda fija: los vastos sujetan y el recto, que cruza la
         cadera, va en contra del movimiento. */
      'cuadriceps.recto': 0.14,
      'cuadriceps.vasto-lateral': 0.34,
      'cuadriceps.vasto-medial': 0.3,
      'cuadriceps.vasto-intermedio': 0.22,
    },
  },
  prensa: {
    cuadriceps: {
      'cuadriceps.recto': 0.2,
      'cuadriceps.vasto-lateral': 0.32,
      'cuadriceps.vasto-medial': 0.26,
      'cuadriceps.vasto-intermedio': 0.22,
    },
    gluteo: { 'gluteo.mayor': 0.8, 'gluteo.medio': 0.15, 'gluteo.menor': 0.05 },
    femoral: { 'femoral.biceps': 0.4, 'femoral.semitendinoso': 0.32, 'femoral.semimembranoso': 0.28 },
  },
  'femoral-sentado': {
    /* Cadera flexionada: el bíceps femoral queda estirado y trabaja más. */
    femoral: { 'femoral.biceps': 0.45, 'femoral.semitendinoso': 0.3, 'femoral.semimembranoso': 0.25 },
  },
  'extension-cuadriceps': {
    cuadriceps: {
      'cuadriceps.recto': 0.3,
      'cuadriceps.vasto-lateral': 0.26,
      'cuadriceps.vasto-medial': 0.26,
      'cuadriceps.vasto-intermedio': 0.18,
    },
  },
  'abs-maquina': {
    abdomen: {
      'abdomen.recto': 0.65,
      'abdomen.oblicuo': 0.2,
      'abdomen.transverso': 0.1,
      'abdomen.serrato': 0.05,
    },
  },
};

/**
 * Reparto de un ejercicio dentro de un grupo. Si no está declarado, se reparte
 * a partes iguales entre las cabezas del grupo — y `exact` avisa de que es un
 * relleno, no un dato.
 */
export function headSplit(
  exerciseId: string,
  muscle: Muscle,
): { shares: Record<string, number>; exact: boolean } {
  const declared = EXERCISE_HEADS[exerciseId]?.[muscle];
  if (declared) {
    const total = Object.values(declared).reduce((a, b) => a + b, 0);
    if (total > 0) {
      return {
        shares: Object.fromEntries(Object.entries(declared).map(([k, v]) => [k, v / total])),
        exact: true,
      };
    }
  }
  const list = HEADS[muscle];
  const even = 1 / list.length;
  return { shares: Object.fromEntries(list.map((h) => [h.id, even])), exact: false };
}
