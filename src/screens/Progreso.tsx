import { AnimatePresence, motion } from "framer-motion";
import { Suspense, lazy, useCallback, useMemo, useState } from "react";
import { ComponentBar, ThermalLegend, thermal } from "../components/BodyMap";
import type { BodyPick } from "../components/BodyView3D";
import { BarList, Spark, TrendLine, type BarDatum } from "../components/charts";
import { MiniBars, RestScatter } from "../components/charts-extra";
import {
  Card,
  Empty,
  Pill,
  SectionTitle,
  Segmented,
  Stat,
  cx,
} from "../components/ui";
import { duration, kg, plural, signedPct, tonnage } from "../lib/format";
import { haptic } from "../lib/hooks";
import {
  balance,
  exerciseSeries,
  exerciseVolumes,
  muscleSeries,
  personalBests,
  repMaxTable,
  restVsPerformance,
  sessionStats,
  trendPct,
} from "../lib/metrics";
import { HEAD_BY_ID } from "../lib/heads";
import { headStates } from "../lib/headState";
import { muscleStates, stateLabel } from "../lib/muscleState";
import { catalogName } from "../lib/routine";
import { MUSCLE_LABEL, type Muscle, type Store } from "../lib/types";

/* El visor 3D arrastra el motor de gráficos, que pesa más que el resto de la
   app junta. Se carga solo al abrir Progreso: la portada y la pantalla de
   entreno —lo que se usa con el móvil en la mano y la conexión regular— no lo
   tocan. El service worker precachea el trozo igual, así que sin conexión
   sigue estando. */
const BodyView3D = lazy(() =>
  import("../components/BodyView3D").then((m) => ({ default: m.BodyView3D })),
);

/** Tramos de días. El usuario elige cuánto mira hacia atrás en cada apartado. */
const WINDOWS = [
  { value: "7", label: "7 d" },
  { value: "14", label: "14 d" },
  { value: "30", label: "30 d" },
  { value: "90", label: "90 d" },
  { value: "365", label: "Año" },
] as const;

type Win = (typeof WINDOWS)[number]["value"];

type Tab = "mapa" | "kilos" | "fuerza" | "descanso";

const TABS: { value: Tab; label: string }[] = [
  { value: "mapa", label: "Mapa" },
  { value: "kilos", label: "Kilos" },
  { value: "fuerza", label: "Fuerza" },
  { value: "descanso", label: "Descanso" },
];

