import { useEffect, useRef, useState } from 'react';
import { haptic } from '../lib/hooks';
import { cx } from './ui';

/**
 * Entrada numérica con pulsadores.
 *
 * En un gimnasio se teclea con una mano, con el pulgar sudado y sin gafas. De
 * ahí las tres decisiones de este componente:
 *
 *  1. Los pulsadores son la vía rápida y el número también es un campo: si
 *     hay que meter 47,5 de golpe, se toca la cifra y se escribe.
 *  2. Mantener pulsado repite y acelera. Subir de 20 a 60 kg no puede ser
 *     dieciséis toques.
 *  3. Mientras se escribe manda el texto, no el número. Si el estado se
 *     impusiera en cada tecla, borrar el «4» de «40» reescribiría un «0» y
 *     sería imposible escribir «5».
 */
export function NumberField({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 999,
  decimals = 1,
  noun,
  context,
  placeholder,
  tone = 'default',
  size = 'md',
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  decimals?: number;
  /** El nombre del dato en minúscula: «peso», «repeticiones». */
  noun: string;
  /** A qué pertenece: «la serie 1». Sin él, doce botones «Añadir peso» son
   *  indistinguibles para un lector de pantalla. */
  context: string;
  placeholder?: string;
  tone?: 'default' | 'brand';
  size?: 'md' | 'lg';
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const hold = useRef<{ timeout?: ReturnType<typeof setTimeout>; interval?: ReturnType<typeof setInterval> }>({});

  /* La repetición al mantener pulsado corre fuera del ciclo de render, así que
     necesita el valor vivo: con el de la clausura sumaría siempre sobre el
     mismo número y el peso se quedaría clavado en el segundo paso. */
  const latest = useRef(value);
  latest.current = value;

  const clamp = (n: number) => Math.min(max, Math.max(min, Number(n.toFixed(decimals))));

  const bump = (dir: 1 | -1) => {
    haptic(8);
    onChange(clamp(latest.current + dir * step));
  };

  /* Mantener pulsado: 380 ms de espera para no dispararlo en un toque normal,
     luego repetición que acelera a los 12 pasos. */
  const startHold = (dir: 1 | -1) => {
    stopHold();
    hold.current.timeout = setTimeout(() => {
      let ticks = 0;
      const fire = () => {
        ticks += 1;
        bump(dir);
        if (ticks === 12 && hold.current.interval) {
          clearInterval(hold.current.interval);
          hold.current.interval = setInterval(fire, 55);
        }
      };
      hold.current.interval = setInterval(fire, 110);
    }, 380);
  };

  const stopHold = () => {
    if (hold.current.timeout) clearTimeout(hold.current.timeout);
    if (hold.current.interval) clearInterval(hold.current.interval);
    hold.current = {};
  };

  useEffect(() => stopHold, []);

  const commit = (raw: string) => {
    setDraft(null);
    const n = Number(raw.replace(',', '.'));
    if (raw.trim() === '' || Number.isNaN(n)) return;
    onChange(clamp(n));
  };

  const shown = draft ?? (value > 0 ? String(Number(value.toFixed(decimals))).replace('.', ',') : '');
  /* 36 px de ancho por pulsador: es lo máximo que cabe si en una fila de
     teléfono tienen que entrar dos campos, el número y el botón de marcar.
     La altura sí se mantiene en 48 para que el objetivo táctil sea real. */
  const btn = size === 'lg' ? 'h-14 w-14' : 'h-12 w-9';

  return (
    <div
      className={cx(
        'flex items-stretch overflow-hidden rounded-xl border bg-surface-sunken/90 transition-colors duration-press',
        tone === 'brand' ? 'border-brand/35' : 'border-line',
      )}
    >
      <Stepper
        label={`Quitar ${noun} a ${context}`}
        className={btn}
        onDown={() => {
          bump(-1);
          startHold(-1);
        }}
        onUp={stopHold}
      >
        <svg viewBox="0 0 20 20" className="h-4 w-4" stroke="currentColor" strokeWidth="2.2" fill="none">
          <path d="M4.5 10h11" strokeLinecap="round" />
        </svg>
      </Stepper>

      <label className="flex min-w-0 flex-1 items-center justify-center border-x border-line">
        <span className="sr-only">{`${noun[0]?.toUpperCase()}${noun.slice(1)} de ${context}`}</span>
        <input
          inputMode="decimal"
          enterKeyHint="done"
          value={shown}
          placeholder={placeholder ?? '0'}
          onChange={(e) => setDraft(e.target.value.replace(/[^\d.,]/g, ''))}
          onFocus={(e) => {
            setDraft(shown);
            /* Seleccionar todo al enfocar: lo normal es sustituir el peso
               entero, no editar un dígito. */
            requestAnimationFrame(() => e.target.select());
          }}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              bump(1);
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              bump(-1);
            }
          }}
          className={cx(
            'tnum w-full bg-transparent text-center font-semibold text-white outline-none',
            'placeholder:font-normal placeholder:text-content-faint',
            size === 'lg' ? 'py-3 text-figure-lg' : 'py-2 text-figure',
          )}
        />
      </label>

      <Stepper
        label={`Añadir ${noun} a ${context}`}
        className={btn}
        onDown={() => {
          bump(1);
          startHold(1);
        }}
        onUp={stopHold}
      >
        <svg viewBox="0 0 20 20" className="h-4 w-4" stroke="currentColor" strokeWidth="2.2" fill="none">
          <path d="M10 4.5v11M4.5 10h11" strokeLinecap="round" />
        </svg>
      </Stepper>
    </div>
  );
}

function Stepper({
  label,
  className,
  onDown,
  onUp,
  children,
}: {
  label: string;
  className?: string;
  onDown: () => void;
  onUp: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={(e) => {
        /* Con captura, mantener pulsado sigue contando aunque el dedo se
           salga del botón — que es lo que pasa siempre al pulsar rápido. */
        e.currentTarget.setPointerCapture(e.pointerId);
        onDown();
      }}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onLostPointerCapture={onUp}
      onContextMenu={(e) => e.preventDefault()}
      className={cx(
        'grid shrink-0 place-items-center text-content-muted transition-colors duration-press',
        'hover:bg-white/6 hover:text-white active:bg-white/10 active:text-white',
        className,
      )}
    >
      {children}
    </button>
  );
}
