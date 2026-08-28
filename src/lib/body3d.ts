import type { Muscle } from './types';

/* ────────────────────────────────────────────────────────────────────────────
 * Cuerpo en tres dimensiones
 *
 * La figura no viene de un modelo descargado: se genera aquí con código. Es la
 * única forma de que la app siga funcionando sin conexión y de que pese poco,
 * y además permite que cada músculo sea una malla independiente —con su grupo
 * y su cabeza— para poder tocarla, identificarla y colorearla por separado.
 *
 * El cuerpo se construye en dos capas:
 *
 *   1. **La piel.** Superficies paramétricas: el tronco es un perfil de
 *      secciones apiladas y cada extremidad un tubo que sigue el eje del
 *      hueso. La piel se dibuja en un gris neutro y hace de fondo.
 *   2. **Los músculos.** Cada uno es un parche sobre esa misma piel: un
 *      recorte en el dominio (altura, ángulo) que se levanta un poco sobre la
 *      superficie con un perfil abombado. Como nace de la piel y vuelve a ella
 *      en los bordes, el músculo se integra en el cuerpo en vez de parecer una
 *      pegatina, que era justo el problema del mapa plano anterior.
 *
 * Ángulos: 0° mira al frente, 90° hacia fuera del cuerpo, 180° a la espalda y
 * 270° hacia dentro. Vale igual para los dos lados porque solo se define el
 * lado izquierdo del modelo y el derecho es su reflejo. Unidades: centímetros
 * sobre una figura de 180 cm, con el suelo en y = 0.
 * ──────────────────────────────────────────────────────────────────────── */

export type Vec3 = [number, number, number];

export type MeshData = {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
};

export type Part = MeshData & {
  /** Identificador único de la malla (incluye el lado). */
  id: string;
  muscle: Muscle | null;
  head: string | null;
  /** Músculo tapado por otro: solo se muestra en el mapa de detalle. */
  deep: boolean;
  /** Punto medio del parche, para colocar la etiqueta y encuadrar la cámara. */
  center: Vec3;
};

/* ── Vectores ────────────────────────────────────────────────────────────── */

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

const RAD = Math.PI / 180;
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const at = <T,>(a: readonly T[], i: number): T => a[clamp(i, 0, a.length - 1)] as T;

/** Interpolación suave (Catmull-Rom) de una tabla ordenada por su clave. */
function track(rows: readonly number[][], key: number, col: number): number {
  const n = rows.length;
  if (n === 1) return at(rows, 0)[col] as number;
  let i = 0;
  while (i < n - 2 && (at(rows, i + 1)[0] as number) < key) i++;
  const a = at(rows, i);
  const b = at(rows, i + 1);
  const ka = a[0] as number;
  const kb = b[0] as number;
  const u = clamp(kb === ka ? 0 : (key - ka) / (kb - ka), 0, 1);
  const p0 = at(rows, i - 1)[col] as number;
  const p1 = a[col] as number;
  const p2 = b[col] as number;
  const p3 = at(rows, i + 2)[col] as number;
  const u2 = u * u;
  return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u2 * u);
}

/* ── Superficies ─────────────────────────────────────────────────────────── */

/**
 * Una superficie del cuerpo. `at` devuelve el punto de la piel para una
 * coordenada longitudinal `u` y un ángulo `deg`; `core` da el punto del eje a
 * esa altura, que sirve para saber hacia dónde mira la normal.
 */
export type Surface = {
  at(u: number, deg: number): Vec3;
  core(u: number): Vec3;
  /** Rango útil de `u`, para convertir alturas en fracciones. */
  range: [number, number];
};

/** Normal hacia fuera, por diferencias finitas sobre la propia superficie. */
function normalAt(s: Surface, u: number, deg: number): Vec3 {
  const span = s.range[1] - s.range[0];
  const du = span * 0.004;
  const p = s.at(u, deg);
  const tu = sub(s.at(clamp(u + du, s.range[0], s.range[1]), deg), s.at(clamp(u - du, s.range[0], s.range[1]), deg));
  const tv = sub(s.at(u, deg + 2), s.at(u, deg - 2));
  let n = norm(cross(tv, tu));
  if (dot(n, sub(p, s.core(u))) < 0) n = mul(n, -1);
  return n;
}

