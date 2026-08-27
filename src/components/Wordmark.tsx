import { cx } from './ui';

/**
 * Marca de la app. Una barra dibujada con dos discos y un eje, en trazo
 * grueso y geométrico para que aguante a 20 px sin convertirse en papilla.
 */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cx('shrink-0', className)} fill="none" aria-hidden>
      <rect x="10" y="10.6" width="4" height="2.8" rx="1" fill="currentColor" />
      <rect x="4.6" y="7.6" width="3.4" height="8.8" rx="1.4" fill="currentColor" />
      <rect x="16" y="7.6" width="3.4" height="8.8" rx="1.4" fill="currentColor" />
      <rect x="1.2" y="9.8" width="2.4" height="4.4" rx="1.1" fill="currentColor" opacity=".45" />
      <rect x="20.4" y="9.8" width="2.4" height="4.4" rx="1.1" fill="currentColor" opacity=".45" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-2', className)}>
      <Mark className="h-[18px] w-[18px] text-accent" />
      <span className="text-caption font-semibold uppercase tracking-label text-ink">Gym Tracking</span>
    </span>
  );
}
