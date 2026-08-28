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
  /**
   * Luz propia de cada vértice, de 0 a 1, que multiplica al color del músculo.
   *
   * Va oscura en el borde del parche y clara en el vientre. Es una sombra de
   * contacto barata: sin ella los músculos son manchas planas pegadas unas a
   * otras, y con ella cada uno se despega de la piel y de sus vecinos aunque
   * el mapa de calor les dé a los dos el mismo color.
   */
  shade: Float32Array;
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
  /** Punto del eje bajo (u, deg): dice hacia dónde mira la normal. */
  core(u: number, deg: number): Vec3;
  /** Rango útil de `u`, para convertir alturas en fracciones. */
  range: [number, number];
};

/**
 * La misma superficie con los ejes cambiados: el ángulo pasa a ser la
 * coordenada larga y la altura la de alrededor.
 *
 * Sirve para los músculos en abanico. Un parche normal tiene los bordes de
 * arriba y de abajo horizontales, así que el pectoral salía como tres franjas
 * apiladas; girando los ejes, sus divisiones pueden bajar según se alejan del
 * esternón, que es como convergen de verdad las fibras hacia el húmero.
 */
function swapped(s: Surface): Surface {
  return {
    range: [-180, 180],
    at: (deg, u) => s.at(u, deg),
    core: (deg, u) => s.core(u, deg),
  };
}

/** Normal hacia fuera, por diferencias finitas sobre la propia superficie. */
function normalAt(s: Surface, u: number, deg: number): Vec3 {
  const span = s.range[1] - s.range[0];
  const du = span * 0.004;
  const p = s.at(u, deg);
  const tu = sub(s.at(clamp(u + du, s.range[0], s.range[1]), deg), s.at(clamp(u - du, s.range[0], s.range[1]), deg));
  const tv = sub(s.at(u, deg + 2), s.at(u, deg - 2));
  let n = norm(cross(tv, tu));
  if (dot(n, sub(p, s.core(u, deg))) < 0) n = mul(n, -1);
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
  /* El tronco se afila por arriba hasta meterse dentro del cuello: si acaba
     más ancho que él, su borde superior asoma como un cuello de camisa. */
  [149, 16.0, 9.2, 10.0],
  [152, 12.6, 8.0, 8.8],
  [155, 8.0, 5.6, 6.2],
  [156.5, 5.0, 4.0, 4.4],
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
  [143, 9.6, 8.8, 9.4],
  [148, 7.0, 6.6, 7.0],
  [152, 6.0, 5.8, 6.2],
  [156, 5.9, 5.9, 6.3],
  [160, 6.8, 6.8, 7.2],
];

const ARM_AXIS: Vec3[] = [
  [14.6, 152, 0],
  [19.2, 130, -0.5],
  [21.5, 112, -1],
  [23.0, 98, 0],
  [24.0, 86, 1],
  [25.0, 70, 1.5],
];

/* [t, radio, achatamiento delante-detrás] — el hombro es lo más grueso, la
   muñeca lo más fino, y la mano se aplana para no ser un cono. */
