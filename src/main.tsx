import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { restoreDemo } from './lib/demo';
import './index.css';

/* Antes del primer pintado: si se estaba viendo el ejemplo y se ha recargado,
   volver a ponerlo sin que se asome la app vacía por el camino. */
restoreDemo();

const root = document.getElementById('root');
if (root) createRoot(root).render(<StrictMode><App /></StrictMode>);

/**
 * El service worker es lo que hace que la app abra sin cobertura. Se registra
 * después de `load` para no competir con el primer pintado.
 *
 * Y avisa cuando hay versión nueva. Sin esto, un móvil que ya tenía la app
 * instalada seguía sirviendo la copia vieja de la caché indefinidamente: se
 * desplegaban cambios que no llegaban nunca a la pantalla.
 */
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    const base = import.meta.env.BASE_URL;
    void navigator.serviceWorker
      .register(`${base}sw.js`, { scope: base })
      .then((reg) => {
        const offer = (worker: ServiceWorker) => {
          worker.addEventListener('statechange', () => {
            /* `installed` con un controlador ya activo significa: hay una
               versión nueva esperando a que se libere la pestaña. */
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              window.dispatchEvent(
                new CustomEvent('app-update', { detail: () => worker.postMessage('skip-waiting') }),
              );
            }
          });
        };

        if (reg.waiting && navigator.serviceWorker.controller) {
          window.dispatchEvent(
            new CustomEvent('app-update', { detail: () => reg.waiting?.postMessage('skip-waiting') }),
          );
        }
        reg.addEventListener('updatefound', () => {
          if (reg.installing) offer(reg.installing);
        });

        /* Al tomar el control el worker nuevo, recargar una sola vez. */
        let reloaded = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (reloaded) return;
          reloaded = true;
          window.location.reload();
        });

        /* Buscar actualizaciones al volver a la app, no solo al arrancar. */
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') void reg.update();
        });
      })
      .catch(() => {
        /* Sin service worker la app sigue funcionando; solo pierde el modo
           sin conexión, así que no hay nada que avisar al usuario. */
      });
  });
}
