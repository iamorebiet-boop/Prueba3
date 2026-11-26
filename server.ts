import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  ALL_UNIQUE_ROOM_NAMES,
  CENTER_CODE,
  CENTER_NAME,
  DEFAULT_FORMAT_ID,
  DEPARTMENT_ID,
  ROOM_GROUPS,
  TIME_SLOTS,
} from './src/data/roomGroups.ts';
import type {
  DayTimetableResponse,
  GridDaySchedule,
  PeriodDetail,
  RoomDaySchedule,
  SlotState,
  TeacherDaySession,
  TeacherInfo,
  TeacherScheduleResponse,
  WeekDaySummary,
} from './src/data/roomGroups.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Hardcoded institutional WebUntis origin (UPV/EHU) — never derived from user input
const WEBUNTIS_BASE = 'https://ehu.webuntis.com/WebUntis';
const WEBUNTIS_PUBLIC_URL = `${WEBUNTIS_BASE}/?school=ehu`;

const SESSION_TTL_MS = 25 * 60 * 1000;
const DIRECTORY_TTL_MS = 6 * 60 * 60 * 1000;
const WEEK_CACHE_TTL_MS = 15 * 60 * 1000;
const REFRESH_COOLDOWN_MS = 15 * 1000;
const MAX_CACHED_WEEKS = 14;
const MAX_CACHED_TEACHERS = 120;
const FETCH_CONCURRENCY = 14;

interface SessionState {
  cookieHeader: string;
  fetchedAt: number;
}

interface RoomDirectoryEntry {
  id: number;
  name: string;
  longName: string;
  capacity: number;
}

interface DirectoryState {
  roomsByName: Map<string, RoomDirectoryEntry>;
  teachersById: Map<number, TeacherInfo>;
  teachersByCode: Map<string, TeacherInfo>;
  formatId: number;
  lastImportTimestamp: number | null;
  fetchedAt: number;
}

interface RawWebUntisElement {
  type: number;
  id: number;
  name?: string;
  forename?: string;
  longName?: string;
  displayname?: string;
  alternatename?: string;
  dids?: number[];
  capacity?: number;
}

interface RawWebUntisPeriodElement {
  type: number;
  id: number;
  state?: string;
}

interface RawWebUntisPeriod {
  id: number;
  date: number; // YYYYMMDD
  startTime: number; // HHMM
  endTime: number; // HHMM
  cellState?: string;
  lessonText?: string;
  periodText?: string;
  substText?: string;
  is?: {
    cancelled?: boolean;
    exam?: boolean;
    event?: boolean;
    confirmed?: boolean;
  };
  elements?: RawWebUntisPeriodElement[];
}

interface WeekCacheEntry {
  weekKey: string;
  fetchedAt: number;
  syncedRooms: number;
  // dateYYYYMMDD -> roomName -> PeriodDetail[]
  byDateAndRoom: Map<string, Map<string, PeriodDetail[]>>;
}

interface TeacherWeekCacheEntry {
  fetchedAt: number;
  byDate: Map<string, TeacherDaySession[]>;
}

let sessionCache: SessionState | null = null;
let sessionPromise: Promise<SessionState> | null = null;
let directoryCache: DirectoryState | null = null;
let directoryPromise: Promise<DirectoryState> | null = null;
const weekCache = new Map<string, WeekCacheEntry>();
const weekInFlight = new Map<string, Promise<WeekCacheEntry>>();
const teacherWeekCache = new Map<string, TeacherWeekCacheEntry>();
const teacherWeekInFlight = new Map<string, Promise<TeacherWeekCacheEntry>>();
const lastManualRefresh = new Map<string, number>();

function isValidISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (y < 2020 || y > 2035 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

function getMondayKey(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dow = dt.getUTCDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  dt.setUTCDate(dt.getUTCDate() + offset);
  const ry = dt.getUTCFullYear();
  const rm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const rd = String(dt.getUTCDate()).padStart(2, '0');
  return `${ry}-${rm}-${rd}`;
}

function addDaysISO(isoDate: string, delta: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + delta);
  const ry = dt.getUTCFullYear();
  const rm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const rd = String(dt.getUTCDate()).padStart(2, '0');
  return `${ry}-${rm}-${rd}`;
}

