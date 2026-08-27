import type { Muscle } from '../lib/types';

/* ────────────────────────────────────────────────────────────────────────────
 * Anatomía del mapa de calor
 *
 * Cada músculo es una pieza del cuerpo, no una mancha encima: el dibujo se
 * compone de estas piezas y se colorean ellas.
 *
 * La geometría **no** se escribe como curvas Bézier a mano. Ajustar puntos de
 * control a ciegas daba muñecos de jengibre: torsos sin cintura y brazos
 * despegados del hombro. En su lugar cada pieza se declara como una tabla de
 * anchuras a distintas alturas —«a la altura del pecho, de x=70 a x=150»— y
 * `shape()` genera el trazo suave que las une. Así la forma es un dato que se
 * lee y se corrige, no una ristra de números opacos.
 *
 * Lienzo de 220 × 470, proporción de ocho cabezas, eje del cuerpo en x = 110:
 * hombros en y≈95, cintura en y≈195, cadera en y≈255, rodilla en y≈360 y
 * tobillo en y≈445.
 * ──────────────────────────────────────────────────────────────────────── */

export const VIEW_W = 220;
export const VIEW_H = 470;
const AXIS = 110;

export type Piece = { muscle: Muscle | null; d: string };

/** Un corte horizontal: a la altura `y`, la pieza va de `l` a `r`. */
type Cut = [y: number, l: number, r: number];

type Pt = [number, number];

/**
 * Trazo cerrado y suave que pasa por una lista de puntos.
 *
 * Interpola con Catmull-Rom convertido a Bézier cúbica: da una curva que pasa
 * exactamente por cada punto declarado, que es justo lo que hace falta cuando
 * los puntos son medidas anatómicas y no aproximaciones.
 */
function smoothClosed(points: Pt[]): string {
  const n = points.length;
  if (n < 3) return '';
  const at = (i: number) => points[((i % n) + n) % n] as Pt;

  const parts: string[] = [`M${at(0)[0].toFixed(1)} ${at(0)[1].toFixed(1)}`];
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    parts.push(
      `C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`,
    );
  }
  return `${parts.join(' ')} Z`;
}

/**
 * Convierte una tabla de cortes en un contorno cerrado: baja por el borde
 * izquierdo y sube por el derecho.
 */
export function shape(cuts: Cut[]): string {
  const left: Pt[] = cuts.map(([y, l]) => [l, y]);
  const right: Pt[] = [...cuts].reverse().map(([y, , r]) => [r, y]);
  return smoothClosed([...left, ...right]);
}

/** Refleja una tabla de cortes respecto al eje del cuerpo. */
function mirrorCuts(cuts: Cut[]): Cut[] {
  return cuts.map(([y, l, r]) => [y, 2 * AXIS - r, 2 * AXIS - l]);
}

/** Una pieza y su reflejo. */
function both(muscle: Muscle | null, cuts: Cut[]): Piece[] {
  return [
    { muscle, d: shape(cuts) },
    { muscle, d: shape(mirrorCuts(cuts)) },
  ];
}

/* ── Contorno ────────────────────────────────────────────────────────────── */

/* La cabeza se dibuja algo más ancha que alta en su mitad superior y el
   cuello arranca por debajo de ella: con un óvalo largo y un anillo aparte, el
   cuello se leía como un collar. */
const HEAD: Cut[] = [
  [10, 98, 122],
  [22, 89, 131],
  [38, 88, 132],
  [52, 95, 125],
  [62, 102, 118],
];

const NECK: Cut[] = [
  [58, 100, 120],
  [72, 98, 122],
  [82, 91, 129],
];

/** Tronco: hombros anchos, cintura marcada y cadera que vuelve a abrir. */
const TORSO: Cut[] = [
  [78, 88, 132],
  [96, 74, 146],
  [120, 69, 151],
  [150, 71, 149],
  [175, 76, 144],
  [196, 79, 141],
  [222, 75, 145],
  [248, 70, 150],
  [262, 72, 148],
];

/** Brazo entero, del deltoides a la mano. */
const ARM: Cut[] = [
  [90, 57, 82],
  [118, 48, 79],
  [150, 46, 75],
  [178, 46, 73],
  [206, 47, 70],
  [238, 46, 66],
  [268, 47, 63],
  [292, 50, 63],
  [304, 53, 61],
];

/** Pierna entera, de la cadera al pie. */
const LEG: Cut[] = [
  [258, 71, 108],
  [290, 66, 108],
  [325, 67, 107],
  [356, 72, 104],
  [372, 76, 101],
  [400, 75, 100],
  [428, 78, 97],
  [448, 80, 96],
  [462, 76, 99],
];

export const SILHOUETTE = [
  shape(HEAD),
  shape(NECK),
  shape(TORSO),
  shape(ARM),
  shape(mirrorCuts(ARM)),
  shape(LEG),
  shape(mirrorCuts(LEG)),
].join(' ');

/* ── Vista frontal ───────────────────────────────────────────────────────── */

