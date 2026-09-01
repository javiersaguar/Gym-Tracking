import type { Day, Exercise, Muscle, MuscleShare, Routine } from './types';

/**
 * Catálogo de ejercicios. El id es estable y se comparte entre días a
 * propósito: la gironda del día 1 y la del día 5 son el mismo ejercicio y su
 * progreso tiene que sumar en la misma línea.
 *
 * `muscles` reparte el estímulo. Los pesos salen de qué mueve realmente cada
 * máquina, no de a qué sección del gimnasio pertenece: una prensa no es
 * cuádriceps puro y un rumano no es femoral puro.
 */
type Spec = {
  name: string;
  muscles: [Muscle, number][];
  reps: [number, number];
  load?: 'peso' | 'corporal';
  notes?: string;
  /** Se hace un lado cada vez: la app ofrece apuntar los dos por separado. */
  unilateral?: boolean;
};

const CATALOG = {
  'remo-t': {
    name: 'Remo en T',
    muscles: [['espalda', 0.8], ['biceps', 0.2]],
    reps: [6, 10],
  },
  'remo-t-densidad': {
    name: 'Remo en T · densidad',
    muscles: [['espalda', 0.8], ['biceps', 0.2]],
    reps: [8, 12],
    notes: 'Día de densidad: series seguidas, sin alargar el descanso.',
  },
  'jalon-cerrado': {
    name: 'Jalón cerrado',
    muscles: [['espalda', 0.8], ['biceps', 0.2]],
    reps: [6, 10],
  },
  'jalon-pecho': {
    name: 'Jalón al pecho',
    muscles: [['espalda', 0.8], ['biceps', 0.2]],
    reps: [6, 10],
  },
  'gironda-uni': {
    name: 'Gironda unilateral',
    muscles: [['espalda', 0.85], ['biceps', 0.15]],
    reps: [7, 11],
    notes: 'El peso es por lado.',
    unilateral: true,
  },
  'pull-over': {
    name: 'Pull over',
    muscles: [['espalda', 0.85], ['triceps', 0.15]],
    reps: [8, 12],
    unilateral: true,
  },
  'hombro-posterior': {
    name: 'Hombro posterior',
    muscles: [['hombro', 0.8], ['espalda', 0.2]],
    reps: [10, 15],
  },
  'predicador-maquina': {
    name: 'Bíceps predicador en máquina',
    muscles: [['biceps', 1]],
    reps: [6, 10],
  },
  'curl-bayesian': {
    name: 'Curl bayesiano',
    muscles: [['biceps', 1]],
    reps: [8, 12],
  },
  'press-inclinado': {
    name: 'Press inclinado',
    muscles: [['pecho', 0.7], ['hombro', 0.15], ['triceps', 0.15]],
    reps: [5, 8],
  },
  'press-inclinado-maquina': {
    name: 'Press inclinado en máquina',
    muscles: [['pecho', 0.7], ['hombro', 0.15], ['triceps', 0.15]],
    reps: [6, 10],
  },
  'press-plano-maquina': {
    name: 'Press plano en máquina',
    muscles: [['pecho', 0.7], ['triceps', 0.2], ['hombro', 0.1]],
    reps: [6, 10],
  },
  'press-plano-smith': {
    name: 'Press plano en multipower',
    muscles: [['pecho', 0.7], ['triceps', 0.2], ['hombro', 0.1]],
    reps: [5, 8],
  },
  'laterales-polea': {
    name: 'Elevaciones laterales en polea',
    muscles: [['hombro', 1]],
    reps: [10, 15],
    notes: 'El peso es por lado.',
  },
  'cruces-polea-inclinado': {
    name: 'Cruces de poleas inclinado',
    muscles: [['pecho', 0.9], ['hombro', 0.1]],
    reps: [10, 14],
  },
  contractora: {
    name: 'Contractora de pecho',
    muscles: [['pecho', 1]],
    reps: [10, 14],
  },
  'extension-triceps': {
    name: 'Extensión de tríceps',
    muscles: [['triceps', 1]],
    reps: [8, 12],
    unilateral: true,
  },
  'triceps-nuca': {
    name: 'Tríceps tras nuca',
    muscles: [['triceps', 1]],
    reps: [8, 12],
    notes: 'Con el codo arriba la cabeza larga trabaja estirada: es la que más carga.',
  },
  aductor: {
    name: 'Aductor',
    muscles: [['aductor', 1]],
    reps: [10, 15],
  },
  'gemelo-pie': {
    name: 'Gemelo de pie',
    muscles: [['gemelo', 1]],
    reps: [10, 15],
  },
  'rumano-maquina': {
    name: 'Peso muerto rumano en máquina',
    muscles: [['femoral', 0.55], ['gluteo', 0.45]],
    reps: [6, 10],
  },
  'hip-thrust-maquina': {
    name: 'Hip thrust en máquina',
    muscles: [['gluteo', 0.7], ['femoral', 0.2], ['cuadriceps', 0.1]],
    reps: [8, 12],
    notes: 'Extensión de cadera con la rodilla doblada: el glúteo mayor sin que el femoral tape.',
  },
  prensa: {
    name: 'Prensa',
    muscles: [['cuadriceps', 0.65], ['gluteo', 0.25], ['femoral', 0.1]],
    reps: [6, 10],
  },
  'femoral-sentado': {
    name: 'Femoral sentado',
    muscles: [['femoral', 1]],
    reps: [8, 12],
  },
  'extension-cuadriceps': {
    name: 'Extensión de cuádriceps',
    muscles: [['cuadriceps', 1]],
    reps: [8, 12],
  },
  'abs-maquina': {
    name: 'Abdominales en máquina',
    muscles: [['abdomen', 1]],
    reps: [10, 15],
  },
} satisfies Record<string, Spec>;