function formatUntisTime(hhmm: number): string {
  const h = Math.floor(hhmm / 100);
  const m = hhmm % 100;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function toTitleCaseName(raw: string): string {
  const minor = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'i']);
  return raw
    .trim()
    .split(/\s+/)
    .map((word, idx) => {
      const lower = word.toLowerCase();
      if (idx > 0 && minor.has(lower)) return lower;
      return lower
        .split('-')
        .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : ''))
        .join('-');
    })
    .join(' ');
}

function formatTeacherFullName(el: RawWebUntisElement): string {
  const forename = (el.forename || '').trim();
  const surname = (el.longName || '').trim();
  const code = (el.name || '').trim();
  if (forename && surname && surname !== code) {
    return toTitleCaseName(`${forename} ${surname}`);
  }
  if (surname && surname !== code) {
    return toTitleCaseName(surname);
  }
  if (el.displayname && el.displayname !== code) {
    return toTitleCaseName(el.displayname);
  }
  return code || String(el.id);
}

function extractCookies(response: Response): string {
  const headersObj = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const list =
    typeof headersObj.getSetCookie === 'function'
      ? headersObj.getSetCookie()
      : [response.headers.get('set-cookie') ?? ''];
  return list
    .filter(Boolean)
    .map((cookie) => cookie.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
}

async function getSession(forceRefresh = false): Promise<SessionState> {
  if (
    !forceRefresh &&
    sessionCache &&
    Date.now() - sessionCache.fetchedAt < SESSION_TTL_MS
  ) {
    return sessionCache;
  }
  if (!forceRefresh && sessionPromise) {
    return sessionPromise;
  }

  const promise = (async (): Promise<SessionState> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch(WEBUNTIS_PUBLIC_URL, {
        method: 'GET',
        headers: {
          'User-Agent': 'EIB-306-Horarios/1.0',
          Accept: 'text/html,application/xhtml+xml',
        },
        signal: controller.signal,
      });
      const cookieHeader = extractCookies(res);
      if (!cookieHeader) {
        throw new Error('No se pudieron obtener cookies de sesión de WebUntis.');
      }
      const state: SessionState = {
        cookieHeader,
        fetchedAt: Date.now(),
      };
      sessionCache = state;
      return state;
    } finally {
      clearTimeout(timeout);
      sessionPromise = null;
    }
  })();

  sessionPromise = promise;
  return promise;
}

