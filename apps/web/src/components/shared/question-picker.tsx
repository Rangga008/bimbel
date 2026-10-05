'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api-client';
import type { LevelItem, SubjectItem } from '@/lib/phase3b-types';
import { Phase1aSelectField } from '@/components/phase1a/phase1a-form-dialog';
import { MathContent } from '@/components/shared/math-content';
import {
  useContentCategories,
  useContentLevels,
} from '@/components/shared/content-drilldown';
import { categoryOptions, tingkatCode } from '@/lib/content-taxonomy';

export interface QuestionPickerFilters {
  /** Tingkat sekolah (SD/SMP/SMA/TK) — dari kode gradeLevel jenjang. */
  tingkat: string;
  subjectId: string;
  programId: string;
  levelId: string;
  /** Tipe/kategori konten soal (HARIAN/UTS/BAB-1/dst.) — mempersempit daftar. */
  category: string;
}

export const emptyQuestionPickerFilters: QuestionPickerFilters = {
  tingkat: '',
  subjectId: '',
  programId: '',
  levelId: '',
  category: '',
};

interface QuestionSelectItem {
  id: string;
  content: string;
  imageUrl: string | null;
  type: string;
  difficulty: string | null;
  points: number | null;
  category?: string | null;
  subject?: { id: string; name: string } | null;
}

/**
 * Pemilih soal cascade: Tingkat → Jenjang → Mapel → Tipe — selaras dengan
 * drill-down bank soal. Mapel wajib untuk menampilkan daftar soal.
 */
