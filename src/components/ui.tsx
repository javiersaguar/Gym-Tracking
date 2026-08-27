import { AnimatePresence, motion } from 'framer-motion';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useEffect, useId, useRef } from 'react';
import { haptic } from '../lib/hooks';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/* ── Botón ───────────────────────────────────────────────────────────────── */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'brand' | 'ghost' | 'quiet' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
  /* Vibración corta al pulsar. Solo en lo que confirma algo. */
  buzz?: boolean;
};

const VARIANT: Record<NonNullable<ButtonProps['variant']>, string> = {
  /* Blanco sobre negro: la acción principal de la app y nada más. */
  primary: 'bg-white text-canvas hover:bg-white/90 shadow-lift font-semibold',
  brand: 'bg-brand text-white hover:bg-brand-bright shadow-glow-brand font-semibold',
  ghost: 'bg-surface-high/70 text-content hover:bg-surface-high border border-line',
  quiet: 'bg-transparent text-content-muted hover:text-content hover:bg-white/5',
  danger: 'bg-danger/12 text-danger hover:bg-danger/20 border border-danger/25',
};

const SIZE: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'h-9 px-3.5 text-caption rounded-lg gap-1.5',
  md: 'h-11 px-4 text-body rounded-xl gap-2',
  lg: 'h-14 px-6 text-body-lg rounded-2xl gap-2.5',
};

export function Button({
  variant = 'ghost',
  size = 'md',
  block,
  buzz,
  className,
  onPointerDown,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      onPointerDown={(e) => {
        /* La respuesta va en pointer-down: esperar al click se siente muerto. */
        if (buzz) haptic();
        onPointerDown?.(e);
      }}
      className={cx(
        'pressable inline-flex select-none items-center justify-center whitespace-nowrap',
        'transition-colors duration-press ease-out outline-none',
        'focus-visible:ring-4 focus-visible:ring-brand/30',
        'disabled:pointer-events-none disabled:opacity-40',
        SIZE[size],
        VARIANT[variant],
        block && 'w-full',
        className,
      )}
    />
  );
}

/* ── Tarjeta ─────────────────────────────────────────────────────────────── */

export function Card({
  children,
  className,
  as: As = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'li' | 'article';
}) {
  return <As className={cx('card', className)}>{children}</As>;
}

export function SectionTitle({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-2.5 flex items-end justify-between gap-3 px-1">
      <h2 className="text-caption font-semibold uppercase tracking-[0.09em] text-content-faint">{children}</h2>
      {action}
    </div>
  );
}

/* ── Cifra grande ────────────────────────────────────────────────────────── */

export function Stat({
  label,
  value,
  unit,
  hint,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: ReactNode;
  tone?: 'default' | 'brand' | 'up' | 'down' | 'pr';
}) {
  const color =
    tone === 'brand'
      ? 'text-brand-bright'
      : tone === 'up'
        ? 'text-up'
        : tone === 'down'
          ? 'text-down'
          : tone === 'pr'
            ? 'text-pr'
            : 'text-white';
  return (
    <div className="min-w-0">
      <div className="text-micro font-medium uppercase tracking-[0.09em] text-content-faint">{label}</div>
      <div className={cx('tnum mt-1 flex items-baseline gap-1 text-figure font-semibold', color)}>
        <span className="truncate">{value}</span>
        {unit && <span className="text-caption font-medium text-content-muted">{unit}</span>}
      </div>
      {hint && <div className="mt-0.5 truncate text-micro text-content-faint">{hint}</div>}
    </div>
  );
}

/* ── Etiqueta ────────────────────────────────────────────────────────────── */

export function Pill({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'brand' | 'up' | 'down' | 'pr';
  className?: string;
}) {
  const tones = {
    neutral: 'bg-white/6 text-content-muted border-line',
    brand: 'bg-brand/14 text-brand-bright border-brand/25',
    up: 'bg-up/12 text-up border-up/25',
    down: 'bg-down/12 text-down border-down/25',
    pr: 'bg-pr/12 text-pr border-pr/25',
  } as const;
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-micro font-semibold',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ── Hoja inferior ───────────────────────────────────────────────────────── */

/**
 * Entra y sale por abajo, siempre por el mismo camino: si algo desaparece por
 * un lado, se espera que vuelva por él. La curva es la de los drawers de iOS.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const labelId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <motion.button
            aria-label="Cerrar"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-canvas/70 backdrop-blur-sm"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? labelId : undefined}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', bounce: 0.14, duration: 0.42 }}
            className="chrome relative flex max-h-[88vh] w-full max-w-lg flex-col rounded-t-3xl border border-line shadow-lift sm:rounded-3xl"
          >
            <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-3 pt-4">
              {title ? (
                <h3 id={labelId} className="text-title font-semibold">
                  {title}
                </h3>
              ) : (
                <span />
              )}
              <button
                onClick={onClose}
                aria-label="Cerrar"
                className="pressable -mr-1.5 grid h-9 w-9 place-items-center rounded-full text-content-muted hover:bg-white/6 hover:text-content"
              >
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9">
                  <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-2">{children}</div>
            {footer && <div className="shrink-0 hairline safe-bottom px-5 pt-3">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/* ── Vacío ───────────────────────────────────────────────────────────────── */

export function Empty({ icon, title, body }: { icon?: ReactNode; title: string; body?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      {icon && <div className="mb-1 text-content-faint">{icon}</div>}
      <p className="text-body-lg font-semibold text-content">{title}</p>
      {body && <p className="max-w-xs text-body text-content-muted">{body}</p>}
    </div>
  );
}

/* ── Segmentos ───────────────────────────────────────────────────────────── */

/**
 * El fondo activo es un único elemento que se desliza entre opciones
 * (`layoutId`), no un color que aparece y desaparece en cada pastilla: así el
 * cambio se lee como un movimiento y no como un parpadeo.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  const group = useId();
  return (
    <div className={cx('inline-flex rounded-xl border border-line bg-surface-sunken/80 p-1', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className={cx(
              'pressable relative flex-1 rounded-lg px-3 py-1.5 text-caption font-semibold transition-colors duration-press',
              active ? 'text-canvas' : 'text-content-muted hover:text-content',
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${group}`}
                transition={{ type: 'spring', bounce: 0.16, duration: 0.34 }}
                className="absolute inset-0 rounded-lg bg-white"
              />
            )}
            <span className="relative z-10 whitespace-nowrap">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ── Confirmación ────────────────────────────────────────────────────────── */

export function Confirm({
  open,
  title,
  body,
  confirmLabel = 'Confirmar',
  destructive,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Sheet open={open} onClose={onCancel} title={title}>
      {body && <p className="pb-4 text-body text-content-muted">{body}</p>}
      <div className="flex gap-2 pb-4">
        <Button variant="ghost" block onClick={onCancel}>
          Cancelar
        </Button>
        <Button variant={destructive ? 'danger' : 'primary'} block buzz onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Sheet>
  );
}

/* ── Aviso efímero ───────────────────────────────────────────────────────── */

export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!message) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(onDone, 2600);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [message, onDone]);

  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.97 }}
          transition={{ type: 'spring', bounce: 0.18, duration: 0.36 }}
          className="pointer-events-none fixed inset-x-0 bottom-28 z-[60] mx-auto w-fit max-w-[90vw]"
        >
          <div className="chrome rounded-full border border-line-strong px-4 py-2.5 text-caption font-medium text-white shadow-lift">
            {message}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