async function fetchWebUntisJson<T>(
  pathAndQuery: string,
  retryAuth = true
): Promise<T> {
  const session = await getSession(false);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${WEBUNTIS_BASE}${pathAndQuery}`, {
      method: 'GET',
      headers: {
        Cookie: session.cookieHeader,
        Accept: 'application/json',
        'User-Agent': 'EIB-306-Horarios/1.0',
      },
      signal: controller.signal,
    });
    if ((res.status === 401 || res.status === 403) && retryAuth) {
      await getSession(true);
      return fetchWebUntisJson<T>(pathAndQuery, false);
    }
    if (!res.ok) {
      throw new Error(`WebUntis respondió con estado HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function getRoomDirectory(forceRefresh = false): Promise<DirectoryState> {
  if (
    !forceRefresh &&
    directoryCache &&
    Date.now() - directoryCache.fetchedAt < DIRECTORY_TTL_MS
  ) {
    return directoryCache;
  }
  if (!forceRefresh && directoryPromise) {
    return directoryPromise;
  }

  const promise = (async (): Promise<DirectoryState> => {
    try {
      const [roomsPayload, teachersPayload] = await Promise.all([
        fetchWebUntisJson<{
          data?: {
            elements?: RawWebUntisElement[];
            formats?: Array<{ id: number; name?: string }>;
            lastImportTimestamp?: number;
          };
        }>('/api/public/timetable/weekly/pageconfig?type=4'),
        fetchWebUntisJson<{
          data?: {
            elements?: RawWebUntisElement[];
          };
        }>('/api/public/timetable/weekly/pageconfig?type=2').catch(() => ({
          data: { elements: [] },
        })),
      ]);

      const elements = roomsPayload.data?.elements ?? [];
      const formats = roomsPayload.data?.formats ?? [];
      const eibFormat = formats.find(
        (f) => f.id === DEFAULT_FORMAT_ID || f.name?.includes(CENTER_CODE)
      );
      const formatId = eibFormat?.id ?? DEFAULT_FORMAT_ID;

      const roomsByName = new Map<string, RoomDirectoryEntry>();
      for (const roomName of ALL_UNIQUE_ROOM_NAMES) {
        const matchInDept = elements.find(
          (el) =>
            el.name === roomName &&
            Array.isArray(el.dids) &&
            el.dids.includes(DEPARTMENT_ID)
        );
        const fallbackMatch =
          matchInDept ?? elements.find((el) => el.name === roomName);
        if (fallbackMatch) {
          roomsByName.set(roomName, {
            id: fallbackMatch.id,
            name: fallbackMatch.name ?? roomName,
            longName: (fallbackMatch.longName ?? roomName).trim(),
            capacity: fallbackMatch.capacity ?? 0,
          });
        }
      }

      const teachersById = new Map<number, TeacherInfo>();
      const teachersByCode = new Map<string, TeacherInfo>();
      for (const t of teachersPayload.data?.elements ?? []) {
        if (t && typeof t.id === 'number' && typeof t.name === 'string') {
          const info: TeacherInfo = {
            id: t.id,
            code: t.name.trim(),
            fullName: formatTeacherFullName(t),
          };
          teachersById.set(t.id, info);
          teachersByCode.set(info.code.toUpperCase(), info);
        }
      }

      const state: DirectoryState = {
        roomsByName,
        teachersById,
        teachersByCode,
        formatId,
        lastImportTimestamp:
          typeof roomsPayload.data?.lastImportTimestamp === 'number'
            ? roomsPayload.data.lastImportTimestamp
            : null,
        fetchedAt: Date.now(),
      };
      directoryCache = state;
      return state;
    } finally {
      directoryPromise = null;
    }
  })();

  directoryPromise = promise;
  return promise;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await worker(items[current]);
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => runWorker()
  );
  await Promise.all(workers);
  return results;
}

function parseRoomWeeklyPeriods(
  roomId: number,
  directory: DirectoryState,
  rawData: {
    data?: {
      result?: {
        data?: {
          elementPeriods?: Record<string, RawWebUntisPeriod[]>;
          elements?: RawWebUntisElement[];
        };
      };
    };
  }
): Map<string, PeriodDetail[]> {
  const byDate = new Map<string, PeriodDetail[]>();
  const resultData = rawData.data?.result?.data;
  if (!resultData) return byDate;

  const elementLookup = new Map<string, RawWebUntisElement>();
  for (const el of resultData.elements ?? []) {
    elementLookup.set(`${el.type}:${el.id}`, el);
  }

  const rawPeriods = resultData.elementPeriods?.[String(roomId)] ?? [];
  for (const period of rawPeriods) {
    const cellState = (period.cellState ?? 'STANDARD').toUpperCase();
    const isCancelled =
      cellState === 'CANCEL' ||
      cellState === 'FREE' ||
      Boolean(period.is?.cancelled);

    const roomRef = (period.elements ?? []).find(
      (el) => el.type === 4 && el.id === roomId
    );
    const roomRemoved =
      roomRef?.state === 'ABSENT' || roomRef?.state === 'CANCEL';
    if (isCancelled || roomRemoved) {
      continue;
    }

    const subjects: string[] = [];
    const subjectsAlt: string[] = [];
    const groups: string[] = [];
    const teachers: string[] = [];
    const teacherDetails: TeacherInfo[] = [];
    const seenTeacherIds = new Set<number>();

    for (const ref of period.elements ?? []) {
      const info = elementLookup.get(`${ref.type}:${ref.id}`);
      if (ref.type === 3 && info) {
        const primary = (info.longName || info.name || '').trim();
        const alt = (info.alternatename || '').trim();
        if (primary && !subjects.includes(primary)) subjects.push(primary);
        if (alt && alt !== primary && !subjectsAlt.includes(alt)) {
          subjectsAlt.push(alt);
        }
      } else if (ref.type === 1 && info) {
        const label = (info.name || info.longName || '').trim();
        if (label && !groups.includes(label)) groups.push(label);
      } else if (ref.type === 2) {
        const dirTeacher = directory.teachersById.get(ref.id);
        const fallbackCode = (info?.name || '').trim();
        const resolved: TeacherInfo =
          dirTeacher ??
          (fallbackCode
            ? directory.teachersByCode.get(fallbackCode.toUpperCase())
            : undefined) ?? {
            id: ref.id,
            code: fallbackCode || String(ref.id),
            fullName: info
              ? formatTeacherFullName(info)
              : fallbackCode || String(ref.id),
          };
        if (!seenTeacherIds.has(resolved.id)) {
          seenTeacherIds.add(resolved.id);
          teacherDetails.push(resolved);
          if (!teachers.includes(resolved.fullName)) {
            teachers.push(resolved.fullName);
          }
        }
      }
    }

    const dateKey = String(period.date);
    const detail: PeriodDetail = {
      id: period.id,
      startTime: period.startTime,
      endTime: period.endTime,
      startLabel: formatUntisTime(period.startTime),
      endLabel: formatUntisTime(period.endTime),
      cellState,
      subject:
        subjects.join(' / ') ||
        (period.lessonText || '').trim() ||
        (period.periodText || '').trim() ||
        'Actividad / Reserva',
      subjectAlt: subjectsAlt.join(' / '),
      groups,
      teachers,
      teacherDetails,
      lessonText: (period.lessonText || '').trim(),
      periodText: (period.periodText || '').trim(),
      substText: (period.substText || '').trim(),
      isExam: cellState === 'EXAM' || Boolean(period.is?.exam),
    };

    const existing = byDate.get(dateKey);
    if (existing) {
      existing.push(detail);
    } else {
      byDate.set(dateKey, [detail]);
    }
  }

  for (const [, list] of byDate) {
    list.sort((a, b) => a.startTime - b.startTime || a.endTime - b.endTime);
  }
  return byDate;
}

