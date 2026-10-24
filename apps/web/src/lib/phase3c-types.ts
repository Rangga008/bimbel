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

export interface ExamSubtesRow {
  id: string;
  examId?: string;
  name: string;
  sortOrder: number;
  durationMinutes: number;
  subjectId?: string | null;
  subject?: { id: string; name: string } | null;
}

export interface ExamGroupRow {
  groupId: string;
  group: { id: string; name: string; code?: string | null };
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
  /** true = siswa langsung melihat nilai+kunci setelah submit. */
  showResultImmediately?: boolean;
  /** Kode akses untuk peserta luar (ditukar di halaman ujian siswa). */
  accessCode?: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  items: ExamItem[];
  subtes?: ExamSubtesRow[];
  groups?: ExamGroupRow[];
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
  /** Subtes tempat soal ini berada (null = ujian tanpa subtes). */
  subtesId?: string | null;
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

/** Status pengerjaan satu subtes dalam sebuah attempt. */
export interface ExamAttemptSubtesState {
  subtesId: string;
  startedAt: string | null;
  submittedAt: string | null;
}

/** Rekap hasil per subtes — hanya terisi setelah hasil dirilis. */
export interface ExamSubtesResult {
  subtesId: string;
  name: string;
  total: number;
  correct: number;
  score: number;
  maxScore: number;
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
  /** State per subtes (ujian multi-subtes). */
  subtesStates?: ExamAttemptSubtesState[];
  /** Rekap nilai per subtes — ada setelah hasil dirilis. */
  subtesResults?: ExamSubtesResult[];
  exam: {
    id: string;
    title: string;
    scheduledStartAt: string;
    scheduledEndAt: string;
    proctoringEnabled?: boolean;
    showResultImmediately?: boolean;
    subtes?: { id: string; name: string; durationMinutes: number; sortOrder: number }[];
  };
  items: ExamAttemptItem[];
}

export interface ExamAttemptItem {
  questionId: string;
  sortOrder: number;
  points: number;
  /** Subtes tempat soal berada (ujian multi-subtes). */
  subtesId?: string | null;
  subtesName?: string | null;
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

export interface ExamSubtesDto {
  name: string;
  subjectId?: string;
  durationMinutes: number;
}

export interface ExamItemDto {
  questionId: string;
  points?: number;
  /** Indeks subtes (0-based) pada array subtes di request yang sama. */
  subtesIdx?: number | null;
}

export interface CreateExamDto {
  programId?: string;
  levelId?: string;
  subjectId?: string;
  category?: string;
  title: string;
  description?: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  durationMinutes?: number;
  proctoringEnabled?: boolean;
  /** true = siswa langsung melihat hasil setelah submit. */
  showResultImmediately?: boolean;
  notes?: string;
  questionIds?: string[];
  points?: number[];
  /** Kelompok target — kosong/undefined = terbuka sesuai scope taksonomi. */
  groupIds?: string[];
  /** Mode multi-subtes — bila dikirim, pakai `items` untuk penempatan soal. */
  subtes?: ExamSubtesDto[];
  items?: ExamItemDto[];
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
  showResultImmediately?: boolean;
  notes?: string;
  questionIds?: string[];
  points?: number[];
  groupIds?: string[];
  subtes?: ExamSubtesDto[];
  items?: ExamItemDto[];
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
  violationLimit?: number;
  locked: boolean;
  /** Batas pelanggaran terlampaui — jawaban dikumpulkan otomatis oleh sistem. */
  autoSubmitted?: boolean;
  message: string;
}

export interface ProctoringStatus extends ProctoringFields {
  id: string;
  status: ExamAttemptStatus;
  violationThreshold: number;
  canBeLocked: boolean;
}
