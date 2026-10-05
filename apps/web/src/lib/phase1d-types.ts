export type AttendanceStatus = 'HADIR' | 'TERLAMBAT' | 'IZIN' | 'SAKIT' | 'ALFA';

export const ATTENDANCE_STATUSES: AttendanceStatus[] = ['HADIR', 'TERLAMBAT', 'IZIN', 'SAKIT', 'ALFA'];

export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  HADIR: 'Hadir',
  TERLAMBAT: 'Terlambat',
  IZIN: 'Izin',
  SAKIT: 'Sakit',
  ALFA: 'Alfa',
};

export interface AttendanceRow {
  id: string;
  sessionId: string;
  studentId: string;
  status: AttendanceStatus;
  note: string | null;
  student: { id: string; user: { id: string; name: string } };
  session: {
    id: string;
    groupId: string;
    tutorId: string | null;
    startsAt: string;
    endsAt: string;
    status: string;
    group: { id: string; name: string };
    tutor: { id: string; user: { name: string } } | null;
  };
}

export interface AttendanceRoster {
  session: { id: string; groupId: string; tutorId: string | null; startsAt: string; endsAt: string; status: string };
  group: { id: string; name: string };
  tutor: { id: string; name: string } | null;
  tutorAttendance: { id: string; status: AttendanceStatus; note: string | null } | null;
  members: Array<{ studentId: string; name: string; attendance: { id: string; status: AttendanceStatus; note: string | null } | null }>;
}

export interface AttendanceRecap {
  total: number;
  byStatus: Record<string, number>;
  rows: AttendanceRow[];
}

export interface ParentAttendanceRecap {
  children: Array<{ student: { id: string; user: { name: string } }; total: number; byStatus: Record<string, number>; rows: AttendanceRow[] }>;
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPreference {
  id: string;
  userId: string;
  inAppEnabled: boolean;
  attendanceAlert: boolean;
  scheduleAlert: boolean;
  whatsAppEnabled: boolean;
}
