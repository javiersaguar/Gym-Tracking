import { describe, expect, it } from 'vitest';
import {
  balance,
  e1RM,
  exerciseStats,
  muscleProgress,
  muscleStats,
  personalBests,
  prsInSession,
  sessionIndex,
  sessionStats,
  trendPct,
  workSeconds,
} from './metrics';
import type { LoggedExercise, LoggedSet, Session } from './types';

let counter = 0;
function set(weight: number, reps: number, restSec: number | null = 120): LoggedSet {
  counter += 1;
  return { id: `s${counter}`, weight, reps, restSec, at: 0, done: true, rir: null };
}

function exercise(
  exerciseId: string,
  sets: LoggedSet[],
  muscles: [string, number][] = [['espalda', 1]],
): LoggedExercise {
  return {
    exerciseId,
    name: exerciseId,
    muscles: muscles.map(([muscle, share]) => ({ muscle, share })) as LoggedExercise['muscles'],
    loadKind: 'peso',
    targetRest: 120,
    repRange: [6, 10],
    sets,
    skipped: false,
  };
}

function session(id: string, start: number, exercises: LoggedExercise[], durationSec = 3600): Session {
  return {
    id,
    dayId: 'd1',
    dayIndex: 1,
    dayName: 'Test',
    start,
    end: start + durationSec * 1000,
    exercises,
  };
}

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 12, 10, 0, 0);

describe('e1RM', () => {
  it('aplica Epley', () => {
    expect(e1RM(100, 1)).toBeCloseTo(103.33, 2);
    expect(e1RM(40, 8)).toBeCloseTo(50.67, 2);
  });

  it('corta a 15 repeticiones: por encima Epley deja de medir fuerza', () => {
    expect(e1RM(20, 30)).toBe(e1RM(20, 15));
  });

  it('devuelve cero sin carga o sin repeticiones', () => {
    expect(e1RM(0, 8)).toBe(0);
    expect(e1RM(40, 0)).toBe(0);
  });
});

describe('exerciseStats', () => {
  const ex = exercise('remo-t', [set(40, 8, null), set(40, 7, 150), set(35, 8, 120)]);
  const st = exerciseStats(ex);

  it('suma el tonelaje de las series marcadas', () => {
    expect(st.tonnage).toBe(40 * 8 + 40 * 7 + 35 * 8);
    expect(st.reps).toBe(23);
    expect(st.sets).toBe(3);
  });

  it('elige como mejor serie la de mayor 1RM estimado, no la más pesada', () => {
    expect(st.topSet?.reps).toBe(8);
    expect(st.topSet?.weight).toBe(40);
    expect(st.heaviest).toBe(40);
  });

  it('promedia solo los descansos medidos', () => {
    expect(st.restAvg).toBe(135);
  });

  it('ignora las series sin marcar y las de cero repeticiones', () => {
    const parcial = exercise('x', [set(40, 8), { ...set(40, 8), done: false }, set(40, 0)]);
    expect(exerciseStats(parcial).sets).toBe(1);
  });
});

describe('muscleStats', () => {
  it('reparte series y tonelaje según el peso de cada músculo', () => {
    const s = session('a', T0, [
      exercise('press', [set(60, 6), set(60, 6)], [
        ['pecho', 0.7],
        ['triceps', 0.3],
      ]),
    ]);
    const m = muscleStats(s);
    expect(m.get('pecho')?.sets).toBeCloseTo(1.4, 5);
    expect(m.get('triceps')?.sets).toBeCloseTo(0.6, 5);
    expect(m.get('pecho')?.tonnage).toBeCloseTo(720 * 0.7, 5);
    expect(m.get('triceps')?.tonnage).toBeCloseTo(720 * 0.3, 5);
  });

  it('solo toma intensidad de los ejercicios donde el grupo es el principal', () => {
    const s = session('a', T0, [
      exercise('press', [set(100, 5)], [
        ['pecho', 0.7],
        ['triceps', 0.3],
      ]),
    ]);
    const m = muscleStats(s);
    expect(m.get('pecho')?.intensity).toBeGreaterThan(0);
    expect(m.get('triceps')?.intensity).toBe(0);
  });

  it('no cuenta los ejercicios saltados', () => {
    const s = session('a', T0, [{ ...exercise('remo', [set(40, 8)]), skipped: true }]);
    expect(muscleStats(s).size).toBe(0);
  });
});