/**
 * Tronco: secciones horizontales apiladas.
 *
 * Cada sección lleva su semianchura y dos profundidades distintas, delante y
 * detrás. Con una sola profundidad el glúteo y el pecho salían simétricos y el
 * cuerpo parecía un tubo; separarlas es lo que da espalda y asiento.
 */
function makeTorso(rings: readonly number[][]): Surface {
  const y0 = at(rings, 0)[0] as number;
  const y1 = at(rings, rings.length - 1)[0] as number;
  return {
    range: [y0, y1],
    core: (y) => [0, y, 0],
    at(y, deg) {
      const w = track(rings, y, 1);
      const df = track(rings, y, 2);
      const db = track(rings, y, 3);
      const a = deg * RAD;
      const cx = Math.sin(a);
      const cz = Math.cos(a);
      const d = cz >= 0 ? df : db;
      // Superelipse suave: la elipse pura deja el tronco cilíndrico y un
      // exponente alto lo vuelve una caja. 2,15 da el flanco plano justo.
      const k = 2 / 2.15;
      return [w * Math.sign(cx) * Math.abs(cx) ** k, y, d * Math.sign(cz) * Math.abs(cz) ** k];
    },
  };
}

/**
 * Extremidad: tubo que sigue el eje del hueso.
 *
 * En cada punto se levanta un triedro con la tangente, el frente del cuerpo y
 * el lado. Así el ángulo 90° es «hacia fuera» a lo largo de todo el brazo
 * aunque el brazo caiga en diagonal, y las tablas de los músculos se leen
 * igual arriba que abajo.
 */
function makeLimb(points: readonly Vec3[], radii: readonly number[][]): Surface {
  const dense: Vec3[] = [];
  const P = [at(points, 0), ...points, at(points, points.length - 1)];
  const STEP = 24;
  for (let i = 1; i + 2 < P.length; i++) {
    const p0 = at(P, i - 1);
    const p1 = at(P, i);
    const p2 = at(P, i + 1);
    const p3 = at(P, i + 2);
    for (let j = 0; j < STEP; j++) {
      const t = j / STEP;
      const t2 = t * t;
      const t3 = t2 * t;
      dense.push([0, 1, 2].map((c) =>
        0.5 * (2 * (p1[c] as number)
          + (-(p0[c] as number) + (p2[c] as number)) * t
          + (2 * (p0[c] as number) - 5 * (p1[c] as number) + 4 * (p2[c] as number) - (p3[c] as number)) * t2
          + (-(p0[c] as number) + 3 * (p1[c] as number) - 3 * (p2[c] as number) + (p3[c] as number)) * t3),
      ) as Vec3);
    }
  }
  dense.push(at(P, P.length - 2));

  const cum: number[] = [0];
  for (let i = 1; i < dense.length; i++) cum.push((at(cum, i - 1)) + Math.hypot(...sub(at(dense, i), at(dense, i - 1))));
  const total = at(cum, cum.length - 1);

  const seek = (t: number) => {
    const d = clamp(t, 0, 1) * total;
    let i = 1;
    while (i < cum.length - 1 && at(cum, i) < d) i++;
    const a = at(dense, i - 1);
    const b = at(dense, i);
    const seg = at(cum, i) - at(cum, i - 1) || 1;
    const k = (d - at(cum, i - 1)) / seg;
    const p = add(a, mul(sub(b, a), k)) as Vec3;
    // La tangente se toma sobre una ventana: con tramos de medio milímetro el
    // ángulo salta y el tubo sale facetado.
    const f = at(dense, i + 4);
    const g = at(dense, i - 4);
    return { p, T: norm(sub(f, g)) };
  };

  return {
    range: [0, 1],
    core: (t) => seek(t).p,
    at(t, deg) {
      const { p, T } = seek(t);
      const front: Vec3 = [0, 0, 1];
      const N = norm(sub(front, mul(T, dot(front, T))));
      const B = norm(cross(N, T));
      const r = track(radii, clamp(t, 0, 1), 1);
      const k = radii[0]?.length === 3 ? track(radii, clamp(t, 0, 1), 2) : 1;
      const a = deg * RAD;
      return add(p, add(mul(N, Math.cos(a) * r * k), mul(B, Math.sin(a) * r))) as Vec3;
    },
  };
}

