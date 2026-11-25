const SHORT_WEEKDAYS_ES = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'];

const FULL_WEEKDAYS_ES = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];

const WEEKDAY_STRIP_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const MONTHS_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

const MONTHS_CAPITALIZED_ES = MONTHS_ES.map(
  (m) => m.charAt(0).toUpperCase() + m.slice(1)
);

export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function getTodayMadridISO(): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Madrid',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const y = parts.find((p) => p.type === 'year')?.value ?? '2026';
    const m = parts.find((p) => p.type === 'month')?.value ?? '01';
    const d = parts.find((p) => p.type === 'day')?.value ?? '01';
    return `${y}-${m}-${d}`;
  } catch {
    return toISODate(new Date());
  }
}

export function getCurrentMadridMinutes(): number {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Madrid',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date());
    const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
    const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
    return h * 60 + m;
  } catch {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

export function toISODate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(iso: string, delta: number): string {
  const d = parseISODate(iso);
  d.setUTCDate(d.getUTCDate() + delta);
  return toISODate(d);
}

export function getMondayOfWeek(iso: string): string {
  const d = parseISODate(iso);
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const offset = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + offset);
  return toISODate(d);
}

export function getNextMondayISO(fromIso: string): string {
  const d = parseISODate(fromIso);
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const daysUntilNextMonday = dow === 0 ? 1 : 8 - dow;
  d.setUTCDate(d.getUTCDate() + daysUntilNextMonday);
  return toISODate(d);
}

/**
 * Matches the exact WebUntis header format: e.g. "Lu, 16.11. 2026"
 */
export function formatWebUntisDayHeader(iso: string): string {
  const d = parseISODate(iso);
  const dow = SHORT_WEEKDAYS_ES[d.getUTCDay()];
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const year = d.getUTCFullYear();
  return `${dow}, ${day}.${month}. ${year}`;
}

export function formatFullSpanishDate(iso: string): string {
  const d = parseISODate(iso);
  const weekday = FULL_WEEKDAYS_ES[d.getUTCDay()];
  const day = d.getUTCDate();
  const month = MONTHS_ES[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  return `${weekday}, ${day} de ${month} de ${year}`;
}

export function getAllMonthsES(): string[] {
  return MONTHS_CAPITALIZED_ES;
}

export interface WeekDayItem {
  iso: string;
  shortLabel: string;
  dayNumber: number;
  isWeekend: boolean;
}

export function getWeekStrip(iso: string): WeekDayItem[] {
  const monday = getMondayOfWeek(iso);
  return Array.from({ length: 6 }, (_, i) => {
    const dayIso = addDays(monday, i);
    const d = parseISODate(dayIso);
    return {
      iso: dayIso,
      shortLabel: WEEKDAY_STRIP_LABELS[i],
      dayNumber: d.getUTCDate(),
      isWeekend: i >= 5,
    };
  });
}

export interface CalendarCell {
  iso: string;
  day: number;
  inCurrentMonth: boolean;
}

export function getMonthCalendarCells(
  year: number,
  monthIndex: number
): CalendarCell[] {
  const firstOfMonth = new Date(Date.UTC(year, monthIndex, 1, 12, 0, 0));
  const firstDow = firstOfMonth.getUTCDay(); // 0=Sun..6=Sat
  const leadingDays = firstDow === 0 ? 6 : firstDow - 1; // Monday-first grid
  const startDate = new Date(
    Date.UTC(year, monthIndex, 1 - leadingDays, 12, 0, 0)
  );
  const cells: CalendarCell[] = [];
  for (let i = 0; i < 42; i++) {
    const current = new Date(startDate.getTime());
    current.setUTCDate(startDate.getUTCDate() + i);
    cells.push({
      iso: toISODate(current),
      day: current.getUTCDate(),
      inCurrentMonth: current.getUTCMonth() === monthIndex,
    });
  }
  return cells;
}

export function formatSyncTime(isoTimestamp: string | null): string {
  if (!isoTimestamp) return '—';
  try {
    return new Intl.DateTimeFormat('es-ES', {
      timeZone: 'Europe/Madrid',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(isoTimestamp));
  } catch {
    return '—';
  }
}

export function formatWebUntisImportTimestamp(ms: number | null): string | null {
  if (!ms) return null;
  try {
    return new Intl.DateTimeFormat('es-ES', {
      timeZone: 'Europe/Madrid',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(ms));
  } catch {
    return null;
  }
}