export type CatalogId = keyof typeof CATALOG;

export const CATALOG_IDS = Object.keys(CATALOG) as CatalogId[];

export function catalogName(id: string): string {
  return (CATALOG as Record<string, Spec>)[id]?.name ?? id;
}

/**
 * Si el ejercicio se hace un lado cada vez. Es solo el valor por defecto: en
 * el entreno se puede activar o desactivar para cualquier ejercicio, porque
 * un día suelto se hace a un brazo lo que normalmente va a dos.
 */
export function isUnilateral(id: string): boolean {
  return (CATALOG as Record<string, Spec>)[id]?.unilateral === true;
}

/** Construye un ejercicio de la rutina a partir del catálogo. */
export function makeExercise(id: CatalogId | string, plannedSets: number): Exercise {
  const spec = (CATALOG as Record<string, Spec>)[id];
  if (!spec) throw new Error(`Ejercicio desconocido: ${id}`);
  return {
    id,
    name: spec.name,
    muscles: spec.muscles.map(([muscle, share]) => ({ muscle, share })) as MuscleShare[],
    loadKind: spec.load ?? 'peso',
    plannedSets,
    repRange: spec.reps,
    ...(spec.notes ? { notes: spec.notes } : {}),
  };
}

function day(
  index: number,
  name: string,
  short: string,
  entries: [CatalogId, number][],
): Day {
  return {
    id: `d${index}`,
    index,
    name,
    short,
    rest: false,
    exercises: entries.map(([id, sets]) => makeExercise(id, sets)),
  };
}

function restDay(index: number): Day {
  return { id: `d${index}`, index, name: 'Descanso', short: 'Off', rest: true, exercises: [] };
}

/** El ciclo de 10 días, tal cual está escrito en la hoja. */
export function defaultRoutine(): Routine {
  return {
    id: 'ciclo-10',
    name: 'Ciclo de 10 días',
    days: [
      day(1, 'Espalda y bíceps', 'Tirón', [
        ['remo-t', 2],
        ['jalon-cerrado', 2],
        ['gironda-uni', 2],
        ['pull-over', 2],
        ['predicador-maquina', 2],
        ['curl-bayesian', 2],
      ]),
      day(2, 'Pecho, hombro y tríceps', 'Empuje', [
        ['press-inclinado', 3],
        ['press-plano-maquina', 2],
        ['laterales-polea', 3],
        ['cruces-polea-inclinado', 3],
        ['extension-triceps', 2],
      ]),
      day(3, 'Pierna completa', 'Pierna', [
        ['aductor', 2],
        ['gemelo-pie', 3],
        ['rumano-maquina', 2],
        ['prensa', 2],
        ['femoral-sentado', 2],
        ['extension-cuadriceps', 2],
        ['abs-maquina', 2],
      ]),
      restDay(4),
      day(5, 'Espalda, bíceps y posterior', 'Tirón', [
        ['remo-t-densidad', 3],
        ['jalon-pecho', 2],
        ['gironda-uni', 2],
        ['pull-over', 2],
        ['hombro-posterior', 2],
        ['predicador-maquina', 2],
        ['curl-bayesian', 2],
      ]),
      day(6, 'Pecho, hombro y tríceps', 'Empuje', [
        ['press-plano-smith', 3],
        ['press-inclinado-maquina', 2],
        ['laterales-polea', 3],
        ['contractora', 3],
        ['extension-triceps', 2],
      ]),
      restDay(7),
      day(8, 'Pierna completa', 'Pierna', [
        ['aductor', 3],
        ['gemelo-pie', 2],
        ['prensa', 2],
        ['rumano-maquina', 2],
        ['extension-cuadriceps', 2],
        ['femoral-sentado', 2],
        ['abs-maquina', 2],
      ]),
      day(9, 'Brazo y hombro', 'Brazo', [
        ['laterales-polea', 3],
        ['curl-bayesian', 3],
        ['extension-triceps', 2],
        ['hombro-posterior', 2],
        ['predicador-maquina', 2],
      ]),
      restDay(10),
    ],
  };
}

/**
 * Marcas que ya venían apuntadas en la hoja antes de instalar la app. No son
 * una sesión: no tienen fecha ni descansos, así que no se pueden meter en el
 * histórico sin inventarse datos. Se guardan aparte y solo sirven de listón
 * en la primera sesión de cada ejercicio.
 */
export function seedReferences(): Record<string, { weight: number; reps: number }[]> {
  return {
    'remo-t': [
      { weight: 40, reps: 8 },
      { weight: 40, reps: 7 },
    ],
    'jalon-cerrado': [
      { weight: 54, reps: 7 },
      { weight: 50, reps: 7 },
    ],
    'gironda-uni': [
      { weight: 23, reps: 7 },
      { weight: 23, reps: 6 },
    ],
    'pull-over': [
      { weight: 18, reps: 7 },
      { weight: 18, reps: 6 },
    ],
    'predicador-maquina': [
      { weight: 41, reps: 7 },
      { weight: 41, reps: 5 },
    ],
    'press-inclinado': [
      { weight: 30, reps: 6 },
      { weight: 30, reps: 5 },
    ],
    'press-plano-maquina': [
      { weight: 30, reps: 6 },
      { weight: 20, reps: 8 },
    ],
  };
}