/* ── Mallado ─────────────────────────────────────────────────────────────── */

/** Rejilla de (nu+1)×(nv+1) vértices, opcionalmente cerrada en v. */
function grid(nu: number, nv: number, f: (i: number, j: number) => { p: Vec3; n: Vec3 }, wrap = false): MeshData {
  const cols = wrap ? nv : nv + 1;
  const positions = new Float32Array((nu + 1) * cols * 3);
  const normals = new Float32Array((nu + 1) * cols * 3);
  for (let i = 0; i <= nu; i++) {
    for (let j = 0; j < cols; j++) {
      const { p, n } = f(i, j);
      const o = (i * cols + j) * 3;
      positions[o] = p[0];
      positions[o + 1] = p[1];
      positions[o + 2] = p[2];
      normals[o] = n[0];
      normals[o + 1] = n[1];
      normals[o + 2] = n[2];
    }
  }
  const indices = new Uint32Array(nu * (wrap ? nv : nv) * 6);
  let k = 0;
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < (wrap ? nv : nv); j++) {
      const j2 = wrap ? (j + 1) % cols : j + 1;
      const a = i * cols + j;
      const b = i * cols + j2;
      const c = (i + 1) * cols + j;
      const d = (i + 1) * cols + j2;
      indices[k++] = a;
      indices[k++] = c;
      indices[k++] = b;
      indices[k++] = b;
      indices[k++] = c;
      indices[k++] = d;
    }
  }
  return orient({ positions, normals, indices });
}

/**
 * Deja todos los triángulos mirando hacia fuera.
 *
 * El sentido de giro de la rejilla depende de hacia dónde crecen `u` y el
 * ángulo, y eso cambia entre el tronco —donde `u` sube— y las extremidades
 * —donde baja—. Sin corregirlo, media figura se dibuja del revés y el motor
 * la descarta: era justo lo que hacía desaparecer el pecho y la espalda.
 */
function orient(m: MeshData): MeshData {
  let vote = 0;
  for (let i = 0; i + 2 < m.indices.length; i += 3 * 7) {
    const [ia, ib, ic] = [m.indices[i] as number, m.indices[i + 1] as number, m.indices[i + 2] as number];
    const v = (k: number): Vec3 => [m.positions[k * 3] as number, m.positions[k * 3 + 1] as number, m.positions[k * 3 + 2] as number];
    const face = cross(sub(v(ib), v(ia)), sub(v(ic), v(ia)));
    const ref: Vec3 = [m.normals[ia * 3] as number, m.normals[ia * 3 + 1] as number, m.normals[ia * 3 + 2] as number];
    vote += dot(face, ref) > 0 ? 1 : -1;
  }
  if (vote >= 0) return m;
  for (let i = 0; i < m.indices.length; i += 3) {
    const t = m.indices[i] as number;
    m.indices[i] = m.indices[i + 2] as number;
    m.indices[i + 2] = t;
  }
  return m;
}

/** Refleja una malla en x. Hay que invertir el orden de los triángulos: si no,
 *  el lado derecho queda del revés y se ve por dentro. */
function mirror(m: MeshData): MeshData {
  const positions = Float32Array.from(m.positions);
  const normals = Float32Array.from(m.normals);
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = -(positions[i] as number);
    normals[i] = -(normals[i] as number);
  }
  const indices = Uint32Array.from(m.indices);
  for (let i = 0; i < indices.length; i += 3) {
    const t = indices[i] as number;
    indices[i] = indices[i + 2] as number;
    indices[i + 2] = t;
  }
  return { positions, normals, indices };
}

