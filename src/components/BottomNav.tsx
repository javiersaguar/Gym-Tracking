import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { haptic } from '../lib/hooks';
import { cx } from './ui';

/* Los iconos van de una sola pieza y con el mismo grosor de trazo: un set
   mezclado se nota aunque no se sepa por qué. */
const ICONS: Record<string, ReactNode> = {
  hoy: (
    <>
      <path d="M4 8.5h16M7 3.5v3M17 3.5v3" strokeLinecap="round" />
      <rect x="4" y="5" width="16" height="15.5" rx="3" />
      <path d="M8.4 13.5h3.2M8.4 17h6.6" strokeLinecap="round" />
    </>
  ),
  progreso: (
    <>
      <path d="M4 19.5V4.5" strokeLinecap="round" />
      <path d="M4 19.5h16" strokeLinecap="round" />
      <path d="M7.5 15.5l3.6-4.4 3 2.6 4.4-6" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  historial: (
    <>
      <circle cx="12" cy="12.5" r="7.8" />
      <path d="M12 8.4v4.3l2.8 1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.6 6.5l1 3.4 3.4-1" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  rutina: (
    <>
      <path d="M6.5 9v6M17.5 9v6" strokeLinecap="round" />
      <rect x="2.6" y="8.2" width="3.9" height="7.6" rx="1.4" />
      <rect x="17.5" y="8.2" width="3.9" height="7.6" rx="1.4" />
      <path d="M6.5 12h11" strokeLinecap="round" />
    </>
  ),
};

export type NavItem = { path: string; label: string; icon: keyof typeof ICONS };

export const NAV: NavItem[] = [
  { path: '/', label: 'Hoy', icon: 'hoy' },
  { path: '/progreso', label: 'Progreso', icon: 'progreso' },
  { path: '/historial', label: 'Historial', icon: 'historial' },
  { path: '/rutina', label: 'Rutina', icon: 'rutina' },
];

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
      animate={{ y: hidden ? 96 : 0, opacity: hidden ? 0 : 1 }}
      transition={{ type: 'spring', bounce: 0, duration: 0.34 }}
      className="chrome fixed inset-x-0 bottom-0 z-40 border-t border-line"
    >
      <ul className="safe-bottom mx-auto flex max-w-lg items-stretch px-2 pt-1.5">
        {NAV.map((item) => {
          const active = path === item.path;
          return (
            <li key={item.path} className="flex-1">
              <button
                onClick={() => {
                  if (!active) haptic(8);
                  onNavigate(item.path);
                }}
                aria-current={active ? 'page' : undefined}
                className="group relative flex w-full flex-col items-center gap-1 rounded-xl px-1 py-1.5"
              >
                <span className="relative grid h-7 w-12 place-items-center">
                  {active && (
                    <motion.span
                      layoutId="nav-glow"
                      transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
                      className="absolute inset-0 rounded-full bg-brand/16 ring-1 ring-inset ring-brand/25"
                    />
                  )}
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.65"
                    className={cx(
                      'relative h-[19px] w-[19px] transition-colors duration-panel',
                      active ? 'text-brand-bright' : 'text-content-faint group-hover:text-content-muted',
                    )}
                  >
                    {ICONS[item.icon]}
                  </svg>
                </span>
                <span
                  className={cx(
                    'text-micro font-semibold transition-colors duration-panel',
                    active ? 'text-white' : 'text-content-faint group-hover:text-content-muted',
                  )}
                >
                  {item.label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </motion.nav>
  );
}
