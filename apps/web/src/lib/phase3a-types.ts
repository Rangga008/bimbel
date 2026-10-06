export interface MaterialRow {
  id: string;
  programId: string | null;
  levelId: string | null;
  groupId: string | null;
  subjectId?: string | null;
  title: string;
  description: string | null;
  content: string | null;
  imageUrl: string | null;
  fileUrl: string | null;
  fileType: string | null;
  fileSize: number | null;
  isActive: boolean;
  category?: string | null;
  createdAt: string;
  updatedAt: string;
  examId?: string | null;
  latsolPackageId?: string | null;
  exam?: { id: string; title: string; status: string; scheduledStartAt: string } | null;
  latsolPackage?: { id: string; title: string; isActive: boolean } | null;
  program?: { id: string; name: string; code: string | null } | null;
  level?: { id: string; name: string; code: string | null } | null;
  group?: { id: string; name: string; code: string | null } | null;
  subject?: { id: string; name: string; code: string } | null;
}

export interface QuestionRow {
  id: string;
  programId: string | null;
  levelId: string | null;
  subjectId: string | null;
  type: string;
  content: string;
  imageUrl: string | null;
  difficulty: string | null;
  points: number | null;
  explanation: string | null;
  explanationImageUrl: string | null;
  answerKey: string | null;
  isActive: boolean;
  category?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  program?: { id: string; name: string; code: string | null } | null;
  level?: { id: string; name: string; code: string | null } | null;
  subject?: { id: string; name: string; code: string } | null;
  options: QuestionOption[];
}

export interface QuestionOption {
  id: string;
  questionId: string;
  content: string;
  imageUrl: string | null;
  isCorrect: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface SubjectItem {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export interface QuestionSummary {
  total: number;
  byType: Record<string, number>;
  byDifficulty: Record<string, number>;
}

export interface ProgramItem {
  id: string;
  name: string;
  code: string;
}

export interface LevelItem {
  id: string;
  name: string;
  code: string | null;
}

export interface GroupItem {
  id: string;
  name: string;
  code: string | null;
}

export const QUESTION_TYPES = [
  { value: 'SINGLE_CHOICE', label: 'Pilihan Tunggal' },
  { value: 'MULTIPLE_CHOICE', label: 'Pilihan Ganda' },
  { value: 'TRUE_FALSE', label: 'Benar/Salah' },
  { value: 'SHORT_ANSWER', label: 'Isian Singkat' },
  { value: 'ESSAY', label: 'Essay' },
] as const;

export const DIFFICULTY_LEVELS = [
  { value: 'EASY', label: 'Mudah' },
  { value: 'MEDIUM', label: 'Sedang' },
  { value: 'HARD', label: 'Sulit' },
] as const;