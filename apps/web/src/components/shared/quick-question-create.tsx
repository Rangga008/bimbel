'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { apiFetch, ApiError } from '@/lib/api-client';
import type { ProgramItem, QuestionRow } from '@/lib/phase3a-types';
import {
  QuestionFormCard,
  emptyQuestionDraft,
  type QuestionDraft,
} from '@/components/phase3a/question-form-card';

function draftToPayload(draft: QuestionDraft) {
  return {
    programId: draft.programId || undefined,
    levelId: draft.levelId || undefined,
    subjectId: draft.subjectId || undefined,
    category: draft.category || undefined,
    type: draft.type,
    content: draft.content,
    imageUrl: draft.imageUrl || undefined,
    difficulty: draft.difficulty || undefined,
    points: draft.points ? Number(draft.points) : undefined,
    explanation: draft.explanation || undefined,
    explanationImageUrl: draft.explanationImageUrl || undefined,
    answerKey: draft.answerKey || undefined,
    options: draft.options,
  };
}

/** Panel lipat "Buat soal baru" — soal tersimpan langsung terpilih. */
export function QuickQuestionCreate({
  seed,
  onCreated,
  createdToast,
}: {
  seed: Partial<QuestionDraft>;
  onCreated: (questionId: string) => void;
  /** Pesan toast setelah soal dibuat — default konteks ujian. */
  createdToast?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<QuestionDraft>(() => ({
    ...emptyQuestionDraft(),
    ...seed,
  }));
  const programsQ = useQuery({
    queryKey: ['programs-lite'],
    queryFn: () => apiFetch<ProgramItem[]>('/programs'),
    enabled: open,
  });
  const createM = useMutation({
    mutationFn: () =>
      apiFetch<QuestionRow>('/questions', {
        method: 'POST',
        body: draftToPayload(draft),
      }),
    onSuccess: (q) => {
      toast.success(createdToast ?? 'Soal dibuat dan langsung dipilih.');
      onCreated(q.id);
      setDraft({ ...emptyQuestionDraft(), ...seed });
      setOpen(false);
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : 'Gagal membuat soal.'),
  });

  const valid =
    !!draft.levelId &&
    !!draft.subjectId &&
    !!draft.category &&
    !!draft.content.trim() &&
    (draft.type === 'SHORT_ANSWER' ||
      draft.type === 'ESSAY' ||
      (draft.options.length > 0 &&
        draft.options.every((o) => o.content.trim() || o.imageUrl) &&
        (draft.type === 'MULTIPLE_CHOICE' ||
          draft.type === 'TRUE_FALSE_COMPLEX' ||
          draft.options.filter((o) => o.isCorrect).length === 1)));

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => {
        setDraft((d) => ({ ...d, ...seed }));
        setOpen(true);
      }}>
        <Plus className="mr-1 h-4 w-4" /> Buat Soal Baru
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed p-3">
      <QuestionFormCard
        index={0}
        draft={draft}
        onChange={setDraft}
        programsData={programsQ.data ?? []}
      />
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Batal
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!valid || createM.isPending}
          onClick={() => createM.mutate()}
        >
          {createM.isPending ? 'Menyimpan…' : 'Simpan & Pilih Soal Ini'}
        </Button>
      </div>
    </div>
  );
}
