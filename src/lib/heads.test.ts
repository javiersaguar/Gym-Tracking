import { describe, expect, it } from 'vitest';
import { EXERCISE_HEADS, HEADS, HEAD_BY_ID, headSplit } from './heads';
import { CATALOG_IDS, defaultRoutine, makeExercise } from './routine';
import { MUSCLES } from './types';

/* El reparto por porciones es lo único que hace que el mapa de detalle diga
   algo. Si un ejercicio no lo declara, sus series se reparten a partes iguales
   y el mapa pinta el mismo color en todas las cabezas del grupo, que no
   informa de nada. Estas pruebas están para que eso no se cuele sin darse
   cuenta al añadir un ejercicio nuevo. */

describe('catálogo de porciones', () => {
  it('cada grupo tiene sus porciones', () => {
    for (const m of MUSCLES) {
      expect(HEADS[m].length, m).toBeGreaterThanOrEqual(3);
    }
  });

  it('los identificadores llevan el prefijo de su grupo y no se repiten', () => {
    const seen = new Set<string>();
    for (const m of MUSCLES) {
      for (const h of HEADS[m]) {
        expect(h.id.startsWith(`${m}.`), `${h.id} pertenece a ${m}`).toBe(true);
        expect(seen.has(h.id), `${h.id} repetido`).toBe(false);
        seen.add(h.id);
        expect(h.label.length, `${h.id} tiene nombre`).toBeGreaterThan(2);
        expect(h.short.length, `${h.id} tiene nombre corto`).toBeGreaterThan(2);
      }
    }
  });

  it('el índice por id cubre todas las porciones', () => {
    const total = MUSCLES.reduce((n, m) => n + HEADS[m].length, 0);
    expect(Object.keys(HEAD_BY_ID)).toHaveLength(total);
  });
});

describe('repartos declarados', () => {
  it('solo mencionan porciones que existen', () => {
    const unknown: string[] = [];
    for (const [exercise, split] of Object.entries(EXERCISE_HEADS)) {
      for (const [muscle, shares] of Object.entries(split)) {
        for (const id of Object.keys(shares ?? {})) {
          if (!HEAD_BY_ID[id]) unknown.push(`${exercise} → ${id}`);
          else if (HEAD_BY_ID[id]?.muscle !== muscle) unknown.push(`${exercise} → ${id} no es de ${muscle}`);
        }
      }
    }
    expect(unknown).toEqual([]);
  });

  it('cada reparto suma uno', () => {
    for (const [exercise, split] of Object.entries(EXERCISE_HEADS)) {
      for (const [muscle, shares] of Object.entries(split)) {
        const total = Object.values(shares ?? {}).reduce((a, b) => a + b, 0);
        expect(total, `${exercise} · ${muscle}`).toBeCloseTo(1, 4);
      }
    }
  });

  it('ningún reparto lleva pesos negativos', () => {
    for (const [exercise, split] of Object.entries(EXERCISE_HEADS)) {
      for (const [muscle, shares] of Object.entries(split)) {
        for (const [id, v] of Object.entries(shares ?? {})) {
          expect(v, `${exercise} · ${muscle} · ${id}`).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('cobertura de la rutina y del catálogo', () => {
  const pending = (id: string, muscles: { muscle: string }[]) =>
    muscles.filter((m) => !EXERCISE_HEADS[id]?.[m.muscle as never]).map((m) => `${id} → ${m.muscle}`);

  it('todos los ejercicios del catálogo declaran su reparto', () => {
    const missing = CATALOG_IDS.flatMap((id) => pending(id, makeExercise(id, 3).muscles));
    expect(missing).toEqual([]);
  });

  it('todos los ejercicios de la rutina declaran su reparto', () => {
    const missing = defaultRoutine().days.flatMap((d) => d.exercises.flatMap((e) => pending(e.id, e.muscles)));
    expect(missing).toEqual([]);
  });

  it('un ejercicio del catálogo nunca se marca como estimado', () => {
    for (const id of CATALOG_IDS) {
      for (const { muscle } of makeExercise(id, 3).muscles) {
        expect(headSplit(id, muscle).exact, `${id} · ${muscle}`).toBe(true);
      }
    }
  });

  it('un ejercicio desconocido reparte a partes iguales y se marca como estimado', () => {
    const { shares, exact } = headSplit('no-existe', 'triceps');
    expect(exact).toBe(false);
    const values = Object.values(shares);
    expect(values).toHaveLength(HEADS.triceps.length);
    expect(Math.max(...values) - Math.min(...values)).toBeCloseTo(0, 6);
  });
});
