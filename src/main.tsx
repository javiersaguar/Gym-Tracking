import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const root = document.getElementById('root');
if (root) createRoot(root).render(<StrictMode><App /></StrictMode>);

/* El service worker es lo que hace que la app abra sin cobertura. Se registra
   después de `load` para no competir con el primer pintado. */
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    const base = import.meta.env.BASE_URL;
    void navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => {
      /* Sin service worker la app sigue funcionando; solo pierde el modo
         sin conexión, así que no hay nada que avisar al usuario. */
    });
  });
}