describe('sessionStats', () => {
  it('acota la duración por abajo al tiempo que exigen las series', () => {
    /* Un entreno apuntado a posteriori dura «cero» de reloj; si se aceptara,
       la densidad saldría en miles de kg por minuto. */
    const s = session('a', T0, [exercise('remo', [set(40, 8), set(40, 8)])], 0);
    const st = sessionStats(s);
    expect(st.durationSec).toBeCloseTo(workSeconds(8) * 2 + 240, 5);
    expect(st.density).toBeLessThan(200);
  });

  it('acota por arriba la sesión que se quedó abierta toda la noche', () => {
    const s = session('a', T0, [exercise('remo', [set(40, 8)])], 12 * 3600);
    expect(sessionStats(s).durationSec).toBeLessThan(3 * 3600);
  });

  it('usa el reloj de pared cuando es razonable', () => {
    const s = session('a', T0, [exercise('remo', [set(40, 8), set(40, 8), set(40, 8)])], 2700);
    expect(sessionStats(s).durationSec).toBe(2700);
  });
});

describe('muscleProgress', () => {
  const previa = (id: string, start: number) =>
    session(id, start, [exercise('remo', [set(40, 8), set(40, 8)])], 1800);

  it('da 100 cuando la sesión repite exactamente la referencia', () => {
    const history = [previa('h1', T0 - DAY), previa('h2', T0 - 2 * DAY), previa('h3', T0 - 3 * DAY)];
    const hoy = previa('hoy', T0);
    const [espalda] = muscleProgress(hoy, history);
    expect(espalda?.index).toBe(100);
  });

  it('sube por encima de 100 al añadir carga', () => {
    const history = [previa('h1', T0 - DAY), previa('h2', T0 - 2 * DAY)];
    const hoy = session('hoy', T0, [exercise('remo', [set(45, 8), set(45, 8)])], 1800);
    const [espalda] = muscleProgress(hoy, history);
    expect(espalda?.index).toBeGreaterThan(100);
    expect(espalda?.parts.tonnage).toBeCloseTo(45 / 40, 5);
  });

  it('baja por debajo de 100 al perder repeticiones', () => {
    const history = [previa('h1', T0 - DAY), previa('h2', T0 - 2 * DAY)];
    const hoy = session('hoy', T0, [exercise('remo', [set(40, 5), set(40, 5)])], 1800);
    const [espalda] = muscleProgress(hoy, history);
    expect(espalda?.index).toBeLessThan(100);
  });

  it('no puntúa el grupo la primera vez que se entrena', () => {
    const [espalda] = muscleProgress(previa('hoy', T0), []);
    expect(espalda?.index).toBeNull();
    expect(espalda?.baseline).toBeNull();
  });

  it('usa la mediana, así que una sesión mala no hunde el listón', () => {
    const history = [
      previa('h1', T0 - DAY),
      session('h2', T0 - 2 * DAY, [exercise('remo', [set(5, 1)])], 1800),
      previa('h3', T0 - 3 * DAY),
    ];
    const [espalda] = muscleProgress(previa('hoy', T0), history);
    expect(espalda?.index).toBe(100);
  });

  it('solo mira las tres últimas sesiones del grupo', () => {
    const history = [
      previa('h1', T0 - DAY),
      previa('h2', T0 - 2 * DAY),
      previa('h3', T0 - 3 * DAY),
      session('viejo', T0 - 40 * DAY, [exercise('remo', [set(200, 10)])], 1800),
    ];
    const [espalda] = muscleProgress(previa('hoy', T0), history);
    expect(espalda?.baseline?.samples).toBe(3);
    expect(espalda?.index).toBe(100);
  });

  it('no puntúa un grupo que apenas ha recibido media serie efectiva', () => {
    const remo = exercise('remo', [set(40, 8)], [['espalda', 0.8], ['biceps', 0.2]]);
    const progress = muscleProgress(session('hoy', T0, [remo], 1800), []);
    expect(progress.map((p) => p.muscle)).toEqual(['espalda']);
  });

  it('reparte el peso de un componente ausente entre los que sí hay', () => {
    /* El bíceps entra solo como secundario: no tiene dato de intensidad,
       y aun así el índice se calcula con tonelaje y densidad. Hacen falta
       tres series para que sus 0,2 por serie superen el medio efectivo por
       debajo del cual un grupo no se puntúa. */
    const remo = (w: number) =>
      exercise('remo', [set(w, 8), set(w, 8), set(w, 8)], [['espalda', 0.8], ['biceps', 0.2]]);
    const history = [session('h1', T0 - DAY, [remo(40)], 1800)];
    const progress = muscleProgress(session('hoy', T0, [remo(40)], 1800), history);
    const biceps = progress.find((p) => p.muscle === 'biceps');
    expect(biceps).toBeDefined();
    expect(biceps?.parts.intensity).toBeNull();
    expect(biceps?.index).toBe(100);
  });
});

