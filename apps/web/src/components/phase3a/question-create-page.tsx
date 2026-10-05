'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { apiFetch, ApiError } from '@/lib/api-client';
import type { LevelItem, ProgramItem, QuestionRow } from '@/lib/phase3a-types';
import { QuestionFormCard, emptyQuestionDraft, type QuestionDraft } from './question-form-card';

function err(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}

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

/**
 * Halaman "Tambah Soal" — bukan modal. Bisa menambah banyak kartu soal
 * sekaligus (satu per satu ditambah ke draft), lalu semua disimpan dengan
 * sekali klik "Simpan Semua". Dipakai untuk Bank Soal, yang selanjutnya
 * dipakai baik oleh Latsol maupun Ujian.
 */
export function QuestionCreatePage({
  basePath,
  initial,
}: {
  basePath: string;
  initial?: { levelId?: string; subjectId?: string; category?: string };
}) {
  const qc = useQueryClient();
  const router = useRouter();
  const [drafts, setDrafts] = useState<QuestionDraft[]>([
    {
      ...emptyQuestionDraft(),
      levelId: initial?.levelId ?? '',
      subjectId: initial?.subjectId ?? '',
      category: initial?.category ?? '',
    },
  ]);

  const programsQ = useQuery({
    queryKey: ['programs-lite'],
    queryFn: () => apiFetch<ProgramItem[]>('/programs'),
  });

  // Prefill dari drill-down: turunkan program dari jenjang yang dipilih.
  const levelsAllQ = useQuery({
    queryKey: ['levels-all'],
    queryFn: () => apiFetch<(LevelItem & { program?: { id: string } | null })[]>('/levels'),
    enabled: !!initial?.levelId,
  });
  useEffect(() => {
    const lvl = levelsAllQ.data?.find((l) => l.id === initial?.levelId);
    if (lvl?.program?.id) {
      setDrafts((prev) => prev.map((d, i) => (i === 0 && !d.programId ? { ...d, programId: lvl.program!.id } : d)));
    }
  }, [levelsAllQ.data, initial?.levelId]);

  const saveAllM = useMutation({
    mutationFn: async () => {
      const results: QuestionRow[] = [];
      for (const draft of drafts) {
        const created = await apiFetch<QuestionRow>('/questions', {
          method: 'POST',
          body: draftToPayload(draft),
        });
        results.push(created);
      }
      return results;
    },
    onSuccess: (results) => {
      toast.success(`${results.length} soal berhasil disimpan.`);
      qc.invalidateQueries({ queryKey: ['questions'] });
      qc.invalidateQueries({ queryKey: ['questions-summary'] });
      router.push(basePath);
    },
    onError: (e) => toast.error(err(e, 'Gagal menyimpan soal. Perbaiki kartu yang bermasalah lalu coba lagi.')),
  });

  const updateDraft = (idx: number, draft: QuestionDraft) => {
    setDrafts((prev) => prev.map((d, i) => (i === idx ? draft : d)));
  };

  const addDraft = () => {
    setDrafts((prev) => [...prev, emptyQuestionDraft()]);
  };

  const removeDraft = (idx: number) => {
    setDrafts((prev) => prev.filter((_, i) => i !== idx));
  };

  const isValid = drafts.every((d) => {
    // Jenjang + mapel + tipe wajib — bank soal dikategorikan per jenjang.
    if (!d.levelId || !d.subjectId || !d.category) return false;
    if (!d.content.trim()) return false;
    if ((d.type === 'SINGLE_CHOICE' || d.type === 'MULTIPLE_CHOICE' || d.type === 'TRUE_FALSE')) {
      if (d.options.length === 0) return false;
      if (!d.options.every((o) => o.content.trim() || o.imageUrl)) return false;
      // Pilihan tunggal wajib tepat 1 jawaban benar.
      if (d.type !== 'MULTIPLE_CHOICE' && d.options.filter((o) => o.isCorrect).length !== 1) return false;
    }
    return true;
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tambah Soal</h1>
          <p className="text-sm text-muted-foreground">
            Tambahkan sebanyak mungkin soal di halaman ini, lalu simpan sekaligus.
          </p>
        </div>
        <Button variant="outline" onClick={() => router.push(basePath)}>
          Batal
        </Button>
      </div>

      <div className="flex flex-col gap-4">
        {drafts.map((draft, idx) => (
          <QuestionFormCard
            key={idx}
            index={idx}
            draft={draft}
            onChange={(d) => updateDraft(idx, d)}
            onRemove={drafts.length > 1 ? () => removeDraft(idx) : undefined}
            programsData={programsQ.data || []}
          />
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 sticky bottom-0 bg-background py-3 border-t">
        <Button type="button" variant="outline" onClick={addDraft}>
          + Tambah Soal Lagi
        </Button>
        <Button
          type="button"
          disabled={!isValid || saveAllM.isPending}
          onClick={() => saveAllM.mutate()}
        >
          {saveAllM.isPending ? 'Menyimpan...' : `Simpan Semua (${drafts.length} soal)`}
        </Button>
      </div>
    </div>
  );
}
