import { beforeEach, describe, expect, it, vi } from 'vitest';

/* La regla del modo demo es una sola y no admite matices: mirar el ejemplo no
   puede tocar los datos de verdad. Estas pruebas la comprueban desde fuera,
   sobre el almacenamiento real, porque es el sitio donde un descuido cuesta un
   histórico entero. */

const KEY = 'gym-tracking:v1';

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
    /** Solo para la prueba: qué hay escrito ahora mismo. */
    raw: () => map.get(KEY) ?? null,
  };
}

let disk: ReturnType<typeof fakeStorage>;
let storage: typeof import('./storage');
let demo: typeof import('./demo');

beforeEach(async () => {
  vi.resetModules();
  disk = fakeStorage();
  vi.stubGlobal('localStorage', disk);
  vi.stubGlobal('sessionStorage', fakeStorage());
  storage = await import('./storage');
  demo = await import('./demo');
});

/** Una sesión mínima, para reconocerla luego en el disco. */
const mine = {
  id: 'mia',
  dayId: 'd1',
  dayIndex: 1,
  dayName: 'Espalda y bíceps',
  start: Date.UTC(2026, 7, 20, 18, 0, 0),
  end: Date.UTC(2026, 7, 20, 19, 0, 0),
  exercises: [],
};

describe('modo demo', () => {
  it('sustituye lo que ve la app sin tocar lo guardado', () => {
    storage.update((s) => ({ ...s, sessions: [mine] }));
    storage.flushNow();
    const antes = disk.raw();

    demo.startDemo();
    expect(storage.isDemo()).toBe(true);
    expect(storage.getStore().sessions.length).toBeGreaterThan(50);
    expect(disk.raw()).toBe(antes);
  });

  it('lo que se apunte dentro del ejemplo tampoco se guarda', () => {
    storage.update((s) => ({ ...s, sessions: [mine] }));
    storage.flushNow();
    const antes = disk.raw();

    demo.startDemo();
    storage.update((s) => ({ ...s, sessions: [] }));
    storage.flushNow();
    expect(storage.getStore().sessions).toHaveLength(0);
    expect(disk.raw(), 'el disco no se ha movido').toBe(antes);

    demo.stopDemo();
    expect(storage.getStore().sessions).toHaveLength(1);
    expect(storage.getStore().sessions[0]?.id).toBe('mia');
  });

  it('al salir vuelven los datos de verdad', () => {
    storage.update((s) => ({ ...s, sessions: [mine] }));
    demo.startDemo();
    demo.stopDemo();
    expect(storage.isDemo()).toBe(false);
    expect(storage.getStore().sessions[0]?.id).toBe('mia');
  });

  it('borrar e importar quedan bloqueados mientras dura el ejemplo', () => {
    storage.update((s) => ({ ...s, sessions: [mine] }));
    demo.startDemo();

    storage.resetAll();
    expect(storage.getStore().sessions.length, 'no ha borrado el ejemplo').toBeGreaterThan(50);

    const res = storage.importJson('{"sessions":[],"routine":{"days":[]}}');
    expect(res.ok).toBe(false);

    demo.stopDemo();
    expect(storage.getStore().sessions[0]?.id, 'los datos reales siguen').toBe('mia');
  });

  it('no reclama copia de seguridad dentro del ejemplo', () => {
    demo.startDemo();
    expect(storage.sessionsSinceBackup()).toBe(0);
  });

  it('el ejemplo aguanta una recarga y se acaba al cerrar la pestaña', async () => {
    demo.startDemo();
    /* Recargar = volver a cargar los módulos con el mismo sessionStorage. */
    vi.resetModules();
    const storage2 = await import('./storage');
    const demo2 = await import('./demo');
    expect(storage2.isDemo()).toBe(false);
    demo2.restoreDemo();
    expect(storage2.isDemo()).toBe(true);

    /* Cerrar la pestaña vacía el sessionStorage. */
    demo2.stopDemo();
    vi.resetModules();
    vi.stubGlobal('sessionStorage', fakeStorage());
    const storage3 = await import('./storage');
    const demo3 = await import('./demo');
    demo3.restoreDemo();
    expect(storage3.isDemo()).toBe(false);
  });
});

describe('actualizar la app con un entreno a medias', () => {
  /* Lo apuntado con la versión anterior no lleva lados, ni parciales, ni el
     descanso corregido a mano. Al abrir la versión nueva no puede perderse
     nada de eso: es una sesión en curso, con series ya marcadas. */
  const viejo = {
    version: 2,
    routine: { id: 'ciclo-10', name: 'Ciclo de 10 días', days: [] },
    sessions: [],
    active: {
      id: 'en-curso',
      dayId: 'd2',
      dayIndex: 2,
      dayName: 'Pecho, hombro y tríceps',
      start: 1000,
      end: null,
      exercises: [
        {
          exerciseId: 'press-inclinado',
          name: 'Press inclinado',
          muscles: [{ muscle: 'pecho', share: 1 }],
          loadKind: 'peso',
          repRange: [5, 8],
          skipped: false,
          sets: [
            { id: 'a', weight: 32.5, reps: 6, rir: 1, restSec: 180, at: 1200, done: true },
            { id: 'b', weight: 32.5, reps: 0, rir: null, restSec: null, at: 0, done: false },
          ],
        },
      ],
    },
    seedRefs: {},
    settings: { weightStep: 2.5, keepAwake: true, backupEvery: 8, lastBackupCount: 0 },
  };

  it('la sesión en curso y sus series llegan intactas', async () => {
    disk.setItem(KEY, JSON.stringify(viejo));
    vi.resetModules();
    const fresh = await import('./storage');
    const active = fresh.getStore().active;

    expect(active?.id).toBe('en-curso');
    expect(active?.dayName).toBe('Pecho, hombro y tríceps');
    expect(active?.exercises).toHaveLength(1);

    const sets = active?.exercises[0]?.sets ?? [];
    expect(sets).toHaveLength(2);
    expect(sets[0]).toMatchObject({ id: 'a', weight: 32.5, reps: 6, rir: 1, restSec: 180, done: true });
    expect(sets[1]).toMatchObject({ id: 'b', weight: 32.5, reps: 0, done: false });
    /* Los campos nuevos entran ausentes, no a cero: ausente significa «no se
       apuntó», y cero significaría «no hizo ninguna». */
    expect(sets[0]?.right).toBeUndefined();
    expect(sets[0]?.partials).toBeUndefined();
  });

  it('lo nuevo se puede apuntar encima sin tocar lo que ya había', async () => {
    disk.setItem(KEY, JSON.stringify(viejo));
    vi.resetModules();
    const fresh = await import('./storage');
    const actions = await import('./actions');

    actions.setPartials(0, 0, 3);
    actions.setRest(0, 1, 95);
    const sets = fresh.getStore().active?.exercises[0]?.sets ?? [];
    expect(sets[0]).toMatchObject({ weight: 32.5, reps: 6, rir: 1, partials: 3 });
    expect(sets[1]?.restSec).toBe(95);
  });
});
