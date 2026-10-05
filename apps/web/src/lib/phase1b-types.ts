import type { ApiUserBrief } from '@/lib/phase1a-types';

export interface GroupListItem {
  id: string;
  name: string;
  code: string | null;
  programId: string;
  levelId: string | null;
  packageId?: string | null;
  capacity: number | null;
  isActive: boolean;
  program: { id: string; name: string; code: string };
  level: { id: string; name: string } | null;
  package?: { id: string; name: string; code: string | null; totalSessions: number } | null;
  _count: { members: number; tutors: number };
}

export interface SubjectBrief {
  id: string;
  code: string;
  name: string;
}

export interface GroupDetail extends GroupListItem {
  program: GroupListItem['program'] & {
    subjectId?: string | null;
    subject?: SubjectBrief | null;
  };
  level: (GroupListItem['level'] & {
    subjectId?: string | null;
    subject?: SubjectBrief | null;
    levelSubjects?: Array<{ subject: SubjectBrief }>;
  }) | null;
  members: Array<{
    groupId: string;
    studentId: string;
    student: { id: string; user: ApiUserBrief };
  }>;
  tutors: Array<{
    groupId: string;
    tutorId: string;
    isLead: boolean;
    tutor: { id: string; specialization: string | null; user: ApiUserBrief };
  }>;
}
