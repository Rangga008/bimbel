// Fase 3c — Exam Core & Timing types

export enum ExamStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  LOCKED = 'LOCKED',
  /// Diakhiri manual oleh admin — semua attempt IN_PROGRESS auto-submit.
  ENDED = 'ENDED',
}

export enum ExamAttemptStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  SUBMITTED = 'SUBMITTED',
  LOCKED = 'LOCKED',
}

/** Fase 3d — status & histori proctoring, disertakan di semua response attempt. */
export interface ProctoringFields {
  violationCount: number;
  lockedAt: string | null;
  lockedBy: string | null;
  lockedReason: string | null;
  unlockedAt: string | null;
  unlockedBy: string | null;
}

export interface ExamRow {
  id: string;
  category?: string | null;
  programId?: string | null;
  levelId?: string | null;
  subjectId?: string | null;
  program?: { id: string; name: string } | null;
  level?: { id: string; name: string } | null;
  subject?: { id: string; name: string } | null;
  title: string;
  description: string | null;
  scheduledStartAt: string;
  scheduledEndAt: string;
  status: ExamStatus;
  maxScore: number;
  durationMinutes: number | null;
  proctoringEnabled: boolean;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  items: ExamItem[];
  _count: {
    attempts: number;
  };
}

export interface ExamItem {
  id: string;
  examId: string;
  questionId: string;
  sortOrder: number;
  points: number;
  question: {
    id: string;
    type: string;
    content: string;
    points: number | null;
  };
}

export interface ExamAttempt extends ProctoringFields {
  id: string;
  examId: string;
  studentId: string;
  status: ExamAttemptStatus;
  score: number | null;
  maxScore: number;
  startedAt: string;
  submittedAt: string | null;
  lateByMs: number | null;
  resultReleased?: boolean;
  exam: {
    id: string;
    title: string;
  };
  student?: {
    id: string;
    user: {
      name: string;
      email: string;
    };
  };
}

export interface ExamAttemptDetail extends ProctoringFields {
  id: string;
  examId: string;
  studentId: string;
  status: ExamAttemptStatus;
  score: number;
  maxScore: number;
  startedAt: string;
  submittedAt: string | null;
  lateByMs: number | null;
  resultReleased?: boolean;
  exam: {
    id: string;
    title: string;
    scheduledStartAt: string;
    scheduledEndAt: string;
    proctoringEnabled?: boolean;
  };
  items: ExamAttemptItem[];
}

export interface ExamAttemptItem {
  questionId: string;
  sortOrder: number;
  points: number;
  question: {
    id: string;
    type: string;
    content: string;
    imageUrl: string | null;
    difficulty: string | null;
    points: number | null;
    answerKey?: string | null;
    explanation?: string | null;
    options: {
      id: string;
      content: string;
      isCorrect: boolean;
      sortOrder: number;
    }[];
  };
  answer: {
    selectedOptionIds: string[];
    textAnswer: string | null;
    isCorrect?: boolean | null;
    score?: number;
  } | null;
}

export interface CreateExamDto {
  title: string;
  description?: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  durationMinutes?: number;
  proctoringEnabled?: boolean;
  notes?: string;
  questionIds: string[];
  points?: number[];
}

export interface UpdateExamDto {
  programId?: string;
  levelId?: string;
  subjectId?: string;
  category?: string;
  title?: string;
  description?: string;
  scheduledStartAt?: string;
  scheduledEndAt?: string;
  status?: ExamStatus;
  durationMinutes?: number;
  proctoringEnabled?: boolean;
  notes?: string;
  questionIds?: string[];
  points?: number[];
}

export interface SaveExamAnswerDto {
  selectedOptionIds: string[];
  textAnswer?: string | null;
}

// --- Fase 3d: Proctoring & Anti-Leak ---

export enum ProctoringViolationType {
  FULLSCREEN_EXIT = 'FULLSCREEN_EXIT',
  VISIBILITY_CHANGE = 'VISIBILITY_CHANGE',
  BLUR = 'BLUR',
  TAB_LEAVE = 'TAB_LEAVE',
}

export interface ReportViolationDto {
  violationType: ProctoringViolationType;
  details?: string;
}

export interface ReportViolationResult {
  success: boolean;
  violationCount: number;
  locked: boolean;
  message: string;
}

export interface ProctoringStatus extends ProctoringFields {
  id: string;
  status: ExamAttemptStatus;
  violationThreshold: number;
  canBeLocked: boolean;
}