function parseTeacherWeeklyPeriods(
  rawData: {
    data?: {
      result?: {
        data?: {
          elementPeriods?: Record<string, RawWebUntisPeriod[]>;
          elements?: RawWebUntisElement[];
        };
      };
    };
  },
  teacherId: number
): Map<string, TeacherDaySession[]> {
  const byDate = new Map<string, TeacherDaySession[]>();
  const resultData = rawData.data?.result?.data;
  if (!resultData) return byDate;

  const elementLookup = new Map<string, RawWebUntisElement>();
  for (const el of resultData.elements ?? []) {
    elementLookup.set(`${el.type}:${el.id}`, el);
  }

  const rawPeriods = resultData.elementPeriods?.[String(teacherId)] ?? [];
  for (const period of rawPeriods) {
    const cellState = (period.cellState ?? 'STANDARD').toUpperCase();
    const isCancelled =
      cellState === 'CANCEL' ||
      cellState === 'FREE' ||
      Boolean(period.is?.cancelled);
    if (isCancelled) continue;

    const subjects: string[] = [];
    const groups: string[] = [];
    const rooms: string[] = [];

    for (const ref of period.elements ?? []) {
      const info = elementLookup.get(`${ref.type}:${ref.id}`);
      if (!info) continue;
      if (ref.type === 3) {
        const label = (info.longName || info.name || '').trim();
        if (label && !subjects.includes(label)) subjects.push(label);
      } else if (ref.type === 1) {
        const label = (info.name || info.longName || '').trim();
        if (label && !groups.includes(label)) groups.push(label);
      } else if (ref.type === 4) {
        if (ref.state === 'ABSENT' || ref.state === 'CANCEL') continue;
        const label = (info.name || info.longName || '').trim();
        if (label && !rooms.includes(label)) rooms.push(label);
      }
    }

    const dateKey = String(period.date);
    const sessionItem: TeacherDaySession = {
      id: period.id,
      startTime: period.startTime,
      endTime: period.endTime,
      startLabel: formatUntisTime(period.startTime),
      endLabel: formatUntisTime(period.endTime),
      subject:
        subjects.join(' / ') ||
        (period.lessonText || '').trim() ||
        (period.periodText || '').trim() ||
        'Actividad / Reserva',
      groups,
      rooms,
      lessonText: (period.lessonText || '').trim(),
      isExam: cellState === 'EXAM' || Boolean(period.is?.exam),
    };

    const existing = byDate.get(dateKey);
    if (existing) {
      existing.push(sessionItem);
    } else {
      byDate.set(dateKey, [sessionItem]);
    }
  }

  // Merge consecutive periods of the same session in the same rooms
  for (const [dateKey, list] of byDate) {
    list.sort((a, b) => a.startTime - b.startTime || a.endTime - b.endTime);
    const merged: TeacherDaySession[] = [];
    for (const item of list) {
      const prev = merged[merged.length - 1];
      if (
        prev &&
        prev.endTime === item.startTime &&
        prev.subject === item.subject &&
        prev.rooms.join(',') === item.rooms.join(',') &&
        prev.groups.join(',') === item.groups.join(',')
      ) {
        prev.endTime = item.endTime;
        prev.endLabel = item.endLabel;
      } else {
        merged.push({ ...item });
      }
    }
    byDate.set(dateKey, merged);
  }

  return byDate;
}

