/** Segundos → «1:05» o «12:04». Para cronómetros y descansos. */
export function clock(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

/** Segundos → «1 h 12 min» o «48 min». Para duraciones de sesión. */
export function duration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h > 0) return m > 0 ? `${h} h ${m} min` : `${h} h`;
  /* «0 min» parece un error de la app; decir que fue corto es un dato. */
  if (m < 1) return '< 1 min';
  return `${m} min`;
}

/** Kilos con la coma española y sin decimales inútiles: 42,5 y 40, no 40,0. */
export function kg(n: number, decimals = 1): string {
  const rounded = Number(n.toFixed(decimals));
  return rounded.toLocaleString('es-ES', { maximumFractionDigits: decimals });
}

/** Tonelaje: por encima de 1000 kg pasa a toneladas para que quepa. */
export function tonnage(n: number): string {
  if (n >= 1000) return `${(n / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} t`;
  return `${Math.round(n).toLocaleString('es-ES')} kg`;
}

export function signedPct(n: number, decimals = 0): string {
  const v = Number(n.toFixed(decimals));
  return `${v > 0 ? '+' : ''}${v.toLocaleString('es-ES', { maximumFractionDigits: decimals })} %`;
}

const DAY_MS = 86_400_000;

/** «Hoy», «Ayer», «Hace 4 días», y a partir de una semana la fecha. */
export function relativeDay(at: number, now = Date.now()): string {
  const a = new Date(at);
  const b = new Date(now);
  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);
  const diff = Math.round((b.getTime() - a.getTime()) / DAY_MS);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Ayer';
  if (diff < 7) return `Hace ${diff} días`;
  return new Date(at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

/** «Jueves, 27 de agosto». En español solo va en mayúscula la primera letra:
 *  `capitalize` de CSS pondría «27 De Agosto». */
export function longDate(at: number): string {
  const raw = new Date(at).toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function hhmm(at: number): string {
  return new Date(at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

export function daysBetween(a: number, b: number): number {
  const x = new Date(a);
  const y = new Date(b);
  x.setHours(0, 0, 0, 0);
  y.setHours(0, 0, 0, 0);
  return Math.round((y.getTime() - x.getTime()) / DAY_MS);
}

/** «1 entreno» / «4 entrenos». El plural en «s» cubre todo lo que cuenta
 *  esta app: entrenos, series, ejercicios, días. */
export function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  const shown = Number.isInteger(n) ? n.toLocaleString('es-ES') : n.toLocaleString('es-ES', { maximumFractionDigits: 1 });
  return `${shown} ${n === 1 ? singular : pluralForm}`;
}
