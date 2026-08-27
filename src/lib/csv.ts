import { clock } from './format';
import { isFilled } from './metrics';
import { uid } from './actions';
import type { LoggedExercise, Session, Store } from './types';

/* ────────────────────────────────────────────────────────────────────────────
 * Registro en CSV
 *
 * Una fila por serie, con todo lo que hace falta para reconstruir la sesión
 * entera: por eso la exportación también sirve de copia de seguridad y se
 * puede volver a importar. Se usa punto y coma como separador porque Excel en
 * español lo espera y con coma parte los decimales por la mitad.
 * ──────────────────────────────────────────────────────────────────────── */

const SEP = ';';

const COLUMNS = [
  'sesion_id',
  'fecha',
  'hora',
  'dia_indice',
  'dia_nombre',
  'ejercicio_id',
  'ejercicio',
  'musculos',
  'serie',
  'peso_kg',
  'repeticiones',
  'rir',
  'descanso_seg',
  'descanso',
  'tonelaje_kg',
  'sensacion',
  'nota',
] as const;

function esc(v: string | number | null | undefined): string {
  if (v == null) return '';
  const s = String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function isoDate(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isoTime(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function toCsv(sessions: Session[]): string {
  const rows: string[] = [COLUMNS.join(SEP)];

  for (const s of [...sessions].sort((a, b) => a.start - b.start)) {
    for (const ex of s.exercises) {
      const muscles = ex.muscles.map((m) => `${m.muscle}:${m.share}`).join(' ');
      ex.sets.forEach((set, i) => {
        if (!isFilled(set)) return;
        rows.push(
          [
            s.id,
            isoDate(s.start),
            isoTime(set.at || s.start),
            s.dayIndex,
            esc(s.dayName),
            ex.exerciseId,
            esc(ex.name),
            esc(muscles),
            i + 1,
            set.weight,
            set.reps,
            set.rir ?? '',
            set.restSec ?? '',
            set.restSec != null ? clock(set.restSec) : '',
            Math.round(set.weight * set.reps),
            s.feel ?? '',
            esc(s.note),
          ].join(SEP),
        );
      });
    }
  }
  return rows.join('\n');
}

/* ── Importación ─────────────────────────────────────────────────────────── */

function splitLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === SEP) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

const num = (v: string | undefined): number => {
  const n = Number((v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

const optNum = (v: string | undefined): number | null => {
  if (!v || !v.trim()) return null;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

export type CsvImport = { sessions: Session[]; rows: number };

/**
 * Reconstruye sesiones desde un CSV exportado por la app. Las filas se
 * agrupan por `sesion_id`, y si falta se agrupan por fecha y día del ciclo,
 * de modo que también entra un CSV editado a mano.
 */
export function fromCsv(text: string): { ok: true; data: CsvImport } | { ok: false; error: string } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { ok: false, error: 'El archivo no tiene filas de datos.' };

  const header = splitLine(lines[0] as string).map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  if (idx('ejercicio_id') < 0 || idx('peso_kg') < 0 || idx('repeticiones') < 0) {
    return { ok: false, error: 'Faltan columnas obligatorias (ejercicio_id, peso_kg, repeticiones).' };
  }

  const bySession = new Map<string, Session>();
  let rows = 0;

  for (const line of lines.slice(1)) {
    const c = splitLine(line);
    const get = (name: string) => c[idx(name)];

    const date = get('fecha') ?? '';
    const time = get('hora') ?? '00:00';
    const start = new Date(`${date}T${time}:00`).getTime();
    if (!Number.isFinite(start)) continue;

    const key = get('sesion_id') || `${date}#${get('dia_indice') ?? ''}`;
    let session = bySession.get(key);
    if (!session) {
      session = {
        id: get('sesion_id') || uid(),
        dayId: `d${get('dia_indice') ?? 1}`,
        dayIndex: num(get('dia_indice')) || 1,
        dayName: get('dia_nombre') || 'Importado',
        start,
        end: start,
        exercises: [],
        feel: optNum(get('sensacion')),
        ...(get('nota') ? { note: get('nota') as string } : {}),
      };
      bySession.set(key, session);
    }

    const exId = get('ejercicio_id') as string;
    let ex = session.exercises.find((e) => e.exerciseId === exId);
    if (!ex) {
      /* «espalda:0.8 biceps:0.2» → reparto de estímulo. Si falta, el
         ejercicio cuenta entero al primer músculo que se declare. */
      const muscles = (get('musculos') ?? '')
        .split(/\s+/)
        .filter(Boolean)
        .map((chunk) => {
          const [m, share] = chunk.split(':');
          return { muscle: m as LoggedExercise['muscles'][number]['muscle'], share: Number(share) || 1 };
        });
      ex = {
        exerciseId: exId,
        name: get('ejercicio') || exId,
        muscles: muscles.length ? muscles : [{ muscle: 'espalda', share: 1 }],
        loadKind: 'peso',
        repRange: [6, 10],
        sets: [],
        skipped: false,
      };
      session.exercises.push(ex);
    }

    const at = start;
    ex.sets.push({
      id: uid(),
      weight: num(get('peso_kg')),
      reps: num(get('repeticiones')),
      rir: optNum(get('rir')),
      restSec: optNum(get('descanso_seg')),
      at,
      done: true,
    });
    rows += 1;
    session.end = Math.max(session.end ?? start, at);
  }

  const sessions = [...bySession.values()].filter((s) => s.exercises.some((e) => e.sets.length));
  if (!sessions.length) return { ok: false, error: 'No se ha podido leer ninguna serie del archivo.' };
  return { ok: true, data: { sessions, rows } };
}

/** Funde sesiones importadas con las que ya hay, sin duplicar por id. */
export function mergeSessions(store: Store, incoming: Session[]): { added: number; skipped: number } {
  const known = new Set(store.sessions.map((s) => s.id));
  const fresh = incoming.filter((s) => !known.has(s.id));
  return { added: fresh.length, skipped: incoming.length - fresh.length };
}
