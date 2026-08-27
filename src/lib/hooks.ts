import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getStore, subscribe } from './storage';
import { elapsedSec, getTimer, resetAlert, ring, startRest, stopRest, subscribeTimer, takePending } from './timer';
import type { Store } from './types';

export function useStore(): Store {
  return useSyncExternalStore(subscribe, getStore, getStore);
}

/** Reloj compartido. `ms` marca cada cuánto se repinta; 0 lo apaga. */
export function useTick(ms: number): number {
  const [, force] = useState(0);
  useEffect(() => {
    if (ms <= 0) return;
    const id = setInterval(() => force((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
  return Date.now();
}

export type RestTimer = {
  running: boolean;
  elapsed: number;
  target: number;
  slot: { exIdx: number; setIdx: number } | null;
  start: (target: number, slot?: { exIdx: number; setIdx: number } | null) => void;
  stop: () => number;
  /** Descanso ya parado a mano y aún sin asignar a ninguna serie. */
  takePending: () => number | null;
};

export function useRestTimer(alertOnTarget: boolean): RestTimer {
  const snap = useSyncExternalStore(subscribeTimer, getTimer, getTimer);
  useTick(snap.startedAt ? 200 : 0);

  const elapsed = snap.startedAt ? elapsedSec() : 0;

  /* El aviso se dispara aquí y no dentro del render del cronómetro para que
     suene una sola vez aunque haya varios cronómetros en pantalla. */
  useEffect(() => {
    if (!alertOnTarget || !snap.startedAt) return;
    if (elapsed >= snap.target) ring();
  }, [alertOnTarget, snap.startedAt, snap.target, elapsed]);

  const start = useCallback((target: number, slot: { exIdx: number; setIdx: number } | null = null) => {
    resetAlert();
    startRest(target, slot);
  }, []);

  const stop = useCallback(() => {
    resetAlert();
    return stopRest();
  }, []);

  return { running: !!snap.startedAt, elapsed, target: snap.target, slot: snap.slot, start, stop, takePending };
}

/* ── Rutas ───────────────────────────────────────────────────────────────── */

function currentPath(): string {
  const h = window.location.hash.replace(/^#/, '');
  return h || '/';
}

export function useRoute(): [string, (to: string, replace?: boolean) => void] {
  const path = useSyncExternalStore(
    (fn) => {
      window.addEventListener('hashchange', fn);
      return () => window.removeEventListener('hashchange', fn);
    },
    currentPath,
    () => '/',
  );

  const navigate = useCallback((to: string, replace = false) => {
    const next = `#${to}`;
    if (window.location.hash === next) return;
    if (replace) window.history.replaceState(null, '', next);
    else window.location.hash = to;
    if (replace) window.dispatchEvent(new HashChangeEvent('hashchange'));
  }, []);

  return [path, navigate];
}

/* ── Pantalla encendida ──────────────────────────────────────────────────── */

type WakeLock = { release: () => Promise<void> };

/**
 * Mantiene la pantalla encendida mientras hay un entreno abierto. El bloqueo
 * se pierde al minimizar, así que hay que volver a pedirlo al recuperar el
 * foco; sin eso se apaga a mitad de la serie.
 */
export function useKeepAwake(enabled: boolean): void {
  const lock = useRef<WakeLock | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLock> } };
    if (!nav.wakeLock) return;

    let cancelled = false;
    const acquire = async () => {
      try {
        const l = await nav.wakeLock!.request('screen');
        if (cancelled) void l.release();
        else lock.current = l;
      } catch {
        /* el navegador lo deniega (batería baja, pestaña oculta): no pasa nada */
      }
    };

    void acquire();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock.current?.release();
      lock.current = null;
    };
  }, [enabled]);
}

/** Vibración corta de confirmación. Silencioso donde no exista. */
export function haptic(pattern: number | number[] = 12): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* sin motor de vibración */
  }
}
