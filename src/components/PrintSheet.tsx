import { SCHOOL_INFO, TIME_SLOTS } from '../data/roomGroups';
import type {
  GridDaySchedule,
  PeriodDetail,
  RoomDaySchedule,
} from '../data/roomGroups';
import {
  formatWebUntisDayHeader,
  normalizeSearchText,
} from '../utils/dateUtils';
import type { PrintJobConfig } from './PrintCenterModal';

interface PrintSheetProps {
  config: PrintJobConfig | null;
  grids: GridDaySchedule[];
  dateIso: string;
  subjectQuery: string;
  teacherQuery: string;
}

interface UniqueRoomBlock {
  startLabel: string;
  endLabel: string;
  subject: string;
  teacher: string;
  group: string;
  lessonType: string;
}

function detailMatchesTeacher(
  detail: PeriodDetail,
  normalizedTeacher: string
): boolean {
  if (!normalizedTeacher) return false;
  if (
    detail.teachers.some((t) =>
      normalizeSearchText(t).includes(normalizedTeacher)
    )
  ) {
    return true;
  }
  return (detail.teacherDetails ?? []).some(
    (t) =>
      normalizeSearchText(t.fullName).includes(normalizedTeacher) ||
      normalizeSearchText(t.code).includes(normalizedTeacher)
  );
}