describe('sessionIndex', () => {
  it('pondera los grupos por tonelaje, no todos igual', () => {
    const pierna = exercise('prensa', [set(200, 10)], [['cuadriceps', 1]]);
    const gemelo = exercise('gemelo', [set(20, 10)], [['gemelo', 1]]);
    const history = [session('h1', T0 - DAY, [pierna, gemelo], 3600)];

    const mejorPierna = exercise('prensa', [set(240, 10)], [['cuadriceps', 1]]);
    const peorGemelo = exercise('gemelo', [set(10, 10)], [['gemelo', 1]]);
    const hoy = session('hoy', T0, [mejorPierna, peorGemelo], 3600);

    const index = sessionIndex(muscleProgress(hoy, history));
    /* El gemelo se ha desplomado a la mitad, pero mueve una décima parte del
       tonelaje: el índice global tiene que seguir por encima de 100. */
    expect(index).toBeGreaterThan(100);
  });

  it('es nulo cuando ningún grupo tiene referencia', () => {
    expect(sessionIndex(muscleProgress(session('a', T0, [exercise('remo', [set(40, 8)])]), []))).toBeNull();
  });
});

describe('récords', () => {
  it('toma las marcas de la hoja como listón inicial', () => {
    const best = personalBests([], { 'remo-t': [{ weight: 40, reps: 8 }] });
    expect(best.get('remo-t')?.e1rm).toBeCloseTo(e1RM(40, 8), 5);
    expect(best.get('remo-t')?.at).toBeNull();
  });

  it('detecta el récord contra la marca apuntada a mano', () => {
    const hoy = session('hoy', T0, [exercise('remo-t', [set(42.5, 8)])]);
    const prs = prsInSession(hoy, [], { 'remo-t': [{ weight: 40, reps: 8 }] });
    expect(prs).toHaveLength(1);
    expect(prs[0]?.weight).toBe(42.5);
  });

  it('no llama récord a igualar la marca', () => {
    const hoy = session('hoy', T0, [exercise('remo-t', [set(40, 8)])]);
    expect(prsInSession(hoy, [], { 'remo-t': [{ weight: 40, reps: 8 }] })).toHaveLength(0);
  });

  it('la primera vez de un ejercicio no es un récord', () => {
    const hoy = session('hoy', T0, [exercise('nuevo', [set(40, 8)])]);
    expect(prsInSession(hoy, [], {})).toHaveLength(0);
  });

  it('cuenta como récord subir repeticiones con el mismo peso', () => {
    const previa = session('h1', T0 - DAY, [exercise('remo-t', [set(40, 7)])]);
    const hoy = session('hoy', T0, [exercise('remo-t', [set(40, 9)])]);
    expect(prsInSession(hoy, [previa], {})).toHaveLength(1);
  });
});

describe('balance', () => {
  const sessions = [
    session('a', T0 - DAY, [exercise('remo', [set(40, 8), set(40, 8)], [['espalda', 1]])]),
    session('b', T0 - 2 * DAY, [exercise('press', [set(60, 6)], [['pecho', 1]])]),
    session('viejo', T0 - 60 * DAY, [exercise('prensa', [set(200, 10)], [['cuadriceps', 1]])]),
  ];

  it('solo cuenta lo que cae dentro de la ventana', () => {
    const b = balance(sessions, 30, T0);
    expect(b.find((x) => x.muscle === 'cuadriceps')?.sets).toBe(0);
    expect(b.find((x) => x.muscle === 'espalda')?.sets).toBe(2);
  });

  it('reparte el porcentaje sobre el tonelaje total', () => {
    const b = balance(sessions, 30, T0);
    const total = b.reduce((a, x) => a + x.sharePct, 0);
    expect(total).toBeCloseTo(100, 5);
  });

  it('normaliza las series a media semanal', () => {
    const b = balance(sessions, 14, T0);
    expect(b.find((x) => x.muscle === 'espalda')?.setsPerWeek).toBeCloseTo(1, 5);
  });

  it('devuelve todos los grupos aunque estén a cero, para ver los huecos', () => {
    expect(balance([], 30, T0)).toHaveLength(11);
  });
});

describe('trendPct', () => {
  it('no opina con menos de tres puntos', () => {
    expect(trendPct([{ at: 1, value: 10 }, { at: 2, value: 20 }])).toBeNull();
  });

  it('mide la pendiente ajustada, no el primero contra el último', () => {
    const pts = [10, 12, 11, 13, 14, 16].map((value, at) => ({ at, value }));
    const t = trendPct(pts);
    expect(t).not.toBeNull();
    expect(t as number).toBeGreaterThan(0);
  });

  it('detecta la caída', () => {
    const pts = [20, 18, 19, 16, 15].map((value, at) => ({ at, value }));
    expect(trendPct(pts) as number).toBeLessThan(0);
  });
});