function merge(parts: MeshData[]): MeshData {
  const nv = parts.reduce((s, p) => s + p.positions.length, 0);
  const ni = parts.reduce((s, p) => s + p.indices.length, 0);
  const positions = new Float32Array(nv);
  const normals = new Float32Array(nv);
  const indices = new Uint32Array(ni);
  let vo = 0;
  let io = 0;
  for (const p of parts) {
    positions.set(p.positions, vo);
    normals.set(p.normals, vo);
    for (let i = 0; i < p.indices.length; i++) indices[io + i] = (p.indices[i] as number) + vo / 3;
    vo += p.positions.length;
    io += p.indices.length;
  }
  return { positions, normals, indices };
}

/* ── Medidas ─────────────────────────────────────────────────────────────── */

export const BODY_HEIGHT = 180;

/* [y, semianchura, profundidad delante, profundidad detrás] */
const TORSO_RINGS: number[][] = [
  [74, 13.8, 8.8, 10.2],
  [80, 15.2, 9.4, 11.8],
  [86, 16.1, 9.8, 12.8],
  [92, 16.4, 10.0, 13.2],
  [98, 16.2, 9.9, 12.4],
  [104, 15.4, 9.6, 11.0],
  [110, 13.8, 9.1, 10.0],
  [116, 12.7, 8.7, 9.4],
  [122, 13.2, 9.1, 9.8],
  [128, 14.3, 9.7, 10.3],
  [134, 15.3, 10.2, 10.8],
  [140, 15.9, 10.4, 11.0],
  [145, 16.6, 10.1, 10.8],
  [149, 16.0, 9.2, 10.0],
  [153, 12.4, 7.6, 8.6],
  [156, 8.8, 6.2, 7.2],
];

/* La cabeza es otro perfil de secciones: así tiene mandíbula y occipucio en
   vez de ser una bola, que es lo que delata a un muñeco de juguete. */
const HEAD_RINGS: number[][] = [
  [156, 3.6, 4.6, 4.6],
  [159, 5.6, 7.2, 6.8],
  [163, 7.2, 8.8, 8.4],
  [168, 8.0, 9.4, 9.4],
  [173, 7.6, 8.4, 9.0],
  [177, 6.4, 6.8, 7.4],
  [179, 5.0, 5.2, 5.8],
  [180.6, 2.0, 2.1, 2.4],
];

const NECK_RINGS: number[][] = [
  [144, 7.2, 6.6, 7.0],
  [150, 5.7, 5.4, 5.8],
  [156, 5.6, 5.6, 6.0],
  [160, 6.6, 6.6, 7.0],
];

const ARM_AXIS: Vec3[] = [
  [16.2, 147, 0],
  [19.4, 129, -0.5],
  [21.5, 112, -1],
  [23.0, 98, 0],
  [24.0, 86, 1],
  [25.0, 70, 1.5],
];

/* [t, radio, achatamiento delante-detrás] — el hombro es lo más grueso, la
   muñeca lo más fino, y la mano se aplana para no ser un cono. */
const ARM_RADII: number[][] = [
  [0.0, 7.5, 1.0],
  [0.06, 7.2, 1.0],
  [0.16, 6.3, 1.0],
  [0.28, 5.6, 1.0],
  [0.38, 4.9, 0.98],
  [0.44, 4.3, 0.92],
  [0.52, 4.9, 0.94],
  [0.6, 5.1, 0.9],
  [0.7, 4.1, 0.82],
  [0.79, 2.9, 0.7],
  [0.86, 3.8, 0.5],
  [0.95, 3.4, 0.45],
  [1.0, 1.0, 0.5],
];

const LEG_AXIS: Vec3[] = [
  [8.0, 91, 0],
  [9.4, 68, 0.5],
  [9.0, 50, 1],
  [9.4, 36, -1],
  [8.6, 5, 0],
];

