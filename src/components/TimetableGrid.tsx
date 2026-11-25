import { AnimatePresence, motion } from 'motion/react';
import {
  BookOpen,
  Clock,
  GraduationCap,
  Highlighter,
  Printer,
  User,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { SCHOOL_INFO, TIME_SLOTS } from '../data/roomGroups';
import type {
  GridDaySchedule,
  PeriodDetail,
  RoomDaySchedule,
  RoomGroupId,
} from '../data/roomGroups';
import {
  formatWebUntisDayHeader,
  normalizeSearchText,
} from '../utils/dateUtils';

interface TimetableGridProps {
  grid: GridDaySchedule;
  dateIso: string;
  currentSlotIndex: number | null;
  highlightedSlotIndex: number | null;
  subjectQuery: string;
  onSelectSubject: (subjectName: string) => void;
  onPrintGrid: (gridId: RoomGroupId) => void;
}

interface SelectedCell {
  room: RoomDaySchedule;
  slotIndex: number;
  occupied: boolean;
  details: PeriodDetail[];
}

function getSlotDetails(
  room: RoomDaySchedule,
  slotIndex: number
): PeriodDetail[] {
  const slot = TIME_SLOTS[slotIndex];
  return room.periods.filter(
    (p) => p.startTime < slot.endTime && p.endTime > slot.startTime
  );
}

function matchesSubjectPeriod(
  detail: PeriodDetail,
  normalizedSubject: string
): boolean {
  if (!normalizedSubject) return false;
  return (
    normalizeSearchText(detail.subject).includes(normalizedSubject) ||
    normalizeSearchText(detail.subjectAlt).includes(normalizedSubject) ||
    detail.groups.some((g) =>
      normalizeSearchText(g).includes(normalizedSubject)
    )
  );
}

function computeFreeWindow(
  room: RoomDaySchedule,
  slotIndex: number
): {
  startLabel: string;
  endLabel: string;
  durationMinutes: number;
} {
  let start = slotIndex;
  while (start > 0 && room.slots[start - 1] === 'free') {
    start--;
  }
  let end = slotIndex;
  while (end < TIME_SLOTS.length - 1 && room.slots[end + 1] === 'free') {
    end++;
  }
  return {
    startLabel: TIME_SLOTS[start].label,
    endLabel: TIME_SLOTS[end].endLabel,
    durationMinutes: (end - start + 1) * 30,
  };
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

export function TimetableGrid({
  grid,
  dateIso,
  currentSlotIndex,
  highlightedSlotIndex,
  subjectQuery,
  onSelectSubject,
  onPrintGrid,
}: TimetableGridProps) {
  const normalizedSubject = useMemo(
    () => normalizeSearchText(subjectQuery),
    [subjectQuery]
  );

  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);

  useEffect(() => {
    setSelectedCell(null);
  }, [dateIso]);

  const webUntisDateHeader = formatWebUntisDayHeader(dateIso);
  const occupancyPct =
    grid.totalSlots > 0
      ? Math.round((grid.occupiedSlots / grid.totalSlots) * 100)
      : 0;

  const freeWindow = useMemo(() => {
    if (!selectedCell || selectedCell.occupied) return null;
    return computeFreeWindow(selectedCell.room, selectedCell.slotIndex);
  }, [selectedCell]);

  const roomColWidthClass = grid.isSpecial ? 'w-[196px]' : 'w-[184px]';

  return (
    <section
      id={`cuadricula-${grid.id}`}
      data-grid-id={grid.id}
      aria-label={grid.title}
      className="printable-grid bg-white border border-slate-200/90 rounded-2xl shadow-[0_1px_3px_rgba(15,23,42,0.04)] overflow-hidden scroll-mt-20"
    >
      {/* Print-Only Institutional Header */}
      <div className="print-only hidden mb-2 pb-1.5 border-b border-slate-400">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              {SCHOOL_INFO.university} · {SCHOOL_INFO.name} (Centro{' '}
              {SCHOOL_INFO.centerCode}) — {grid.title}
            </h2>
            <p className="text-[10px] text-slate-600">
              {grid.subtitle} · {grid.rooms.length}{' '}
              {grid.isSpecial ? 'espacios' : 'aulas'} · Fuente: ehu.webuntis.com
              {normalizedSubject.length > 0 &&
                ` · Filtro: ${subjectQuery.trim()}`}
            </p>
          </div>
          <div className="text-right font-mono tabular-nums text-xs font-semibold text-slate-900">
            {webUntisDateHeader}
          </div>
        </div>
      </div>

      {/* Screen Card Header */}
      <div className="no-print px-5 py-4 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-4 bg-white">
        <div className="min-w-0 space-y-1">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              {grid.title}
            </h2>
            <span className="text-xs text-slate-500 tabular-nums">
              {grid.rooms.length} {grid.isSpecial ? 'espacios' : 'aulas'} ·{' '}
              {grid.activeRoomsCount} con actividad · {occupancyPct}% ocupado
            </span>
          </div>
          <p className="text-xs text-slate-500">{grid.subtitle}</p>
        </div>

        <button
          type="button"
          onClick={() => onPrintGrid(grid.id)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 hover:bg-slate-100 hover:border-slate-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Printer className="w-3.5 h-3.5 text-slate-500" />
          <span>Imprimir cuadrícula</span>
        </button>
      </div>

      {/* Smoothly Expanding Cell Inspector Drawer */}
      <AnimatePresence initial={false}>
        {selectedCell && (
          <motion.div
            key={`${selectedCell.room.name}-${selectedCell.slotIndex}`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="no-print overflow-hidden border-b border-slate-200 bg-slate-50/90"
          >
            <div className="px-5 py-4">
              {/* Top drawer bar */}
              <div className="flex items-start justify-between gap-4 pb-3 border-b border-slate-200/80">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <span className="text-sm font-bold font-mono text-slate-900">
                      {selectedCell.room.name}
                    </span>
                    {selectedCell.room.longName &&
                      selectedCell.room.longName !== selectedCell.room.name && (
                        <>
                          <span className="text-slate-300" aria-hidden="true">
                            ·
                          </span>
                          <span className="text-xs text-slate-600">
                            {selectedCell.room.longName}
                          </span>
                        </>
                      )}
                    {selectedCell.room.capacity > 0 && (
                      <>
                        <span className="text-slate-300" aria-hidden="true">
                          ·
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs text-slate-600 tabular-nums">
                          <Users className="w-3.5 h-3.5 text-slate-400" />
                          {selectedCell.room.capacity} plazas
                        </span>
                      </>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-1 text-xs tabular-nums">
                    <span className="font-mono font-medium text-slate-700">
                      Franja {TIME_SLOTS[selectedCell.slotIndex].label} –{' '}
                      {TIME_SLOTS[selectedCell.slotIndex].endLabel}
                    </span>
                    <span className="text-slate-300" aria-hidden="true">
                      ·
                    </span>
                    <span
                      className={
                        selectedCell.occupied
                          ? 'font-semibold text-red-700'
                          : 'font-semibold text-emerald-700'
                      }
                    >
                      {selectedCell.occupied ? 'Ocupada' : 'Disponible'}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedCell(null)}
                  aria-label="Cerrar panel de detalle"
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {selectedCell.occupied ? (
                <div className="pt-4 space-y-3">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {selectedCell.details.map((detail) => {
                      const detailMatches = matchesSubjectPeriod(
                        detail,
                        normalizedSubject
                      );
                      const isExactSelected =
                        normalizeSearchText(detail.subject) ===
                          normalizedSubject && normalizedSubject.length > 0;
                      return (
                        <div
                          key={`${detail.id}-${detail.startTime}`}
                          className={`bg-white border rounded-xl p-3.5 space-y-2 ${
                            detailMatches
                              ? 'border-emerald-300 ring-1 ring-emerald-200/70'
                              : 'border-slate-200'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-2 min-w-0">
                              <BookOpen
                                className={`w-4 h-4 shrink-0 mt-0.5 ${
                                  detailMatches
                                    ? 'text-emerald-600'
                                    : 'text-red-600'
                                }`}
                              />
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-900 leading-snug">
                                  {detail.subject}
                                </p>
                                {detail.subjectAlt && (
                                  <p className="text-xs text-slate-500 mt-0.5">
                                    {detail.subjectAlt}
                                  </p>
                                )}
                              </div>
                            </div>
                            <span
                              className={`font-mono tabular-nums text-xs font-semibold whitespace-nowrap shrink-0 ${
                                detailMatches
                                  ? 'text-emerald-700'
                                  : 'text-red-700'
                              }`}
                            >
                              {detail.startLabel} – {detail.endLabel}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1 text-xs text-slate-600">
                            {detail.teachers.length > 0 && (
                              <span className="inline-flex items-center gap-1.5">
                                <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span>{detail.teachers.join(', ')}</span>
                              </span>
                            )}
                            {detail.groups.length > 0 && (
                              <span className="inline-flex items-center gap-1.5">
                                <GraduationCap className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span>{detail.groups.join(', ')}</span>
                              </span>
                            )}
                            {detail.lessonText &&
                              detail.lessonText !== detail.subject && (
                                <span className="text-slate-500">
                                  {detail.lessonText}
                                </span>
                              )}
                            {detail.isExam && (
                              <span className="font-semibold text-red-800">
                                Examen
                              </span>
                            )}
                          </div>

                          {(detail.periodText || detail.substText) && (
                            <p className="text-xs text-slate-500 pt-0.5">
                              {[detail.periodText, detail.substText]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          )}

                          <div className="pt-1.5 border-t border-slate-100 flex justify-end">
                            <button
                              type="button"
                              onClick={() =>
                                onSelectSubject(
                                  isExactSelected ? '' : detail.subject
                                )
                              }
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                                isExactSelected
                                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                  : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                              }`}
                            >
                              <Highlighter className="w-3.5 h-3.5" />
                              <span>
                                {isExactSelected
                                  ? 'Quitar resaltado verde'
                                  : 'Marcar asignatura en verde'}
                              </span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="pt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      Espacio disponible sin actividad programada en WebUntis
                      para esta franja.
                    </span>
                  </div>
                  {freeWindow && (
                    <span className="font-mono tabular-nums font-medium text-slate-800">
                      Tramo libre continuo: {freeWindow.startLabel} –{' '}
                      {freeWindow.endLabel} (
                      {formatDuration(freeWindow.durationMinutes)})
                    </span>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Precision Timetable Grid */}
      <div className="timetable-scroll-wrap overflow-x-auto">
        <table className="timetable-table w-full min-w-[920px] border-collapse table-fixed">
          <colgroup>
            <col className={`timetable-room-col ${roomColWidthClass}`} />
            {TIME_SLOTS.map((slot) => (
              <col key={slot.index} />
            ))}
          </colgroup>
          <thead>
            <tr className="bg-slate-50">
              <th
                rowSpan={2}
                scope="col"
                className={`timetable-room-col sticky left-0 z-20 bg-slate-50 border-r border-b border-slate-300 px-3 py-2 text-left text-xs font-semibold text-slate-700 align-middle`}
              >
                {grid.isSpecial ? 'Espacios' : 'Aulas'}
              </th>
              <th
                colSpan={TIME_SLOTS.length}
                scope="colgroup"
                className="border-b border-slate-300 py-1.5 text-center text-xs font-semibold text-slate-700 font-mono tabular-nums tracking-tight"
              >
                {webUntisDateHeader}
              </th>
            </tr>
            <tr className="bg-slate-50/70">
              {TIME_SLOTS.map((slot) => {
                const isNow = currentSlotIndex === slot.index;
                const isHighlighted = highlightedSlotIndex === slot.index;
                const isFullHour = slot.minute === '00';
                return (
                  <th
                    key={slot.index}
                    scope="col"
                    className={`border-b border-r last:border-r-0 border-slate-300 py-1 text-center font-mono tabular-nums leading-[1.15] select-none ${
                      isHighlighted
                        ? 'bg-emerald-50 text-emerald-900 font-semibold'
                        : isNow
                          ? 'bg-amber-50 text-amber-900 font-semibold'
                          : isFullHour
                            ? 'text-slate-800 font-semibold'
                            : 'text-slate-400 font-normal'
                    }`}
                  >
                    <span className="block text-[10.5px]">{slot.hour}</span>
                    <span className="block text-[10px]">{slot.minute}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {grid.rooms.map((room) => {
              const isRowActive = selectedCell?.room.name === room.name;
              const roomMatchesSubject =
                normalizedSubject.length > 0 &&
                room.periods.some((p) =>
                  matchesSubjectPeriod(p, normalizedSubject)
                );
              return (
                <tr
                  key={`${grid.id}-${room.name}`}
                  className={`group transition-colors ${
                    isRowActive
                      ? 'bg-red-50/30'
                      : roomMatchesSubject
                        ? 'bg-emerald-50/30 hover:bg-emerald-50/60'
                        : 'hover:bg-slate-50/70'
                  }`}
                >
                  <th
                    scope="row"
                    title={
                      room.capacity > 0
                        ? `${room.name} (${room.longName}) · Aforo: ${room.capacity} plazas`
                        : `${room.name} (${room.longName})`
                    }
                    className={`timetable-room-col sticky left-0 z-10 border-r border-b border-slate-300 px-3 py-1.5 text-left font-mono tabular-nums text-[11.5px] font-medium whitespace-nowrap transition-colors ${
                      isRowActive
                        ? 'bg-red-50/60 text-slate-950 font-semibold'
                        : roomMatchesSubject
                          ? 'bg-emerald-50/90 text-emerald-900 font-semibold'
                          : 'bg-white group-hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">{room.name}</span>
                      {grid.isSpecial && room.capacity > 0 && (
                        <span className="no-print text-[10px] text-slate-400 font-normal shrink-0">
                          {room.capacity}
                        </span>
                      )}
                    </div>
                  </th>
                  {TIME_SLOTS.map((slot) => {
                    const slotState = room.slots[slot.index];
                    const occupied = slotState !== 'free';
                    const details = occupied
                      ? getSlotDetails(room, slot.index)
                      : [];
                    const isSubjectMatch =
                      normalizedSubject.length > 0 &&
                      occupied &&
                      details.some((d) =>
                        matchesSubjectPeriod(d, normalizedSubject)
                      );
                    const isSelected =
                      selectedCell?.room.name === room.name &&
                      selectedCell?.slotIndex === slot.index;
                    const isNow = currentSlotIndex === slot.index;
                    const isHighlighted = highlightedSlotIndex === slot.index;

                    const tooltipTitle = occupied
                      ? `${room.name} · ${slot.label}–${slot.endLabel}: ${details
                          .map((d) => {
                            const prof =
                              d.teachers.length > 0
                                ? ` · Prof: ${d.teachers.join(', ')}`
                                : '';
                            return `${d.subject}${prof}`;
                          })
                          .join(' / ')}`
                      : `${room.name} · ${slot.label}–${slot.endLabel}: Libre`;

                    const cellColorClass = isSubjectMatch
                      ? 'timetable-slot-subject-match bg-emerald-600 hover:bg-emerald-700 border-emerald-700/40'
                      : occupied
                        ? normalizedSubject.length > 0
                          ? 'timetable-slot-occupied bg-red-500/45 hover:bg-red-600/75 border-red-400/40'
                          : 'timetable-slot-occupied bg-red-600 hover:bg-red-700 border-red-700/35'
                        : isHighlighted
                          ? 'timetable-slot-free bg-emerald-50/70 hover:bg-emerald-100/70 border-slate-200'
                          : isNow
                            ? 'timetable-slot-free bg-amber-50/50 hover:bg-amber-100/60 border-slate-200'
                            : 'timetable-slot-free bg-white hover:bg-slate-100 border-slate-200';

                    return (
                      <td
                        key={slot.index}
                        onClick={() =>
                          setSelectedCell(
                            isSelected
                              ? null
                              : {
                                  room,
                                  slotIndex: slot.index,
                                  occupied,
                                  details,
                                }
                          )
                        }
                        title={tooltipTitle}
                        className={`h-[28px] border-b border-r last:border-r-0 p-0 cursor-pointer transition-colors ${cellColorClass} ${
                          isSelected
                            ? 'ring-2 ring-inset ring-slate-950 relative z-[1]'
                            : ''
                        }`}
                      />
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Print-Only Compact Legend */}
      <div className="print-only hidden mt-2 pt-1 flex items-center justify-between text-[9px] text-slate-600">
        <div className="flex items-center gap-4">
          {normalizedSubject.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3 h-2.5 bg-emerald-600 border border-emerald-700 timetable-slot-subject-match" />
              Asignatura buscada
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-2.5 bg-red-600 border border-red-700 timetable-slot-occupied" />
            Franja ocupada
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-2.5 bg-white border border-slate-400" />
            Franja libre
          </span>
        </div>
        <span className="font-mono tabular-nums">
          Horario 08:00–21:00 · Centro {SCHOOL_INFO.centerCode}{' '}
          {SCHOOL_INFO.name}
        </span>
      </div>
    </section>
  );
}