async function fetchWeekData(
  weekKey: string,
  forceRefresh: boolean
): Promise<{ entry: WeekCacheEntry; cached: boolean }> {
  const existing = weekCache.get(weekKey);
  const isFresh =
    existing && Date.now() - existing.fetchedAt < WEEK_CACHE_TTL_MS;

  if (!forceRefresh && isFresh) {
    return { entry: existing, cached: true };
  }

  if (forceRefresh && existing) {
    const lastRefresh = lastManualRefresh.get(weekKey) ?? 0;
    if (Date.now() - lastRefresh < REFRESH_COOLDOWN_MS) {
      return { entry: existing, cached: true };
    }
    lastManualRefresh.set(weekKey, Date.now());
  }

  const inFlight = weekInFlight.get(weekKey);
  if (inFlight) {
    const entry = await inFlight;
    return { entry, cached: false };
  }

  const fetchPromise = (async (): Promise<WeekCacheEntry> => {
    const directory = await getRoomDirectory(false);
    const roomsToFetch = ALL_UNIQUE_ROOM_NAMES.map((name) => ({
      name,
      entry: directory.roomsByName.get(name),
    })).filter(
      (item): item is { name: string; entry: RoomDirectoryEntry } =>
        Boolean(item.entry)
    );

    const byDateAndRoom = new Map<string, Map<string, PeriodDetail[]>>();
    let syncedRooms = 0;

    await mapWithConcurrency(
      roomsToFetch,
      FETCH_CONCURRENCY,
      async ({ name, entry }) => {
        const query = `/api/public/timetable/weekly/data?elementType=4&elementId=${entry.id}&date=${encodeURIComponent(weekKey)}&formatId=${directory.formatId}`;
        const raw = await fetchWebUntisJson<{
          data?: {
            result?: {
              data?: {
                elementPeriods?: Record<string, RawWebUntisPeriod[]>;
                elements?: RawWebUntisElement[];
              };
            };
          };
        }>(query);
        syncedRooms += 1;
        const roomByDate = parseRoomWeeklyPeriods(entry.id, directory, raw);
        for (const [dateKey, periods] of roomByDate) {
          let dateMap = byDateAndRoom.get(dateKey);
          if (!dateMap) {
            dateMap = new Map<string, PeriodDetail[]>();
            byDateAndRoom.set(dateKey, dateMap);
          }
          dateMap.set(name, periods);
        }
      }
    );

    const cacheEntry: WeekCacheEntry = {
      weekKey,
      fetchedAt: Date.now(),
      syncedRooms,
      byDateAndRoom,
    };

    if (weekCache.size >= MAX_CACHED_WEEKS && !weekCache.has(weekKey)) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;
      for (const [k, v] of weekCache) {
        if (v.fetchedAt < oldestTime) {
          oldestTime = v.fetchedAt;
          oldestKey = k;
        }
      }
      if (oldestKey) {
        weekCache.delete(oldestKey);
      }
    }
    weekCache.set(weekKey, cacheEntry);
    return cacheEntry;
  })();

  weekInFlight.set(weekKey, fetchPromise);
  try {
    const entry = await fetchPromise;
    return { entry, cached: false };
  } catch (err) {
    if (existing) {
      return { entry: existing, cached: true };
    }
    throw err;
  } finally {
    weekInFlight.delete(weekKey);
  }
}