const ARM_RADII: number[][] = [
  [0.0, 3.6, 1.0],
  [0.05, 7.0, 1.0],
  [0.12, 7.7, 1.0],
  [0.2, 7.0, 1.0],
  [0.29, 5.9, 1.0],
  [0.38, 4.9, 0.98],
  [0.44, 4.3, 0.92],
  [0.52, 4.9, 0.94],
  [0.6, 5.1, 0.9],
  [0.7, 4.1, 0.82],
  [0.79, 2.9, 0.7],
  [0.86, 3.8, 0.5],
  [0.94, 3.5, 0.45],
  [1.0, 2.1, 0.5],
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
  /** Cuánto se levanta sobre la piel. */
  amp?: number;
  /**
   * Pliegue en vez de músculo: la línea alba, el canal de la columna, el
   * ombligo, el hueco del codo.
   *
   * Se apoyan sobre la piel casi sin relieve y van oscuros hacia el centro, al
   * revés que un músculo. Hundirlos de verdad no servía: un parche metido
   * hacia dentro queda por detrás de la propia piel y no se ve nada. Lo que se
   * veía era la junta clara entre los dos lados del cuerpo, que es justo lo
   * contrario de una sombra.
   */
  groove?: boolean;
  deep?: boolean;
  /** Pieza que va sobre el eje del cuerpo y no se refleja. */
  single?: boolean;
  /** Recorte en abanico: las filas van por ángulo y dan tramos de altura. */
  swap?: boolean;
  /**
   * Forma del relieve, de 0 a 1. Bajo aplana el parche como una lámina —el
   * dorsal, el trapecio, el serrato— y alto lo redondea como un vientre —el
   * bíceps, el gemelo, el deltoides—. Con un solo valor para todos, el cuerpo
   * salía acolchado.
   */
  round?: number;
};

/* Los músculos profundos se separan de la piel más de lo que les tocaría: en
   el mapa de detalle se dibujan por encima del que los tapa. Sus recortes son
   además más pequeños que los de ese músculo y quedan encajados dentro, como
   la ventana de una lámina de anatomía: así se ven los dos, y no uno tapando
   al otro por completo. */
const DEEP_LIFT = 1.9;

/* Perfil del abombado: lleno en el centro y a cero en los bordes, para que el
   parche nazca de la piel y no se vea el escalón del recorte. El exponente
   decide si el músculo es una lámina o un vientre. */
const bulge = (x: number, round: number) => Math.sin(Math.PI * clamp(x, 0, 1)) ** (1.15 - round * 0.95);

/**
 * Hendidura entre músculos.
 *
 * Los recortes se escriben pegados unos a otros, y así dos músculos vecinos con
 * colores parecidos se funden en una mancha. Encogiendo cada parche un pelo por
 * los cuatro lados asoma la piel entre ellos como una línea fina, que es lo que
 * separa los músculos en las láminas de anatomía.
 */
const INSET_DEG = 2.2;
const INSET_U = 0.025;

/** Curva en S entre dos umbrales, para que la sombra del borde no dé un corte. */
function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a || 1), 0, 1);
  return t * t * (3 - 2 * t);
}

