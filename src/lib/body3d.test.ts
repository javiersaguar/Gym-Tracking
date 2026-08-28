import { describe, expect, it } from 'vitest';
import { bestYaw, buildFiller, buildParts, buildSkin } from './body3d';
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

  it('el relleno sin músculo es una malla válida', () => {
    const filler = buildFiller();
    checkMesh(filler, 'relleno');
    expect(filler.shade.length, 'una sombra por vértice').toBe(filler.positions.length / 3);
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
      expect(mine.length, `${m}: tiene piezas`).toBeGreaterThan(0);
      const xs = mine.flatMap((p) => [...p.positions].filter((_, i) => i % 3 === 0));
      expect(Math.max(...xs), `${m}: lado izquierdo`).toBeGreaterThan(1);
      expect(Math.min(...xs), `${m}: lado derecho`).toBeLessThan(-1);
    }
  });

  it('cada pieza es simétrica: los dos lados van en la misma malla', () => {
    for (const p of parts) {
      const xs = [...p.positions].filter((_, i) => i % 3 === 0);
      /* Lo que se dibuja a la izquierda tiene que estar también a la derecha,
         porque el mapa nunca colorea medio músculo. Las piezas de la línea
         media cumplen lo mismo por su cuenta. */
      expect(Math.max(...xs), `${p.id}: simétrica`).toBeCloseTo(-Math.min(...xs), 3);
      expect(Math.abs(p.center[0]), `${p.id}: centro sobre el eje`).toBeLessThan(0.001);
      expect(p.shade.length, `${p.id}: una sombra por vértice`).toBe(p.positions.length / 3);
    }
  });

  it('el ancla de la etiqueta cae sobre el lado izquierdo, no en el eje', () => {
    /* Si el ancla se quedara en el centro, el cartel de un bíceps saldría
       flotando en medio del tronco. */
    for (const p of parts) {
      if (Math.max(...[...p.positions].filter((_, i) => i % 3 === 0)) < 3) continue;
      expect(p.anchor[0], `${p.id}: ancla lateral`).toBeGreaterThan(0);
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

  it('cada cabeza tiene su propio ángulo, no el del grupo', () => {
    /* El deltoides es el caso que importa: sus tres porciones están una
       delante, otra al lado y otra detrás, y girar al «ángulo del hombro»
       dejaría la posterior escondida justo al entrar a mirarla. */
    const anterior = bestYaw(parts, null, 'hombro.anterior');
    const posterior = bestYaw(parts, null, 'hombro.posterior');
    expect(Math.abs(anterior), 'anterior de frente').toBeLessThan(0.6);
    expect(Math.abs(posterior), 'posterior por detrás').toBeGreaterThan(Math.PI - 0.6);
  });

  it('mirar una cabeza del pecho sigue mirando de frente', () => {
    for (const h of ['pecho.clavicular', 'pecho.esternal', 'pecho.abdominal']) {
      expect(Math.abs(bestYaw(parts, null, h)), h).toBeLessThan(0.3);
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
