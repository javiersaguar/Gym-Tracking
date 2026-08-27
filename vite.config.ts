import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

/**
 * La app se despliega en GitHub Pages bajo /<repo>/, pero en local y en
 * cualquier host propio cuelga de la raíz. `BASE_PATH` lo decide en build;
 * el service worker lee el mismo valor para no cachear rutas equivocadas.
 */
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    cssMinify: 'lightningcss',
  },
});
