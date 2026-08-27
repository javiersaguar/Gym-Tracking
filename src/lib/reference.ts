import { isFilled } from './metrics';
import type { Session, Store } from './types';

export type Reference = {
  sets: { weight: number; reps: number }[];
  /** null cuando viene de las marcas apuntadas a mano, que no tienen fecha. */
  at: number | null;
  source: 'sesion' | 'hoja';
};

/**
 * Qué hiciste la última vez en este ejercicio. Es el listón que aparece de
 * fondo en cada campo: sin él, cada serie empieza en blanco y no hay forma de
 * saber si estás progresando sin abrir el histórico.
 */
export function referenceFor(store: Store, exerciseId: string, exclude?: string): Reference | null {
  const ordered = [...store.sessions].sort((a, b) => b.start - a.start);
  for (const s of ordered) {
    if (s.id === exclude) continue;
    const ex = s.exercises.find((e) => e.exerciseId === exerciseId);
    if (!ex) continue;
    const sets = ex.sets.filter(isFilled).map((x) => ({ weight: x.weight, reps: x.reps }));
    if (sets.length) return { sets, at: s.start, source: 'sesion' };
  }

  const seed = store.seedRefs[exerciseId];
  if (seed?.length) return { sets: seed.map((x) => ({ ...x })), at: null, source: 'hoja' };
  return null;
}

/** Texto corto para la cabecera del ejercicio: «40 × 8 · 40 × 7». */
export function referenceLabel(ref: Reference | null): string | null {
  if (!ref) return null;
  return ref.sets
    .slice(0, 4)
    .map((s) => `${String(s.weight).replace('.', ',')} × ${s.reps}`)
    .join(' · ');
}

/** Pesos de arranque de una sesión nueva, serie a serie. */
export function prefillWeights(sessions: Session[], seedRefs: Store['seedRefs'], exerciseId: string): number[] {
  const ordered = [...sessions].sort((a, b) => b.start - a.start);
  for (const s of ordered) {
    const ex = s.exercises.find((e) => e.exerciseId === exerciseId);
    const sets = ex?.sets.filter(isFilled) ?? [];
    if (sets.length) return sets.map((x) => x.weight);
  }
  return (seedRefs[exerciseId] ?? []).map((x) => x.weight);
}