export function Progreso({ store }: { store: Store }) {
  const [win, setWin] = useState<Win>("30");
  const [tab, setTab] = useState<Tab>("mapa");
  const days = Number(win);

  const totals = useMemo(() => {
    const from = Date.now() - days * 86_400_000;
    const inWindow = store.sessions
      .filter((s) => s.start >= from)
      .map(sessionStats);
    return {
      sessions: inWindow.length,
      tonnage: inWindow.reduce((a, b) => a + b.tonnage, 0),
      sets: inWindow.reduce((a, b) => a + b.sets, 0),
      time: inWindow.reduce((a, b) => a + b.durationSec, 0),
    };
  }, [store.sessions, days]);

  if (!store.sessions.length) {
    return (
      <div className="space-y-8 pb-8">
        <header>
          <h1 className="font-display text-display-lg">Progreso</h1>
        </header>
        <Empty
          title="Todavía no hay nada que medir"
          body="En cuanto cierres el primer entreno aparecerán aquí el mapa muscular, los kilos por grupo y la evolución de cada ejercicio."
        />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-8">
      <header>
        <h1 className="font-display text-display-lg">Progreso</h1>
        <div className="no-scrollbar -mx-6 mt-4 flex gap-1.5 overflow-x-auto px-6">
          {WINDOWS.map((w) => (
            <button
              key={w.value}
              onClick={() => {
                haptic(8);
                setWin(w.value);
              }}
              aria-pressed={win === w.value}
              className={cx(
                "pressable shrink-0 rounded-md border px-3 py-1.5 text-caption font-medium transition-colors duration-press",
                win === w.value
                  ? "border-accent bg-accent text-paper"
                  : "border-line bg-paper text-ink-muted hover:border-line-strong hover:text-ink",
              )}
            >
              {w.label}
            </button>
          ))}
        </div>
      </header>

      <Card className="grid grid-cols-2 gap-x-4 gap-y-5 p-6 sm:grid-cols-4">
        <Stat label="Entrenos" value={totals.sessions} />
        <Stat label="Tonelaje" value={tonnage(totals.tonnage)} tone="accent" />
        <Stat label="Series" value={Math.round(totals.sets)} />
        <Stat label="Tiempo" value={duration(totals.time)} />
      </Card>

      <Segmented
        className="w-full"
        options={TABS}
        value={tab}
        onChange={setTab}
      />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="space-y-8"
        >
          {tab === "mapa" && <MapaTab store={store} days={days} />}
          {tab === "kilos" && <KilosTab store={store} days={days} />}
          {tab === "fuerza" && <FuerzaTab store={store} />}
          {tab === "descanso" && <DescansoTab store={store} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ── Mapa de calor ───────────────────────────────────────────────────────── */

function MapaTab({ store, days }: { store: Store; days: number }) {
  const states = useMemo(
    () => muscleStates(store.sessions, days),
    [store.sessions, days],
  );
  const [picked, setPicked] = useState<Muscle | null>(null);
  const [detail, setDetail] = useState<Muscle | null>(null);
  const [tapped, setTapped] = useState<BodyPick | null>(null);
  /* Cabeza a la que mira la figura. Se pone al tocar una fila de la lista, y
     así la lista y el cuerpo señalan siempre lo mismo: quien no quiera —o no
     pueda— arrastrar llega igual a cualquier músculo. */
  const [facing, setFacing] = useState<string | null>(null);
  /* Grupo al que girar. Se pone al entrar en un detalle o al tocar el ranking;
     nunca al tocar el cuerpo, que ya estaba de cara. */
  const [facingMuscle, setFacingMuscle] = useState<Muscle | null>(null);

  const byMuscle = useMemo(
    () => new Map(states.map((s) => [s.muscle, s])),
    [states],
  );
  const heads = useMemo(
    () => (detail ? headStates(store.sessions, detail, days) : []),
    [store.sessions, detail, days],
  );
  const byHead = useMemo(() => new Map(heads.map((h) => [h.id, h])), [heads]);

  /* El color se pide por pieza desde el bucle de dibujo, así que la función
     tiene que ser estable: si cambiara en cada render, el visor repintaría
     entero a cada pulsación. */
  const colorOf = useCallback(
    (muscle: Muscle, head: string | null) => {
      const score = head
        ? (byHead.get(head)?.score ?? null)
        : (byMuscle.get(muscle)?.score ?? null);
      return score == null ? null : thermal(score / 100);
    },
    [byMuscle, byHead],
  );

  /* Qué dice el cartel. Dentro del detalle, tocar una porción del grupo da su
     nombre; tocar cualquier otro sitio del cuerpo da el grupo al que pertenece
     y ofrece entrar en él, que es como se navega de un grupo a otro sin volver
     atrás. Fuera del detalle, siempre el grupo. */
  const insideDetail = !!detail && tapped?.muscle === detail && !!tapped.head;
  const info = !tapped
    ? null
    : insideDetail
      ? {
          title: HEAD_BY_ID[tapped.head as string]?.label ?? MUSCLE_LABEL[tapped.muscle],
          score: byHead.get(tapped.head as string)?.score ?? null,
          jump: null,
        }
      : {
          title: MUSCLE_LABEL[tapped.muscle],
          score: byMuscle.get(tapped.muscle)?.score ?? null,
          jump: tapped.muscle,
        };

  const open = (m: Muscle) => {
    haptic();
    setDetail(m);
    setPicked(m);
    setTapped(null);
    setFacing(null);
    setFacingMuscle(m);
  };

  const detailState = detail ? byMuscle.get(detail) : null;
  const estimated = heads.some((h) => !h.exact && h.sets > 0);

  return (
    <>
      <section>
        <SectionTitle
          action={
            detail && (
              <button
                onClick={() => {
                  setDetail(null);
                  setTapped(null);
                  setFacing(null);
                }}
                className="text-caption text-accent transition-colors duration-press hover:text-ink"
              >
                Volver a los grupos
              </button>
            )
          }
        >
          {detail ? `${MUSCLE_LABEL[detail]} por dentro` : "Estado por grupo"}
        </SectionTitle>
        <p className="mb-5 max-w-md text-caption text-ink-muted">
          {detail
            ? "Cómo se reparte el trabajo del grupo entre sus porciones. La referencia de cada una es la franja semanal del grupo dividida a partes iguales."
            : "El color no son los kilos: es cómo de atendido está el grupo, mezclando volumen semanal, frecuencia, RIR y progreso."}
        </p>

        <Card className="overflow-hidden p-0">
          <div className="relative h-[430px]">
            <Suspense
              fallback={
                <div
                  className="h-full w-full animate-pulse bg-sunken"
                  aria-hidden
                />
              }
            >
              <BodyView3D
                className="h-[430px] w-full"
                label={
                  detail
                    ? `Figura giratoria con las porciones del grupo ${MUSCLE_LABEL[detail]} coloreadas por trabajo recibido`
                    : "Figura giratoria con cada grupo muscular coloreado según lo atendido que está"
                }
                colorOf={colorOf}
                focus={detail ?? picked}
                detail={!!detail}
                faceMuscle={facingMuscle}
                faceHead={detail ? facing : null}
                onPick={(p) => {
                  if (p) haptic();
                  setTapped(p);
                  if (p && !detail) setPicked(p.muscle);
                }}
                tag={
                  info && (
                    <div className="pointer-events-auto whitespace-nowrap rounded-xl border border-line bg-paper px-3 py-2 shadow-float">
                      <div className="flex items-baseline gap-2">
                        <span className="text-caption font-medium text-ink">
                          {info.title}
                        </span>
                        <span className="tnum text-caption text-ink-muted">
                          {info.score ?? "—"}
                        </span>
                      </div>
                      {info.jump && (
                        <button
                          onClick={() => open(info.jump as Muscle)}
                          className="mt-1 block text-micro font-medium text-accent transition-colors duration-press hover:text-ink"
                        >
                          Ver sus músculos →
                        </button>
                      )}
                    </div>
                  )
                }
              />
            </Suspense>
          </div>
          <p className="border-t border-line-soft py-2.5 text-center text-micro text-ink-faint">
            Arrastra para girar · pellizca para acercar · toca un músculo ·
            doble toque para centrar
          </p>
        </Card>

        <ThermalLegend className="mt-4 border-t border-line pt-3" />
      </section>

      <AnimatePresence initial={false} mode="wait">
        {detail ? (
          <motion.section
            key={`heads-${detail}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
          >
            <SectionTitle>Reparto dentro del grupo</SectionTitle>
            <ul className="border-t border-line">
              {heads.map((h) => (
                <li key={h.id}>
                  <button
                    onClick={() => {
                      haptic(8);
                      setFacing(h.id);
                      setTapped({ muscle: h.muscle, head: h.id, x: 0, y: 0 });
                    }}
                    aria-pressed={facing === h.id}
                    className={cx(
                      "flex w-full items-center gap-4 border-b border-line py-3 text-left transition-colors duration-press hover:bg-paper",
                      facing === h.id && "bg-paper",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-body text-ink">
                        {HEAD_BY_ID[h.id]?.label ?? h.id}
                        {/* En el cuerpo va tapada por otro músculo: el mapa la
                          levanta para poder enseñarla, y conviene decirlo. */}
                        {HEAD_BY_ID[h.id]?.deep && (
                          <span className="ml-2 align-middle text-micro text-ink-faint">
                            capa profunda
                          </span>
                        )}
                      </span>
                      <span className="tnum block text-micro text-ink-faint">
                        {h.sets > 0
                          ? `${h.setsPerWeek.toFixed(1)} series/sem · ${tonnage(h.tonnage)}`
                          : "sin trabajo en este periodo"}
                      </span>
                    </span>
                    <span className="tnum w-9 shrink-0 text-right text-caption font-medium text-ink">
                      {h.score ?? "—"}
                    </span>
                    <span className="h-[6px] w-16 shrink-0 overflow-hidden rounded-[3px] bg-line-soft">
                      <span
                        className="block h-full rounded-[3px]"
                        style={{
                          width: `${h.score ?? 0}%`,
                          background:
                            h.score == null
                              ? "transparent"
                              : thermal(h.score / 100),
                          transition: "width 420ms cubic-bezier(.16,1,.3,1)",
                        }}
                      />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {estimated && (
              <p className="mt-3 text-micro text-ink-faint">
                Alguno de tus ejercicios no tiene declarado su reparto por
                porciones y se ha repartido a partes iguales. Sirve para ver
                huecos grandes, no para afinar al uno por ciento.
              </p>
            )}
            {detailState && (
              <p className="mt-3 text-caption text-ink-muted">
                El grupo entero va {detailState.score ?? "—"} de 100:{" "}
                {detailState.verdict.toLowerCase()}
              </p>
            )}
          </motion.section>
        ) : (
          picked &&
          byMuscle.get(picked) && (
            <motion.section
              key={picked}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
            >
              <Card className="p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-title font-medium">
                    {MUSCLE_LABEL[picked]}
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="tnum text-figure font-medium text-ink">
                      {byMuscle.get(picked)?.score ?? "—"}
                    </span>
                    <Pill tone={scoreTone(byMuscle.get(picked)?.score ?? null)}>
                      {stateLabel(byMuscle.get(picked)?.score ?? null)}
                    </Pill>
                  </div>
                </div>
                <p className="mt-1.5 text-caption text-ink-muted">
                  {byMuscle.get(picked)?.verdict}
                </p>

                <div className="mt-4 space-y-3">
                  {byMuscle.get(picked)?.components.map((c) => (
                    <ComponentBar
                      key={c.key}
                      label={c.label}
                      score={c.score}
                      detail={c.detail}
                    />
                  ))}
                </div>

                <button
                  onClick={() => open(picked)}
                  className="mt-4 text-caption font-medium text-accent transition-colors duration-press hover:text-ink"
                >
                  Ver sus músculos por separado →
                </button>
              </Card>
            </motion.section>
          )
        )}
      </AnimatePresence>

      {!detail && (
        <section>
          <SectionTitle>Ranking</SectionTitle>
          <ul className="border-t border-line">
            {states.map((s) => (
              <li key={s.muscle}>
                <button
                  onClick={() => {
                    haptic(8);
                    const next = picked === s.muscle ? null : s.muscle;
                    setPicked(next);
                    setFacingMuscle(next);
                    setTapped(null);
                  }}
                  className="flex w-full items-center gap-4 border-b border-line py-3 text-left transition-colors duration-press hover:bg-paper"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-body text-ink">
                      {MUSCLE_LABEL[s.muscle]}
                    </span>
                    <span className="tnum block text-micro text-ink-faint">
                      {s.sets > 0
                        ? `${s.setsPerWeek.toFixed(1)} series/sem · ${tonnage(s.tonnage)}`
                        : "sin trabajo"}
                    </span>
                  </span>
                  <span className="tnum w-9 shrink-0 text-right text-caption font-medium text-ink">
                    {s.score ?? "—"}
                  </span>
                  {/* La barra usa el mismo color que el mapa: si un músculo
                      sale verde arriba, aquí sale verde también. */}
                  <span className="h-[6px] w-16 shrink-0 overflow-hidden rounded-[3px] bg-line-soft">
                    <span
                      className="block h-full rounded-[3px]"
                      style={{
                        width: `${s.score ?? 0}%`,
                        background:
                          s.score == null
                            ? "transparent"
                            : thermal(s.score / 100),
                        transition: "width 420ms cubic-bezier(.16,1,.3,1)",
                      }}
                    />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function scoreTone(score: number | null): "neutral" | "good" | "warn" | "bad" {
  if (score == null) return "neutral";
  if (score >= 75) return "good";
  if (score >= 50) return "neutral";
  if (score >= 25) return "warn";
  return "bad";
}

/* ── Kilos ───────────────────────────────────────────────────────────────── */

function KilosTab({ store, days }: { store: Store; days: number }) {
  const bars = useMemo(
    () => balance(store.sessions, days),
    [store.sessions, days],
  );
  const byExercise = useMemo(
    () => exerciseVolumes(store.sessions, days),
    [store.sessions, days],
  );

  const muscleData: BarDatum[] = bars
    .filter((b) => b.tonnage > 0)
    .map((b) => ({
      key: b.muscle,
      label: MUSCLE_LABEL[b.muscle],
      value: b.tonnage,
      display: tonnage(b.tonnage),
      note: `${b.sets.toFixed(1)} series · ${b.sharePct.toFixed(0)} % del total`,
    }));

  const exerciseData: BarDatum[] = byExercise.map((e) => ({
    key: e.exerciseId,
    label: e.name,
    value: e.tonnage,
    display: tonnage(e.tonnage),
    note: `${plural(e.sets, "serie")} · ${e.reps} reps · ${plural(e.sessions, "sesión", "sesiones")}`,
  }));

  const total = bars.reduce((a, b) => a + b.tonnage, 0);

  return (
    <>
      <section>
        <SectionTitle>Kilos por músculo</SectionTitle>
        <p className="mb-5 max-w-md text-caption text-ink-muted">
          Peso × repeticiones de cada serie, repartido según cuánto recae sobre
          cada músculo. Total del periodo:{" "}
          <span className="font-medium text-ink">{tonnage(total)}</span>.
        </p>
        <BarList data={muscleData} emptyLabel="Sin trabajo en este periodo" />
      </section>

      <section>
        <SectionTitle>Kilos por ejercicio</SectionTitle>
        <p className="mb-5 max-w-md text-caption text-ink-muted">
          Lo mismo, pero sin repartir: el tonelaje entero de cada ejercicio.
        </p>
        <BarList
          data={exerciseData}
          emptyLabel="Sin ejercicios en este periodo"
        />
      </section>
    </>
  );
}

/* ── Fuerza ──────────────────────────────────────────────────────────────── */

function FuerzaTab({ store }: { store: Store }) {
  const trackable = useMemo(() => {
    const count = new Map<string, number>();
    for (const s of store.sessions) {
      for (const ex of s.exercises) {
        if (ex.sets.some((x) => x.done && x.reps > 0))
          count.set(ex.exerciseId, (count.get(ex.exerciseId) ?? 0) + 1);
      }
    }
    return [...count.entries()]
      .map(([id, n]) => ({ id, name: catalogName(id), sessions: n }))
      .sort(
        (a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name, "es"),
      );
  }, [store.sessions]);

  const [picked, setPicked] = useState<string | null>(null);
  const selected = picked ?? trackable[0]?.id ?? null;

  const pbs = useMemo(
    () => personalBests(store.sessions, store.seedRefs),
    [store.sessions, store.seedRefs],
  );
  const series = useMemo(
    () => (selected ? exerciseSeries(store.sessions, selected) : null),
    [store.sessions, selected],
  );
  const reps = useMemo(
    () => (selected ? repMaxTable(store.sessions, selected) : []),
    [store.sessions, selected],
  );
  const trend = series ? trendPct(series.e1rm) : null;

  const muscles = useMemo(
    () => balance(store.sessions, 3650).filter((b) => b.sets > 0),
    [store.sessions],
  );
  const [muscle, setMuscle] = useState<Muscle | null>(null);
  const selMuscle = muscle ?? muscles[0]?.muscle ?? null;
  const mSeries = useMemo(
    () => (selMuscle ? muscleSeries(store.sessions, selMuscle) : []),
    [store.sessions, selMuscle],
  );

  if (!trackable.length || !series || !selected) {
    return (
      <Empty
        title="Sin ejercicios registrados"
        body="Cierra un entreno y aquí aparecerá su evolución."
      />
    );
  }

  return (
    <>
      <section>
        <SectionTitle>Por ejercicio</SectionTitle>
        <Chips
          items={trackable.map((t) => ({ id: t.id, label: t.name }))}
          value={selected}
          onPick={setPicked}
        />

        <div className="mt-5 flex items-end justify-between gap-3">
          <div>
            <p className="text-caption font-medium text-ink">1RM estimado</p>
            <p className="text-micro text-ink-faint">
              Epley sobre tu mejor serie de cada sesión
            </p>
          </div>
          {trend != null && (
            <Pill tone={trend > 1 ? "good" : trend < -1 ? "warn" : "neutral"}>
              {signedPct(trend, 1)}
            </Pill>
          )}
        </div>
        <TrendLine points={series.e1rm} format={(v) => `${kg(v, 0)} kg`} />

        {series.tonnage.length > 1 && (
          <div className="mt-6">
            <p className="mb-2 text-caption font-medium text-ink">
              Tonelaje por sesión
            </p>
            <MiniBars
              values={series.tonnage.map((p) => p.value)}
              labels={series.tonnage.map((p) =>
                new Date(p.at).toLocaleDateString("es-ES", {
                  day: "numeric",
                  month: "short",
                }),
              )}
              format={(v) => tonnage(v)}
            />
          </div>
        )}
      </section>

      {reps.length > 0 && (
        <section>
          <SectionTitle>Récords por repetición</SectionTitle>
          <p className="mb-4 max-w-md text-caption text-ink-muted">
            El mejor peso que has movido a cada número de repeticiones en este
            ejercicio.
          </p>
          <Card className="overflow-hidden p-0">
            <table className="w-full">
              <thead className="border-b border-line bg-canvas">
                <tr className="text-left">
                  <th className="label px-4 py-2 font-semibold">Reps</th>
                  <th className="label px-4 py-2 font-semibold">Peso</th>
                  <th className="label px-4 py-2 font-semibold">RIR</th>
                  <th className="label px-4 py-2 text-right font-semibold">
                    Cuándo
                  </th>
                </tr>
              </thead>
              <tbody className="tnum text-caption">
                {reps.map((r) => (
                  <tr
                    key={r.reps}
                    className="border-b border-line-soft last:border-b-0"
                  >
                    <td className="px-4 py-2 font-medium text-ink">{r.reps}</td>
                    <td className="px-4 py-2 text-ink">{kg(r.weight)} kg</td>
                    <td className="px-4 py-2 text-ink-muted">{r.rir ?? "—"}</td>
                    <td className="px-4 py-2 text-right text-ink-faint">
                      {new Date(r.at).toLocaleDateString("es-ES", {
                        day: "numeric",
                        month: "short",
                        year: "2-digit",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          {pbs.get(selected) && (
            <p className="tnum mt-3 text-micro text-ink-muted">
              Mejor marca absoluta: {kg(pbs.get(selected)!.weight)} kg ×{" "}
              {pbs.get(selected)!.reps} · 1RM {kg(pbs.get(selected)!.e1rm, 0)}{" "}
              kg
            </p>
          )}
        </section>
      )}

      {selMuscle && mSeries.length > 1 && (
        <section>
          <SectionTitle>Volumen por grupo</SectionTitle>
          <Chips
            items={muscles.map((m) => ({
              id: m.muscle,
              label: MUSCLE_LABEL[m.muscle],
            }))}
            value={selMuscle}
            onPick={(id) => setMuscle(id as Muscle)}
          />
          <div className="mt-5">
            <TrendLine points={mSeries} format={(v) => tonnage(v)} />
          </div>
        </section>
      )}

      <section>
        <SectionTitle>Mejores marcas</SectionTitle>
        <div className="border-t border-line">
          {trackable.slice(0, 10).map((x) => {
            const pb = pbs.get(x.id);
            if (!pb) return null;
            const s = exerciseSeries(store.sessions, x.id).e1rm;
            return (
              <button
                key={x.id}
                onClick={() => setPicked(x.id)}
                className="flex w-full items-center gap-4 border-b border-line py-3.5 text-left transition-colors hover:bg-paper"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body text-ink">{x.name}</p>
                  <p className="tnum mt-0.5 text-micro text-ink-faint">
                    {kg(pb.weight)} kg × {pb.reps} · 1RM {kg(pb.e1rm, 0)} kg
                  </p>
                </div>
                <Spark points={s.map((p) => p.value)} />
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}

/* ── Descanso ────────────────────────────────────────────────────────────── */

function DescansoTab({ store }: { store: Store }) {
  const withData = useMemo(() => {
    const ids = new Set<string>();
    for (const s of store.sessions)
      for (const ex of s.exercises) ids.add(ex.exerciseId);
    return [...ids]
      .map((id) => ({
        id,
        name: catalogName(id),
        points: restVsPerformance(store.sessions, id),
      }))
      .filter((x) => x.points.length >= 3)
      .sort((a, b) => b.points.length - a.points.length);
  }, [store.sessions]);

  const [picked, setPicked] = useState<string | null>(null);
  const selected = withData.find((x) => x.id === (picked ?? withData[0]?.id));

  const restsBySession = useMemo(
    () =>
      [...store.sessions]
        .sort((a, b) => a.start - b.start)
        .map((s) => ({ at: s.start, value: sessionStats(s).restAvg }))
        .filter((x): x is { at: number; value: number } => x.value != null),
    [store.sessions],
  );

  return (
    <>
      <section>
        <SectionTitle>Cómo te afecta el descanso</SectionTitle>
        <p className="mb-5 max-w-md text-caption text-ink-muted">
          Cada punto es una serie tuya con el mismo peso que la primera del día:
          cuánto descansaste y qué fracción de aquella primera serie sacaste. La
          línea de puntos es lo que predice el modelo que usa el índice. Si tus
          puntos caen sistemáticamente por encima o por debajo, el modelo no te
          describe bien.
        </p>

        {withData.length ? (
          <>
            <Chips
              items={withData.map((x) => ({
                id: x.id,
                label: `${x.name} (${x.points.length})`,
              }))}
              value={selected?.id ?? ""}
              onPick={setPicked}
            />
            <div className="mt-5">
              <RestScatter points={selected?.points ?? []} />
            </div>
          </>
        ) : (
          <Empty
            title="Aún no hay suficientes series"
            body="Hacen falta al menos tres series de un mismo ejercicio al mismo peso, con su descanso medido, para poder dibujar la relación."
          />
        )}
      </section>

      {restsBySession.length > 1 && (
        <section>
          <SectionTitle>Descanso medio por sesión</SectionTitle>
          <p className="mb-4 max-w-md text-caption text-ink-muted">
            Sirve para ver cuánto varía el gimnasio de un día a otro. El índice
            ya descuenta estas diferencias.
          </p>
          <MiniBars
            values={restsBySession.map((r) => r.value)}
            labels={restsBySession.map((r) =>
              new Date(r.at).toLocaleDateString("es-ES", {
                day: "numeric",
                month: "short",
              }),
            )}
            format={(v) => `${Math.round(v)} s`}
          />
        </section>
      )}
    </>
  );
}

/* ── Selector horizontal ─────────────────────────────────────────────────── */

function Chips({
  items,
  value,
  onPick,
}: {
  items: { id: string; label: string }[];
  value: string;
  onPick: (id: string) => void;
}) {
  return (
    <div className="no-scrollbar -mx-6 flex gap-1.5 overflow-x-auto px-6">
      {items.map((x) => (
        <button
          key={x.id}
          onClick={() => {
            haptic(8);
            onPick(x.id);
          }}
          aria-pressed={x.id === value}
          className={cx(
            "pressable shrink-0 rounded-md border px-3 py-1.5 text-micro font-medium transition-colors duration-press",
            x.id === value
              ? "border-accent/40 bg-accent-wash text-accent-deep"
              : "border-line bg-paper text-ink-muted hover:border-line-strong hover:text-ink",
          )}
        >
          {x.label}
        </button>
      ))}
    </div>
  );
}
