import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useState } from 'react';
import { BottomNav, TopBar } from './components/BottomNav';
import { Button, Empty, Toast, UpdateBanner } from './components/ui';
import { startSession } from './lib/actions';
import { useRoute, useStore } from './lib/hooks';
import { Ajustes } from './screens/Ajustes';
import { Entreno } from './screens/Entreno';
import { Historial } from './screens/Historial';
import { Hoy } from './screens/Hoy';
import { Portada } from './screens/Portada';
import { Registro } from './screens/Registro';
import { Progreso } from './screens/Progreso';
import { Resumen } from './screens/Resumen';
import { Rutina } from './screens/Rutina';

/** Título de la barra superior por ruta. La portada y el entreno tienen la
 *  suya propia y no la usan. */
const TITLES: Record<string, string> = {
  '/hoy': 'Hoy',
  '/progreso': 'Progreso',
  '/registro': 'Registro',
  '/historial': 'Análisis',
  '/rutina': 'Rutina',
  '/ajustes': 'Ajustes',
};

export default function App() {
  const store = useStore();
  const [path, navigate] = useRoute();
  const [toast, setToast] = useState<string | null>(null);
  /* Marca la sesión que se acaba de cerrar: el resumen se enseña en tono de
     celebración y ofrece volver a la portada en vez de al historial. */
  const [justFinished, setJustFinished] = useState<string | null>(null);

  const clearToast = useCallback(() => setToast(null), []);
  const goHome = useCallback(() => navigate('/'), [navigate]);

  const start = useCallback(
    (dayId: string) => {
      startSession(dayId);
      navigate('/entreno');
    },
    [navigate],
  );

  const sessionMatch = /^\/sesion\/(.+)$/.exec(path);
  const isPortada = path === '/';
  const isEntreno = path === '/entreno';
  /* La portada y el entreno ocupan la pantalla entera: una es el vestíbulo y
     el otro pide todo el sitio para las cifras. */
  const bare = isPortada || isEntreno;

  const screen = (() => {
    if (isPortada) {
      return <Portada store={store} onStart={start} onNavigate={navigate} />;
    }

    if (isEntreno) {
      if (!store.active) {
        return (
          <Empty
            title="No hay ningún entreno abierto"
            body="Vuelve a la portada y elige el día que toca."
            action={
              <Button variant="primary" onClick={goHome}>
                Ir a la portada
              </Button>
            }
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
          onExit={goHome}
        />
      );
    }

    if (sessionMatch) {
      const id = sessionMatch[1] as string;
      const session = store.sessions.find((s) => s.id === id);
      if (!session) {
        return (
          <Empty
            title="Esa sesión ya no existe"
            body="Puede que la hayas borrado desde el historial."
            action={
              <Button variant="outline" onClick={() => navigate('/historial')}>
                Ver el historial
              </Button>
            }
          />
        );
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
      case '/hoy':
        return <Hoy store={store} onStart={start} onResume={() => navigate('/entreno')} onNavigate={navigate} />;
      case '/progreso':
        return <Progreso store={store} />;
      case '/registro':
        return <Registro store={store} onToast={setToast} />;
      case '/historial':
        return <Historial store={store} onOpen={(id) => navigate(`/sesion/${id}`)} />;
      case '/rutina':
        return <Rutina store={store} onStart={start} onNavigate={navigate} />;
      case '/ajustes':
        return <Ajustes store={store} onNavigate={navigate} onToast={setToast} />;
      default:
        return (
          <Empty
            title="Por aquí no hay nada"
            body="La dirección no corresponde a ninguna pantalla de la app."
            action={
              <Button variant="primary" onClick={goHome}>
                Ir a la portada
              </Button>
            }
          />
        );
    }
  })();

  /* La pantalla de entreno se queda quieta al marcar series: animar la
     entrada en cada cambio de estado sería mareante. */
  const transitionKey = isEntreno ? 'entreno' : sessionMatch ? `sesion-${sessionMatch[1]}` : path;

  return (
    <div className="mx-auto min-h-[100dvh] max-w-lg px-6 pb-24">
      {!bare && <TopBar onHome={goHome} title={TITLES[path] ?? (sessionMatch ? 'Análisis' : undefined)} />}

      <AnimatePresence mode="wait" initial={false}>
        <motion.main
          key={transitionKey}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          /* La portada trae sus propios márgenes: aquí se le devuelve el
             ancho completo que el contenedor le quita. */
          className={isPortada ? '-mx-6 -mb-24' : undefined}
        >
          {screen}
        </motion.main>
      </AnimatePresence>

      <BottomNav path={path} onNavigate={navigate} hidden={bare} />
      <Toast message={toast} onDone={clearToast} />
      <UpdateBanner />
    </div>
  );
}
