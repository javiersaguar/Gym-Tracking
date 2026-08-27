import { describe, expect, it } from 'vitest';
import { analyse } from './analysis';
import { cycleState } from './actions';
import { defaultRoutine, seedReferences } from './routine';
import { DEFAULT_SETTINGS } from './storage';
import type { LoggedExercise, LoggedSet, Session, Store } from './types';

let counter = 0;
function set(weight: number, reps: number, restSec: number | null = 120): LoggedSet {
  counter += 1;
  return { id: `s${counter}`, weight, reps, restSec, at: 0, done: true, rir: null };
}

function exercise(id: string, sets: LoggedSet[], repRange: [number, number] = [6, 10]): LoggedExercise {
  return {
    exerciseId: id,
    name: id,
    muscles: [{ muscle: 'espalda', share: 1 }],
    loadKind: 'peso',
    targetRest: 120,
    repRange,
    sets,
    skipped: false,
  };
}

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 12, 10, 0, 0);

function session(id: string, start: number, exercises: LoggedExercise[]): Session {
  return { id, dayId: 'd1', dayIndex: 1, dayName: 'Espalda y bíceps', start, end: start + 3600_000, exercises };
}

function store(partial: Partial<Store> = {}): Store {
  return {
    version: 1,
    routine: defaultRoutine(),
    sessions: [],
    active: null,
    seedRefs: seedReferences(),
    settings: { ...DEFAULT_SETTINGS },
    ...partial,
  };
}

describe('consejo del próximo entreno', () => {
  const advice = (sets: LoggedSet[], range: [number, number] = [6, 10]) =>
    analyse(session('hoy', T0, [exercise('remo', sets, range)]), [], {}, 2.5).exercises[0]?.advice;

  it('manda subir peso cuando todas las series cierran el rango', () => {
    const a = advice([set(40, 10), set(40, 10)]);
    expect(a?.move).toBe('sube');
    expect(a?.text).toContain('42,5');
  });

  it('manda bajar cuando alguna serie se queda corta', () => {
    const a = advice([set(40, 8), set(40, 4)]);
    expect(a?.move).toBe('baja');
    expect(a?.text).toContain('37,5');
  });

  it('manda mantener y buscar una repetición más dentro del rango', () => {
    const a = advice([set(40, 8), set(40, 7)]);
    expect(a?.move).toBe('mantiene');
    expect(a?.text).toContain('9');
  });

  it('no propone subir por encima del tope del rango', () => {
    const a = advice([set(40, 10), set(40, 10)], [6, 10]);
    expect(a?.text).toContain('6-7');
  });
});

describe('veredicto', () => {
  const previa = (id: string, start: number) => session(id, start, [exercise('remo', [set(40, 8), set(40, 8)])]);

  it('un récord manda sobre cualquier otro veredicto', () => {
    const a = analyse(session('hoy', T0, [exercise('remo', [set(60, 8)])]), [previa('h1', T0 - DAY)]);
    expect(a.verdict).toBe('record');
    expect(a.prs).toHaveLength(1);
    expect(a.headline).toContain('Récord');
  });

  it('sin histórico, la sesión es la referencia', () => {
    expect(analyse(previa('hoy', T0), []).verdict).toBe('primera');
  });

  it('repetir la sesión anterior se lee como sostenida', () => {
    const a = analyse(previa('hoy', T0), [previa('h1', T0 - DAY), previa('h2', T0 - 2 * DAY)]);
    expect(a.verdict).toBe('sostenido');
    expect(a.index).toBe(100);
  });

  it('perder carga sin batir nada se lee como bajón', () => {
    const flojo = session('hoy', T0, [exercise('remo', [set(25, 6), set(25, 6)])]);
    const a = analyse(flojo, [previa('h1', T0 - DAY), previa('h2', T0 - 2 * DAY)]);
    expect(a.verdict).toBe('bajon');
  });
});