const LEG_RADII: number[][] = [
  [0.0, 10.6, 1.0],
  [0.12, 9.8, 1.0],
  [0.28, 8.7, 1.0],
  [0.4, 6.9, 0.98],
  [0.49, 5.4, 0.96],
  [0.56, 6.1, 0.94],
  [0.67, 6.7, 0.92],
  [0.8, 4.6, 0.9],
  [0.92, 3.1, 0.86],
  [1.0, 2.8, 0.86],
];

export const TORSO = makeTorso(TORSO_RINGS);
const HEAD = makeTorso(HEAD_RINGS);
const NECK = makeTorso(NECK_RINGS);
export const ARM = makeLimb(ARM_AXIS, ARM_RADII);
export const LEG = makeLimb(LEG_AXIS, LEG_RADII);

/* ── Parches musculares ──────────────────────────────────────────────────── */

/** Una fila del recorte: a la coordenada `u`, del ángulo `a` al `b`. */
type Row = [u: number, a: number, b: number];

type Spec = {
  head: string | null;
  muscle: Muscle | null;
  on: Surface;
  rows: Row[];
  /** Cuánto se levanta sobre la piel. Por defecto, según la superficie. */
  amp?: number;
  deep?: boolean;
};

/* Los músculos profundos se separan de la piel más de lo que les tocaría: en
   el mapa de detalle se dibujan por encima del que los tapa, como una lámina
   levantada, y si no quedarían enterrados dentro de él. */
const DEEP_LIFT = 2.4;

/* Perfil del abombado: lleno en el centro y a cero en los bordes, para que el
   parche nazca de la piel y no se vea el escalón del recorte. */
const bulge = (x: number) => Math.sin(Math.PI * clamp(x, 0, 1)) ** 0.55;

/**
 * Hendidura entre músculos.
 *
 * Los recortes se escriben pegados unos a otros, y así dos músculos vecinos con
 * colores parecidos se funden en una mancha. Encogiendo cada parche un pelo por
 * los cuatro lados asoma la piel entre ellos como una línea fina, que es lo que
 * separa los músculos en las láminas de anatomía.
 */
const INSET_DEG = 1.6;
const INSET_U = 0.02;

function buildPatch(s: Spec, side: 1 | -1, nu = 9, nv = 12): Part {
  const rows = s.rows;
  const span = at(rows, rows.length - 1)[0] - at(rows, 0)[0];
  const u0 = at(rows, 0)[0] + span * INSET_U;
  const u1 = at(rows, rows.length - 1)[0] - span * INSET_U;
  const amp = s.amp ?? 1.0;

  let cx = 0;
  let cy = 0;
  let cz = 0;
  const mesh = grid(nu, nv, (i, j) => {
    const fu = i / nu;
    const u = u0 + (u1 - u0) * fu;
    const a0 = track(rows, u, 1);
    const b0 = track(rows, u, 2);
    const gap = Math.min(INSET_DEG, Math.abs(b0 - a0) * 0.18);
    const a = a0 + gap;
    const b = b0 - gap;
    const fv = j / nv;
    const deg = a + (b - a) * fv;
    const p = s.on.at(u, deg);
    const n = normalAt(s.on, u, deg);
    const h = (s.deep ? DEEP_LIFT : 0) + amp * bulge(fu) * bulge(fv);
    const out = add(p, mul(n, h)) as Vec3;
    cx += out[0];
    cy += out[1];
    cz += out[2];
    return { p: out, n };
  });

  const count = (nu + 1) * (nv + 1);
  const center: Vec3 = [(cx / count) * side, cy / count, cz / count];
  const data = side === 1 ? mesh : mirror(mesh);
  return {
    ...data,
    id: `${s.head ?? 'piel'}#${side}`,
    muscle: s.muscle,
    head: s.head,
    deep: s.deep ?? false,
    center,
  };
}

const T = (head: string | null, muscle: Muscle | null, rows: Row[], extra: Partial<Spec> = {}): Spec =>
  ({ head, muscle, on: TORSO, rows, amp: 1.05, ...extra });
const A = (head: string | null, muscle: Muscle | null, rows: Row[], extra: Partial<Spec> = {}): Spec =>
  ({ head, muscle, on: ARM, rows, amp: 0.85, ...extra });
