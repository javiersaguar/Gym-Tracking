import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { haptic } from '../lib/hooks';
import { Mark } from './Wordmark';
import { cx } from './ui';

/* Iconos propios, todos con el mismo trazo de 1,7 y las mismas terminaciones.
   Un set mezclado de varias librerías se nota aunque no se sepa por qué. */
const ICONS: Record<string, ReactNode> = {
  hoy: (
    <>
      <rect x="3.6" y="5" width="16.8" height="15.4" rx="2.6" />
      <path d="M3.6 9.4h16.8M8 3.2v3.4M16 3.2v3.4" strokeLinecap="round" />
      <path d="M8.2 13.6h3.1M8.2 16.8h6.4" strokeLinecap="round" />
    </>
  ),
  progreso: (
    <>
      <path d="M3.8 20.2V3.8" strokeLinecap="round" />
      <path d="M3.8 20.2h16.4" strokeLinecap="round" />
      <path d="M7.6 15.8l3.7-4.6 3.1 2.7 4.4-6.2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  historial: (
    <>
      <path d="M3.9 12a8.1 8.1 0 108.1-8.1 8 8 0 00-5.9 2.6" strokeLinecap="round" />
      <path d="M12 7.9V12l2.9 1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.2 4.2v3.6h3.6" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  rutina: (
    <>
      <path d="M7.2 4.6v14.8M16.8 4.6v14.8" strokeLinecap="round" />
      <path d="M3.4 8.4v7.2M20.6 8.4v7.2" strokeLinecap="round" />
      <path d="M7.2 12h9.6" strokeLinecap="round" />
    </>
  ),
  registro: (
    <>
      <rect x="4.2" y="3.4" width="15.6" height="17.2" rx="2.4" />
      <path d="M8 8h8M8 12h8M8 16h5" strokeLinecap="round" />
    </>
  ),
};

export type NavItem = { path: string; label: string; icon: keyof typeof ICONS };

export const NAV: NavItem[] = [
  { path: '/hoy', label: 'Hoy', icon: 'hoy' },
  { path: '/progreso', label: 'Progreso', icon: 'progreso' },
  { path: '/registro', label: 'Registro', icon: 'registro' },
  { path: '/historial', label: 'Análisis', icon: 'historial' },
  { path: '/rutina', label: 'Rutina', icon: 'rutina' },
];

/**
 * Barra superior de las pantallas internas. La marca es el camino de vuelta a
 * la portada: sin ella, entrar en una sección sería un callejón sin salida.
 */
export function TopBar({ onHome, title }: { onHome: () => void; title?: string }) {
  return (
    <div className="chrome safe-top sticky top-0 z-30 -mx-6 mb-6 border-b border-line px-6 pb-2.5">
      <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
        <button
          onClick={() => {
            haptic(8);
            onHome();
          }}
          aria-label="Volver a la portada"
          className="pressable -ml-1.5 flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-sunken"
        >
          <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 text-ink-faint" fill="none" stroke="currentColor" strokeWidth="1.9">
            <path d="M11.5 4.5L6 10l5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <Mark className="h-4 w-4 text-accent" />
        </button>
        {title && <span className="truncate text-caption font-medium text-ink-muted">{title}</span>}
        <span className="w-9" />
      </div>
    </div>
  );
}

/**
 * Barra inferior translúcida con el contenido pasando por debajo. Los nombres
 * son concretos («Progreso», «Rutina») y no paraguas vagos: así se puede
 * predecir qué hay detrás sin entrar.
 */
export function BottomNav({
  path,
  onNavigate,
  hidden,
}: {
  path: string;
  onNavigate: (to: string) => void;
  hidden?: boolean;
}) {
  return (
    <motion.nav
      initial={false}
      animate={{ y: hidden ? 96 : 0 }}
      transition={{ type: 'spring', bounce: 0, duration: 0.34 }}
      className="chrome fixed inset-x-0 bottom-0 z-40 border-t border-line"
      aria-hidden={hidden}
    >
      <ul className="safe-bottom mx-auto flex max-w-lg items-stretch px-1.5 pt-2">
        {NAV.map((item) => {
          const active = path === item.path;
          return (
            <li key={item.path} className="flex-1">
              <button
                onClick={() => {
                  if (!active) haptic(8);
                  onNavigate(item.path);
                }}
                tabIndex={hidden ? -1 : undefined}
                aria-current={active ? 'page' : undefined}
                className="group relative flex w-full flex-col items-center gap-1.5 rounded-md px-1 pb-1 pt-1.5"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  className={cx(
                    'h-[19px] w-[19px] transition-colors duration-panel',
                    active ? 'text-accent' : 'text-ink-faint group-hover:text-ink-muted',
                  )}
                >
                  {ICONS[item.icon]}
                </svg>
                <span
                  className={cx(
                    'text-micro transition-colors duration-panel',
                    active ? 'font-semibold text-ink' : 'text-ink-faint group-hover:text-ink-muted',
                  )}
                >
                  {item.label}
                </span>
                {/* Un subrayado corto marca la pestaña activa: se lee de un
                    vistazo y no mete otra caja de color en la barra. */}
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    transition={{ type: 'spring', bounce: 0.18, duration: 0.4 }}
                    className="absolute -top-2 h-[2px] w-7 rounded-full bg-accent"
                  />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </motion.nav>
  );
}