function buildPatch(s: Spec, index: number, side: 1 | -1, nu = 9, nv = 12): Part {
  const on = s.swap ? swapped(s.on) : s.on;
  const rows = s.rows;
  const span = at(rows, rows.length - 1)[0] - at(rows, 0)[0];
  const u0 = at(rows, 0)[0] + span * INSET_U;
  const u1 = at(rows, rows.length - 1)[0] - span * INSET_U;
  const amp = s.amp ?? 1.0;
  const round = s.round ?? 0.5;

  let cx = 0;
  let cy = 0;
  let cz = 0;
  const shade = new Float32Array((nu + 1) * (nv + 1));
  const mesh = grid(nu, nv, (i, j) => {
    const fu = i / nu;
    const u = u0 + (u1 - u0) * fu;
    const a0 = track(rows, u, 1);
    const b0 = track(rows, u, 2);
    const gap = s.groove ? 0 : Math.min(s.swap ? 0.9 : INSET_DEG, Math.abs(b0 - a0) * 0.18);
    const a = a0 + gap;
    const b = b0 - gap;
    const fv = j / nv;
    const deg = a + (b - a) * fv;
    const p = on.at(u, deg);
    const n = normalAt(on, u, deg);
    const h = (s.deep ? DEEP_LIFT : 0) + amp * bulge(fu, round) * bulge(fv, round);
    const out = add(p, mul(n, h)) as Vec3;
    const edge = Math.min(Math.min(fu, 1 - fu), Math.min(fv, 1 - fv)) * 2;
    shade[i * (nv + 1) + j] = s.groove
      ? 1 - 0.34 * smoothstep(0, 0.55, edge)
      : 0.82 + 0.18 * smoothstep(0, 0.26, edge);
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
    shade,
    id: `${s.head ?? 'piel'}-${index}#${side}`,
    muscle: s.muscle,
    head: s.head,
    deep: s.deep ?? false,
    center,
  };
}

const T = (head: string | null, muscle: Muscle | null, rows: Row[], extra: Partial<Spec> = {}): Spec =>
  ({ head, muscle, on: TORSO, rows, amp: 1.63, ...extra });
const A = (head: string | null, muscle: Muscle | null, rows: Row[], extra: Partial<Spec> = {}): Spec =>
  ({ head, muscle, on: ARM, rows, amp: 1.32, ...extra });
const L = (head: string | null, muscle: Muscle | null, rows: Row[], extra: Partial<Spec> = {}): Spec =>
  ({ head, muscle, on: LEG, rows, amp: 1.55, ...extra });
const N = (head: string | null, muscle: Muscle | null, rows: Row[], extra: Partial<Spec> = {}): Spec =>
  ({ head, muscle, on: NECK, rows, amp: 0.8, ...extra });

const SPECS: Spec[] = [
  /* ── Tronco, delante ───────────────────────────────────────────────────── */
  /* Pectoral en abanico: las filas van por ángulo y dan tramos de altura, de
     modo que las tres porciones bajan según se alejan del esternón y
     convergen en el tendón del húmero, que es como van las fibras. Con filas
     por altura salían tres franjas horizontales apiladas. */
  T('pecho.clavicular', 'pecho', [
    [4, 143, 150.5], [26, 141, 149], [46, 138, 145], [62, 136, 141],
  ], { swap: true, round: 0.2, amp: 2.33 }),
  T('pecho.esternal', 'pecho', [
    [4, 133, 143], [26, 132, 141], [46, 131, 138], [62, 132, 136],
  ], { swap: true, round: 0.25, amp: 2.79 }),
  T('pecho.abdominal', 'pecho', [
    [5, 126, 133], [26, 125, 132], [44, 126, 131], [58, 129, 132],
  ], { swap: true, round: 0.2, amp: 2.25 }),

  /* Recto abdominal: la banda pegada a la línea alba. */
  /* El recto va en cuatro bloques por lado, no en una tira: las
     intersecciones tendinosas son lo que hace que un abdomen parezca un
     abdomen, y una banda lisa de veinticinco centímetros no lo parece. */
  T('abdomen.recto', 'abdomen', [[102, 5, 24], [105, 4, 30], [107.6, 4, 29]], { round: 0.85, amp: 1.3 }),
  T('abdomen.recto', 'abdomen', [[108.8, 4, 30], [112, 3, 32], [114.6, 3, 31]], { round: 0.85, amp: 1.45 }),
  T('abdomen.recto', 'abdomen', [[115.8, 3, 31], [119, 3, 33], [121.4, 3, 32]], { round: 0.85, amp: 1.5 }),
  T('abdomen.recto', 'abdomen', [[122.6, 3, 32], [125, 3, 32], [127.4, 4, 29]], { round: 0.85, amp: 1.4 }),
  T('abdomen.oblicuo', 'abdomen', [[103, 32, 74], [110, 33, 88], [118, 35, 84], [126, 36, 66]]),
  T('abdomen.serrato', 'abdomen', [[119, 64, 84], [125, 62, 88], [131, 64, 84]], { round: 0.15, amp: 1.24 }),
  T('abdomen.transverso', 'abdomen', [[107, 14, 42], [113, 12, 46], [118, 15, 41]], { round: 0.15, amp: 0.78, deep: true }),

  /* Esternocleidomastoideo: los dos cordones que bajan de detrás de la oreja
     al esternón. No se miden, pero sin ellos el cuello es un tubo y la unión
     con la cabeza —que está arriba del todo y se mira siempre— canta. */
  N(null, null, [[152, 5, 21], [156, 13, 31], [159.4, 24, 42]], { amp: 1.15, round: 0.85 }),

  /* ── Tronco, espalda ───────────────────────────────────────────────────── */
  T('espalda.erectores', 'espalda', [[100, 164, 180], [110, 161, 180], [122, 167, 180]], { amp: 1.4 }),
  T('espalda.romboides', 'espalda', [[134, 151, 173], [137, 148, 176], [140, 152, 173]], { round: 0.15, amp: 0.85, deep: true }),
  /* Dorsal: arriba es solo el pliegue de la axila y abajo se abre hacia la
     columna. Los bordes de la espalda se reparten el territorio en vez de
     pisarse —cuando dos parches ocupan el mismo sitio gana el que más abulta,
     y el dorsal se estaba tragando entero al trapecio—, así que su borde
     interno sigue al borde externo del trapecio, capa por capa. */
  T('espalda.dorsal', 'espalda', [
    [101, 138, 176], [108, 124, 171], [115, 110, 166], [122, 100, 160], [130, 95, 146], [136, 94, 136], [142, 98, 130],
  ], { amp: 1.78 }),
  T('espalda.trapecio-inf', 'espalda', [[118, 170, 180], [125, 154, 180], [132, 139, 180]], { round: 0.15, amp: 1.24 }),
  T('espalda.trapecio-med', 'espalda', [[132, 139, 180], [137, 131, 180], [142, 149, 180]], { round: 0.15, amp: 1.4 }),
  /* El superior y el medio se pisaban cerca de la columna y el solapamiento
     hacía un galón brillante en la nuca; ahora comparten borde. */
  T('espalda.trapecio-sup', 'espalda', [
    [142, 149, 180], [146, 122, 180], [150, 86, 180], [153, 70, 180], [155.4, 104, 180],
  ], { round: 0.15, amp: 1.55 }),
  T('espalda.redondo', 'espalda', [[140, 100, 126], [144, 96, 130], [148, 101, 124]], { amp: 1.32 }),

  /* ── Glúteo ────────────────────────────────────────────────────────────── */
  T('gluteo.menor', 'gluteo', [[102, 96, 118], [105.5, 93, 121], [109, 97, 117]], { round: 0.15, amp: 0.78, deep: true }),
  T('gluteo.medio', 'gluteo', [[100, 84, 130], [106, 78, 134], [112, 92, 128]], { round: 0.85, amp: 1.4 }),
  T('gluteo.mayor', 'gluteo', [[83, 116, 176], [90, 108, 180], [98, 112, 180], [104, 132, 180]], { round: 0.85, amp: 2.02 }),

  /* ── Hombro ────────────────────────────────────────────────────────────── */
  A('hombro.anterior', 'hombro', [[0.03, -55, 22], [0.11, -55, 25], [0.2, -48, 20], [0.3, -30, 5]], { round: 0.85, amp: 1.71 }),
  A('hombro.lateral', 'hombro', [[0.03, 22, 112], [0.11, 25, 115], [0.2, 20, 108], [0.32, 5, 85]], { round: 0.85, amp: 1.86 }),
  A('hombro.posterior', 'hombro', [[0.03, 112, 196], [0.11, 115, 198], [0.2, 108, 190], [0.3, 85, 170]], { round: 0.85, amp: 1.71 }),

  /* ── Brazo ─────────────────────────────────────────────────────────────── */
  A('biceps.larga', 'biceps', [[0.17, 8, 52], [0.26, 4, 56], [0.35, 2, 52], [0.43, 6, 42]], { round: 0.85, amp: 1.71 }),
  A('biceps.corta', 'biceps', [[0.17, -50, 8], [0.26, -56, 4], [0.35, -52, 2], [0.43, -42, 6]], { round: 0.85, amp: 1.55 }),
  A('biceps.braquial', 'biceps', [[0.3, 52, 78], [0.36, 50, 82], [0.42, 46, 80], [0.47, 44, 74]], { amp: 1.08 }),
  A('triceps.larga', 'triceps', [[0.1, 130, 190], [0.2, 128, 196], [0.31, 126, 192], [0.4, 130, 182]], { round: 0.85, amp: 1.71 }),
  A('triceps.lateral', 'triceps', [[0.1, 82, 130], [0.2, 78, 128], [0.31, 80, 126], [0.4, 88, 130]], { round: 0.85, amp: 1.55 }),
  A('triceps.medial', 'triceps', [[0.36, 104, 136], [0.41, 100, 142], [0.47, 106, 138]], { amp: 1.08 }),
  /* Antebrazo: la app no lo mide, pero un antebrazo liso canta a muñeco. Son
     tres masas —extensora por fuera, flexora por dentro y el braquiorradial
     haciendo cresta desde el codo— y las tres se afilan hacia la muñeca, que
     es de donde sale la forma del antebrazo. */
  A(null, null, [[0.47, 44, 148], [0.58, 40, 152], [0.68, 46, 146], [0.78, 58, 132]], { amp: 1.05, round: 0.7 }),
  A(null, null, [[0.47, -138, 42], [0.58, -142, 38], [0.68, -134, 44], [0.78, -120, 56]], { amp: 1.05, round: 0.7 }),
  A(null, null, [[0.45, 36, 76], [0.54, 32, 74], [0.64, 36, 70], [0.74, 44, 66]], { amp: 0.75, round: 0.85 }),

  /* Mano: el pulgar por dentro y dos hendiduras que insinúan los dedos. A
     tamaño de pantalla son cuatro píxeles, pero al ampliar sobre el brazo la
     diferencia entre una mano y una paleta se nota. */
  A(null, null, [[0.84, -128, -58], [0.89, -132, -54], [0.94, -124, -62]], { amp: 1.1, round: 0.9 }),
  A(null, null, [[0.9, -46, -36], [0.96, -48, -38], [1.0, -46, -36]], { amp: 0.1, groove: true }),
  A(null, null, [[0.9, -5, 5], [0.96, -6, 6], [1.0, -5, 5]], { amp: 0.1, groove: true }),
  A(null, null, [[0.9, 36, 46], [0.96, 38, 48], [1.0, 36, 46]], { amp: 0.1, groove: true }),

  /* ── Muslo ─────────────────────────────────────────────────────────────── */
  L('cuadriceps.vasto-intermedio', 'cuadriceps', [[0.13, -12, 12], [0.25, -14, 14], [0.37, -12, 12]], { round: 0.15, amp: 0.78, deep: true }),
  L('cuadriceps.recto', 'cuadriceps', [[0.02, -26, 26], [0.16, -24, 26], [0.32, -22, 24], [0.44, -20, 20]], { round: 0.85, amp: 1.63 }),
  L('cuadriceps.vasto-lateral', 'cuadriceps', [[0.02, 26, 76], [0.14, 24, 82], [0.3, 22, 80], [0.44, 20, 62]], { round: 0.85, amp: 1.78 }),
  L('cuadriceps.vasto-medial', 'cuadriceps', [[0.2, -60, -24], [0.32, -66, -22], [0.4, -70, -20], [0.47, -58, -18]], { round: 0.85, amp: 1.71 }),
  L('aductor.largo', 'aductor', [[0.0, -85, -60], [0.1, -88, -58], [0.24, -86, -62]], { amp: 1.4 }),
  L('aductor.gracil', 'aductor', [[0.03, -106, -86], [0.24, -108, -88], [0.45, -104, -86]], { amp: 1.08 }),
  L('aductor.mayor', 'aductor', [[0.0, -150, -106], [0.12, -152, -108], [0.28, -148, -106]], { amp: 1.47 }),

  /* ── Isquiotibiales ────────────────────────────────────────────────────── */
  L('femoral.biceps', 'femoral', [[0.06, 100, 150], [0.2, 96, 152], [0.34, 98, 150], [0.45, 104, 146]], { round: 0.85, amp: 1.71 }),
  L('femoral.semitendinoso', 'femoral', [[0.06, 152, 200], [0.2, 154, 205], [0.34, 152, 202], [0.45, 150, 196]], { round: 0.85, amp: 1.55 }),
  L('femoral.semimembranoso', 'femoral', [[0.16, 200, 224], [0.3, 202, 228], [0.46, 198, 220]], { amp: 1.24 }),

  /* ── Pierna ────────────────────────────────────────────────────────────── */
  L('gemelo.gastro-lateral', 'gemelo', [[0.52, 108, 178], [0.6, 100, 178], [0.7, 104, 178], [0.79, 116, 176]], { round: 0.85, amp: 1.71 }),
  L('gemelo.gastro-medial', 'gemelo', [[0.52, 182, 252], [0.6, 182, 260], [0.7, 182, 256], [0.8, 184, 244]], { round: 0.85, amp: 1.86 }),
  L('gemelo.soleo', 'gemelo', [[0.78, 96, 264], [0.87, 108, 252], [0.95, 122, 238]], { amp: 1.16 }),
  L(null, null, [[0.52, -60, 10], [0.66, -56, 6], [0.82, -50, 0]], { amp: 0.93 }),

  /* ── Accidentes de la piel ─────────────────────────────────────────────── */
  /* Ni músculo ni relleno: los pliegues y los huesos que el ojo espera ver.
     Los pliegues se apoyan en la piel y se oscurecen hacia el centro; la
     clavícula y la rótula, al revés, sobresalen y se aclaran. Sin ellos la
     figura es correcta y parece un maniquí. */
  T(null, null, [[102, -5.5, 5.5], [116, -5, 5], [127, -4.6, 4.6]], { amp: 0.12, groove: true, single: true }),
  T(null, null, [[119, -5, 5], [132, -4.6, 4.6], [145, -5.4, 5.4]], { amp: 0.12, groove: true, single: true }),
  T(null, null, [[100, 174.5, 185.5], [124, 174, 186], [150, 174.5, 185.5]], { amp: 0.12, groove: true, single: true }),
  T(null, null, [[83, 174, 186], [92, 173, 187], [103, 174, 186]], { amp: 0.12, groove: true, single: true }),
  /* Clavícula: el hueso que remata el pecho por arriba. */
  T(null, null, [[150, 12, 30], [151.4, 12, 42], [152.6, 18, 46]], { amp: 0.42 }),
  /* Cresta ilíaca y hueco del ombligo. */
  T(null, null, [[106, 30, 62], [110, 34, 66], [113, 42, 68]], { amp: 0.12, groove: true }),
  T(null, null, [[117.5, -4, 4], [120, -5.5, 5.5], [122.5, -4, 4]], { amp: 0.12, groove: true, single: true }),
  /* Rótula y hueco del codo. */
  L(null, null, [[0.53, -26, 26], [0.57, -30, 30], [0.62, -24, 24]], { amp: 0.7 }),
  A(null, null, [[0.44, 158, 202], [0.48, 152, 208], [0.53, 158, 202]], { amp: 0.12, groove: true }),
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
    tube(TORSO, 74.5, 156.2, 36),
    tube(NECK, 143.5, 159.8, 10, 24),
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
  return SPECS.flatMap((s, i) => (s.single ? [buildPatch(s, i, 1)] : [buildPatch(s, i, 1), buildPatch(s, i, -1)]));
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
export function bestYaw(parts: Part[], muscle: Muscle | null, head?: string | null): number {
  const mine = parts.filter((p) => (head ? p.head === head : p.muscle === muscle));
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
