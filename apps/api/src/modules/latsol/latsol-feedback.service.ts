import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

type Opt = {
  id: string;
  content: string;
  imageUrl?: string | null;
  isCorrect: boolean;
  sortOrder: number;
};
type Q = {
  id: string;
  type: string;
  content: string;
  imageUrl: string | null;
  points: number | null;
  options: Opt[];
};
type Ans = {
  id: string;
  questionId: string;
  selectedOptionIds: string[];
  textAnswer: string | null;
  isCorrect: boolean | null;
  score: number;
  question: Q & { explanation: string | null; explanationImageUrl: string | null; answerKey: string | null };
};

/** Sanitasi soal untuk siswa sebelum dijawab: tanpa kunci & solusi. */
export function sanitizeQuestion(q: Q) {
  return {
    id: q.id,
    type: q.type,
    content: q.content,
    imageUrl: q.imageUrl,
    points: q.points,
    options: q.options.map((o) => ({
      id: o.id,
      content: o.content,
      imageUrl: o.imageUrl ?? null,
      sortOrder: o.sortOrder,
    })),
  };
}

/** Feedback instan 1 jawaban milik siswa: benar/salah + kunci + solusi. */
export function toFeedbackAnswer(a: Ans) {
  const q = a.question;
  return {
    id: a.id,
    questionId: a.questionId,
    selectedOptionIds: a.selectedOptionIds,
    textAnswer: a.textAnswer,
    isCorrect: a.isCorrect,
    score: a.score,
    maxScore: q.points ?? 1,
    question: {
      id: q.id,
      type: q.type,
      content: q.content,
      imageUrl: q.imageUrl,
      points: q.points,
      explanation: q.explanation,
      explanationImageUrl: q.explanationImageUrl,
      answerKey: q.type === 'SHORT_ANSWER' ? q.answerKey : null,
      correctOptionIds: q.options.filter((o) => o.isCorrect).map((o) => o.id),
      options: q.options.map((o) => ({
        id: o.id,
        content: o.content,
        imageUrl: o.imageUrl ?? null,
        sortOrder: o.sortOrder,
      })),
    },
  };
}

@Injectable()
export class LatsolFeedbackService {
  constructor(private readonly prisma: PrismaService) {}
}
