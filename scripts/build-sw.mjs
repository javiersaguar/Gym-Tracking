/**
 * Genera el service worker con la lista exacta de archivos del build.
 *
 * Se escribe después de `vite build` porque los nombres llevan hash: no hay
 * forma de saberlos antes. La lista se precachea entera en la instalación,
 * así que la app abre sin conexión desde la primera visita, no solo desde la
 * segunda.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const base = process.env.BASE_PATH ?? '/';

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

const files = (await walk(dist))
  .map((f) => relative(dist, f).split('\\').join('/'))
  .filter((f) => f !== 'sw.js' && !f.endsWith('.map'))
  .sort();

const assets = files.map((f) => `${base}${f}`);

/* La versión del caché es el hash del contenido: si nada cambia, el
   navegador no revalida nada; si cambia un byte, se instala un caché nuevo y
   el viejo se borra en `activate`. */
const version = createHash('sha256')
  .update(await Promise.all(files.map((f) => readFile(join(dist, f)))).then((bufs) => Buffer.concat(bufs)))
  .digest('hex')
  .slice(0, 12);

const sw = `/* Generado por scripts/build-sw.mjs. No editar a mano. */
const VERSION = '${version}';
const CACHE = 'gym-tracking-' + VERSION;
const BASE = '${base}';
const SHELL = ${JSON.stringify(assets, null, 2)};

self.addEventListener('install', (event) => {
  /* Se precachea todo el build de golpe: la app tiene que poder abrirse sin
     conexión desde la primera visita, no desde la segunda.
     NO se llama a skipWaiting aquí: cambiar los archivos por debajo de una
     pestaña abierta rompe la sesión en curso. Espera a que la app avise. */
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  /* Navegación: se responde desde el caché al instante y se revalida por
     detrás. Ir a la red primero significaría que en el gimnasio, con una
     barra de cobertura, la app tarda en abrir por esperar un tiempo de
     espera que va a fallar igualmente. */
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match(BASE + 'index.html').then((cached) => {
        const fresh = fetch(request)
          .then((res) => {
            if (res.ok) caches.open(CACHE).then((c) => c.put(BASE + 'index.html', res.clone()));
            return res;
          })
          .catch(() => cached);
        return cached || fresh;
      }),
    );
    return;
  }

  /* Los assets llevan hash en el nombre: si está en el caché es el correcto
     y no hace falta preguntar a la red nunca. */
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => cached ?? Response.error());
    }),
  );
});
`;

await writeFile(join(dist, 'sw.js'), sw);
console.log(`sw.js generado · ${assets.length} archivos precacheados · versión ${version}`);
