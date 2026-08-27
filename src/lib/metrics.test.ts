import { describe, expect, it } from 'vitest';
import {
  attribution,
  balance,
  e1RM,
  e1RMCapacity,
  exerciseStats,
  expectedPerformance,
  fatigueLimited,
  muscleProgress,
  muscleStats,
  personalBests,
  prsInSession,
  recovery,
  repMaxTable,
  restVsPerformance,
  sessionIndex,
  sessionStats,
  trendPct,
  workSeconds,
} from './metrics';
import type { LoggedExercise, LoggedSet, Session } from './types';

let counter = 0;
function set(weight: number, reps: number, restSec: number | null = 120, rir: number | null = null): LoggedSet {
  counter += 1;
  return { id: `s${counter}`, weight, reps, restSec, at: 0, done: true, rir };
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

  it('solo toma fuerza de los ejercicios donde el grupo es el principal', () => {
    const s = session('a', T0, [
      exercise('press', [set(100, 5)], [
        ['pecho', 0.7],
        ['triceps', 0.3],
      ]),
    ]);
    const m = muscleStats(s);
    expect(m.get('pecho')?.capacity).toBeGreaterThan(0);
    expect(m.get('triceps')?.capacity).toBe(0);
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
    expect(espalda?.parts.volume).toBeCloseTo(45 / 40, 5);
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
    /* Como secundario no tiene dato de capacidad, pero el volumen sí. */
    expect(biceps?.parts.capacity).toBeNull();
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


/* ── Lo nuevo: descansos no uniformes ────────────────────────────────────── */

describe('curva de recuperación', () => {
  it('crece con el descanso y se satura', () => {
    expect(recovery(0)).toBeCloseTo(0.5, 5);
    expect(recovery(60)).toBeGreaterThan(recovery(30));
    expect(recovery(300)).toBeGreaterThan(0.95);
    expect(recovery(600)).toBeLessThanOrEqual(1);
  });

  it('da valores coherentes con los intervalos habituales', () => {
    expect(recovery(60)).toBeCloseTo(0.71, 1);
    expect(recovery(120)).toBeCloseTo(0.83, 1);
    expect(recovery(180)).toBeCloseTo(0.9, 1);
  });

  it('trata la primera serie de un ejercicio como fresca', () => {
    /* Su descanso previo es el de cambiar de máquina: no es comparable con
       el de entre series y no debe penalizar. */
    expect(expectedPerformance(0, 15)).toBe(1);
    expect(expectedPerformance(0, 600)).toBe(1);
  });

  it('espera menos de las series posteriores con poco descanso', () => {
    expect(expectedPerformance(1, 45)).toBeLessThan(expectedPerformance(1, 180));
  });

  it('acumula fatiga aunque el descanso sea el mismo', () => {
    expect(expectedPerformance(3, 120)).toBeLessThan(expectedPerformance(1, 120));
  });
});

describe('capacidad con RIR', () => {
  it('cuenta las repeticiones que quedaban en la recámara', () => {
    expect(e1RMCapacity(40, 7, 3)).toBeCloseTo(e1RM(40, 10), 5);
  });

  it('sin RIR se queda en lo demostrado, que es lo conservador', () => {
    expect(e1RMCapacity(40, 7, null)).toBeCloseTo(e1RM(40, 7), 5);
  });

  it('la misma serie vale más si sobraban repeticiones', () => {
    const alFallo = exerciseStats(exercise('x', [set(40, 8, 120, 0)]));
    const sobrado = exerciseStats(exercise('x', [set(40, 8, 120, 3)]));
    expect(sobrado.capacity).toBeGreaterThan(alFallo.capacity);
  });

  it('la fuerza no se mueve con el descanso: eso vive en el volumen', () => {
    /* Normalizar aquí convertía «lo mismo descansando más» en una caída de
       fuerza del 20 %, y el índice volvía a bailar con la cola del gimnasio.
       Lo que levantas es lo que levantas. */
    const corto = exerciseStats(exercise('x', [set(40, 8), set(40, 8, 45)]));
    const largo = exerciseStats(exercise('x', [set(40, 8), set(40, 8, 240)]));
    expect(corto.capacity).toBeCloseTo(largo.capacity, 5);
  });

  it('el descuento del descanso se apaga si sobraban repeticiones', () => {
    /* Paras a las 8 porque pone 8: el descanso no decidió nada. */
    expect(fatigueLimited(0)).toBe(1);
    expect(fatigueLimited(1)).toBe(1);
    expect(fatigueLimited(4)).toBe(0);
    expect(fatigueLimited(6)).toBe(0);
    expect(fatigueLimited(null)).toBeGreaterThan(0);
    expect(fatigueLimited(null)).toBeLessThan(1);
  });
});

describe('atribución descanso / mejora real', () => {
  const dos = (w: number, rest: number) => exercise('remo', [set(w, 8), set(w, 8, rest)]);

  it('no penaliza haber esperado por la máquina', () => {
    /* Mismo peso y mismas repeticiones, pero hoy con el doble de descanso:
       el volumen es idéntico, así que no hay mérito ni castigo. */
    const history = [session('h1', T0 - DAY, [dos(40, 90)], 1800)];
    const hoy = session('hoy', T0, [dos(40, 240)], 1800);
    const a = attribution(hoy, history);
    expect(a).not.toBeNull();
    expect((a as NonNullable<typeof a>).totalPct).toBeCloseTo(0, 1);
    /* Con más descanso cabía esperar MÁS trabajo; como no lo hubo, el
       componente real sale negativo y el del descanso positivo. */
    expect((a as NonNullable<typeof a>).restPct).toBeGreaterThan(0);
    expect((a as NonNullable<typeof a>).realPct).toBeLessThan(0);
  });

  it('con el mismo descanso, todo el cambio es real', () => {
    const history = [session('h1', T0 - DAY, [dos(40, 120)], 1800)];
    const hoy = session('hoy', T0, [dos(50, 120)], 1800);
    const a = attribution(hoy, history) as NonNullable<ReturnType<typeof attribution>>;
    expect(a.restPct).toBeCloseTo(0, 5);
    expect(a.realPct).toBeCloseTo(a.totalPct, 5);
    expect(a.restShare).toBeCloseTo(0, 5);
  });

  it('mide la diferencia de descanso medio frente a la referencia', () => {
    /* `dos` deja los descansos en [120, x], así que la media se mueve la
       mitad de lo que se mueve el segundo descanso. */
    const history = [session('h1', T0 - DAY, [dos(40, 60)], 1800)];
    const hoy = session('hoy', T0, [dos(40, 180)], 1800);
    const a = attribution(hoy, history) as NonNullable<ReturnType<typeof attribution>>;
    expect(a.restDeltaSec).toBeCloseTo(60, 0);
  });

  it('la primera vez no hay nada que atribuir', () => {
    expect(attribution(session('hoy', T0, [dos(40, 120)]), [])).toBeNull();
  });
});

describe('el índice ya no castiga el descanso', () => {
  const dos = (w: number, rest: number) => exercise('remo', [set(w, 8), set(w, 8, rest)]);

  it('repetir la misma sesión con descansos muy distintos no hunde el índice', () => {
    const history = [
      session('h1', T0 - DAY, [dos(40, 90)], 1800),
      session('h2', T0 - 2 * DAY, [dos(40, 90)], 1800),
    ];
    /* Mismo trabajo, pero la sesión duró mucho más por las esperas. Con el
       índice viejo la densidad se desplomaba y el índice con ella. */
    const hoy = session('hoy', T0, [dos(40, 300)], 4200);
    const [espalda] = muscleProgress(hoy, history);
    expect(espalda?.index).toBeGreaterThan(85);
  });

  it('subir peso puntúa aunque el gimnasio esté lleno', () => {
    const history = [session('h1', T0 - DAY, [dos(40, 90)], 1800)];
    const hoy = session('hoy', T0, [dos(45, 300)], 4200);
    const [espalda] = muscleProgress(hoy, history);
    expect(espalda?.index).toBeGreaterThan(100);
  });
});

describe('tabla de récords por repetición', () => {
  const sessions = [
    session('a', T0 - DAY, [exercise('remo', [set(40, 8), set(45, 5)])]),
    session('b', T0, [exercise('remo', [set(42.5, 8), set(40, 12)])]),
  ];

  it('guarda el mejor peso de cada número de repeticiones', () => {
    const t = repMaxTable(sessions, 'remo');
    expect(t.find((r) => r.reps === 8)?.weight).toBe(42.5);
    expect(t.find((r) => r.reps === 5)?.weight).toBe(45);
    expect(t.find((r) => r.reps === 12)?.weight).toBe(40);
  });

  it('sale ordenada por repeticiones', () => {
    expect(repMaxTable(sessions, 'remo').map((r) => r.reps)).toEqual([5, 8, 12]);
  });
});

describe('descanso frente a rendimiento', () => {
  it('solo compara series a la misma carga', () => {
    const s = session('a', T0, [exercise('remo', [set(40, 10), set(40, 8, 60), set(30, 12, 60)])]);
    const pts = restVsPerformance([s], 'remo');
    expect(pts).toHaveLength(1);
    expect(pts[0]?.ratio).toBeCloseTo(0.8, 5);
    expect(pts[0]?.rest).toBe(60);
  });

  it('nunca incluye la primera serie, que no tiene con qué compararse', () => {
    const s = session('a', T0, [exercise('remo', [set(40, 10, 300)])]);
    expect(restVsPerformance([s], 'remo')).toHaveLength(0);
  });
});