describe('avisos', () => {
  it('señala la caída fuerte entre la primera y la última serie', () => {
    const a = analyse(session('hoy', T0, [exercise('remo', [set(40, 10), set(40, 4)])]), []);
    expect(a.notes.some((n) => n.kind === 'watch' && n.text.includes('40 %'))).toBe(true);
  });

  it('avisa cuando el descanso se va muy por encima del objetivo', () => {
    const largo = (id: string) => exercise(id, [set(40, 8, 300), set(40, 8, 300)]);
    const a = analyse(session('hoy', T0, [largo('remo'), largo('jalon')]), []);
    expect(a.notes.some((n) => n.text.includes('más de lo previsto'))).toBe(true);
  });

  it('avisa del parón largo desde el entreno anterior', () => {
    const previa = session('h1', T0 - 12 * DAY, [exercise('remo', [set(40, 8)])]);
    const a = analyse(session('hoy', T0, [exercise('remo', [set(40, 8)])]), [previa]);
    expect(a.notes.some((n) => n.text.includes('12 días'))).toBe(true);
  });
});

describe('posición en el ciclo', () => {
  it('empieza por el día 1 sin histórico', () => {
    expect(cycleState(store()).day.index).toBe(1);
  });

  it('pasa al día siguiente después de entrenar hoy', () => {
    const s = store({ sessions: [{ ...session('a', T0, []), dayId: 'd1', dayIndex: 1 }] });
    const c = cycleState(s, T0 + 3600_000);
    expect(c.day.index).toBe(2);
    expect(c.trainedToday).toBe(true);
  });

  it('avanza un día de ciclo por cada día de calendario perdido', () => {
    /* Tres días sin aparecer desde el día 1 dejan el ciclo en el 4, que es
       descanso: la app no se queda clavada esperando al día 2. */
    const s = store({ sessions: [{ ...session('a', T0, []), dayId: 'd1', dayIndex: 1 }] });
    const c = cycleState(s, T0 + 3 * DAY);
    expect(c.day.index).toBe(4);
    expect(c.day.rest).toBe(true);
    expect(c.daysSinceLast).toBe(3);
  });

  it('da la vuelta al final del ciclo', () => {
    const s = store({ sessions: [{ ...session('a', T0, []), dayId: 'd9', dayIndex: 9 }] });
    expect(cycleState(s, T0 + 2 * DAY).day.index).toBe(1);
  });
});

describe('rutina sembrada', () => {
  const r = defaultRoutine();

  it('tiene el ciclo de diez días con tres descansos', () => {
    expect(r.days).toHaveLength(10);
    expect(r.days.filter((d) => d.rest).map((d) => d.index)).toEqual([4, 7, 10]);
  });

  it('cada ejercicio reparte exactamente el 100 % del estímulo', () => {
    for (const day of r.days) {
      for (const ex of day.exercises) {
        const total = ex.muscles.reduce((a, m) => a + m.share, 0);
        expect(total).toBeCloseTo(1, 6);
      }
    }
  });

  it('respeta las series de la hoja', () => {
    const dia1 = r.days[0];
    expect(dia1?.exercises.map((e) => e.plannedSets)).toEqual([2, 2, 2, 2, 2, 2]);
    expect(r.days[1]?.exercises.map((e) => e.plannedSets)).toEqual([3, 2, 3, 3, 2]);
    expect(r.days[8]?.exercises.map((e) => e.plannedSets)).toEqual([3, 3, 2, 2, 2]);
  });

  it('comparte el identificador de los ejercicios que se repiten entre días', () => {
    const dia1 = r.days[0]?.exercises.map((e) => e.id) ?? [];
    const dia5 = r.days[4]?.exercises.map((e) => e.id) ?? [];
    expect(dia1).toContain('gironda-uni');
    expect(dia5).toContain('gironda-uni');
  });

  it('las marcas de la hoja apuntan a ejercicios que existen en la rutina', () => {
    const ids = new Set(r.days.flatMap((d) => d.exercises.map((e) => e.id)));
    for (const id of Object.keys(seedReferences())) expect(ids.has(id)).toBe(true);
  });
});
