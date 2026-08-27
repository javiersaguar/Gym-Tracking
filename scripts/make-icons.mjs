/**
 * Rasteriza los iconos PNG a partir del SVG.
 *
 * Chrome se conforma con el SVG, pero iOS necesita un PNG para el icono de la
 * pantalla de inicio y Android quiere una versión «maskable» con margen para
 * poder recortarla en círculo sin comerse la barra.
 *
 * Se ejecuta a mano (`npm run icons`) y los PNG se suben al repo: así el
 * build no depende de sharp ni de que la rasterización salga igual en cada
 * máquina.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../public/', import.meta.url));
const svg = await readFile(`${root}icon.svg`);

for (const size of [180, 192, 512]) {
  await writeFile(`${root}icon-${size}.png`, await sharp(svg, { density: 384 }).resize(size, size).png().toBuffer());
}

/* Maskable: el mismo dibujo al 62 % sobre el fondo, para que quepa entero
   dentro de la «zona segura» circular que recorta Android. */
const inner = await sharp(svg, { density: 384 }).resize(318, 318).png().toBuffer();
await writeFile(
  `${root}icon-maskable-512.png`,
  await sharp({ create: { width: 512, height: 512, channels: 4, background: '#05070C' } })
    .composite([{ input: inner, gravity: 'center' }])
    .png()
    .toBuffer(),
);

console.log('Iconos generados en public/');
