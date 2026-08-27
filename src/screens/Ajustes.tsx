import { useRef, useState } from 'react';
import { Button, Card, SectionTitle, Sheet, cx } from '../components/ui';
import { updateSettings } from '../lib/actions';
import { clock } from '../lib/format';
import { haptic } from '../lib/hooks';
import { exportJson, importJson, resetAll, resetRoutine } from '../lib/storage';
import type { Store } from '../lib/types';

export function Ajustes({
  store,
  onNavigate,
  onToast,
}: {
  store: Store;
  onNavigate: (to: string) => void;
  onToast: (msg: string) => void;
}) {
  const { settings } = store;
  const fileInput = useRef<HTMLInputElement>(null);
  const [confirm, setConfirm] = useState<'todo' | 'rutina' | null>(null);

  /* La copia se descarga como archivo. Es la única forma de sacar los datos
     de aquí sin servidor: todo vive en este navegador. */
  const download = () => {
    const blob = new Blob([exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gym-tracking-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    onToast('Copia descargada');
  };

  return (
    <div className="space-y-5 pb-6">
      <header className="flex items-center gap-3 px-1 pt-1">
        <button
          onClick={() => onNavigate('/rutina')}
          aria-label="Volver"
          className="pressable -ml-1.5 grid h-9 w-9 shrink-0 place-items-center rounded-full text-content-muted hover:bg-white/6 hover:text-content"
        >
          <svg viewBox="0 0 20 20" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 4.5L6.5 10l5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="text-display font-semibold">Ajustes</h1>
      </header>

      <section>
        <SectionTitle>Entreno</SectionTitle>
        <Card className="divide-y divide-line p-0">
          <Row
            title="Descanso por defecto"
            body="Se usa cuando el ejercicio no tiene uno propio."
            control={
              <Nudge
                value={clock(settings.defaultRest)}
                onDown={() => updateSettings({ defaultRest: Math.max(15, settings.defaultRest - 15) })}
                onUp={() => updateSettings({ defaultRest: Math.min(600, settings.defaultRest + 15) })}
              />
            }
          />
          <Row
            title="Salto de peso"
            body="Cuánto suma o resta cada toque en el campo de kilos."
            control={
              <Nudge
                value={`${String(settings.weightStep).replace('.', ',')} kg`}
                onDown={() => updateSettings({ weightStep: Math.max(0.5, settings.weightStep - 0.5) })}
                onUp={() => updateSettings({ weightStep: Math.min(10, settings.weightStep + 0.5) })}
              />
            }
          />
          <Row
            title="Aviso al terminar el descanso"
            body="Dos pitidos y una vibración al llegar al objetivo."
            control={<Switch on={settings.restAlert} onToggle={() => updateSettings({ restAlert: !settings.restAlert })} />}
          />
          <Row
            title="Pantalla siempre encendida"
            body="Mientras haya un entreno abierto. Gasta más batería."
            control={<Switch on={settings.keepAwake} onToggle={() => updateSettings({ keepAwake: !settings.keepAwake })} />}
          />
        </Card>
      </section>

      <section>
        <SectionTitle>Tus datos</SectionTitle>
        <Card className="space-y-3 p-4">
          <p className="text-caption text-content-muted">
            Todo se guarda en este navegador y nunca sale de aquí: no hay cuenta, ni servidor, ni conexión. Eso también
            significa que si borras los datos del navegador o cambias de móvil, se van con él — descárgate una copia de
            vez en cuando.
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" block onClick={download}>
              Descargar copia
            </Button>
            <Button variant="ghost" block onClick={() => fileInput.current?.click()}>
              Restaurar
            </Button>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              const result = importJson(await file.text());
              onToast(result.ok ? 'Datos restaurados' : result.error);
            }}
          />
          <p className="tnum text-micro text-content-faint">
            {store.sessions.length} sesiones guardadas · {(new Blob([exportJson()]).size / 1024).toFixed(0)} KB
          </p>
        </Card>
      </section>

      <section>
        <SectionTitle>Empezar de cero</SectionTitle>
        <Card className="divide-y divide-line p-0">
          <button
            onClick={() => setConfirm('rutina')}
            className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors duration-press hover:bg-white/[0.025]"
          >
            <span>
              <span className="block text-body font-medium text-content">Restaurar la rutina original</span>
              <span className="block text-micro text-content-faint">Vuelve al ciclo de 10 días de la hoja. El historial no se toca.</span>
            </span>
          </button>
          <button
            onClick={() => setConfirm('todo')}
            className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors duration-press hover:bg-danger/8"
          >
            <span>
              <span className="block text-body font-medium text-danger">Borrar todo</span>
              <span className="block text-micro text-content-faint">Historial, rutina y ajustes. Sin vuelta atrás.</span>
            </span>
          </button>
        </Card>
      </section>

      <p className="px-2 text-micro text-content-faint">
        Gym Tracking funciona sin conexión. Añádela a la pantalla de inicio desde el menú del navegador y se abrirá como
        una app más, con o sin cobertura.
      </p>

      <Sheet open={confirm !== null} onClose={() => setConfirm(null)} title={confirm === 'todo' ? 'Borrar todo' : 'Restaurar la rutina'}>
        <p className="pb-4 text-body text-content-muted">
          {confirm === 'todo'
            ? 'Se borran todas las sesiones, la rutina y los ajustes. Si no has descargado una copia, no hay forma de recuperarlo.'
            : 'La rutina vuelve al ciclo de 10 días original. Los ejercicios que hayas añadido o quitado se pierden; el historial se queda como está.'}
        </p>
        <div className="flex gap-2 pb-4">
          <Button variant="ghost" block onClick={() => setConfirm(null)}>
            Cancelar
          </Button>
          <Button
            variant={confirm === 'todo' ? 'danger' : 'primary'}
            block
            buzz
            onClick={() => {
              if (confirm === 'todo') {
                resetAll();
                onToast('Todo borrado');
                onNavigate('/');
              } else {
                resetRoutine();
                onToast('Rutina restaurada');
              }
              setConfirm(null);
            }}
          >
            {confirm === 'todo' ? 'Borrar todo' : 'Restaurar'}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

function Row({ title, body, control }: { title: string; body: string; control: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 p-4">
      <div className="min-w-0 flex-1">
        <p className="text-body font-medium text-content">{title}</p>
        <p className="mt-0.5 text-micro text-content-faint">{body}</p>
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

function Nudge({ value, onDown, onUp }: { value: string; onDown: () => void; onUp: () => void }) {
  return (
    <div className="flex items-center gap-1 rounded-xl border border-line bg-surface-sunken/80 p-1">
      <button
        aria-label="Menos"
        onClick={() => {
          haptic(8);
          onDown();
        }}
        className="pressable grid h-8 w-8 place-items-center rounded-lg text-content-muted hover:bg-white/6 hover:text-white"
      >
        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M4.5 10h11" strokeLinecap="round" />
        </svg>
      </button>
      <span className="tnum w-14 text-center text-caption font-semibold text-white">{value}</span>
      <button
        aria-label="Más"
        onClick={() => {
          haptic(8);
          onUp();
        }}
        className="pressable grid h-8 w-8 place-items-center rounded-lg text-content-muted hover:bg-white/6 hover:text-white"
      >
        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M10 4.5v11M4.5 10h11" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

function Switch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => {
        haptic(10);
        onToggle();
      }}
      className={cx(
        'relative h-7 w-12 shrink-0 rounded-full border transition-colors duration-panel',
        on ? 'border-brand/50 bg-brand' : 'border-line bg-surface-high',
      )}
    >
      <span
        className={cx(
          'absolute top-1/2 block h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow-card',
          'transition-[left] duration-panel ease-out',
        )}
        style={{ left: on ? 'calc(100% - 1.5rem)' : '0.15rem' }}
      />
    </button>
  );
}