function detailMatchesSubject(
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

function getSlotDetails(
  room: RoomDaySchedule,
  slotIndex: number
): PeriodDetail[] {
  const slot = TIME_SLOTS[slotIndex];
  return room.periods.filter(
    (p) => p.startTime < slot.endTime && p.endTime > slot.startTime
  );
}

function extractRoomDailyBlocks(room: RoomDaySchedule): UniqueRoomBlock[] {
  // Merge consecutive periods of the same session so continuous block hours appear cleanly
  const sorted = [...room.periods].sort(
    (a, b) => a.startTime - b.startTime || a.endTime - b.endTime
  );
  const blocks: Array<
    UniqueRoomBlock & { startTime: number; endTime: number }
  > = [];

  for (const p of sorted) {
    const teacher =
      p.teachers.length > 0 ? p.teachers.join(', ') : '—';
    const group = p.groups.join(', ');
    const prev = blocks[blocks.length - 1];
    if (
      prev &&
      prev.endTime === p.startTime &&
      prev.subject === p.subject &&
      prev.teacher === teacher &&
      prev.group === group
    ) {
      prev.endTime = p.endTime;
      prev.endLabel = p.endLabel;
    } else {
      blocks.push({
        startTime: p.startTime,
        endTime: p.endTime,
        startLabel: p.startLabel,
        endLabel: p.endLabel,
        subject: p.subject,
        teacher,
        group,
        lessonType: p.lessonText || (p.isExam ? 'Examen' : 'Actividad'),
      });
    }
  }
  return blocks;
}

export function PrintSheet({
  config,
  grids,
  dateIso,
  subjectQuery,
  teacherQuery,
}: PrintSheetProps) {
  if (!config) return null;

  const dateHeader = formatWebUntisDayHeader(dateIso);
  const normalizedSubject = normalizeSearchText(subjectQuery);
  const normalizedTeacher = normalizeSearchText(teacherQuery);

  const renderSlotClass = (room: RoomDaySchedule, slotIdx: number): string => {
    const occupied = room.slots[slotIdx] !== 'free';
    if (!occupied) return 'timetable-slot-free';
    const details = getSlotDetails(room, slotIdx);
    const subjMatch =
      normalizedSubject.length > 0 &&
      details.some((d) => detailMatchesSubject(d, normalizedSubject));
    const teachMatch =
      normalizedTeacher.length > 0 &&
      details.some((d) => detailMatchesTeacher(d, normalizedTeacher));
    if (subjMatch) return 'timetable-slot-subject-match';
    if (teachMatch) return 'timetable-slot-teacher-match';
    return 'timetable-slot-occupied';
  };

  if (config.mode === 'grids') {
    const targetGrids = grids.filter((g) => config.gridIds.includes(g.id));

    return (
      <div className="print-sheet-root hidden">
        {targetGrids.map((grid, idx) => {
          const isLast = idx === targetGrids.length - 1;
          return (
            <section
              key={grid.id}
              data-grid-id={grid.id}
              className={`print-sheet-section ${
                config.pageBreak && !isLast ? 'print-page-break' : 'mb-6'
              }`}
            >
              <div className="mb-2 pb-1.5 border-b border-slate-400 flex items-baseline justify-between gap-4">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    {SCHOOL_INFO.university} · {SCHOOL_INFO.name} (Centro{' '}
                    {SCHOOL_INFO.centerCode}) — {grid.title}
                  </h2>
                  <p className="text-[10px] text-slate-600">
                    {grid.subtitle} · {grid.rooms.length}{' '}
                    {grid.isSpecial ? 'espacios' : 'aulas'} · Fuente:
                    ehu.webuntis.com
                  </p>
                </div>
                <div className="text-right font-mono tabular-nums text-xs font-semibold text-slate-900">
                  {dateHeader}
                </div>
              </div>

              <table className="timetable-table w-full border-collapse table-fixed">
                <thead>
                  <tr className="bg-slate-50">
                    <th
                      rowSpan={2}
                      className={`timetable-room-col text-left font-semibold text-slate-700 ${
                        grid.isSpecial ? 'timetable-room-col-wide' : ''
                      }`}
                    >
                      {grid.isSpecial ? 'Espacios' : 'Aulas'}
                    </th>
                    <th
                      colSpan={TIME_SLOTS.length}
                      className="text-center font-semibold text-slate-700 font-mono tabular-nums"
                    >
                      {dateHeader}
                    </th>
                  </tr>
                  <tr className="bg-slate-50">
                    {TIME_SLOTS.map((slot) => (
                      <th
                        key={slot.index}
                        className="text-center font-mono tabular-nums leading-[1.15]"
                      >
                        <span className="block">{slot.hour}</span>
                        <span className="block">{slot.minute}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grid.rooms.map((room) => (
                    <tr key={`${grid.id}-${room.name}`}>
                      <th
                        scope="row"
                        className={`timetable-room-col text-left font-mono tabular-nums font-medium text-slate-800 whitespace-nowrap ${
                          grid.isSpecial ? 'timetable-room-col-wide' : ''
                        }`}
                      >
                        {room.name}
                      </th>
                      {TIME_SLOTS.map((slot) => (
                        <td
                          key={slot.index}
                          className={`h-[18px] ${renderSlotClass(room, slot.index)}`}
                        />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-1.5 flex items-center justify-between text-[9px] text-slate-600">
                <div className="flex items-center gap-4">
                  {normalizedSubject && (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block w-3 h-2.5 border border-emerald-700 timetable-slot-subject-match" />
                      Asignatura: {subjectQuery}
                    </span>
                  )}
                  {normalizedTeacher && (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block w-3 h-2.5 border border-blue-700 timetable-slot-teacher-match" />
                      Profesorado: {teacherQuery}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block w-3 h-2.5 border border-red-700 timetable-slot-occupied" />
                    Franja ocupada
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block w-3 h-2.5 bg-white border border-slate-400" />
                    Franja libre
                  </span>
                </div>
                <span className="font-mono tabular-nums">
                  Horario 08:00–21:00 · Centro {SCHOOL_INFO.centerCode}
                </span>
              </div>
            </section>
          );
        })}
      </div>
    );
  }

  // Custom Summary Mode: Unified Grid + Optional Detailed Breakdown of Selected Rooms
  const nameSet = new Set(config.roomNames);
  const seenNames = new Set<string>();
  const selectedEntries: Array<{ gridName: string; room: RoomDaySchedule }> =
    [];
  let hasSpecialRoom = false;

  for (const g of grids) {
    for (const r of g.rooms) {
      if (nameSet.has(r.name) && !seenNames.has(r.name)) {
        seenNames.add(r.name);
        selectedEntries.push({ gridName: g.shortLabel, room: r });
        if (g.isSpecial || r.name.includes('Edif')) hasSpecialRoom = true;
      }
    }
  }

  const totalOccupiedSlots = selectedEntries.reduce(
    (acc, item) => acc + item.room.occupiedSlotsCount,
    0
  );
  const totalPossibleSlots = selectedEntries.length * TIME_SLOTS.length;
  const avgPct =
    totalPossibleSlots > 0
      ? Math.round((totalOccupiedSlots / totalPossibleSlots) * 100)
      : 0;

  return (
    <div className="print-sheet-root hidden">
      <section className="print-sheet-section">
        <div className="mb-2.5 pb-1.5 border-b border-slate-400 flex items-baseline justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              {SCHOOL_INFO.university} · {SCHOOL_INFO.name} (Centro{' '}
              {SCHOOL_INFO.centerCode}) — Sumario de Aulas Seleccionadas
            </h2>
            <p className="text-[10px] text-slate-600">
              {selectedEntries.length}{' '}
              {selectedEntries.length === 1
                ? 'aula seleccionada'
                : 'aulas seleccionadas'}{' '}
              · {totalOccupiedSlots} franjas ocupadas ({avgPct}% ocupación
              media) · Fuente: ehu.webuntis.com
            </p>
          </div>
          <div className="text-right font-mono tabular-nums text-xs font-semibold text-slate-900">
            {dateHeader}
          </div>
        </div>

        {/* Unified Custom Matrix */}
        <table className="timetable-table w-full border-collapse table-fixed">
          <thead>
            <tr className="bg-slate-50">
              <th
                rowSpan={2}
                className={`timetable-room-col text-left font-semibold text-slate-700 ${
                  hasSpecialRoom ? 'timetable-room-col-wide' : ''
                }`}
              >
                Aulas
              </th>
              <th
                colSpan={TIME_SLOTS.length}
                className="text-center font-semibold text-slate-700 font-mono tabular-nums"
              >
                {dateHeader}
              </th>
            </tr>
            <tr className="bg-slate-50">
              {TIME_SLOTS.map((slot) => (
                <th
                  key={slot.index}
                  className="text-center font-mono tabular-nums leading-[1.15]"
                >
                  <span className="block">{slot.hour}</span>
                  <span className="block">{slot.minute}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {selectedEntries.map(({ room }) => (
              <tr key={room.name}>
                <th
                  scope="row"
                  className={`timetable-room-col text-left font-mono tabular-nums font-medium text-slate-800 whitespace-nowrap ${
                    hasSpecialRoom ? 'timetable-room-col-wide' : ''
                  }`}
                >
                  {room.name}
                </th>
                {TIME_SLOTS.map((slot) => (
                  <td
                    key={slot.index}
                    className={`h-[18px] ${renderSlotClass(room, slot.index)}`}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-1.5 flex items-center justify-between text-[9px] text-slate-600">
          <div className="flex items-center gap-4">
            {normalizedSubject && (
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block w-3 h-2.5 border border-emerald-700 timetable-slot-subject-match" />
                Asignatura: {subjectQuery}
              </span>
            )}
            {normalizedTeacher && (
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block w-3 h-2.5 border border-blue-700 timetable-slot-teacher-match" />
                Profesorado: {teacherQuery}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3 h-2.5 border border-red-700 timetable-slot-occupied" />
              Franja ocupada
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3 h-2.5 bg-white border border-slate-400" />
              Franja libre
            </span>
          </div>
          <span className="font-mono tabular-nums">
            Sumario personalizado · Centro {SCHOOL_INFO.centerCode}
          </span>
        </div>

        {/* Optional Detailed Schedule Table per Selected Room */}
        {config.includeDetails && (
          <div className="mt-5 pt-3 border-t border-slate-300">
            <h3 className="text-xs font-bold text-slate-900 mb-2">
              Desglose horario de aulas seleccionadas ({dateHeader})
            </h3>
            <table className="w-full border-collapse text-[9px]">
              <thead>
                <tr className="bg-slate-100 text-slate-700">
                  <th className="border border-slate-300 px-2 py-1 text-left w-[150px]">
                    Aula
                  </th>
                  <th className="border border-slate-300 px-2 py-1 text-left w-[78px]">
                    Horario
                  </th>
                  <th className="border border-slate-300 px-2 py-1 text-left">
                    Asignatura / Actividad
                  </th>
                  <th className="border border-slate-300 px-2 py-1 text-left w-[170px]">
                    Profesorado / Responsable
                  </th>
                  <th className="border border-slate-300 px-2 py-1 text-left w-[190px]">
                    Grupo / Titulación
                  </th>
                </tr>
              </thead>
              <tbody>
                {selectedEntries.flatMap(({ gridName, room }) => {
                  const blocks = extractRoomDailyBlocks(room);
                  if (blocks.length === 0) {
                    return [
                      <tr key={`${room.name}-free`}>
                        <td className="border border-slate-300 px-2 py-1 font-mono font-medium text-slate-800">
                          {room.name}{' '}
                          <span className="text-slate-400">({gridName})</span>
                        </td>
                        <td
                          colSpan={4}
                          className="border border-slate-300 px-2 py-1 text-slate-500 italic"
                        >
                          Sin ocupación registrada en esta fecha (libre toda la
                          jornada)
                        </td>
                      </tr>,
                    ];
                  }
                  return blocks.map((blk, i) => (
                    <tr key={`${room.name}-${blk.startLabel}-${i}`}>
                      <td className="border border-slate-300 px-2 py-1 font-mono font-medium text-slate-800">
                        {i === 0 ? (
                          <>
                            {room.name}{' '}
                            <span className="text-slate-400">({gridName})</span>
                          </>
                        ) : (
                          ''
                        )}
                      </td>
                      <td className="border border-slate-300 px-2 py-1 font-mono tabular-nums text-slate-800 whitespace-nowrap">
                        {blk.startLabel}–{blk.endLabel}
                      </td>
                      <td className="border border-slate-300 px-2 py-1 text-slate-900 font-medium">
                        {blk.subject}
                      </td>
                      <td className="border border-slate-300 px-2 py-1 text-slate-700">
                        {blk.teacher}
                      </td>
                      <td className="border border-slate-300 px-2 py-1 text-slate-600">
                        {blk.group || blk.lessonType}
                      </td>
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
