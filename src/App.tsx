import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useState } from 'react';
import { BottomNav, NAV } from './components/BottomNav';
import { Empty, Toast } from './components/ui';
import { startSession } from './lib/actions';
import { useRoute, useStore } from './lib/hooks';
import { Ajustes } from './screens/Ajustes';
import { Entreno } from './screens/Entreno';
import { Historial } from './screens/Historial';
import { Hoy } from './screens/Hoy';
import { Progreso } from './screens/Progreso';
import { Resumen } from './screens/Resumen';
import { Rutina } from './screens/Rutina';

export default function App() {
  const store = useStore();
  const [path, navigate] = useRoute();
  const [toast, setToast] = useState<string | null>(null);
  /* Marca la sesión que se acaba de cerrar: el resumen se enseña en tono de
     celebración y ofrece volver al inicio en vez de al historial. */
  const [justFinished, setJustFinished] = useState<string | null>(null);

  const clearToast = useCallback(() => setToast(null), []);

  const start = useCallback(
    (dayId: string) => {
      startSession(dayId);
      navigate('/entreno');
    },
    [navigate],
  );

  const sessionMatch = /^\/sesion\/(.+)$/.exec(path);
  const isEntreno = path === '/entreno';
  const isTab = NAV.some((n) => n.path === path);

  const screen = (() => {
    if (isEntreno) {
      if (!store.active) {
        return (
          <Empty
            title="No hay ningún entreno abierto"
            body="Vuelve al inicio y elige el día que toca."
          />
        );
      }
      return (
        <Entreno
          store={store}
          active={store.active}
          onFinished={(id) => {
            setJustFinished(id);
            navigate(`/sesion/${id}`, true);
          }}
          onExit={() => navigate('/')}
        />
      );
    }

    if (sessionMatch) {
      const id = sessionMatch[1] as string;
      const session = store.sessions.find((s) => s.id === id);
      if (!session) {
        return <Empty title="Esa sesión ya no existe" body="Puede que la hayas borrado desde el historial." />;
      }
      return (
        <Resumen
          store={store}
          session={session}
          fresh={justFinished === id}
          onNavigate={(to) => {
            setJustFinished(null);
            navigate(to);
          }}
          onDeleted={() => navigate('/historial')}
        />
      );
    }

    switch (path) {
      case '/progreso':
        return <Progreso store={store} />;
      case '/historial':
        return <Historial store={store} onOpen={(id) => navigate(`/sesion/${id}`)} />;
      case '/rutina':
        return <Rutina store={store} onStart={start} onNavigate={navigate} />;
      case '/ajustes':
        return <Ajustes store={store} onNavigate={navigate} onToast={setToast} />;
      case '/':
        return (
          <Hoy
            store={store}
            onStart={start}
            onResume={() => navigate('/entreno')}
            onNavigate={navigate}
          />
        );
      default:
        return (
          <Empty
            title="Por aquí no hay nada"
            body="Vuelve al inicio con la barra de abajo."
          />
        );
    }
  })();

  /* La pantalla de entreno se queda quieta al cambiar de pestaña dentro de
     ella: animar la entrada cada vez que se marca una serie sería mareante. */
  const transitionKey = isEntreno ? 'entreno' : sessionMatch ? `sesion-${sessionMatch[1]}` : path;

  return (
    <div className="mx-auto min-h-full max-w-lg px-4 pb-24">
      <AnimatePresence mode="wait" initial={false}>
        <motion.main
          key={transitionKey}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
          className={isTab || sessionMatch ? 'safe-top pt-2' : ''}
        >
          {screen}
        </motion.main>
      </AnimatePresence>

      <BottomNav path={path} onNavigate={navigate} hidden={isEntreno} />
      <Toast message={toast} onDone={clearToast} />
    </div>
  );
}
