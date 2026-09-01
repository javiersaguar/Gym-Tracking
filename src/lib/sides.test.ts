import { describe, expect, it } from 'vitest';
import {
  demonstratedCapacity,
  e1RM,
  exerciseStats,
  isFilled,
  personalBests,
  repMaxTable,
  setE1RM,
  setHeaviest,
  setReps,
  setTonnage,
} from './metrics';
import type { LoggedExercise, LoggedSet, Session } from './types';

/* Lo que se apunta por lados y las repeticiones parciales cambian cuánto vale
   una serie, y eso se propaga al tonelaje, al mapa de calor y a los récords.
   Lo que más importa aquí es lo último: que un histórico apuntado antes de
   todo esto siga dando exactamente los mismos números. */

let n = 0;
const set = (p: Partial<LoggedSet> = {}): LoggedSet => ({
  id: `s${n++}`,
  weight: 20,
  reps: 10,
  restSec: 120,
  at: 0,
  done: true,
  rir: 1,
  ...p,
});

const exercise = (sets: LoggedSet[]): LoggedExercise => ({
  exerciseId: 'curl',
  name: 'Curl',
  muscles: [{ muscle: 'biceps', share: 1 }],
  loadKind: 'peso',
  repRange: [8, 12],
  sets,
  skipped: false,
});

const session = (sets: LoggedSet[]): Session => ({
  id: 'x',
  dayId: 'd1',
  dayIndex: 1,
  dayName: 'Brazo',
  start: Date.UTC(2026, 7, 20, 18),
  end: Date.UTC(2026, 7, 20, 19),
  exercises: [exercise(sets)],
});

describe('lo que vale una serie', () => {
  it('sin lados ni parciales, cuenta lo de siempre', () => {
    const s = set({ weight: 20, reps: 10 });
    expect(setReps(s)).toBe(10);
    expect(setTonnage(s)).toBe(200);
    expect(setHeaviest(s)).toBe(20);
    expect(setE1RM(s)).toBeCloseTo(e1RM(20, 10), 6);
  });

  it('los dos lados suman', () => {
    const s = set({ weight: 20, reps: 10, right: { weight: 18, reps: 9 } });
    expect(setReps(s)).toBe(19);
    expect(setTonnage(s)).toBe(20 * 10 + 18 * 9);
    expect(setHeaviest(s)).toBe(20);
  });

  it('un lado ausente no se supone igual al otro', () => {
    /* Suponerlo doblaría de golpe el tonelaje de todos los unilaterales ya
       apuntados, y un histórico no se reescribe solo. */
    expect(setTonnage(set({ weight: 20, reps: 10 }))).toBe(200);
  });

  it('las parciales valen media repetición, en los dos lados', () => {
    expect(setTonnage(set({ weight: 20, reps: 10, partials: 4 }))).toBe(200 + 20 * 2);
    const dos = set({ weight: 20, reps: 10, right: { weight: 10, reps: 10 }, partials: 2 });
    expect(setTonnage(dos)).toBe(200 + 100 + 20 + 10);
  });

  it('las parciales no inflan el 1RM estimado', () => {
    const sin = set({ weight: 20, reps: 10 });
    const con = set({ weight: 20, reps: 10, partials: 5 });
    expect(setE1RM(con)).toBeCloseTo(setE1RM(sin), 6);
  });

  it('el 1RM y la capacidad salen del lado que más demostró', () => {
    const s = set({ weight: 20, reps: 10, right: { weight: 26, reps: 8 } });
    expect(setE1RM(s)).toBeCloseTo(e1RM(26, 8), 6);
    expect(demonstratedCapacity(s)).toBeGreaterThan(demonstratedCapacity(set({ weight: 20, reps: 10 })));
  });

  it('una serie apuntada solo con el lado derecho está hecha', () => {
    const s = set({ weight: 0, reps: 0, right: { weight: 18, reps: 9 } });
    expect(isFilled(s)).toBe(true);
    expect(setReps(s)).toBe(9);
    expect(setTonnage(s)).toBe(18 * 9);
  });
});

describe('cómo llega al resto de la app', () => {
  it('el tonelaje del ejercicio suma lados y parciales', () => {
    const st = exerciseStats(
      exercise([
        set({ weight: 20, reps: 10, right: { weight: 20, reps: 10 } }),
        set({ weight: 20, reps: 8, partials: 2 }),
      ]),
    );
    expect(st.sets).toBe(2);
    expect(st.reps).toBe(10 + 10 + 8);
    expect(st.tonnage).toBe(400 + 160 + 20);
  });

  it('una marca con el brazo derecho es una marca', () => {
    const best = personalBests([session([set({ weight: 20, reps: 6, right: { weight: 30, reps: 6 } })])], {});
    expect(best.get('curl')?.weight).toBe(30);
  });

  it('la tabla de récords mide cada lado por su cuenta', () => {
    const tabla = repMaxTable([session([set({ weight: 20, reps: 6, right: { weight: 24, reps: 8 } })])], 'curl');
    expect(tabla.find((r) => r.reps === 6)?.weight).toBe(20);
    expect(tabla.find((r) => r.reps === 8)?.weight).toBe(24);
  });
});

describe('lo apuntado antes de todo esto no se mueve', () => {
  it('un ejercicio sin lados ni parciales da los mismos números', () => {
    const viejo = exercise([
      set({ weight: 40, reps: 8, rir: 1, restSec: 150 }),
      set({ weight: 40, reps: 7, rir: 0, restSec: 160 }),
      set({ weight: 35, reps: 8, rir: 1, restSec: 155 }),
    ]);
    const st = exerciseStats(viejo);
    expect(st.tonnage).toBe(40 * 8 + 40 * 7 + 35 * 8);
    expect(st.reps).toBe(23);
    expect(st.heaviest).toBe(40);
    expect(st.topE1RM).toBeCloseTo(e1RM(40, 8), 6);
  });
});
