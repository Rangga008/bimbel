export interface LatsolPackageItem {
  id: string;
  title: string;
  description: string | null;
  isActive: boolean;
  category?: string | null;
  program: { id: string; name: string; code: string } | null;
  level: { id: string; name: string; code: string | null } | null;
  subject?: { id: string; name: string; code: string } | null;
  _count: { items: number; attempts: number };
}

export interface LatsolOption {
  id: string;
  content: string;
  imageUrl?: string | null;
  sortOrder: number;
  isCorrect?: boolean;
}

export interface LatsolQuestionPlay {
  id: string;
  type: string;
  content: string;
  imageUrl: string | null;
  points: number | null;
  options: LatsolOption[];
}

export interface LatsolFeedback {
  id: string;
  questionId: string;
  selectedOptionIds: string[];
  textAnswer: string | null;
  isCorrect: boolean | null;
  score: number;
  maxScore: number;
  question: {
    id: string;
    type: string;
    content: string;
    imageUrl: string | null;
    points: number | null;
    explanation: string | null;
    explanationImageUrl?: string | null;
    answerKey: string | null;
    correctOptionIds: string[];
    options: LatsolOption[];
  };
}

export interface LatsolAttemptDetail {
  id: string;
  status: string;
  score: number;
  maxScore: number;
  startedAt: string;
  submittedAt: string | null;
  package: { id: string; title: string; description: string | null };
  items: Array<
    | { questionId: string; sortOrder: number; answered: false; question: LatsolQuestionPlay }
    | { questionId: string; sortOrder: number; answered: true; answer: LatsolFeedback }
  >;
}

export interface LevelItem {
  id: string;
  name: string;
  code?: string | null;
}

export interface ProgramItem {
  id: string;
  name: string;
  code?: string | null;
}

export interface SubjectItem {
  id: string;
  code: string;
  name: string;
  isActive?: boolean;
}

export interface LatsolAttemptItem {
  id: string;
  status: string;
  score: number;
  maxScore: number;
  startedAt: string;
  submittedAt: string | null;
  package: { id: string; title: string };
  _count: { answers: number };
}

/** Render teks soal: dukung KaTeX inline $...$ (tanpa dependensi baru). */
export function renderMathText(text: string): Array<{ kind: 'text' | 'math'; value: string }> {
  const parts: Array<{ kind: 'text' | 'math'; value: string }> = [];
  const re = /\$(.+?)\$/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ kind: 'text', value: text.slice(last, m.index) });
    parts.push({ kind: 'math', value: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ kind: 'text', value: text.slice(last) });
  if (!parts.length) parts.push({ kind: 'text', value: text });
  return parts;
}
