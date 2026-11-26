export interface TimeSlot {
  index: number;
  startTime: number; // e.g. 800, 830, ..., 2030
  endTime: number; // e.g. 830, 900, ..., 2100
  startMinutes: number; // 480 .. 1230
  endMinutes: number; // 510 .. 1260
  hour: string; // "08" .. "20"
  minute: string; // "00" | "30"
  label: string; // "08:00" .. "20:30"
  endLabel: string; // "08:30" .. "21:00"
}

export const TIME_SLOTS: TimeSlot[] = Array.from({ length: 26 }, (_, index) => {
  const startMinutes = 8 * 60 + index * 30;
  const endMinutes = startMinutes + 30;
  const startH = Math.floor(startMinutes / 60);
  const startM = startMinutes % 60;
  const endH = Math.floor(endMinutes / 60);
  const endM = endMinutes % 60;
  const hour = String(startH).padStart(2, '0');
  const minute = String(startM).padStart(2, '0');
  const endHour = String(endH).padStart(2, '0');
  const endMin = String(endM).padStart(2, '0');

  return {
    index,
    startTime: startH * 100 + startM,
    endTime: endH * 100 + endM,
    startMinutes,
    endMinutes,
    hour,
    minute,
    label: `${hour}:${minute}`,
    endLabel: `${endHour}:${endMin}`,
  };
});

export type RoomGroupId = 'edif-p' | 'especiales';

export interface RoomGroupDef {
  id: RoomGroupId;
  shortLabel: string;
  title: string;
  subtitle: string;
  isSpecial?: boolean;
  rooms: string[];
}

export const SCHOOL_INFO = {
  university: 'UPV/EHU',
  name: 'Escuela de Ingeniería de Bilbao',
  centerCode: '306',
  departmentId: 238, // Bilboko Ingeniaritza Eskola / Escuela Ingenieria de Bilbao
  defaultFormatId: 5, // 306-Euiti Bilbao
} as const;

export const CENTER_CODE = SCHOOL_INFO.centerCode;
export const CENTER_NAME = SCHOOL_INFO.name;
export const DEPARTMENT_ID = SCHOOL_INFO.departmentId;
export const DEFAULT_FORMAT_ID = SCHOOL_INFO.defaultFormatId;

export const ROOM_GROUPS: RoomGroupDef[] = [
  {
    id: 'edif-p',
    shortLabel: 'Edificio P',
    title: 'Edificio P · Aulas 350 y Salas',
    subtitle: 'Aulas, laboratorios, informática y salas · Plantas P0 a P6',
    isSpecial: false,
    rooms: [
      'P0P1 S.ACTOS Edif.P',
      'P1P18 S.GRADOS Ed.P',
      'P1P1 S. JUNTAS Ed.P',
      'P1P28A_350',
      'P2P39L_350',
      'P2P43L_350',
      'P3P10A_350',
      'P3P13I_350',
      'P3P15L_350',
      'P3P2A_350',
      'P3P3A_350',
      'P3P4I_350',
      'P3P5I_350',
      'P4P14A_350',
      'P4P16L_350',
      'P4P17A_350',
      'P4P3A_350',
      'P4P4A_350',
      'P4P5A_350',
      'P4P6A_350',
      'P4P7A_350',
      'P5P1L_350',
      'P6P1 Puente alto',
    ],
  },
  {
    id: 'especiales',
    shortLabel: 'Especiales',
    title: 'Salas Especiales y Actos',
    subtitle: 'Aulas Magnas, Salones de Actos, Grados y Juntas',
    isSpecial: true,
    rooms: [
      'P0E1 S.CONFER Edif I',
      'P0I1 A.MAGNA Edif II',
      'P0M2 A.MAGNA Edif II',
      'P0P1 S.ACTOS Edif.P',
      'P1A1 A.GRADOS Edif I',
      'P1I15 JUNTAS Edif II',
      'P1I1 S.GRADOS II-I',
      'P1M1 JUNTAS Edif II',
      'P1P18 S.GRADOS Ed.P',
      'P1P1 S. JUNTAS Ed.P',
      'P6M7',
      'P6P1 Puente alto',
    ],
  },
];

export const ALL_UNIQUE_ROOM_NAMES: string[] = Array.from(
  new Set(ROOM_GROUPS.flatMap((group) => group.rooms))
);

export type SlotState = 'free' | 'occupied' | 'exam';

export interface TeacherInfo {
  id: number;
  code: string;
  fullName: string;
}

export interface PeriodDetail {
  id: number;
  startTime: number;
  endTime: number;
  startLabel: string;
  endLabel: string;
  cellState: string;
  subject: string;
  subjectAlt: string;
  groups: string[];
  teachers: string[];
  teacherDetails: TeacherInfo[];
  lessonText: string;
  periodText: string;
  substText: string;
  isExam: boolean;
}

export interface TeacherDaySession {
  id: number;
  startTime: number;
  endTime: number;
  startLabel: string;
  endLabel: string;
  subject: string;
  groups: string[];
  rooms: string[];
  lessonText: string;
  isExam: boolean;
}

export interface TeacherScheduleResponse {
  date: string;
  teacher: TeacherInfo;
  sessions: TeacherDaySession[];
}

export interface RoomDaySchedule {
  name: string;
  longName: string;
  elementId: number | null;
  capacity: number;
  slots: SlotState[]; // 26 entries matching TIME_SLOTS
  periods: PeriodDetail[];
  occupiedSlotsCount: number;
}

export interface GridDaySchedule {
  id: RoomGroupId;
  shortLabel: string;
  title: string;
  subtitle: string;
  isSpecial: boolean;
  rooms: RoomDaySchedule[];
  activeRoomsCount: number;
  occupiedSlots: number;
  totalSlots: number;
  occupancyPercent: number;
}

export interface WeekDaySummary {
  date: string; // YYYY-MM-DD
  activeRooms: number;
  occupiedSlots: number;
}

export interface DayTimetableResponse {
  date: string; // YYYY-MM-DD
  weekKey: string; // Monday YYYY-MM-DD
  centerCode: string;
  centerName: string;
  webUntisUrl: string;
  lastUpdated: string; // ISO timestamp
  lastImportTimestamp: number | null;
  syncedRooms: number;
  totalRooms: number;
  cached: boolean;
  weekSummary: WeekDaySummary[];
  grids: GridDaySchedule[];
}
