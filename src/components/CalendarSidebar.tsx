import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { SCHOOL_INFO, TIME_SLOTS } from '../data/roomGroups';
import {
  addDays,
  formatSyncTime,
  formatWebUntisImportTimestamp,
  getAllMonthsES,
  getMondayOfWeek,
  getMonthCalendarCells,
  getNextMondayISO,
  parseISODate,
} from '../utils/dateUtils';

interface CalendarSidebarProps {
  selectedDate: string;
  todayIso: string;
  onSelectDate: (isoDate: string) => void;
  roomQuery: string;
  onRoomQueryChange: (value: string) => void;
  freeAtSlot: number | null;
  onFreeAtSlotChange: (slotIndex: number | null) => void;
  currentSlotIndex: number | null;
  autoRefresh: boolean;
  onToggleAutoRefresh: () => void;
  onManualRefresh: () => void;
  isLoading: boolean;
  fetchedAt: string | null;
  lastImportTimestamp: number | null;
  webUntisDirectUrl: string;
}

const WEEKDAY_HEADERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const SELECTABLE_YEARS = [2024, 2025, 2026, 2027, 2028];

export function CalendarSidebar({
  selectedDate,
  todayIso,
  onSelectDate,
  roomQuery,
  onRoomQueryChange,
  freeAtSlot,
  onFreeAtSlotChange,
  currentSlotIndex,
  autoRefresh,
  onToggleAutoRefresh,
  onManualRefresh,
  isLoading,
  fetchedAt,
  lastImportTimestamp,
  webUntisDirectUrl,
}: CalendarSidebarProps) {
  const initialDate = parseISODate(selectedDate);
  const [viewYear, setViewYear] = useState(initialDate.getUTCFullYear());
  const [viewMonth, setViewMonth] = useState(initialDate.getUTCMonth());

  useEffect(() => {
    const parsed = parseISODate(selectedDate);
    setViewYear(parsed.getUTCFullYear());
    setViewMonth(parsed.getUTCMonth());
  }, [selectedDate]);

  const months = useMemo(() => getAllMonthsES(), []);
  const cells = useMemo(
    () => getMonthCalendarCells(viewYear, viewMonth),
    [viewYear, viewMonth]
  );
  const activeWeekMonday = useMemo(
    () => getMondayOfWeek(selectedDate),
    [selectedDate]
  );

  const lastWebUntisImport = useMemo(
    () => formatWebUntisImportTimestamp(lastImportTimestamp),
    [lastImportTimestamp]
  );

  const hasFilters = roomQuery.trim().length > 0 || freeAtSlot !== null;

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => Math.max(2020, y - 1));
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => Math.min(2035, y + 1));
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  return (
    <aside className="w-full lg:w-[276px] shrink-0 space-y-4 lg:sticky lg:top-20">
      {/* Calendar Card */}
      <section
        aria-label="Calendario de fechas"
        className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-4"
      >
        <div className="flex items-center justify-between gap-2 mb-3">
          <button
            type="button"
            onClick={handlePrevMonth}
            aria-label="Mes anterior"
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-1 min-w-0">
            <select
              aria-label="Seleccionar mes"
              value={viewMonth}
              onChange={(e) => setViewMonth(Number(e.target.value))}
              className="text-xs font-bold text-slate-900 bg-transparent hover:bg-slate-100 rounded-md px-1.5 py-1 cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-600"
            >
              {months.map((label, idx) => (
                <option key={label} value={idx}>
                  {label}
                </option>
              ))}
            </select>
            <select
              aria-label="Seleccionar año"
              value={viewYear}
              onChange={(e) => setViewYear(Number(e.target.value))}
              className="text-xs font-bold font-mono tabular-nums text-slate-700 bg-transparent hover:bg-slate-100 rounded-md px-1 py-1 cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-600"
            >
              {SELECTABLE_YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={handleNextMonth}
            aria-label="Mes siguiente"
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-7 mb-1">
          {WEEKDAY_HEADERS.map((h) => (
            <div
              key={h}
              className="text-center text-[11px] font-semibold text-slate-400 py-1 select-none"
            >
              {h}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-y-0.5">
          {cells.map((cell) => {
            const isSelected = cell.iso === selectedDate;
            const isToday = cell.iso === todayIso;
            const isInActiveWeek =
              getMondayOfWeek(cell.iso) === activeWeekMonday;
            return (
              <button
                key={cell.iso}
                type="button"
                onClick={() => onSelectDate(cell.iso)}
                aria-pressed={isSelected}
                aria-label={`Seleccionar ${cell.iso}`}
                className={[
                  'h-8 w-full text-xs font-mono tabular-nums transition-colors relative flex items-center justify-center cursor-pointer',
                  isSelected
                    ? 'bg-red-600 text-white font-semibold rounded-lg z-10 shadow-xs'
                    : isInActiveWeek
                      ? 'bg-slate-100 text-slate-900 hover:bg-slate-200 first:rounded-l-lg'
                      : cell.inCurrentMonth
                        ? 'text-slate-700 hover:bg-slate-100 rounded-lg'
                        : 'text-slate-400 hover:bg-slate-50 rounded-lg',
                  isToday && !isSelected
                    ? 'ring-1 ring-inset ring-red-600 font-semibold text-red-700 rounded-lg'
                    : '',
                ].join(' ')}
              >
                {cell.day}
              </button>
            );
          })}
        </div>

        {/* Quick Date Jump Buttons */}
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onSelectDate(todayIso)}
            className="flex-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={() => onSelectDate(addDays(todayIso, 1))}
            className="flex-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            Mañana
          </button>
          <button
            type="button"
            onClick={() => onSelectDate(getNextMondayISO(todayIso))}
            className="flex-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            Próx. lunes
          </button>
        </div>

        {/* Direct Date Input */}
        <div className="mt-3">
          <label
            htmlFor="direct-date-input"
            className="block text-xs font-medium text-slate-600 mb-1"
          >
            Ir a fecha exacta
          </label>
          <div className="relative">
            <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="direct-date-input"
              type="date"
              min="2020-01-01"
              max="2035-12-31"
              value={selectedDate}
              onChange={(e) => {
                if (e.target.value) onSelectDate(e.target.value);
              }}
              className="w-full pl-8 pr-2.5 py-1.5 text-xs font-mono tabular-nums text-slate-800 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent"
            />
          </div>
        </div>
      </section>

      {/* Classroom Search & Availability Filter */}
      <section
        aria-label="Filtros de aulas"
        className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-4 space-y-3"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-900">Buscar aulas</h2>
          {hasFilters && (
            <button
              type="button"
              onClick={() => {
                onRoomQueryChange('');
                onFreeAtSlotChange(null);
              }}
              className="text-xs font-medium text-red-700 hover:text-red-800 cursor-pointer whitespace-nowrap"
            >
              Limpiar
            </button>
          )}
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={roomQuery}
            onChange={(e) => onRoomQueryChange(e.target.value)}
            placeholder="Ej. P3P2A, P4P14A, ACTOS, MAGNA..."
            aria-label="Filtrar aula o espacio por código o nombre"
            className="w-full pl-8 pr-7 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent"
          />
          {roomQuery && (
            <button
              type="button"
              onClick={() => onRoomQueryChange('')}
              aria-label="Borrar búsqueda"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div>
          <label
            htmlFor="free-slot-select"
            className="block text-xs font-medium text-slate-600 mb-1"
          >
            Mostrar espacios libres a las
          </label>
          <div className="relative">
            <Clock className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              id="free-slot-select"
              value={freeAtSlot === null ? '' : String(freeAtSlot)}
              onChange={(e) =>
                onFreeAtSlotChange(
                  e.target.value === '' ? null : Number(e.target.value)
                )
              }
              className="w-full pl-8 pr-2.5 py-1.5 text-xs font-mono tabular-nums text-slate-800 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent cursor-pointer"
            >
              <option value="">Todos los espacios (sin filtrar hora)</option>
              {TIME_SLOTS.map((slot) => (
                <option key={slot.index} value={slot.index}>
                  {slot.label} – {slot.endLabel}
                </option>
              ))}
            </select>
          </div>
          {currentSlotIndex !== null && selectedDate === todayIso && (
            <button
              type="button"
              onClick={() =>
                onFreeAtSlotChange(
                  freeAtSlot === currentSlotIndex ? null : currentSlotIndex
                )
              }
              className={`mt-2 w-full px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                freeAtSlot === currentSlotIndex
                  ? 'bg-emerald-700 text-white border-emerald-700'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {freeAtSlot === currentSlotIndex
                ? `Libres ahora (${TIME_SLOTS[currentSlotIndex].label})`
                : `Ver libres ahora (${TIME_SLOTS[currentSlotIndex].label})`}
            </button>
          )}
        </div>
      </section>

      {/* Live WebUntis Sync Panel */}
      <section
        aria-label="Sincronización con WebUntis"
        className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-4 space-y-3"
      >
        <div>
          <h2 className="text-sm font-bold text-slate-900">
            Sincronización WebUntis
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Centro {SCHOOL_INFO.centerCode} · {SCHOOL_INFO.name}
          </p>
        </div>

        <div className="text-xs text-slate-600 space-y-1.5 tabular-nums">
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500">Última consulta</span>
            <span className="font-mono text-slate-800">
              {formatSyncTime(fetchedAt)}
            </span>
          </div>
          {lastWebUntisImport && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500">Datos en WebUntis</span>
              <span className="font-mono text-slate-800">
                {lastWebUntisImport}
              </span>
            </div>
          )}
        </div>

        <label className="flex items-center justify-between gap-2 pt-2.5 border-t border-slate-100 cursor-pointer">
          <span className="text-xs text-slate-700">
            Auto-actualizar cada 5 min
          </span>
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={onToggleAutoRefresh}
            className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-600 cursor-pointer"
          />
        </label>

        <div className="flex flex-col gap-2 pt-1">
          <button
            type="button"
            onClick={onManualRefresh}
            disabled={isLoading}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`}
            />
            {isLoading ? 'Sincronizando...' : 'Actualizar ahora'}
          </button>
          <a
            href={webUntisDirectUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
          >
            <span>Abrir horario en WebUntis</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </section>
    </aside>
  );
}
