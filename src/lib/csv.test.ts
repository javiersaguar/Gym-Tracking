import { describe, expect, it } from 'vitest';
import { fromCsv, toCsv } from './csv';
import type { Session } from './types';

const T0 = Date.UTC(2026, 0, 12, 10, 0, 0);

const session: Session = {
  id: 'sesion-1',
  dayId: 'd1',
  dayIndex: 1,
  dayName: 'Espalda y bíceps',
  start: T0,
  end: T0 + 3600_000,
  feel: 4,
  note: 'Cola en la prensa; punto y coma incluido',
  exercises: [
    {
      exerciseId: 'remo-t',
      name: 'Remo en T',
      muscles: [
        { muscle: 'espalda', share: 0.8 },
        { muscle: 'biceps', share: 0.2 },
      ],
      loadKind: 'peso',
      repRange: [6, 10],
      skipped: false,
      sets: [
        { id: 'a', weight: 40, reps: 8, rir: 2, restSec: null, at: T0, done: true },
        { id: 'b', weight: 42.5, reps: 7, rir: 0, restSec: 145, at: T0 + 60_000, done: true },
        { id: 'c', weight: 40, reps: 0, rir: null, restSec: 90, at: 0, done: false },
      ],
    },
  ],
};

describe('exportar a CSV', () => {
  const csv = toCsv([session]);
  const lines = csv.split('\n');

  it('escribe una fila por serie hecha y ninguna por las vacías', () => {
    expect(lines).toHaveLength(3);
  });

  it('lleva cabecera con las columnas que hacen falta para reconstruir', () => {
    for (const col of ['ejercicio_id', 'peso_kg', 'repeticiones', 'rir', 'descanso_seg']) {
      expect(lines[0]).toContain(col);
    }
  });

  it('entrecomilla lo que lleva el separador dentro', () => {
    expect(csv).toContain('"Cola en la prensa; punto y coma incluido"');
  });

  it('guarda el descanso en segundos y en formato legible', () => {
    expect(lines[2]).toContain(';145;2:25;');
  });
});

describe('importar CSV', () => {
  it('reconstruye la sesión que acaba de exportar', () => {
    const res = fromCsv(toCsv([session]));
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.data.rows).toBe(2);
    const s = res.data.sessions[0] as Session;
    expect(s.id).toBe('sesion-1');
    expect(s.dayName).toBe('Espalda y bíceps');
    expect(s.exercises).toHaveLength(1);

    const sets = s.exercises[0]?.sets ?? [];
    expect(sets).toHaveLength(2);
    expect(sets[0]?.weight).toBe(40);
    expect(sets[0]?.rir).toBe(2);
    expect(sets[1]?.weight).toBe(42.5);
    expect(sets[1]?.restSec).toBe(145);
  });

  it('recupera el reparto muscular, que es lo que hace útil el tonelaje', () => {
    const res = fromCsv(toCsv([session]));
    if (!res.ok) throw new Error('no debería fallar');
    expect(res.data.sessions[0]?.exercises[0]?.muscles).toEqual([
      { muscle: 'espalda', share: 0.8 },
      { muscle: 'biceps', share: 0.2 },
    ]);
  });

  it('distingue un RIR de cero de un RIR sin apuntar', () => {
    const res = fromCsv(toCsv([session]));
    if (!res.ok) throw new Error('no debería fallar');
    const sets = res.data.sessions[0]?.exercises[0]?.sets ?? [];
    expect(sets[1]?.rir).toBe(0);
  });

  it('rechaza un archivo que no es de la app', () => {
    expect(fromCsv('nombre,apellido\nAna,Pérez').ok).toBe(false);
    expect(fromCsv('').ok).toBe(false);
  });
});

describe('lados y parciales en el CSV', () => {
  it('van y vuelven sin perderse', () => {
    const conLados: Session = {
      ...session,
      exercises: [
        {
          ...session.exercises[0]!,
          sets: [
            { id: 'a', weight: 20, reps: 10, right: { weight: 18, reps: 9 }, partials: 3, rir: 1, restSec: 120, at: T0, done: true },
            { id: 'b', weight: 20, reps: 8, rir: 1, restSec: 120, at: T0, done: true },
          ],
        },
      ],
    };
    const back = fromCsv(toCsv([conLados]));
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    const sets = back.data.sessions[0]!.exercises[0]!.sets;
    expect(sets[0]!.right).toEqual({ weight: 18, reps: 9 });
    expect(sets[0]!.partials).toBe(3);
    /* La serie normal no se inventa un lado derecho. */
    expect(sets[1]!.right).toBeUndefined();
    expect(sets[1]!.partials).toBeNull();
  });

  it('un CSV sin esas columnas se sigue leyendo', () => {
    const viejo = [
      'sesion_id;fecha;hora;dia_indice;dia_nombre;ejercicio_id;ejercicio;musculos;serie;peso_kg;repeticiones;rir;descanso_seg;descanso;tonelaje_kg;sensacion;nota',
      'a;2026-08-20;18:00;1;Tirón;remo-t;Remo en T;espalda:1;1;40;8;1;120;2:00;320;4;',
    ].join('\n');
    const back = fromCsv(viejo);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    const set = back.data.sessions[0]!.exercises[0]!.sets[0]!;
    expect(set.weight).toBe(40);
    expect(set.right).toBeUndefined();
    expect(set.partials).toBeNull();
  });
});
