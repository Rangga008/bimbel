import { QuestionType } from '@prisma/client';

export type QOpt = { id: string; isCorrect: boolean };
export type QGrade = {
  id: string;
  type: QuestionType;
  points: number | null;
  answerKey: string | null;
  options: QOpt[];
};

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Penilaian server-side 1 soal latsol (dipakai save per-soal & submit paket). */
export function gradeLatsolQuestion(
  q: QGrade,
  input: { selectedOptionIds?: string[]; textAnswer?: string },
): { isCorrect: boolean | null; score: number; maxScore: number } {
  const maxScore = q.points ?? 1;
  const picked = [...new Set(input.selectedOptionIds ?? [])];
  if (q.type === 'SINGLE_CHOICE' || q.type === 'TRUE_FALSE') {
    const correct = q.options.filter((o) => o.isCorrect).map((o) => o.id);
    const ok = picked.length === 1 && correct.includes(picked[0]);
    return { isCorrect: ok, score: ok ? maxScore : 0, maxScore };
  }
  if (q.type === 'MULTIPLE_CHOICE') {
    const c = new Set(q.options.filter((o) => o.isCorrect).map((o) => o.id));
    const g = new Set(picked);
    const ok = g.size === c.size && [...g].every((id) => c.has(id));
    return { isCorrect: ok, score: ok ? maxScore : 0, maxScore };
  }
  if (q.type === 'SHORT_ANSWER') {
    if (!q.answerKey) return { isCorrect: null, score: 0, maxScore };
    const ok = norm(input.textAnswer ?? '') === norm(q.answerKey);
    return { isCorrect: ok, score: ok ? maxScore : 0, maxScore };
  }
  return { isCorrect: null, score: 0, maxScore };
}
