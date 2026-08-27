import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { haptic } from '../lib/hooks';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/* ── Botón ───────────────────────────────────────────────────────────────── */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'outline' | 'quiet' | 'accent' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
  /** Vibración corta al pulsar. Solo en lo que confirma algo. */
  buzz?: boolean;
};

const VARIANT: Record<NonNullable<ButtonProps['variant']>, string> = {
  /* Tinta sobre papel: la acción principal de la app y nada más. Sin sombra
     y sin color — el azul se reserva para los datos. */
  primary: 'bg-ink text-paper hover:bg-ink-soft font-medium',
  outline: 'bg-paper text-ink border border-line hover:border-line-strong hover:bg-canvas font-medium',
  quiet: 'bg-transparent text-ink-muted hover:text-ink hover:bg-sunken',
  accent: 'bg-accent-wash text-accent-deep border border-accent/15 hover:bg-accent/12 font-medium',
  danger: 'bg-bad-wash text-bad-ink border border-bad-ink/15 hover:bg-bad-ink/10 font-medium',
};

const SIZE: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'h-8 px-3 text-caption rounded-md gap-1.5',
  md: 'h-10 px-4 text-body rounded-md gap-2',
  lg: 'h-12 px-6 text-body rounded-lg gap-2',
};

export function Button({
  variant = 'outline',
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
        'focus-visible:ring-4 focus-visible:ring-accent/20',
        'disabled:pointer-events-none disabled:opacity-35',
        SIZE[size],
        VARIANT[variant],
        block && 'w-full',
        className,
      )}
    />
  );
}

/* ── Superficies ─────────────────────────────────────────────────────────── */

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

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="label">{children}</h2>
      {action}
    </div>
  );
}

/** Separador de sección: una línea de un píxel, sin caja. */
export function Rule({ className }: { className?: string }) {
  return <hr className={cx('border-0 border-t border-line', className)} />;
}

/* ── Cifra ───────────────────────────────────────────────────────────────── */

export function Stat({
  label,
  value,
  unit,
  hint,
  tone = 'default',
  size = 'md',
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: ReactNode;
  tone?: 'default' | 'accent' | 'good' | 'warn';
  size?: 'md' | 'lg';
}) {
  const color =
    tone === 'accent'
      ? 'text-accent'
      : tone === 'good'
        ? 'text-good-ink'
        : tone === 'warn'
          ? 'text-warn-ink'
          : 'text-ink';
  return (
    <div className="min-w-0">
      <div className="label">{label}</div>
      <div
        className={cx(
          'tnum mt-1.5 flex items-baseline gap-1 font-medium',
          size === 'lg' ? 'text-figure-lg' : 'text-figure',
          color,
        )}
      >
        <span className="truncate">{value}</span>
        {unit && <span className="text-caption font-normal text-ink-faint">{unit}</span>}
      </div>
      {hint && <div className="mt-1 truncate text-micro text-ink-faint">{hint}</div>}
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
  tone?: 'neutral' | 'accent' | 'good' | 'warn' | 'bad';
  className?: string;
}) {
  const tones = {
    neutral: 'bg-sunken text-ink-muted',
    accent: 'bg-info-wash text-info-ink',
    good: 'bg-good-wash text-good-ink',
    warn: 'bg-warn-wash text-warn-ink',
    bad: 'bg-bad-wash text-bad-ink',
  } as const;
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-2 py-[3px]',
        'text-micro font-semibold uppercase tracking-label',
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
 * un lado, se espera que vuelva por él.
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
            className="absolute inset-0 bg-ink/20 backdrop-blur-[2px]"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? labelId : undefined}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', bounce: 0.12, duration: 0.42 }}
            className="relative flex max-h-[88vh] w-full max-w-lg flex-col rounded-t-2xl border border-line bg-paper shadow-float sm:rounded-2xl"
          >
            <div className="flex shrink-0 items-center justify-between gap-3 px-6 pb-4 pt-5">
              {title ? (
                <h3 id={labelId} className="text-title font-medium">
                  {title}
                </h3>
              ) : (
                <span />
              )}
              <button
                onClick={onClose}
                aria-label="Cerrar"
                className="pressable -mr-2 grid h-8 w-8 place-items-center rounded-md text-ink-faint transition-colors hover:bg-sunken hover:text-ink"
              >
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-2">{children}</div>
            {footer && <div className="shrink-0 safe-bottom border-t border-line px-6 pt-4">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/* ── Vacío ───────────────────────────────────────────────────────────────── */

export function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-line px-6 py-12">
      <p className="font-display text-display text-ink">{title}</p>
      {body && <p className="max-w-sm text-body text-ink-muted">{body}</p>}
      {action}
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
    <div className={cx('inline-flex rounded-lg border border-line bg-sunken p-[3px]', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className={cx(
              'pressable relative flex-1 rounded-[5px] px-3 py-1.5 text-caption font-medium transition-colors duration-press',
              active ? 'text-ink' : 'text-ink-faint hover:text-ink-muted',
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${group}`}
                transition={{ type: 'spring', bounce: 0.14, duration: 0.34 }}
                className="absolute inset-0 rounded-[5px] border border-line bg-paper shadow-card"
              />
            )}
            <span className="relative z-10 whitespace-nowrap">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ── Escala de 1 a 5 ─────────────────────────────────────────────────────── */

/**
 * Selector de sensación. Cinco barras que crecen en lugar de cinco caras:
 * los emojis en una interfaz de datos leen como decoración, y una escala
 * ordinal se entiende mejor si el propio dibujo tiene orden.
 */
export function Scale({
  options,
  value,
  onChange,
}: {
  options: { value: number; label: string }[];
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex gap-1.5">
      {options.map((o, i) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            onClick={() => {
              haptic(8);
              onChange(o.value);
            }}
            aria-pressed={active}
            className={cx(
              'pressable flex flex-1 flex-col items-center gap-2 rounded-lg border px-1 py-3 transition-colors duration-press',
              active ? 'border-accent/40 bg-accent-wash' : 'border-line bg-paper hover:border-line-strong',
            )}
          >
            <span className="flex h-5 items-end gap-[2px]" aria-hidden>
              {Array.from({ length: 5 }, (_, bar) => (
                <span
                  key={bar}
                  className={cx(
                    'w-[3px] rounded-[1px] transition-colors duration-press',
                    bar <= i ? (active ? 'bg-accent' : 'bg-ink-faint') : 'bg-line',
                  )}
                  style={{ height: `${28 + bar * 18}%` }}
                />
              ))}
            </span>
            <span className={cx('text-micro font-medium', active ? 'text-accent-deep' : 'text-ink-faint')}>
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Versión de solo lectura de la escala, para las listas. */
export function ScaleDots({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cx('inline-flex items-end gap-[2px] align-middle', className)} aria-label={`Sensación ${value} de 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={cx('w-[2px] rounded-[1px]', i < value ? 'bg-accent' : 'bg-line')}
          style={{ height: `${5 + i * 2}px` }}
        />
      ))}
    </span>
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
          role="status"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ type: 'spring', bounce: 0.14, duration: 0.36 }}
          className="pointer-events-none fixed inset-x-0 bottom-28 z-[60] mx-auto w-fit max-w-[90vw]"
        >
          <div className="rounded-md bg-ink px-4 py-2.5 text-caption font-medium text-paper shadow-float">
            {message}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}