const L = (head: string | null, muscle: Muscle | null, rows: Row[], extra: Partial<Spec> = {}): Spec =>
  ({ head, muscle, on: LEG, rows, amp: 1.0, ...extra });

const SPECS: Spec[] = [
  /* ── Tronco, delante ───────────────────────────────────────────────────── */
  /* Pectoral en sus tres porciones: la clavicular se estrecha al subir hacia
     la clavícula y la abdominal se recoge hacia el esternón. */
  T('pecho.clavicular', 'pecho', [[143, 4, 62], [146, 4, 60], [149, 5, 46]], { amp: 1.5 }),
  T('pecho.esternal', 'pecho', [[133, 5, 58], [138, 4, 64], [143, 4, 62]], { amp: 1.8 }),
  T('pecho.abdominal', 'pecho', [[126.5, 8, 42], [130, 6, 52], [133, 5, 58]], { amp: 1.45 }),

  /* Recto abdominal: la banda pegada a la línea alba. */
  T('abdomen.recto', 'abdomen', [[102, 4, 20], [110, 3, 26], [118, 3, 27], [126, 3, 25]], { amp: 0.95 }),
  T('abdomen.oblicuo', 'abdomen', [[103, 26, 50], [110, 26, 64], [118, 27, 66], [126, 30, 62]]),
  T('abdomen.serrato', 'abdomen', [[119, 64, 84], [125, 62, 88], [131, 64, 84]], { amp: 0.8 }),
  T('abdomen.transverso', 'abdomen', [[104, 6, 54], [112, 5, 58], [119, 6, 54]], { amp: 0.5, deep: true }),

  /* ── Tronco, espalda ───────────────────────────────────────────────────── */
  T('espalda.erectores', 'espalda', [[101, 165, 180], [110, 160, 180], [120, 160, 180], [128, 163, 180]], { amp: 0.9 }),
  T('espalda.romboides', 'espalda', [[132, 150, 178], [139, 146, 178], [146, 150, 178]], { amp: 0.55, deep: true }),
  /* Dorsal: arriba es solo el pliegue de la axila y abajo llega a la columna.
     Estrechar los dos bordes daba un reloj de arena; el borde interno se queda
     pegado a la columna y solo se mueve el de fuera. */
  T('espalda.dorsal', 'espalda', [
    [111, 124, 179], [119, 104, 179], [128, 96, 178], [137, 94, 176], [146, 96, 122],
  ], { amp: 1.15 }),
  T('espalda.trapecio-inf', 'espalda', [[119, 166, 180], [126, 152, 180], [134, 140, 180]], { amp: 0.8 }),
  T('espalda.trapecio-med', 'espalda', [[134, 140, 180], [141, 132, 180], [148, 142, 180]], { amp: 0.9 }),
  T('espalda.trapecio-sup', 'espalda', [
    [144, 58, 140], [147, 62, 170], [151, 100, 180], [155, 148, 180],
  ], { amp: 1.0 }),
  T('espalda.redondo', 'espalda', [[134, 102, 122], [138, 96, 124], [142, 98, 118]], { amp: 0.85 }),

  /* ── Glúteo ────────────────────────────────────────────────────────────── */
  T('gluteo.menor', 'gluteo', [[100, 88, 124], [105, 86, 126], [110, 90, 122]], { amp: 0.5, deep: true }),
  T('gluteo.medio', 'gluteo', [[100, 84, 130], [106, 78, 134], [112, 92, 128]], { amp: 0.9 }),
  T('gluteo.mayor', 'gluteo', [[83, 116, 176], [90, 108, 180], [98, 112, 180], [104, 132, 180]], { amp: 1.3 }),

  /* ── Hombro ────────────────────────────────────────────────────────────── */
  A('hombro.anterior', 'hombro', [[0.0, -55, 22], [0.1, -55, 25], [0.2, -48, 20], [0.28, -30, 5]], { amp: 1.1 }),
  A('hombro.lateral', 'hombro', [[0.0, 22, 112], [0.1, 25, 115], [0.2, 20, 108], [0.3, 5, 85]], { amp: 1.2 }),
  A('hombro.posterior', 'hombro', [[0.0, 112, 196], [0.1, 115, 198], [0.2, 108, 190], [0.28, 85, 170]], { amp: 1.1 }),

  /* ── Brazo ─────────────────────────────────────────────────────────────── */
  A('biceps.larga', 'biceps', [[0.17, 8, 52], [0.26, 4, 56], [0.35, 2, 52], [0.43, 6, 42]], { amp: 1.1 }),
  A('biceps.corta', 'biceps', [[0.17, -50, 8], [0.26, -56, 4], [0.35, -52, 2], [0.43, -42, 6]], { amp: 1.0 }),
  A('biceps.braquial', 'biceps', [[0.3, 52, 78], [0.36, 50, 82], [0.42, 46, 80], [0.47, 44, 74]], { amp: 0.7 }),
  A('triceps.larga', 'triceps', [[0.1, 130, 190], [0.2, 128, 196], [0.31, 126, 192], [0.4, 130, 182]], { amp: 1.1 }),
  A('triceps.lateral', 'triceps', [[0.1, 82, 130], [0.2, 78, 128], [0.31, 80, 126], [0.4, 88, 130]], { amp: 1.0 }),
  A('triceps.medial', 'triceps', [[0.36, 104, 136], [0.41, 100, 142], [0.47, 106, 138]], { amp: 0.7 }),
  /* Antebrazo: la app no lo mide, pero un antebrazo liso canta a muñeco. */
  A(null, null, [[0.47, 40, 150], [0.6, 36, 154], [0.72, 44, 146]], { amp: 0.65 }),
  A(null, null, [[0.47, -140, 40], [0.6, -144, 36], [0.72, -136, 44]], { amp: 0.65 }),

  /* ── Muslo ─────────────────────────────────────────────────────────────── */
  L('cuadriceps.vasto-intermedio', 'cuadriceps', [[0.06, -22, 22], [0.24, -20, 20], [0.42, -18, 18]], { amp: 0.5, deep: true }),
  L('cuadriceps.recto', 'cuadriceps', [[0.02, -26, 26], [0.16, -24, 26], [0.32, -22, 24], [0.44, -20, 20]], { amp: 1.05 }),
  L('cuadriceps.vasto-lateral', 'cuadriceps', [[0.02, 26, 76], [0.14, 24, 82], [0.3, 22, 80], [0.44, 20, 62]], { amp: 1.15 }),
  L('cuadriceps.vasto-medial', 'cuadriceps', [[0.2, -60, -24], [0.32, -66, -22], [0.4, -70, -20], [0.47, -58, -18]], { amp: 1.1 }),
  L('aductor.largo', 'aductor', [[0.0, -85, -60], [0.1, -88, -58], [0.24, -86, -62]], { amp: 0.9 }),
  L('aductor.gracil', 'aductor', [[0.03, -106, -86], [0.24, -108, -88], [0.45, -104, -86]], { amp: 0.7 }),
  L('aductor.mayor', 'aductor', [[0.0, -150, -106], [0.12, -152, -108], [0.28, -148, -106]], { amp: 0.95 }),

  /* ── Isquiotibiales ────────────────────────────────────────────────────── */
  L('femoral.biceps', 'femoral', [[0.06, 100, 150], [0.2, 96, 152], [0.34, 98, 150], [0.45, 104, 146]], { amp: 1.1 }),
  L('femoral.semitendinoso', 'femoral', [[0.06, 152, 200], [0.2, 154, 205], [0.34, 152, 202], [0.45, 150, 196]], { amp: 1.0 }),
  L('femoral.semimembranoso', 'femoral', [[0.16, 200, 224], [0.3, 202, 228], [0.46, 198, 220]], { amp: 0.8 }),

  /* ── Pierna ────────────────────────────────────────────────────────────── */
  L('gemelo.gastro-lateral', 'gemelo', [[0.52, 108, 178], [0.6, 100, 178], [0.7, 104, 178], [0.79, 116, 176]], { amp: 1.1 }),
  L('gemelo.gastro-medial', 'gemelo', [[0.52, 182, 252], [0.6, 182, 260], [0.7, 182, 256], [0.8, 184, 244]], { amp: 1.2 }),
  L('gemelo.soleo', 'gemelo', [[0.78, 96, 264], [0.87, 108, 252], [0.95, 122, 238]], { amp: 0.75 }),
  L(null, null, [[0.52, -60, 10], [0.66, -56, 6], [0.82, -50, 0]], { amp: 0.6 }),
];

