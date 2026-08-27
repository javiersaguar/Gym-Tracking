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
  /** Descanso objetivo en segundos: alimenta el cronómetro y la densidad. */
  targetRest: number;
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
  /** Descanso *previo* a esta serie, en segundos. La primera serie no tiene. */
  restSec: number | null;
  /** Momento en que se marcó como hecha. */
  at: number;
  done: boolean;
  /** RIR estimado por el usuario. Opcional: si no está, no penaliza. */
  rir?: number | null;
};

export type LoggedExercise = {
  /** Copia del ejercicio en el momento del entreno: la rutina puede cambiar
   *  después y el histórico no debe reescribirse solo. */
  exerciseId: string;
  name: string;
  muscles: MuscleShare[];
  loadKind: LoadKind;
  targetRest: number;
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
  /** Descanso por defecto cuando el ejercicio no dice otra cosa. */
  defaultRest: number;
  /** Avisar con sonido/vibración al llegar al descanso objetivo. */
  restAlert: boolean;
  /** Incremento del stepper de peso, en kg. */
  weightStep: number;
  /** Mantener la pantalla encendida durante el entreno. */
  keepAwake: boolean;
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
