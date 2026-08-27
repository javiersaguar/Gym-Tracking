import { describe, expect, it } from 'vitest';
import { muscleStates, stateLabel } from './muscleState';
import type { LoggedSet, Session } from './types';

let counter = 0;
function set(weight: number, reps: number, rir: number | null = 1): LoggedSet {
  counter += 1;
  return { id: `s${counter}`, weight, reps, restSec: 120, at: 0, done: true, rir };
}

function backSession(id: string, start: number, sets = 5, rir: number | null = 1): Session {
  return {
    id,
    dayId: 'd1',
    dayIndex: 1,
    dayName: 'Espalda',
    start,
    end: start + 3600_000,
    exercises: [
      {
        exerciseId: 'remo',
        name: 'Remo',
        muscles: [{ muscle: 'espalda', share: 1 }],
        loadKind: 'peso',
        repRange: [6, 10],
        sets: Array.from({ length: sets }, () => set(40, 8, rir)),
        skipped: false,
      },
    ],
  };
}

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 12, 10, 0, 0);

describe('estado por grupo muscular', () => {
  it('devuelve los once grupos, entrenados o no', () => {
    expect(muscleStates([], 30, T0)).toHaveLength(11);
  });

  it('no puntúa un grupo sin trabajo en la ventana', () => {
    const pecho = muscleStates([backSession('a', T0 - DAY)], 30, T0).find((m) => m.muscle === 'pecho');
    expect(pecho?.score).toBeNull();
    expect(pecho?.verdict).toContain('Sin trabajo');
  });

  it('puntúa mejor un grupo con volumen y frecuencia que uno abandonado', () => {
    const bueno = muscleStates(
      [
        backSession('a', T0 - 2 * DAY),
        backSession('b', T0 - 5 * DAY),
        backSession('c', T0 - 9 * DAY),
        backSession('d', T0 - 12 * DAY),
      ],
      28,
      T0,
    ).find((m) => m.muscle === 'espalda');

    const flojo = muscleStates([backSession('a', T0 - 2 * DAY, 1)], 28, T0).find((m) => m.muscle === 'espalda');

    expect(bueno?.score).not.toBeNull();
    expect(flojo?.score).not.toBeNull();
    expect(bueno?.score as number).toBeGreaterThan(flojo?.score as number);
  });

  it('penaliza entrenar siempre muy lejos del fallo', () => {
    const apretado = muscleStates([backSession('a', T0 - DAY, 5, 1)], 28, T0).find((m) => m.muscle === 'espalda');
    const sobrado = muscleStates([backSession('a', T0 - DAY, 5, 5)], 28, T0).find((m) => m.muscle === 'espalda');
    expect(apretado?.score as number).toBeGreaterThan(sobrado?.score as number);
  });

  it('marca como sin dato el componente de intensidad si no hay RIR', () => {
    const sinRir = muscleStates([backSession('a', T0 - DAY, 3, null)], 28, T0).find((m) => m.muscle === 'espalda');
    const intensidad = sinRir?.components.find((c) => c.key === 'intensidad');
    expect(intensidad?.score).toBeNull();
    expect(intensidad?.detail).toContain('sin RIR');
  });

  it('siempre expone los cuatro componentes para poder auditar el número', () => {
    const espalda = muscleStates([backSession('a', T0 - DAY)], 28, T0).find((m) => m.muscle === 'espalda');
    expect(espalda?.components.map((c) => c.key)).toEqual(['volumen', 'frecuencia', 'intensidad', 'progreso']);
  });

  it('traduce la puntuación a una etiqueta legible', () => {
    expect(stateLabel(null)).toBe('Sin datos');
    expect(stateLabel(90)).toBe('Bien cubierto');
    expect(stateLabel(10)).toBe('Desatendido');
  });
});