/* ── Piel ────────────────────────────────────────────────────────────────── */

function tube(s: Surface, u0: number, u1: number, nu: number, nv = 30): MeshData {
  return grid(nu, nv, (i, j) => {
    const u = u0 + ((u1 - u0) * i) / nu;
    const deg = (360 * j) / nv;
    return { p: s.at(u, deg), n: normalAt(s, u, deg) };
  }, true);
}

/* Pie: secciones a lo largo del empeine, del talón a la punta. */
const FOOT_RINGS: number[][] = [
  [-6, 2.4, 2.0],
  [-3.5, 3.6, 3.7],
  [0, 4.1, 3.9],
  [5, 4.2, 3.0],
  [9, 3.6, 2.0],
  [12.5, 2.1, 1.0],
];

function foot(): MeshData {
  return grid(16, 20, (i, j) => {
    const z = -6 + (18.5 * i) / 16;
    const w = track(FOOT_RINGS, z, 1);
    const h = track(FOOT_RINGS, z, 2);
    const a = (2 * Math.PI * j) / 20;
    const cy = Math.cos(a);
    const cx = Math.sin(a);
    // La planta es plana: el pie apoya, no rueda.
    const y = h * 0.95 + cy * h * (cy < 0 ? 0.85 : 1.15);
    return {
      p: [8.6 + cx * w, Math.max(0.15, y), z] as Vec3,
      n: norm([cx / w, cy / h, 0.1]),
    };
  }, true);
}

