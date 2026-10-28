'use client';

import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api-client';
import type { LevelItem, SubjectItem } from '@/lib/phase3b-types';
import { Phase1aSelectField } from '@/components/phase1a/phase1a-form-dialog';
import { plainPreview } from '@/components/shared/math-content';
import {
  useContentCategories,
  useContentLevels,
} from '@/components/shared/content-drilldown';
import { categoryLabel, categoryOptions, sortLevels, tingkatCode } from '@/lib/content-taxonomy';

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
  // Jenjang tanpa gradeLevel (paket Privat dsb.) → bucket "Lainnya".
  if (levels.some((l) => !tingkatCode(l)) && !tingkatOptions.some((t) => t.value === 'none')) {
    tingkatOptions.push({ value: 'none', label: 'Lainnya', sort: 9999 });
  }

  const levelOptions = useMemo(
    () =>
      sortLevels(levels)
        .filter((l) => {
          const tk = tingkatCode(l);
          return (
            !filters.tingkat ||
            (filters.tingkat === 'none' ? !tk : tk === filters.tingkat)
          );
        })
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
      // Semua filter opsional — tanpa filter, server mengembalikan
      // 100 soal terbaru; filter/cari untuk mempersempit.
      if (filters.subjectId) p.set('subjectId', filters.subjectId);
      if (filters.programId) p.set('programId', filters.programId);
      if (filters.levelId) p.set('levelId', filters.levelId);
      if (filters.category) p.set('category', filters.category);
      if (questionSearch) p.set('search', questionSearch);
      return apiFetch<QuestionSelectItem[]>(`/questions?${p.toString()}`);
    },
  });

  // Ambil detail soal terpilih yang tidak muncul di daftar terfilter
  // (mis. hasil import di taksonomi lain atau soal dari filter sebelumnya).
  const missingIds = selectedIds.filter(
    (id) => !(questionsQ.data ?? []).some((q) => q.id === id),
  );
  const missingKey = missingIds.slice().sort().join(',');
  const selectedDetailQ = useQuery({
    queryKey: ['questions-selected', missingKey],
    queryFn: () =>
      apiFetch<QuestionSelectItem[]>(
        `/questions?ids=${encodeURIComponent(missingIds.join(','))}`,
      ),
    enabled: missingIds.length > 0,
  });

  // Cache item yang pernah tampil — strip "soal dipilih" di bawah tetap bisa
  // menampilkan label soal walau filter saat ini menyembunyikan daftarnya.
  const knownRef = useRef(new Map<string, QuestionSelectItem>());
  for (const q of questionsQ.data ?? []) knownRef.current.set(q.id, q);
  for (const q of selectedDetailQ.data ?? []) knownRef.current.set(q.id, q);
  const selectedItems = selectedIds
    .map((id) => knownRef.current.get(id))
    .filter((q): q is QuestionSelectItem => !!q);

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
            label="Jenjang *"
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
          label="Mapel (opsional)"
          value={filters.subjectId}
          onChange={(v) => onFiltersChange({ ...filters, subjectId: v })}
          options={subjectOptions}
          placeholder="Semua mapel"
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
        {/* Soal terpilih selalu terlihat — tidak ikut hilang saat filter
            diubah/dikosongkan; klik × untuk melepas. */}
        {selectedItems.length > 0 ? (
          <div className="flex flex-col gap-1.5 rounded-md border border-brand-blue-300 bg-brand-blue-50/60 p-2">
            <p className="text-xs font-medium text-brand-blue-800">
              Soal terpilih (tidak terpengaruh filter):
            </p>
            <div className="flex flex-wrap gap-1.5">
              {selectedItems.map((q) => (
                <span
                  key={q.id}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs"
                >
                  <span className="min-w-0 max-w-56 truncate">
                    {plainPreview(q.content, 80)}
                  </span>
                  <button
                    type="button"
                    aria-label="Lepas soal"
                    onClick={() => onToggle(q.id)}
                    className="shrink-0 rounded px-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        ) : null}
        <>
          <input
            placeholder="Cari soal berdasarkan konten..."
            value={questionSearch}
            onChange={(e) => setQuestionSearch(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3"
          />
          {!filters.subjectId ? (
            <p className="text-xs text-muted-foreground">
              Menampilkan maks. 100 soal terbaru — gunakan filter Tingkat /
              Jenjang / Mapel / Tipe atau kolom cari untuk mempersempit.
            </p>
          ) : null}
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
                    {plainPreview(q.content, 120)}
                  </label>
                  <div className="flex gap-1 mt-1">
                    {q.subject && <Badge variant="default" className="text-xs">{q.subject.name}</Badge>}
                    {q.category && <Badge variant="secondary" className="text-xs">{categoryLabel(q.category, catsQ.data)}</Badge>}
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
      </div>
    </div>
  );
}
