import type { ApiUserBrief } from '@/lib/phase1a-types';

export interface ScheduleItem {
  id: string;
  groupId: string;
  tutorId: string | null;
  roomId: string | null;
  subjectId?: string | null;
  dayOfWeek: number;
  startMin: number;
  endMin: number;
  validFrom: string;
  validTo: string | null;
  isActive: boolean;
  group: {
    id: string;
    name: string;
    code: string | null;
    package?: { id: string; name: string; totalSessions: number } | null;
  };
  tutor: { id: string; user: { name: string } } | null;
  room: { id: string; name: string } | null;
  subject?: { id: string; code: string; name: string } | null;
  _count: { sessions: number };
}

export interface SessionItem {
  id: string;
  groupId: string;
  scheduleId: string | null;
  tutorId: string | null;
  roomId: string | null;
  subjectId?: string | null;
  startsAt: string;
  endsAt: string;
  status: 'SCHEDULED' | 'CANCELLED' | 'COMPLETED';
  notes: string | null;
  /** Laporan tutor berhalangan (sakit/darurat) — admin menugasi pengganti. */
  tutorAbsenceNote?: string | null;
  tutorAbsenceAt?: string | null;
  group: {
    id: string;
    name: string;
    code: string | null;
    level?: { id: string; name: string; subject?: { code: string; name: string } | null } | null;
    program?: { id: string; name: string; subject?: { code: string; name: string } | null } | null;
  };
  tutor: { id: string; user: { name: string; phone?: string | null } } | null;
  room: { id: string; name: string } | null;
  /** Nama anak ortu di kelompok sesi — hanya diisi endpoint /sessions/mine-children & dashboard ortu. */
  childNames?: string[];
  subject?: { id: string; code: string; name: string } | null;
  schedule?: { id: string; subject?: { code: string; name: string } | null } | null;
  _count: { overrides: number };
  overrides?: Array<{
    id: string;
    startsAt: string | null;
    endsAt: string | null;
    roomId: string | null;
    note: string | null;
  }>;
}

export interface DayNoteItem {
  id: string;
  date: string;
  type: 'LIBUR' | 'RAPAT' | 'DARURAT' | 'INFO';
  title: string;
  note: string | null;
}

export interface SessionDetail extends SessionItem {
  group: {
    id: string;
    name: string;
    code: string | null;
    members: Array<{ studentId: string; student: { id: string; user: { name: string } } }>;
    tutors: Array<{ tutorId: string; isLead: boolean; tutor: { isActive: boolean; user: { name: string } } }>;
  };
  schedule: { id: string; dayOfWeek: number; startMin: number; endMin: number; subject?: { code: string; name: string } | null } | null;
  overrides: Array<{
    id: string;
    sessionId: string;
    studentId: string;
    startsAt: string | null;
    endsAt: string | null;
    roomId: string | null;
    note: string | null;
    student: { id: string; user: { name: string } };
    room: { id: string; name: string } | null;
  }>;
}

export interface RoomItem {
  id: string;
  buildingId: string | null;
  name: string;
  capacity: number | null;
  photoUrl: string | null;
  isActive: boolean;
  building: { id: string; name: string } | null;
}

export interface BuildingItem {
  id: string;
  name: string;
  address: string | null;
  isActive: boolean;
  rooms?: Array<{ id: string; name: string; isActive: boolean }>;
}

export interface GenerateResult {
  scheduleId: string;
  dayName: string;
  total: number;
  created: number;
  skipped: number;
  removed: number;
  failed: Array<{ date: string; reason: string }>;
}

export const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

export function minToClock(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function clockToMin(clock: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(clock.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export type { ApiUserBrief };
