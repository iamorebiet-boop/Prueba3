import {
  AlertCircle,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Printer,
  RefreshCw,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarSidebar } from './components/CalendarSidebar';
import { TimetableGrid } from './components/TimetableGrid';
import {
  ALL_UNIQUE_ROOM_NAMES,
  ROOM_GROUPS,
  SCHOOL_INFO,
  TIME_SLOTS,
} from './data/roomGroups';
import type {
  DayTimetableResponse,
  GridDaySchedule,
  RoomGroupId,
} from './data/roomGroups';
import {
  addDays,
  formatFullSpanishDate,
  formatSyncTime,
  getCurrentMadridMinutes,
  getTodayMadridISO,
  getWeekStrip,
  normalizeSearchText,
} from './utils/dateUtils';

type ActiveGridFilter = 'ALL' | RoomGroupId;

const AUTO_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

function getInitialDateFromUrl(fallbackIso: string): string {
  try {
    const param = new URLSearchParams(window.location.search).get('date');
    if (param && /^\d{4}-\d{2}-\d{2}$/.test(param)) {
      return param;
    }
  } catch {
    // ignore URL errors
  }
  return fallbackIso;
}

export default function App() {
  const [todayIso, setTodayIso] = useState<string>(() => getTodayMadridISO());
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    getInitialDateFromUrl(getTodayMadridISO())
  );
  const [activeGrid, setActiveGrid] = useState<ActiveGridFilter>('ALL');
  const [roomQuery, setRoomQuery] = useState<string>('');
  const [subjectQuery, setSubjectQuery] = useState<string>('');
  const [freeAtSlot, setFreeAtSlot] = useState<number | null>(null);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [mobileCalendarOpen, setMobileCalendarOpen] = useState<boolean>(false);

  const [timetable, setTimetable] = useState<DayTimetableResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [nowMinutes, setNowMinutes] = useState<number>(() =>
    getCurrentMadridMinutes()
  );

  const abortRef = useRef<AbortController | null>(null);

  // Sync URL query param (?date=YYYY-MM-DD)
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('date', selectedDate);
      window.history.replaceState({}, '', url.toString());
    } catch {
      // ignore history errors
    }
  }, [selectedDate]);

  // Keep current time & midnight day rollover fresh
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMinutes(getCurrentMadridMinutes());
      const freshToday = getTodayMadridISO();
      if (freshToday !== todayIso) {
        setTodayIso(freshToday);
        setSelectedDate((current) =>
          current === todayIso ? freshToday : current
        );
      }
    }, 60 * 1000);
    return () => window.clearInterval(timer);
  }, [todayIso]);

  const currentSlotIndex = useMemo(() => {
    if (selectedDate !== todayIso) return null;
    const found = TIME_SLOTS.find(
      (s) => nowMinutes >= s.startMinutes && nowMinutes < s.endMinutes
    );
    return found ? found.index : null;
  }, [selectedDate, todayIso, nowMinutes]);

  const fetchTimetable = useCallback(async (dateIso: string, force = false) => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setErrorMsg(null);
    try {
      const qs = new URLSearchParams({ date: dateIso });
      if (force) qs.set('refresh', '1');
      const res = await fetch(`/api/timetable?${qs.toString()}`, {
        signal: controller.signal,
        cache: 'no-store',
      });
      const data = (await res.json()) as DayTimetableResponse & {
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || `Error HTTP ${res.status}`);
      }
      setTimetable(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'No se pudo cargar el horario desde WebUntis.'
      );
    } finally {
      if (abortRef.current === controller) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchTimetable(selectedDate, false);
  }, [selectedDate, fetchTimetable]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => {
      fetchTimetable(selectedDate, true);
    }, AUTO_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [autoRefresh, selectedDate, fetchTimetable]);

  // Keyboard navigation: Left/Right arrows move day by day
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'SELECT' ||
          target.tagName === 'TEXTAREA')
      ) {
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setSelectedDate((d) => addDays(d, -1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setSelectedDate((d) => addDays(d, 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const triggerPrint = useCallback((target: 'ALL' | RoomGroupId) => {
    document.body.setAttribute('data-print-target', target);
    const cleanup = () => {
      document.body.removeAttribute('data-print-target');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.setTimeout(() => {
      window.print();
    }, 60);
  }, []);

  const handlePrintAll = useCallback(() => {
    if (activeGrid !== 'ALL') {
      setActiveGrid('ALL');
      window.setTimeout(() => triggerPrint('ALL'), 100);
    } else {
      triggerPrint('ALL');
    }
  }, [activeGrid, triggerPrint]);

  const handlePrintGrid = useCallback(
    (gridId: RoomGroupId) => {
      triggerPrint(gridId);
    },
    [triggerPrint]
  );

  // Monday–Saturday week strip with live crimson occupancy bars
  const weekDays = useMemo(() => {
    const strip = getWeekStrip(selectedDate);
    const summaryMap = new Map(
      (timetable?.weekSummary ?? []).map((s) => [s.date, s])
    );
    const totalPossibleSlots = ALL_UNIQUE_ROOM_NAMES.length * TIME_SLOTS.length;

    return strip.map((day) => {
      const summary = summaryMap.get(day.iso);
      const pct =
        summary && totalPossibleSlots > 0
          ? Math.min(
              100,
              Math.round((summary.occupiedSlots / totalPossibleSlots) * 100)
            )
          : 0;
      return {
        iso: day.iso,
        shortDay: day.shortLabel,
        dayNum: day.dayNumber,
        activeRooms: summary?.activeRooms ?? null,
        pct,
      };
    });
  }, [selectedDate, timetable?.weekSummary]);

  const normalizedSubject = useMemo(
    () => normalizeSearchText(subjectQuery),
    [subjectQuery]
  );

  // Unique scheduled subject names for the selected day (autocomplete datalist)
  const availableSubjects = useMemo(() => {
    if (!timetable) return [];
    const set = new Set<string>();
    for (const g of timetable.grids) {
      for (const r of g.rooms) {
        for (const p of r.periods) {
          if (p.subject && p.subject.trim().length > 0) {
            set.add(p.subject.trim());
          }
        }
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
  }, [timetable]);

  const filteredGrids: GridDaySchedule[] = useMemo(() => {
    if (!timetable) return [];
    const normalizedRoomQuery = normalizeSearchText(roomQuery);

    return timetable.grids
      .filter((g) => activeGrid === 'ALL' || g.id === activeGrid)
      .map((g) => {
        const rooms = g.rooms.filter((r) => {
          if (
            normalizedRoomQuery &&
            !normalizeSearchText(r.name).includes(normalizedRoomQuery) &&
            !normalizeSearchText(r.longName).includes(normalizedRoomQuery)
          ) {
            return false;
          }
          if (freeAtSlot !== null && r.slots[freeAtSlot] !== 'free') {
            return false;
          }
          if (normalizedSubject.length > 0) {
            const hasMatchingSubject = r.periods.some(
              (p) =>
                normalizeSearchText(p.subject).includes(normalizedSubject) ||
                normalizeSearchText(p.subjectAlt).includes(normalizedSubject) ||
                p.groups.some((gr) =>
                  normalizeSearchText(gr).includes(normalizedSubject)
                )
            );
            if (!hasMatchingSubject) return false;
          }
          return true;
        });

        const occupiedSlots = rooms.reduce(
          (acc, r) => acc + r.occupiedSlotsCount,
          0
        );
        const activeRoomsCount = rooms.filter(
          (r) => r.occupiedSlotsCount > 0
        ).length;
        const totalSlots = rooms.length * TIME_SLOTS.length;

        return {
          ...g,
          rooms,
          activeRoomsCount,
          occupiedSlots,
          totalSlots,
          occupancyPercent:
            totalSlots > 0 ? Math.round((occupiedSlots / totalSlots) * 100) : 0,
        };
      })
      .filter((g) => g.rooms.length > 0);
  }, [timetable, activeGrid, roomQuery, freeAtSlot, normalizedSubject]);

  const subjectMatchSummary = useMemo(() => {
    if (normalizedSubject.length === 0) return null;
    let matchingSlots = 0;
    const matchedRoomNames = new Set<string>();
    for (const g of filteredGrids) {
      for (const r of g.rooms) {
        if (matchedRoomNames.has(r.name)) continue;
        let roomHits = 0;
        for (const slot of TIME_SLOTS) {
          if (r.slots[slot.index] === 'free') continue;
          const hit = r.periods.some(
            (p) =>
              p.startTime < slot.endTime &&
              p.endTime > slot.startTime &&
              (normalizeSearchText(p.subject).includes(normalizedSubject) ||
                normalizeSearchText(p.subjectAlt).includes(normalizedSubject) ||
                p.groups.some((gr) =>
                  normalizeSearchText(gr).includes(normalizedSubject)
                ))
          );
          if (hit) roomHits += 1;
        }
        if (roomHits > 0) {
          matchedRoomNames.add(r.name);
          matchingSlots += roomHits;
        }
      }
    }
    return { matchingSlots, matchingRooms: matchedRoomNames.size };
  }, [filteredGrids, normalizedSubject]);

  const totals = useMemo(() => {
    const seen = new Set<string>();
    let occupiedSlots = 0;
    let roomCount = 0;
    for (const g of filteredGrids) {
      for (const r of g.rooms) {
        if (seen.has(r.name)) continue;
        seen.add(r.name);
        roomCount += 1;
        occupiedSlots += r.occupiedSlotsCount;
      }
    }
    const totalSlots = roomCount * TIME_SLOTS.length;
    const pct =
      totalSlots > 0 ? Math.round((occupiedSlots / totalSlots) * 100) : 0;
    return { roomCount, occupiedSlots, totalSlots, pct };
  }, [filteredGrids]);

  const fullDateLabel = useMemo(
    () => formatFullSpanishDate(selectedDate),
    [selectedDate]
  );

  const webUntisDirectUrl =
    timetable?.webUntisUrl ??
    `https://ehu.webuntis.com/WebUntis/?date=${encodeURIComponent(selectedDate)}#/basic/timetablePublic`;

  return (
    <div className="min-h-screen flex flex-col bg-[#f3f5f8] text-slate-900">
      {/* Strict 3-Zone Top Bar matching reference format */}
      <header className="no-print sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-slate-200/90">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              setActiveGrid('ALL');
              setRoomQuery('');
              setSubjectQuery('');
              setFreeAtSlot(null);
            }}
            className="font-display text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            Ingeniería 306
          </a>

          {/* Zone 2: Concise single-line section links */}
          <nav
            aria-label="Navegación por secciones"
            className="hidden md:flex items-center gap-6 text-sm font-medium"
          >
            {ROOM_GROUPS.map((g) => {
              const active = activeGrid === g.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() =>
                    setActiveGrid((prev) => (prev === g.id ? 'ALL' : g.id))
                  }
                  className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'border-red-600 text-slate-950 font-semibold'
                      : 'border-transparent text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {g.isSpecial ? 'Especiales' : g.shortLabel}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Single Primary Action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={handlePrintAll}
              disabled={!timetable || isLoading}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir todo</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-6 flex flex-col lg:flex-row items-start gap-6">
        {/* Mobile Calendar Toggle */}
        <div className="no-print w-full lg:hidden flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setMobileCalendarOpen((v) => !v)}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-200 rounded-lg cursor-pointer shrink-0"
          >
            <CalendarDays className="w-4 h-4 text-slate-500" />
            <span>
              {mobileCalendarOpen
                ? 'Ocultar calendario'
                : 'Calendario y filtros'}
            </span>
          </button>
          <div className="flex items-center gap-1 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveGrid('ALL')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 cursor-pointer ${
                activeGrid === 'ALL'
                  ? 'bg-red-600 text-white'
                  : 'bg-white border border-slate-200 text-slate-600'
              }`}
            >
              Todos
            </button>
            {ROOM_GROUPS.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setActiveGrid(g.id)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 cursor-pointer ${
                  activeGrid === g.id
                    ? 'bg-red-600 text-white'
                    : 'bg-white border border-slate-200 text-slate-600'
                }`}
              >
                {g.shortLabel}
              </button>
            ))}
          </div>
        </div>

        {/* Intuitive Calendar & Filters Sidebar */}
        <div
          className={`no-print w-full lg:w-auto ${
            mobileCalendarOpen ? 'block' : 'hidden lg:block'
          }`}
        >
          <CalendarSidebar
            selectedDate={selectedDate}
            todayIso={todayIso}
            onSelectDate={(iso) => {
              setSelectedDate(iso);
              setMobileCalendarOpen(false);
            }}
            roomQuery={roomQuery}
            onRoomQueryChange={setRoomQuery}
            freeAtSlot={freeAtSlot}
            onFreeAtSlotChange={setFreeAtSlot}
            currentSlotIndex={currentSlotIndex}
            autoRefresh={autoRefresh}
            onToggleAutoRefresh={() => setAutoRefresh((v) => !v)}
            onManualRefresh={() => fetchTimetable(selectedDate, true)}
            isLoading={isLoading}
            fetchedAt={timetable?.lastUpdated ?? null}
            lastImportTimestamp={timetable?.lastImportTimestamp ?? null}
            webUntisDirectUrl={webUntisDirectUrl}
          />
        </div>

        {/* Main Content Viewport */}
        <main className="flex-1 min-w-0 w-full space-y-5">
          {/* Architectural Deep-Slate Date Hero & Week Strip */}
          <section className="no-print bg-slate-900 text-white rounded-2xl p-5 sm:p-6 shadow-[0_6px_24px_rgba(15,23,42,0.12)] space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs text-slate-400 tracking-wide">
                  {SCHOOL_INFO.university} · {SCHOOL_INFO.name} · Centro{' '}
                  {SCHOOL_INFO.centerCode}
                </p>
                <h1 className="text-2xl sm:text-[28px] font-bold text-white tracking-tight mt-1 [text-wrap:balance]">
                  {fullDateLabel}
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => fetchTimetable(selectedDate, true)}
                  disabled={isLoading}
                  title="Sincronizar ahora con ehu.webuntis.com"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`}
                  />
                  <span>{isLoading ? 'Actualizando...' : 'Actualizar'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDate((d) => addDays(d, -1))}
                  aria-label="Día anterior"
                  title="Día anterior (Flecha izquierda)"
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-200 bg-white/10 hover:bg-white/15 border border-white/10 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span className="hidden sm:inline">Anterior</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDate(todayIso)}
                  className="px-3.5 py-1.5 text-xs font-medium text-slate-900 bg-white hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  Hoy
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDate((d) => addDays(d, 1))}
                  aria-label="Día siguiente"
                  title="Día siguiente (Flecha derecha)"
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-200 bg-white/10 hover:bg-white/15 border border-white/10 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  <span className="hidden sm:inline">Siguiente</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Interactive Monday-Saturday Week Strip with Crimson Occupancy Bars */}
            <div
              role="tablist"
              aria-label="Días de la semana"
              className="grid grid-cols-3 sm:grid-cols-6 gap-2"
            >
              {weekDays.map((day) => {
                const isSelected = day.iso === selectedDate;
                const isToday = day.iso === todayIso;
                return (
                  <button
                    key={day.iso}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    onClick={() => setSelectedDate(day.iso)}
                    className={`px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer border ${
                      isSelected
                        ? 'bg-white text-slate-900 border-white shadow-sm'
                        : 'bg-white/[0.06] text-slate-200 border-white/10 hover:bg-white/[0.11]'
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-1">
                      <span className="text-xs font-semibold">
                        {day.shortDay}{' '}
                        <span className="font-mono tabular-nums">
                          {day.dayNum}
                        </span>
                      </span>
                      {isToday && (
                        <span
                          className={`text-[10px] font-semibold ${
                            isSelected ? 'text-red-600' : 'text-red-400'
                          }`}
                        >
                          Hoy
                        </span>
                      )}
                    </div>
                    <div
                      className={`text-[11px] font-mono tabular-nums mt-0.5 truncate ${
                        isSelected ? 'text-slate-500' : 'text-slate-400'
                      }`}
                    >
                      {day.activeRooms !== null
                        ? `${day.activeRooms} activos`
                        : '—'}
                    </div>
                    <div
                      className={`mt-2 h-1 w-full rounded-full overflow-hidden ${
                        isSelected ? 'bg-slate-200' : 'bg-white/15'
                      }`}
                    >
                      <div
                        className="h-full bg-red-600 rounded-full transition-all duration-300"
                        style={{ width: `${day.pct}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Quiet Unboxed Summary & Legend */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-white/10 text-xs text-slate-300">
              <div className="flex flex-wrap items-center gap-2 tabular-nums">
                <span className="font-semibold text-white">
                  {totals.roomCount}{' '}
                  {totals.roomCount === 1
                    ? 'espacio visible'
                    : 'espacios visibles'}
                </span>
                <span className="text-white/30" aria-hidden="true">
                  ·
                </span>
                <span>{totals.occupiedSlots} franjas ocupadas</span>
                <span className="text-white/30" aria-hidden="true">
                  ·
                </span>
                <span>{totals.pct}% ocupación diaria</span>
                {timetable && !errorMsg && (
                  <>
                    <span className="text-white/30" aria-hidden="true">
                      ·
                    </span>
                    <span className="inline-flex items-center gap-1 text-emerald-300 font-mono">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {timetable.syncedRooms}/{timetable.totalRooms} WebUntis{' '}
                      {formatSyncTime(timetable.lastUpdated)}
                    </span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-4 text-xs">
                {normalizedSubject.length > 0 && (
                  <span className="inline-flex items-center gap-1.5 text-emerald-300">
                    <span className="inline-block w-3.5 h-3 rounded-[2px] bg-emerald-600 ring-1 ring-emerald-400/60" />
                    Asignatura buscada
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5 text-slate-200">
                  <span className="inline-block w-3.5 h-3 rounded-[2px] bg-red-600 ring-1 ring-red-400/50" />
                  Ocupada
                </span>
                <span className="inline-flex items-center gap-1.5 text-slate-200">
                  <span className="inline-block w-3.5 h-3 rounded-[2px] bg-white border border-slate-400" />
                  Libre
                </span>
              </div>
            </div>
          </section>

          {/* Dedicated Subject Search Bar (Highlights matching hours in green) */}
          <section
            aria-label="Buscador por nombre de asignatura"
            className="no-print bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3"
          >
            <div className="relative flex-1 min-w-0">
              <BookOpen
                className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none transition-colors ${
                  normalizedSubject.length > 0
                    ? 'text-emerald-600'
                    : 'text-slate-400'
                }`}
              />
              <input
                type="text"
                list="asignaturas-del-dia"
                value={subjectQuery}
                onChange={(e) => setSubjectQuery(e.target.value)}
                placeholder="Buscar por nombre de asignatura o actividad (ej. Cálculo, Física, Álgebra...)"
                aria-label="Buscar por nombre de asignatura"
                className={`w-full pl-9 pr-9 py-2 text-sm text-slate-900 placeholder:text-slate-400 rounded-xl border transition-colors focus:outline-none focus:ring-2 ${
                  normalizedSubject.length > 0
                    ? 'bg-emerald-50/40 border-emerald-300 focus:ring-emerald-600 focus:border-transparent'
                    : 'bg-slate-50 border-slate-200 focus:bg-white focus:ring-emerald-600 focus:border-transparent'
                }`}
              />
              <datalist id="asignaturas-del-dia">
                {availableSubjects.map((subj) => (
                  <option key={subj} value={subj} />
                ))}
              </datalist>
              {subjectQuery && (
                <button
                  type="button"
                  onClick={() => setSubjectQuery('')}
                  aria-label="Quitar búsqueda de asignatura"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 rounded-md cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {subjectMatchSummary ? (
              <div className="flex items-center justify-between sm:justify-end gap-3 text-xs shrink-0 tabular-nums">
                <span className="text-emerald-800 font-medium">
                  {subjectMatchSummary.matchingSlots}{' '}
                  {subjectMatchSummary.matchingSlots === 1
                    ? 'franja en verde'
                    : 'franjas en verde'}{' '}
                  · {subjectMatchSummary.matchingRooms}{' '}
                  {subjectMatchSummary.matchingRooms === 1 ? 'aula' : 'aulas'}
                </span>
                <button
                  type="button"
                  onClick={() => setSubjectQuery('')}
                  className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  Quitar filtro
                </button>
              </div>
            ) : (
              <span className="text-xs text-slate-400 shrink-0 hidden md:inline">
                Las horas coincidentes se marcan en verde
              </span>
            )}
          </section>

          {/* Clean Workspace Section Switcher */}
          <div className="no-print flex items-center gap-1.5 p-1 bg-white border border-slate-200/90 rounded-xl overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveGrid('ALL')}
              className={`px-3.5 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeGrid === 'ALL'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              Todos ({ALL_UNIQUE_ROOM_NAMES.length})
            </button>
            {ROOM_GROUPS.map((g) => {
              const active = activeGrid === g.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setActiveGrid(g.id)}
                  className={`px-3.5 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-red-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {g.title}{' '}
                  <span
                    className={`font-mono tabular-nums ${
                      active ? 'text-red-100' : 'text-slate-400'
                    }`}
                  >
                    ({g.rooms.length})
                  </span>
                </button>
              );
            })}
          </div>

          {/* Error State */}
          {errorMsg && (
            <div
              role="alert"
              className="no-print bg-white border border-red-200 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4"
            >
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    Error de sincronización con WebUntis
                  </h2>
                  <p className="text-xs text-slate-600 mt-0.5">{errorMsg}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => fetchTimetable(selectedDate, true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer whitespace-nowrap"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reintentar</span>
              </button>
            </div>
          )}

          {/* Loading Skeleton */}
          {isLoading && !timetable && (
            <div className="no-print space-y-5" aria-busy="true">
              {ROOM_GROUPS.map((g) => (
                <div
                  key={g.id}
                  className="bg-white border border-slate-200 rounded-2xl overflow-hidden"
                >
                  <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                    <div className="space-y-1.5">
                      <div className="h-4 w-48 bg-slate-200 rounded animate-pulse" />
                      <div className="h-2 w-32 bg-slate-100 rounded animate-pulse" />
                    </div>
                    <div className="h-8 w-36 bg-slate-100 rounded-lg animate-pulse" />
                  </div>
                  <div className="p-4 space-y-2">
                    {Array.from({ length: Math.min(g.rooms.length, 6) }).map(
                      (_, idx) => (
                        <div
                          key={idx}
                          className="h-6 w-full bg-slate-100 rounded animate-pulse"
                        />
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Populated Grids */}
          {timetable && filteredGrids.length > 0 && (
            <div
              className={`space-y-6 transition-opacity duration-150 ${
                isLoading ? 'opacity-65' : 'opacity-100'
              }`}
            >
              {filteredGrids.map((grid) => (
                <TimetableGrid
                  key={grid.id}
                  grid={grid}
                  dateIso={timetable.date}
                  currentSlotIndex={currentSlotIndex}
                  highlightedSlotIndex={freeAtSlot}
                  subjectQuery={subjectQuery}
                  onSelectSubject={setSubjectQuery}
                  onPrintGrid={handlePrintGrid}
                />
              ))}
            </div>
          )}

          {/* Empty Filter State */}
          {timetable && !isLoading && filteredGrids.length === 0 && (
            <div className="no-print bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-3">
              <p className="text-sm font-semibold text-slate-900">
                No hay espacios que coincidan con los filtros activos
              </p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Prueba con otro código de aula, cambia la franja horaria o
                selecciona todos los apartados para ver los{' '}
                {ALL_UNIQUE_ROOM_NAMES.length} espacios del centro.
              </p>
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setActiveGrid('ALL');
                    setRoomQuery('');
                    setSubjectQuery('');
                    setFreeAtSlot(null);
                  }}
                  className="px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                >
                  Restablecer filtros
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Quiet Institutional Footer */}
      <footer className="no-print border-t border-slate-200/90 bg-white mt-8">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <span>
            {SCHOOL_INFO.university} · {SCHOOL_INFO.name} (Centro{' '}
            {SCHOOL_INFO.centerCode})
          </span>
          <span>
            Sincronización en vivo con ehu.webuntis.com · Impresión en A4
            horizontal
          </span>
        </div>
      </footer>
    </div>
  );
}