async function fetchTeacherWeekData(
  teacherId: number,
  weekKey: string,
  directory: DirectoryState
): Promise<TeacherWeekCacheEntry> {
  const cacheKey = `${teacherId}:${weekKey}`;
  const existing = teacherWeekCache.get(cacheKey);
  if (existing && Date.now() - existing.fetchedAt < WEEK_CACHE_TTL_MS) {
    return existing;
  }

  const inFlight = teacherWeekInFlight.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const promise = (async (): Promise<TeacherWeekCacheEntry> => {
    const query = `/api/public/timetable/weekly/data?elementType=2&elementId=${teacherId}&date=${encodeURIComponent(weekKey)}&formatId=${directory.formatId}`;
    const raw = await fetchWebUntisJson<{
      data?: {
        result?: {
          data?: {
            elementPeriods?: Record<string, RawWebUntisPeriod[]>;
            elements?: RawWebUntisElement[];
          };
        };
      };
    }>(query);
    const byDate = parseTeacherWeeklyPeriods(raw, teacherId);
    const entry: TeacherWeekCacheEntry = {
      fetchedAt: Date.now(),
      byDate,
    };
    if (teacherWeekCache.size >= MAX_CACHED_TEACHERS) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;
      for (const [k, v] of teacherWeekCache) {
        if (v.fetchedAt < oldestTime) {
          oldestTime = v.fetchedAt;
          oldestKey = k;
        }
      }
      if (oldestKey) teacherWeekCache.delete(oldestKey);
    }
    teacherWeekCache.set(cacheKey, entry);
    return entry;
  })();

  teacherWeekInFlight.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    teacherWeekInFlight.delete(cacheKey);
  }
}

function buildWeekSummary(weekEntry: WeekCacheEntry): WeekDaySummary[] {
  return Array.from({ length: 6 }, (_, dayIndex) => {
    const dayIso = addDaysISO(weekEntry.weekKey, dayIndex);
    const compact = dayIso.replaceAll('-', '');
    const roomMap = weekEntry.byDateAndRoom.get(compact);
    let activeRooms = 0;
    let occupiedSlots = 0;

    if (roomMap) {
      for (const roomName of ALL_UNIQUE_ROOM_NAMES) {
        const periods = roomMap.get(roomName) ?? [];
        if (periods.length === 0) continue;
        let roomOcc = 0;
        for (const slot of TIME_SLOTS) {
          if (
            periods.some(
              (p) => p.startTime < slot.endTime && p.endTime > slot.startTime
            )
          ) {
            roomOcc += 1;
          }
        }
        if (roomOcc > 0) {
          activeRooms += 1;
          occupiedSlots += roomOcc;
        }
      }
    }

    return {
      date: dayIso,
      activeRooms,
      occupiedSlots,
    };
  });
}