export function buildSkin(): MeshData {
  return merge([
    tube(TORSO, 74.5, 155.5, 36),
    tube(NECK, 144.5, 159.5, 8, 22),
    tube(HEAD, 156.5, 180.4, 20, 26),
    tube(ARM, 0.02, 1, 44),
    mirror(tube(ARM, 0.02, 1, 44)),
    tube(LEG, 0.02, 0.99, 44),
    mirror(tube(LEG, 0.02, 0.99, 44)),
    foot(),
    mirror(foot()),
  ]);
}

/** Todas las piezas musculares, los dos lados. */
export function buildParts(): Part[] {
  return SPECS.flatMap((s) => [buildPatch(s, 1), buildPatch(s, -1)]);
}

/**
 * Giro que hay que dar a la figura para poner un grupo de cara. Sirve para que
 * al entrar en el detalle de la espalda se gire sola y no haya que buscarla
 * arrastrando.
 *
 * Se promedian los parches de los **dos** lados: al ser simétricos, las
 * componentes laterales se anulan entre sí y queda solo el «delante o detrás»,
 * que es lo que interesa. Promediar un solo lado dejaba el pecho girado
 * cuarenta grados.
 */
export function bestYaw(parts: Part[], muscle: Muscle): number {
  const mine = parts.filter((p) => p.muscle === muscle);
  if (!mine.length) return 0;
  let sx = 0;
  let sz = 0;
  for (const p of mine) {
    sx += p.center[0];
    sz += p.center[2];
  }
  if (Math.abs(sx) < 1e-3 && Math.abs(sz) < 1e-3) return 0;
  // Signo cambiado: hay que girar el cuerpo hacia la cámara, no al revés.
  return -Math.atan2(sx, sz);
}

/** Altura media del grupo, para centrar la cámara al ampliarlo. */
export function centerY(parts: Part[], muscle: Muscle): number {
  const mine = parts.filter((p) => p.muscle === muscle);
  if (!mine.length) return 110;
  return mine.reduce((s, p) => s + p.center[1], 0) / mine.length;
}
