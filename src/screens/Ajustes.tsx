import { useEffect, useRef, useState } from 'react';
import { Button, Card, Pill, SectionTitle, Sheet, cx } from '../components/ui';
import { addSessions, updateSettings } from '../lib/actions';
import { fromCsv, toCsv } from '../lib/csv';
import { plural } from '../lib/format';
import { haptic } from '../lib/hooks';
import {
  exportJson,
  importJson,
  markBackedUp,
  resetAll,
  resetRoutine,
  sessionsSinceBackup,
  storageInfo,
} from '../lib/storage';
import type { Store } from '../lib/types';

type Format = 'json' | 'csv';

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
  const jsonInput = useRef<HTMLInputElement>(null);
  const csvInput = useRef<HTMLInputElement>(null);
  const [confirm, setConfirm] = useState<'todo' | 'rutina' | null>(null);
  const [info, setInfo] = useState<{ persisted: boolean; usedKB: number | null } | null>(null);

  useEffect(() => {
    void storageInfo().then(setInfo);
  }, [store.sessions.length]);

  const pending = sessionsSinceBackup(store);

  /**
   * Descarga la copia. En el móvil se ofrece antes compartir, que es lo que
   * de verdad la saca del teléfono: mandarla a iCloud, a Drive o a un chat.
   * Una descarga a la carpeta del navegador desaparece con el navegador.
   */
  const save = async (format: Format) => {
    const csv = format === 'csv';
    const body = csv ? `﻿${toCsv(store.sessions)}` : exportJson();
    const type = csv ? 'text/csv;charset=utf-8' : 'application/json';
    const name = `gym-tracking-${new Date().toISOString().slice(0, 10)}.${format}`;
    const file = new File([body], name, { type });

    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Copia de Gym Tracking' });
        markBackedUp();
        onToast('Copia compartida');
        return;
      } catch {
        /* cancelado o no permitido: se cae a la descarga de siempre */
      }
    }

    const url = URL.createObjectURL(new Blob([body], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    markBackedUp();
    onToast(csv ? 'Registro CSV descargado' : 'Copia descargada');
  };

  return (
    <div className="space-y-8 pb-8">
      <header>
        <h1 className="font-display text-display-lg">Ajustes</h1>
      </header>

      {pending >= settings.backupEvery && (
        <Card className="border-warn-ink/25 bg-warn-wash p-5">
          <p className="text-body font-medium text-warn-ink">Toca hacer copia</p>
          <p className="mt-1.5 text-caption text-ink-muted">
            Llevas {plural(pending, 'entreno')} sin guardar una copia. Los datos viven solo en este navegador.
          </p>
          <div className="mt-4 flex gap-2">
            <Button variant="primary" onClick={() => void save('json')}>
              Guardar copia
            </Button>
            <Button variant="outline" onClick={() => void save('csv')}>
              CSV
            </Button>
          </div>
        </Card>
      )}

      <section>
        <SectionTitle>Entreno</SectionTitle>
        <div className="border-t border-line">
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
            title="Pantalla siempre encendida"
            body="Mientras haya un entreno abierto. Gasta más batería."
            control={<Switch on={settings.keepAwake} onToggle={() => updateSettings({ keepAwake: !settings.keepAwake })} />}
          />
          <Row
            title="Recordar copia cada"
            body="Entrenos que pueden pasar antes de que la app insista."
            control={
              <Nudge
                value={String(settings.backupEvery)}
                onDown={() => updateSettings({ backupEvery: Math.max(2, settings.backupEvery - 1) })}
                onUp={() => updateSettings({ backupEvery: Math.min(40, settings.backupEvery + 1) })}
              />
            }
          />
        </div>
      </section>

      <section>
        <SectionTitle>Tus datos</SectionTitle>
        <Card className="space-y-4 p-6">
          <p className="max-w-md text-caption text-ink-muted">
            Todo se guarda en este navegador y no sale de aquí: no hay cuenta ni servidor, por eso funciona sin
            cobertura. La contrapartida es que si limpias los datos del navegador o cambias de móvil, se van con él.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={info?.persisted ? 'good' : 'warn'}>
              {info?.persisted ? 'Almacenamiento protegido' : 'Almacenamiento normal'}
            </Pill>
            {info?.usedKB != null && <span className="tnum text-micro text-ink-faint">{info.usedKB} KB usados</span>}
            <span className="tnum text-micro text-ink-faint">
              {plural(store.sessions.length, 'sesión', 'sesiones')}
            </span>
          </div>
          {!info?.persisted && (
            <p className="text-micro text-ink-faint">
              Instala la app en la pantalla de inicio para que el móvil deje de considerarla borrable cuando ande justo
              de espacio.
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Button variant="primary" onClick={() => void save('json')}>
              Guardar copia
            </Button>
            <Button variant="outline" onClick={() => void save('csv')}>
              Exportar CSV
            </Button>
            <Button variant="outline" onClick={() => jsonInput.current?.click()}>
              Restaurar copia
            </Button>
            <Button variant="outline" onClick={() => csvInput.current?.click()}>
              Importar CSV
            </Button>
          </div>

          <p className="text-micro text-ink-faint">
            La copia en JSON restaura todo tal cual, rutina y ajustes incluidos. El CSV lleva una fila por serie: se
            abre en cualquier hoja de cálculo y también se puede volver a importar, añadiendo solo los entrenos que
            falten.
          </p>

          <input
            ref={jsonInput}
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
          <input
            ref={csvInput}
            type="file"
            accept="text/csv,.csv"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              const result = fromCsv(await file.text());
              if (!result.ok) {
                onToast(result.error);
                return;
              }
              const added = addSessions(result.data.sessions);
              onToast(
                added
                  ? `Añadidos ${plural(added, 'entreno')} desde el CSV`
                  : 'Todos los entrenos del CSV ya estaban guardados',
              );
            }}
          />
        </Card>
      </section>

      <section>
        <SectionTitle>Empezar de cero</SectionTitle>
        <div className="border-t border-line">
          <button
            onClick={() => setConfirm('rutina')}
            className="flex w-full items-center justify-between gap-3 border-b border-line py-4 text-left transition-colors duration-press hover:bg-paper"
          >
            <span>
              <span className="block text-body text-ink">Restaurar la rutina original</span>
              <span className="mt-0.5 block text-micro text-ink-faint">
                Vuelve al ciclo de 10 días de la hoja. El historial no se toca.
              </span>
            </span>
          </button>
          <button
            onClick={() => setConfirm('todo')}
            className="flex w-full items-center justify-between gap-3 border-b border-line py-4 text-left transition-colors duration-press hover:bg-bad-wash"
          >
            <span>
              <span className="block text-body text-bad-ink">Borrar todo</span>
              <span className="mt-0.5 block text-micro text-ink-faint">
                Historial, rutina y ajustes. Sin vuelta atrás.
              </span>
            </span>
          </button>
        </div>
      </section>

      <p className="max-w-md border-t border-line pt-5 text-micro text-ink-faint">
        Gym Tracking funciona sin conexión. Añádela a la pantalla de inicio desde el menú del navegador y se abrirá
        como una app más, con o sin cobertura.
      </p>

      <Sheet
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm === 'todo' ? 'Borrar todo' : 'Restaurar la rutina'}
      >
        <p className="pb-4 text-body text-ink-muted">
          {confirm === 'todo'
            ? 'Se borran todas las sesiones, la rutina y los ajustes. Si no has guardado una copia, no hay forma de recuperarlo.'
            : 'La rutina vuelve al ciclo de 10 días original. Los ejercicios que hayas añadido o quitado se pierden; el historial se queda como está.'}
        </p>
        <div className="flex gap-2 pb-4">
          <Button variant="outline" block onClick={() => setConfirm(null)}>
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
    <div className="flex items-center gap-4 border-b border-line py-4">
      <div className="min-w-0 flex-1">
        <p className="text-body text-ink">{title}</p>
        <p className="mt-0.5 text-micro text-ink-faint">{body}</p>
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

function Nudge({ value, onDown, onUp }: { value: string; onDown: () => void; onUp: () => void }) {
  const btn =
    'pressable grid h-8 w-8 place-items-center rounded-md text-ink-faint transition-colors hover:bg-sunken hover:text-ink';
  return (
    <div className="flex items-center gap-1 rounded-lg border border-line bg-paper p-1">
      <button
        aria-label="Menos"
        onClick={() => {
          haptic(8);
          onDown();
        }}
        className={btn}
      >
        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4.8 10h10.4" strokeLinecap="round" />
        </svg>
      </button>
      <span className="tnum w-14 text-center text-caption font-medium text-ink">{value}</span>
      <button
        aria-label="Más"
        onClick={() => {
          haptic(8);
          onUp();
        }}
        className={btn}
      >
        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10 4.8v10.4M4.8 10h10.4" strokeLinecap="round" />
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
        on ? 'border-accent bg-accent' : 'border-line bg-sunken',
      )}
    >
      <span
        className="absolute top-1/2 block h-5 w-5 -translate-y-1/2 rounded-full bg-paper shadow-card transition-[left] duration-panel ease-out"
        style={{ left: on ? 'calc(100% - 1.5rem)' : '0.15rem' }}
      />
    </button>
  );
}