function buildDayResponse(
  isoDate: string,
  weekEntry: WeekCacheEntry,
  directory: DirectoryState,
  cached: boolean
): DayTimetableResponse {
  const dateCompact = isoDate.replaceAll('-', '');
  const roomMap = weekEntry.byDateAndRoom.get(dateCompact);

  const grids: GridDaySchedule[] = ROOM_GROUPS.map((group) => {
    let totalOccupiedSlots = 0;
    let activeRoomsCount = 0;

    const rooms: RoomDaySchedule[] = group.rooms.map((roomName) => {
      const dirInfo = directory.roomsByName.get(roomName);
      const periods = roomMap?.get(roomName) ?? [];

      const slots: SlotState[] = TIME_SLOTS.map((slot) => {
        let state: SlotState = 'free';
        for (const p of periods) {
          if (p.startTime < slot.endTime && p.endTime > slot.startTime) {
            if (p.isExam) {
              return 'exam';
            }
            state = 'occupied';
          }
        }
        return state;
      });

      const occupiedSlotsCount = slots.filter((s) => s !== 'free').length;
      if (occupiedSlotsCount > 0) {
        activeRoomsCount += 1;
        totalOccupiedSlots += occupiedSlotsCount;
      }

      return {
        name: roomName,
        longName: dirInfo?.longName ?? roomName,
        elementId: dirInfo?.id ?? null,
        capacity: dirInfo?.capacity ?? 0,
        slots,
        periods,
        occupiedSlotsCount,
      };
    });

    const totalSlots = rooms.length * TIME_SLOTS.length;
    const occupancyPercent =
      totalSlots > 0 ? Math.round((totalOccupiedSlots / totalSlots) * 100) : 0;

    return {
      id: group.id,
      shortLabel: group.shortLabel,
      title: group.title,
      subtitle: group.subtitle,
      isSpecial: Boolean(group.isSpecial),
      rooms,
      activeRoomsCount,
      occupiedSlots: totalOccupiedSlots,
      totalSlots,
      occupancyPercent,
    };
  });

  return {
    date: isoDate,
    weekKey: weekEntry.weekKey,
    centerCode: CENTER_CODE,
    centerName: CENTER_NAME,
    webUntisUrl: `${WEBUNTIS_BASE}/?date=${encodeURIComponent(isoDate)}#/basic/timetablePublic`,
    lastUpdated: new Date(weekEntry.fetchedAt).toISOString(),
    lastImportTimestamp: directory.lastImportTimestamp,
    syncedRooms: weekEntry.syncedRooms,
    totalRooms: ALL_UNIQUE_ROOM_NAMES.length,
    cached,
    weekSummary: buildWeekSummary(weekEntry),
    grids,
  };
}

async function startServer(): Promise<void> {
  const app = express();
  const PORT = 3000;

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, center: CENTER_CODE });
  });

  app.get('/api/timetable', async (req, res) => {
    const rawDate =
      typeof req.query.date === 'string' ? req.query.date.trim() : '';
    const forceRefresh = req.query.refresh === '1' || req.query.force === '1';

    if (!isValidISODate(rawDate)) {
      res.status(400).json({
        error:
          'Formato de fecha no válido. Utiliza AAAA-MM-DD (entre 2020 y 2035).',
      });
      return;
    }

    try {
      const weekKey = getMondayKey(rawDate);
      const [directory, weekResult] = await Promise.all([
        getRoomDirectory(false),
        fetchWeekData(weekKey, forceRefresh),
      ]);
      const responsePayload = buildDayResponse(
        rawDate,
        weekResult.entry,
        directory,
        weekResult.cached
      );
      res.setHeader('Cache-Control', 'no-store');
      res.json(responsePayload);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Error al consultar los horarios públicos de WebUntis.';
      console.error('[WebUntis API Error]', message);
      res.status(502).json({
        error:
          'No se pudo conectar con WebUntis en este momento. Inténtalo de nuevo.',
      });
    }
  });

  app.get('/api/teacher-schedule', async (req, res) => {
    const rawDate =
      typeof req.query.date === 'string' ? req.query.date.trim() : '';
    const rawTeacherId =
      typeof req.query.teacherId === 'string' ? req.query.teacherId.trim() : '';
    const teacherId = Number(rawTeacherId);

    if (!isValidISODate(rawDate)) {
      res.status(400).json({ error: 'Formato de fecha no válido.' });
      return;
    }
    if (!Number.isInteger(teacherId) || teacherId <= 0) {
      res.status(400).json({ error: 'Identificador de docente no válido.' });
      return;
    }

    try {
      const weekKey = getMondayKey(rawDate);
      const directory = await getRoomDirectory(false);
      const weekData = await fetchTeacherWeekData(teacherId, weekKey, directory);
      const dateCompact = rawDate.replaceAll('-', '');
      const sessions = weekData.byDate.get(dateCompact) ?? [];
      const teacher = directory.teachersById.get(teacherId) ?? {
        id: teacherId,
        code: String(teacherId),
        fullName: String(teacherId),
      };

      const payload: TeacherScheduleResponse = {
        date: rawDate,
        teacher,
        sessions,
      };
      res.setHeader('Cache-Control', 'no-store');
      res.json(payload);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Error al consultar el horario del docente.';
      console.error('[WebUntis Teacher API Error]', message);
      res.status(502).json({
        error: 'No se pudo cargar el horario completo del docente.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`EIB 306 Horarios server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