export const FRONT: Piece[] = [
  /* Trapecio superior: el puente del cuello al hombro. */
  ...both('espalda', [
    [79, 92, 108],
    [88, 82, 108],
    [97, 76, 106],
  ]),

  /* Deltoides anterior: la charretera sobre la cabeza del húmero. Termina
     donde empieza el bíceps, hacia un tercio del brazo. */
  ...both('hombro', [
    [92, 61, 82],
    [108, 50, 79],
    [126, 49, 77],
    [142, 55, 73],
  ]),

  /* Pectoral mayor: abanico del esternón a la axila, con el borde inferior
     marcado, que es lo que da su forma al pecho. */
  ...both('pecho', [
    [90, 84, 108],
    [104, 73, 108],
    [126, 71, 108],
    [146, 78, 108],
    [154, 90, 108],
  ]),

  /* Bíceps braquial, llenando el brazo. El antebrazo se queda en el gris del
     contorno: la app no lo mide y fingir que sí sería mentir. */
  ...both('biceps', [
    [146, 54, 74],
    [172, 48, 73],
    [198, 49, 71],
    [218, 55, 67],
  ]),

  /* Recto abdominal: cuatro pares de cuadros con el surco central marcado. */
  ...both('abdomen', [
    [156, 95, 108],
    [166, 94, 108],
    [174, 95, 108],
  ]),
  ...both('abdomen', [
    [180, 94, 108],
    [190, 93, 108],
    [198, 94, 108],
  ]),
  ...both('abdomen', [
    [204, 94, 108],
    [214, 94, 108],
    [222, 95, 108],
  ]),
  ...both('abdomen', [
    [228, 96, 108],
    [240, 97, 108],
    [252, 101, 108],
  ]),
  /* Oblicuo externo, flanqueando los cuadros. */
  ...both('abdomen', [
    [158, 84, 93],
    [186, 80, 92],
    [214, 83, 93],
    [232, 90, 96],
  ]),

  /* Cuádriceps en tres franjas: vasto lateral por fuera, recto femoral en el
     centro y el vasto medial en la lágrima de encima de la rodilla. */
  ...both('cuadriceps', [
    [262, 73, 89],
    [296, 68, 89],
    [330, 69, 88],
    [358, 75, 87],
  ]),
  ...both('cuadriceps', [
    [262, 90, 100],
    [300, 90, 101],
    [336, 90, 100],
    [362, 92, 99],
  ]),
  ...both('cuadriceps', [
    [332, 84, 99],
    [352, 82, 99],
    [372, 88, 97],
  ]),

  /* Aductores: la cara interna del muslo, arrancando ya por debajo de la
     ingle para no invadir el hueco entre las piernas. */
  ...both('aductor', [
    [272, 100, 107],
    [298, 100, 107],
    [324, 101, 106],
    [340, 103, 106],
  ]),

  /* De frente del gemelo solo asoma el vientre lateral. */
  ...both('gemelo', [
    [378, 78, 91],
    [400, 77, 90],
    [424, 80, 89],
  ]),
];

/* ── Vista posterior ─────────────────────────────────────────────────────── */

export const BACK: Piece[] = [
  /* Trapecio: el rombo que baja del cuello a la mitad de la espalda. */
  ...both('espalda', [
    [80, 93, 108],
    [93, 80, 108],
    [112, 86, 108],
    [132, 96, 108],
    [148, 103, 108],
  ]),

  /* Dorsal ancho: la V de la axila a la cintura. El borde interno se queda
     pegado a la columna y solo se mueve el externo; si se estrechan los dos,
     sale un reloj de arena en vez de un dorsal. */
  ...both('espalda', [
    [126, 84, 108],
    [148, 75, 108],
    [170, 78, 107],
    [190, 87, 105],
    [206, 96, 104],
  ]),

  /* Erectores espinales: los dos cordones lumbares, pegados a la columna. */
  ...both('espalda', [
    [210, 97, 108],
    [230, 96, 108],
    [250, 99, 108],
  ]),

  ...both('hombro', [
    [92, 61, 82],
    [108, 50, 79],
    [126, 49, 77],
    [142, 55, 73],
  ]),

  /* Tríceps: la masa posterior del brazo, más larga que el bíceps. */
  ...both('triceps', [
    [146, 53, 74],
    [174, 47, 73],
    [202, 48, 71],
    [222, 54, 67],
  ]),

  /* Glúteo mayor: acaba en el pliegue, no invade el muslo. */
  ...both('gluteo', [
    [250, 80, 108],
    [268, 74, 108],
    [288, 76, 108],
    [304, 88, 107],
  ]),

  /* Isquiotibiales: bíceps femoral por fuera, semitendinoso por dentro. */
  ...both('femoral', [
    [312, 72, 89],
    [340, 69, 89],
    [368, 73, 88],
    [388, 79, 87],
  ]),
  ...both('femoral', [
    [312, 91, 106],
    [340, 91, 106],
    [368, 91, 104],
    [388, 93, 101],
  ]),

  /* Gemelos: los dos vientres del gastrocnemio, que por detrás sí se ven. */
  ...both('gemelo', [
    [400, 76, 89],
    [420, 75, 89],
    [442, 79, 88],
  ]),
  ...both('gemelo', [
    [400, 91, 101],
    [420, 91, 101],
    [440, 92, 99],
  ]),
];
