import { describe, expect, it } from 'vitest';
import { demoSessions, demoStore } from './demo';
import { MUSCLES } from './types';

/* El ejemplo no es relleno: existe para que se vea qué sabe hacer la app, así
   que lo que hay que comprobar es que los fenómenos que enseña —progresión,
   descarga, gimnasio lleno, grupos desatendidos— estén de verdad en los
   números y no solo en el comentario que dice que están. */

const T0 = Date.UTC(2026, 7, 28, 9, 0, 0);
const DAY = 86_400_000;
const sessions = demoSessions(T0);

const setsOf = (s: (typeof sessions)[number]) => s.exercises.flatMap((e) => e.sets);
/** Semana 1 = la más antigua. */
const week = (start: number) => Math.floor((start - (T0 - 14 * 7 * DAY)) / (7 * DAY)) + 1;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

describe('histórico de ejemplo', () => {
  it('cubre catorce semanas con muchas sesiones', () => {
    expect(sessions.length).toBeGreaterThan(50);
    const span = (sessions[0]!.start - sessions[sessions.length - 1]!.start) / DAY;
    expect(span).toBeGreaterThan(88);
    expect(span).toBeLessThan(99);
  });

  it('va de más reciente a más antigua, como las guarda la app', () => {
    for (let i = 1; i < sessions.length; i++) {
      expect(sessions[i - 1]!.start).toBeGreaterThan(sessions[i]!.start);
    }
  });

  it('la última sesión es de hace pocos días', () => {
    expect((T0 - sessions[0]!.start) / DAY).toBeLessThan(4);
  });

  it('toca los once grupos musculares', () => {
    const hit = new Set<string>();
    for (const s of sessions) {
      for (const ex of s.exercises) {
        if (ex.skipped || !ex.sets.length) continue;
        for (const m of ex.muscles) hit.add(m.muscle);
      }
    }
    expect([...MUSCLES].filter((m) => !hit.has(m))).toEqual([]);
  });

  it('todas las series están completas y con RIR apuntado', () => {
    let sinDescanso = 0;
    for (const s of sessions) {
      for (const set of setsOf(s)) {
        expect(set.done).toBe(true);
        expect(set.weight).toBeGreaterThan(0);
        expect(set.reps).toBeGreaterThan(0);
        expect(set.rir).not.toBeNull();
        if (set.restSec == null) sinDescanso++;
        else expect(set.restSec).toBeGreaterThan(20);
      }
    }
    /* Solo la primerísima serie del histórico puede no tener un antes. */
    expect(sinDescanso).toBe(1);
  });

  it('un ejercicio saltado no lleva series', () => {
    for (const s of sessions) {
      for (const ex of s.exercises) {
        if (ex.skipped) expect(ex.sets).toHaveLength(0);
      }
    }
  });
});

describe('lo que el ejemplo tiene que enseñar', () => {
  const weightsOf = (id: string, from: number, to: number) =>
    sessions
      .filter((s) => week(s.start) >= from && week(s.start) <= to)
      .flatMap((s) => s.exercises.filter((e) => e.exerciseId === id).flatMap((e) => e.sets.map((x) => x.weight)));

  it('hay progresión: se acaba levantando más que al principio', () => {
    for (const id of ['prensa', 'press-inclinado', 'remo-t']) {
      expect(avg(weightsOf(id, 12, 14)), id).toBeGreaterThan(avg(weightsOf(id, 1, 3)) * 1.08);
    }
  });

  it('hay una semana de descarga: menos peso y más repeticiones en recámara', () => {
    const rir = (from: number, to: number) =>
      avg(
        sessions
          .filter((s) => week(s.start) >= from && week(s.start) <= to)
          .flatMap((s) => setsOf(s).map((x) => x.rir as number)),
      );
    expect(rir(8, 8)).toBeGreaterThan(rir(7, 7) + 0.8);
    expect(rir(8, 8)).toBeGreaterThan(rir(9, 9) + 0.8);
    /* Y se sale de ella más arriba de lo que se entró. */
    expect(avg(weightsOf('prensa', 9, 10))).toBeGreaterThan(avg(weightsOf('prensa', 7, 7)));
  });

  it('hay semanas con el gimnasio lleno: los descansos se disparan', () => {
    const rest = (from: number, to: number) =>
      avg(
        sessions
          .filter((s) => week(s.start) >= from && week(s.start) <= to)
          .flatMap((s) => setsOf(s).map((x) => x.restSec ?? 0)),
      );
    expect(rest(10, 11)).toBeGreaterThan(rest(1, 9) * 1.6);
    expect(rest(12, 14)).toBeLessThan(rest(10, 11) * 0.8);
  });

  it('hay grupos desatendidos: el mapa no puede salir todo verde', () => {
    const seriesDe = (id: string) =>
      sessions.reduce((n, s) => n + s.exercises.filter((e) => e.exerciseId === id).flatMap((e) => e.sets).length, 0);
    /* Aductor y abdomen se saltan más de la mitad de las veces. */
    expect(seriesDe('aductor')).toBeLessThan(seriesDe('prensa') * 0.7);
    expect(seriesDe('abs-maquina')).toBeLessThan(seriesDe('prensa') * 0.7);
    expect(seriesDe('aductor')).toBeGreaterThan(0);
  });
});

describe('el ejemplo es siempre el mismo', () => {
  it('dos generaciones con la misma fecha dan lo mismo', () => {
    expect(JSON.stringify(demoSessions(T0))).toBe(JSON.stringify(demoSessions(T0)));
  });

  it('el almacén viene completo y sin aviso de copia pendiente', () => {
    const store = demoStore(T0);
    expect(store.routine.days.length).toBeGreaterThan(0);
    expect(store.active).toBeNull();
    expect(store.settings.lastBackupCount).toBe(store.sessions.length);
  });
});
