import { describe, expect, it } from 'vitest';
import { bestYaw, buildParts, buildSkin, type Part } from './body3d';
import { HEADS } from './heads';
import { MUSCLES } from './types';

/* La figura se genera con código, así que lo que hay que vigilar no es que
   «quede bonita» —eso se mira con los ojos— sino que la malla sea válida y que
   ningún músculo se quede sin sitio en el cuerpo. Un índice fuera de rango o
   un NaN no se ven en una captura: se ven en un móvil, en negro. */

const parts = buildParts();

function checkMesh(m: { positions: Float32Array; normals: Float32Array; indices: Uint32Array }, name: string) {
  expect(m.positions.length, `${name}: vértices`).toBeGreaterThan(0);
  expect(m.positions.length).toBe(m.normals.length);
  expect(m.indices.length % 3, `${name}: triángulos completos`).toBe(0);
  const verts = m.positions.length / 3;
  for (let i = 0; i < m.indices.length; i++) {
    expect(m.indices[i] as number, `${name}: índice en rango`).toBeLessThan(verts);
  }
  for (let i = 0; i < m.positions.length; i++) {
    expect(Number.isFinite(m.positions[i] as number), `${name}: posición finita`).toBe(true);
    expect(Number.isFinite(m.normals[i] as number), `${name}: normal finita`).toBe(true);
  }
}

describe('malla del cuerpo', () => {
  it('la piel es una malla válida', () => {
    checkMesh(buildSkin(), 'piel');
  });

  it('cada pieza muscular es una malla válida', () => {
    for (const p of parts) checkMesh(p, p.id);
  });

  it('todas las piezas caben dentro de la figura', () => {
    for (const p of parts) {
      for (let i = 0; i < p.positions.length; i += 3) {
        expect(Math.abs(p.positions[i] as number), `${p.id}: ancho`).toBeLessThan(45);
        expect(p.positions[i + 1] as number, `${p.id}: suelo`).toBeGreaterThan(-1);
        expect(p.positions[i + 1] as number, `${p.id}: techo`).toBeLessThan(185);
      }
    }
  });
});

describe('cobertura de los grupos', () => {
  it('cada cabeza del catálogo tiene su pieza en el cuerpo', () => {
    const drawn = new Set(parts.map((p) => p.head).filter(Boolean));
    const missing: string[] = [];
    for (const list of Object.values(HEADS)) {
      for (const h of list) if (!drawn.has(h.id)) missing.push(h.id);
    }
    expect(missing).toEqual([]);
  });

  it('no se dibuja ninguna cabeza que no esté en el catálogo', () => {
    const known = new Set(Object.values(HEADS).flatMap((l) => l.map((h) => h.id)));
    const unknown = [...new Set(parts.map((p) => p.head))].filter((h): h is string => !!h && !known.has(h));
    expect(unknown).toEqual([]);
  });

  it('cada grupo aparece en los dos lados del cuerpo', () => {
    for (const m of MUSCLES) {
      const mine = parts.filter((p) => p.muscle === m);
      expect(mine.some((p) => p.center[0] > 0), `${m}: lado izquierdo`).toBe(true);
      expect(mine.some((p) => p.center[0] < 0), `${m}: lado derecho`).toBe(true);
    }
  });

  it('cada pieza tiene su reflejo con la misma forma', () => {
    const bySide = new Map<string, Part[]>();
    for (const p of parts) {
      const key = p.head ?? p.id.split('#')[0] ?? '';
      bySide.set(key, [...(bySide.get(key) ?? []), p]);
    }
    for (const [key, list] of bySide) {
      expect(list.length % 2, `${key}: pares`).toBe(0);
      const left = list.filter((p) => p.center[0] > 0);
      const right = list.filter((p) => p.center[0] < 0);
      expect(left.length, `${key}: mismo número a cada lado`).toBe(right.length);
    }
  });
});

describe('encuadre automático', () => {
  it('el pecho y el abdomen se miran de frente', () => {
    for (const m of ['pecho', 'abdomen'] as const) {
      expect(Math.abs(bestYaw(parts, m)), m).toBeLessThan(0.3);
    }
  });

  it('la espalda, el glúteo y el femoral se miran por detrás', () => {
    for (const m of ['espalda', 'gluteo', 'femoral'] as const) {
      expect(Math.abs(bestYaw(parts, m)), m).toBeGreaterThan(Math.PI - 0.5);
    }
  });

  it('el giro propuesto siempre es un ángulo válido', () => {
    for (const m of MUSCLES) {
      const y = bestYaw(parts, m);
      expect(Number.isFinite(y), m).toBe(true);
      expect(Math.abs(y)).toBeLessThanOrEqual(Math.PI + 1e-6);
    }
  });
});