/* ── Panel que se abre desde su origen ───────────────────────────────────── */

/**
 * Expansión al estilo de la carpeta de aplicaciones de iOS: el panel no
 * aparece de la nada en el centro, crece desde el sitio exacto que se ha
 * tocado y vuelve a él al cerrarse.
 *
 * El truco es el `transform-origin`: se calcula desde la posición del
 * disparador en pantalla, así la relación entre lo que tocas y lo que se abre
 * queda explícita. Entra desde `scale(0.94)`, nunca desde cero — nada en el
 * mundo real aparece de la nada.
 */
export function OriginPanel({
  open,
  origin,
  onClose,
  children,
  label,
}: {
  open: boolean;
  /** Centro del disparador en coordenadas de ventana. */
  origin: { x: number; y: number } | null;
  onClose: () => void;
  children: ReactNode;
  label?: string;
}) {
  const reduce = useReducedMotion();

  const transformOrigin = origin
    ? `${(origin.x / window.innerWidth) * 100}% ${(origin.y / window.innerHeight) * 100}%`
    : 'center';

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-5">
          <motion.button
            aria-label="Cerrar"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-canvas/70 backdrop-blur-[3px]"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={label}
            style={{ transformOrigin }}
            initial={reduce ? { opacity: 0 } : { opacity: 0, transform: 'scale(0.94)' }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, transform: 'scale(1)' }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, transform: 'scale(0.94)' }}
            transition={{ type: 'spring', bounce: 0.16, duration: 0.42 }}
            className="relative max-h-[80vh] w-full max-w-md overflow-y-auto rounded-2xl border border-line bg-paper shadow-float"
          >
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}


/* ── Aviso de versión nueva ──────────────────────────────────────────────── */

/**
 * Barra que aparece cuando el service worker ha descargado una versión nueva.
 *
 * Sin esto, un móvil con la app ya instalada seguía sirviendo la copia vieja
 * de la caché indefinidamente: se desplegaban cambios que no llegaban nunca a
 * la pantalla. No se recarga sola a propósito — hacerlo a mitad de un entreno
 * sería perder el hilo justo cuando menos apetece.
 */
export function UpdateBanner() {
  const [apply, setApply] = useState<(() => void) | null>(null);

  useEffect(() => {
    const onUpdate = (e: Event) => {
      const fn = (e as CustomEvent<() => void>).detail;
      setApply(() => fn);
    };
    window.addEventListener('app-update', onUpdate);
    return () => window.removeEventListener('app-update', onUpdate);
  }, []);

  return (
    <AnimatePresence>
      {apply && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ type: 'spring', bounce: 0.14, duration: 0.4 }}
          className="fixed inset-x-0 top-0 z-[70] safe-top px-4 pb-2"
        >
          <div className="mx-auto flex max-w-lg items-center gap-3 rounded-xl border border-accent/30 bg-paper px-4 py-3 shadow-float">
            <span className="min-w-0 flex-1 text-caption text-ink">
              <span className="font-medium">Hay una versión nueva.</span>{' '}
              <span className="text-ink-muted">Se aplica al recargar.</span>
            </span>
            <Button size="sm" variant="primary" onClick={apply}>
              Actualizar
            </Button>
            <button
              onClick={() => setApply(null)}
              aria-label="Ahora no"
              className="pressable grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink-faint hover:bg-sunken hover:text-ink"
            >
              <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
