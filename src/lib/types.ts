/** Grupos musculares que la app sabe puntuar. */
export const MUSCLES = [
  'espalda',
  'pecho',
  'hombro',
  'biceps',
  'triceps',
  'cuadriceps',
  'femoral',
  'gluteo',
  'gemelo',
  'aductor',
  'abdomen',
] as const;

export type Muscle = (typeof MUSCLES)[number];

export const MUSCLE_LABEL: Record<Muscle, string> = {
  espalda: 'Espalda',
  pecho: 'Pecho',
  hombro: 'Hombro',
  biceps: 'Bíceps',
  triceps: 'Tríceps',
  cuadriceps: 'Cuádriceps',
  femoral: 'Femoral',
  gluteo: 'Glúteo',
  gemelo: 'Gemelo',
  aductor: 'Aductor',
  abdomen: 'Abdomen',
};

/**
 * Un ejercicio reparte su estímulo entre el músculo principal y los que
 * ayudan. El reparto no es decorativo: es lo que hace que un press inclinado
 * no cuente como pecho puro y que el tonelaje por grupo signifique algo.
 * Los pesos de `share` suman 1.
 */
export type MuscleShare = { muscle: Muscle; share: number };

/** Cómo se mide la carga. Cambia la unidad y el texto, no el algoritmo. */
export type LoadKind = 'peso' | 'corporal';

export type Exercise = {
  id: string;
  name: string;
  /** Reparto de estímulo por grupo muscular. El primero es el principal. */
  muscles: MuscleShare[];
  loadKind: LoadKind;
  /** Series previstas. Se pueden añadir y quitar dentro del entreno. */
  plannedSets: number;
  /** Ventana de repeticiones a la que apunta el ejercicio. */
  repRange: [number, number];
  notes?: string;
};

export type Day = {
  id: string;
  /** Posición en el ciclo, 1..N. */
  index: number;
  name: string;
  /** Etiqueta corta para las píldoras del ciclo. */
  short: string;
  rest: boolean;
  exercises: Exercise[];
};

export type Routine = {
  id: string;
  name: string;
  days: Day[];
};

/** Una serie ya registrada dentro de una sesión. */
export type LoggedSet = {
  id: string;
  weight: number;
  reps: number;
  /**
   * Descanso real medido antes de esta serie, en segundos.
   *
   * Se guarda también en la primera serie de cada ejercicio: ese es
   * justamente el descanso de esperar a que se libere una máquina, que es el
   * que más varía y el que más falta hace para descontar su efecto.
   * Solo es nulo en la primerísima serie de la sesión, que no tiene un antes.
   */
  restSec: number | null;
  /** Momento en que se marcó como hecha. */
  at: number;
  done: boolean;
  /**
   * Repeticiones que quedaban en la recámara (RIR). Es lo que separa «7 y
   * podía con dos más» de «7 y me morí», y sin ello no hay forma de saber si
   * una sesión floja fue falta de fuerza o falta de ganas.
   */
  rir: number | null;
};

export type LoggedExercise = {
  /** Copia del ejercicio en el momento del entreno: la rutina puede cambiar
   *  después y el histórico no debe reescribirse solo. */
  exerciseId: string;
  name: string;
  muscles: MuscleShare[];
  loadKind: LoadKind;
  repRange: [number, number];
  sets: LoggedSet[];
  /** Quitado del entreno de hoy sin tocar la rutina. */
  skipped: boolean;
};

export type Session = {
  id: string;
  dayId: string;
  dayIndex: number;
  dayName: string;
  /** Inicio y fin en epoch ms. `end` nulo mientras está en curso. */
  start: number;
  end: number | null;
  exercises: LoggedExercise[];
  /** Sensación 1..5 que se pide al cerrar. */
  feel?: number | null;
  note?: string;
};

export type Settings = {
  /** Incremento del stepper de peso, en kg. */
  weightStep: number;
  /** Mantener la pantalla encendida durante el entreno. */
  keepAwake: boolean;
  /** Cada cuántas sesiones recordar que hay que descargar una copia. */
  backupEvery: number;
  /** Sesiones guardadas la última vez que se descargó una copia. */
  lastBackupCount: number;
};

export type Store = {
  version: number;
  routine: Routine;
  sessions: Session[];
  /** Sesión en curso. Sobrevive a cerrar la app: es lo que la hace usable
   *  en un gimnasio sin cobertura. */
  active: Session | null;
  /** Marcas de referencia sembradas antes de usar la app, por ejercicio. */
  seedRefs: Record<string, { weight: number; reps: number }[]>;
  settings: Settings;
};