export function QuestionPicker({
  filters,
  onFiltersChange,
  selectedIds,
  onToggle,
}: {
  filters: QuestionPickerFilters;
  onFiltersChange: (filters: QuestionPickerFilters) => void;
  selectedIds: string[];
  onToggle: (questionId: string) => void;
}) {
  const [questionSearch, setQuestionSearch] = useState('');

  const levelsQ = useContentLevels();
  const catsQ = useContentCategories();
  const levels = levelsQ.data ?? [];

  const subjectsQ = useQuery({
    queryKey: ['subjects'],
    queryFn: () => apiFetch<SubjectItem[]>('/master/subjects'),
  });

  const tingkatOptions = useMemo(
    () =>
      [
        ...new Set(
          levels.map((l) => tingkatCode(l)).filter((t): t is string => !!t),
        ),
      ]
        .map((t) => ({
          value: t,
          label: t,
          sort: Math.min(
            ...levels
              .filter((l) => tingkatCode(l) === t)
              .map((l) => l.gradeLevel?.sortOrder ?? 9999),
          ),
        }))
        .sort((a, b) => a.sort - b.sort),
    [levels],
  );

  const levelOptions = useMemo(
    () =>
      levels
        .filter((l) => !filters.tingkat || tingkatCode(l) === filters.tingkat)
        .map((l) => ({
          value: l.id,
          label: l.program?.name ? `${l.name} — ${l.program.name}` : l.name,
        })),
    [levels, filters.tingkat],
  );

  // Mapel dari jenjang terpilih (levelSubjects) bila ada; kalau belum pilih
  // jenjang, tampilkan seluruh master mapel.
  const subjectOptions = useMemo(() => {
    const lvl = levels.find((l) => l.id === filters.levelId);
    if (lvl?.levelSubjects?.length) {
      return lvl.levelSubjects
        .map((ls) => ls.subject)
        .filter((s): s is { id: string; name: string } => !!s)
        .map((s) => ({ value: s.id, label: s.name }));
    }
    return (
      subjectsQ.data?.map((s) => ({
        value: s.id,
        label: `${s.code} — ${s.name}`,
      })) || []
    );
  }, [levels, filters.levelId, subjectsQ.data]);

  const questionsQ = useQuery({
    queryKey: [
      'questions-select',
      filters.programId,
      filters.levelId,
      filters.subjectId,
      filters.category,
      questionSearch,
    ],
    queryFn: () => {
      const p = new URLSearchParams();
      p.set('subjectId', filters.subjectId);
      if (filters.programId) p.set('programId', filters.programId);
      if (filters.levelId) p.set('levelId', filters.levelId);
      if (filters.category) p.set('category', filters.category);
      if (questionSearch) p.set('search', questionSearch);
      return apiFetch<QuestionSelectItem[]>(`/questions?${p.toString()}`);
    },
    enabled: !!filters.subjectId,
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Phase1aSelectField
          id="qp-tingkat"
          label="Tingkat (opsional)"
          value={filters.tingkat}
          onChange={(v) =>
            onFiltersChange({ ...filters, tingkat: v, levelId: '', subjectId: '' })
          }
          options={tingkatOptions}
          placeholder="SD/SMP/SMA…"
        />
        <div className="flex flex-col gap-1.5">
          <Phase1aSelectField
            id="qp-level"
            label="Jenjang (opsional)"
            value={filters.levelId}
            onChange={(v) => {
              const lvl = levels.find((l) => l.id === v);
              onFiltersChange({
                ...filters,
                levelId: v,
                subjectId: '',
                // programId ikut jenjang — dipakai backend untuk taksonomi ujian.
                programId: lvl?.program?.id ?? filters.programId,
              });
            }}
            options={levelOptions}
          />
        </div>
        <Phase1aSelectField
          id="qp-subject"
          label="Mapel *"
          value={filters.subjectId}
          onChange={(v) => onFiltersChange({ ...filters, subjectId: v })}
          options={subjectOptions}
        />
        <Phase1aSelectField
          id="qp-category"
          label="Tipe (opsional)"
          value={filters.category}
          onChange={(v) => onFiltersChange({ ...filters, category: v })}
          options={categoryOptions(catsQ.data)}
          placeholder="Semua tipe"
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label>Pilih Soal * (minimal 1)</Label>
          <Badge variant="outline">{selectedIds.length} soal dipilih</Badge>
        </div>
        {!filters.subjectId ? (
          <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            Pilih Mapel dulu untuk menampilkan daftar soal. Gunakan Tingkat,
            Jenjang, dan Tipe untuk mempersempit — mis. hanya soal Bab 1.
          </p>
        ) : (
          <>
            <input
              placeholder="Cari soal berdasarkan konten..."
              value={questionSearch}
              onChange={(e) => setQuestionSearch(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3"
            />
            {questionsQ.isLoading ? <Skeleton className="h-24 w-full" /> : null}
            {questionsQ.isError ? <p className="text-sm text-destructive">Gagal memuat soal.</p> : null}
            <div className="max-h-96 overflow-y-auto border rounded-md p-2">
              {questionsQ.data?.map((q) => (
                <div key={q.id} className="flex items-start gap-2 p-2 hover:bg-muted/50">
                  <Checkbox
                    checked={selectedIds.includes(q.id)}
                    onCheckedChange={() => onToggle(q.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <label className="text-sm font-medium cursor-pointer block" onClick={() => onToggle(q.id)}>
                      <MathContent text={q.content.slice(0, 120)} />
                      {q.content.length > 120 ? '...' : ''}
                    </label>
                    <div className="flex gap-1 mt-1">
                      {q.subject && <Badge variant="default" className="text-xs">{q.subject.name}</Badge>}
                      {q.category && <Badge variant="secondary" className="text-xs">{q.category}</Badge>}
                      <Badge variant="outline" className="text-xs">{q.type}</Badge>
                      {q.difficulty && <Badge variant="secondary" className="text-xs">{q.difficulty}</Badge>}
                      {q.points && <Badge variant="outline" className="text-xs">{q.points} poin</Badge>}
                    </div>
                  </div>
                </div>
              ))}
              {questionsQ.data?.length === 0 && (
                <p className="text-sm text-muted-foreground p-2">Tidak ada soal yang cocok.</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
