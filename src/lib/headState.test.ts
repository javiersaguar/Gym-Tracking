import { describe, expect, it } from 'vitest';
import { headStates } from './headState';
import { HEADS } from './heads';
import type { LoggedSet, Session } from './types';

let counter = 0;
function set(weight: number, reps: number, rir: number | null = 1): LoggedSet {
  counter += 1;
  return { id: `s${counter}`, weight, reps, restSec: 120, at: 0, done: true, rir };
}

/** Sesión de un solo ejercicio, para poder atribuir el reparto sin ruido. */
function session(id: string, start: number, exerciseId: string, sets: number, rir: number | null = 1): Session {
  return {
    id,
    dayId: 'd1',
    dayIndex: 1,
    dayName: 'Tirón',
    start,
    end: start + 3600_000,
    exercises: [
      {
        exerciseId,
        name: exerciseId,
        muscles: [{ muscle: 'espalda', share: 1 }],
        loadKind: 'peso',
        repRange: [6, 10],
        sets: Array.from({ length: sets }, () => set(60, 8, rir)),
        skipped: false,
      },
    ],
  };
}

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 12, 10, 0, 0);

describe('estado por cabeza muscular', () => {
  it('devuelve todas las cabezas del grupo, con trabajo o sin él', () => {
    const out = headStates([], 'espalda', 30, T0);
    expect(out).toHaveLength(HEADS.espalda.length);
    expect(out.every((h) => h.score === null)).toBe(true);
  });

  it('una cabeza sin trabajo se queda sin puntuación, no en cero', () => {
    /* El jalón cerrado no declara trabajo de trapecio superior: esa porción
       tiene que salir vacía y no «cero de cien», que se leería como si se
       hubiera entrenado y hubiera salido mal. */
    const out = headStates([session('a', T0 - 3 * DAY, 'jalon-cerrado', 4)], 'espalda', 30, T0);
    const trapSup = out.find((h) => h.id === 'espalda.trapecio-sup');
    expect(trapSup?.score).toBeNull();
    expect(trapSup?.sets).toBe(0);
  });

  it('el reparto suma las series del grupo', () => {
    const out = headStates([session('a', T0 - 3 * DAY, 'jalon-cerrado', 6)], 'espalda', 30, T0);
    const total = out.reduce((a, h) => a + h.sets, 0);
    expect(total).toBeCloseTo(6, 5);
  });

  it('la porción que más carga el ejercicio puntúa más alto', () => {
    /* En jalón cerrado el reparto declarado da 0,62 al dorsal y 0,08 al
       romboides: el mapa de detalle tiene que reflejar esa diferencia. */
    const out = headStates([session('a', T0 - 3 * DAY, 'jalon-cerrado', 8)], 'espalda', 30, T0);
    const dorsal = out.find((h) => h.id === 'espalda.dorsal');
    const romboides = out.find((h) => h.id === 'espalda.romboides');
    expect(dorsal?.sets ?? 0).toBeGreaterThan(romboides?.sets ?? 0);
    expect(dorsal?.score ?? 0).toBeGreaterThan(romboides?.score ?? 0);
  });

  it('marca como estimado el reparto de un ejercicio no declarado', () => {
    const out = headStates([session('a', T0 - 3 * DAY, 'ejercicio-inventado', 4)], 'espalda', 30, T0);
    const worked = out.filter((h) => h.sets > 0);
    expect(worked.length).toBe(HEADS.espalda.length);
    expect(worked.every((h) => !h.exact)).toBe(true);
    /* Repartido a partes iguales: ninguna porción destaca sobre otra. */
    const spread = Math.max(...worked.map((h) => h.sets)) - Math.min(...worked.map((h) => h.sets));
    expect(spread).toBeCloseTo(0, 6);
  });

  it('no marca como estimado un reparto declarado', () => {
    const out = headStates([session('a', T0 - 3 * DAY, 'jalon-cerrado', 4)], 'espalda', 30, T0);
    expect(out.filter((h) => h.sets > 0).every((h) => h.exact)).toBe(true);
  });

  it('dos días distintos cuentan como más frecuencia que uno solo', () => {
    const partido = headStates(
      [session('a', T0 - 6 * DAY, 'jalon-cerrado', 4), session('b', T0 - 2 * DAY, 'jalon-cerrado', 4)],
      'espalda',
      14,
      T0,
    );
    const junto = headStates([session('a', T0 - 4 * DAY, 'jalon-cerrado', 8)], 'espalda', 14, T0);
    const dorsalA = partido.find((h) => h.id === 'espalda.dorsal');
    const dorsalB = junto.find((h) => h.id === 'espalda.dorsal');
    expect(dorsalA?.sets).toBeCloseTo(dorsalB?.sets ?? 0, 5);
    expect(dorsalA?.freqPerWeek ?? 0).toBeGreaterThan(dorsalB?.freqPerWeek ?? 0);
    expect(dorsalA?.score ?? 0).toBeGreaterThan(dorsalB?.score ?? 0);
  });

  it('ignora lo que cae fuera de la ventana', () => {
    const out = headStates([session('a', T0 - 40 * DAY, 'jalon-cerrado', 8)], 'espalda', 30, T0);
    expect(out.every((h) => h.sets === 0)).toBe(true);
  });

  it('un ejercicio saltado no reparte nada', () => {
    const s = session('a', T0 - 2 * DAY, 'jalon-cerrado', 5);
    s.exercises[0]!.skipped = true;
    expect(headStates([s], 'espalda', 30, T0).every((h) => h.sets === 0)).toBe(true);
  });

  it('reparte también el share del grupo dentro del ejercicio', () => {
    /* Remo en T da 0,8 a espalda y 0,2 a bíceps: la suma por cabezas de cada
       grupo tiene que respetar ese reparto previo. */
    const s = session('a', T0 - 2 * DAY, 'remo-t', 5);
    s.exercises[0]!.muscles = [
      { muscle: 'espalda', share: 0.8 },
      { muscle: 'biceps', share: 0.2 },
    ];
    const espalda = headStates([s], 'espalda', 30, T0).reduce((a, h) => a + h.sets, 0);
    const biceps = headStates([s], 'biceps', 30, T0).reduce((a, h) => a + h.sets, 0);
    expect(espalda).toBeCloseTo(4, 5);
    expect(biceps).toBeCloseTo(1, 5);
  });
});
