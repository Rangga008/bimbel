'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { Pencil, Plus, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { apiFetch, resolveAssetUrl } from '@/lib/api-client';
import type { LevelItem, SubjectItem } from '@/lib/phase3b-types';
import { Phase1aSelectField } from '@/components/phase1a/phase1a-form-dialog';
import { MathContent, plainPreview } from '@/components/shared/math-content';
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

interface PickerOption {
  id: string;
  content: string;
  imageUrl?: string | null;
  isCorrect: boolean;
  sortOrder: number;
}

interface QuestionSelectItem {
  id: string;
  content: string;
  imageUrl: string | null;
  type: string;
  difficulty: string | null;
  points: number | null;
  category?: string | null;
  answerKey?: string | null;
  stimulus?: string | null;
  subject?: { id: string; name: string } | null;
  options?: PickerOption[];
  /** Terisi bila soal sudah dihapus (soft-delete) — tampil agar bisa dilepas. */
  deletedAt?: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  SINGLE_CHOICE: 'PG',
  MULTIPLE_CHOICE: 'PGK',
  TRUE_FALSE: 'B/S',
  TRUE_FALSE_COMPLEX: 'BSK',
  SHORT_ANSWER: 'Isian',
  ESSAY: 'Esai',
};

/** Kartu soal terpilih — tampil penuh: isi soal + opsi + kunci jawaban. */
function SelectedQuestionCard({
  no,
  q,
  cats,
  onEdit,
  onRemove,
}: {
  no: number;
  q: QuestionSelectItem;
  cats: { code: string; name: string }[];
  onEdit: () => void;
  onRemove: () => void;
}) {
  const options = q.options ?? [];
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-semibold">Soal {no}</span>
          {q.subject && <Badge variant="default" className="text-xs">{q.subject.name}</Badge>}
          {q.category && <Badge variant="secondary" className="text-xs">{categoryLabel(q.category, cats)}</Badge>}
          <Badge variant="outline" className="text-xs">{TYPE_LABELS[q.type] ?? q.type}</Badge>
          {q.difficulty && <Badge variant="secondary" className="text-xs">{q.difficulty}</Badge>}
          {q.points != null && <Badge variant="outline" className="text-xs">{q.points} poin</Badge>}
          {q.deletedAt && (
            <Badge variant="destructive" className="text-xs">Dihapus dari bank</Badge>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={onEdit}
            title="Edit soal (kembali ke sini setelah selesai)"
            className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Pencil className="size-4" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            title="Keluarkan soal dari ujian"
            className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {q.stimulus && (
        <div className="mt-2 rounded-md border border-brand-blue-200 bg-brand-blue-50 p-2 text-xs">
          <p className="mb-0.5 font-medium uppercase tracking-wide text-muted-foreground">Bacaan</p>
          <MathContent text={q.stimulus} />
        </div>
      )}

      <div className="mt-2 text-sm">
        <MathContent text={q.content} />
        {q.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resolveAssetUrl(q.imageUrl)}
            alt="Gambar soal"
            className="max-w-full mt-1 max-h-48 w-auto rounded border object-contain"
          />
        )}
      </div>

      {q.type === 'TRUE_FALSE_COMPLEX' ? (
        <div className="mt-2 flex flex-col gap-1">
          {options.map((o, i) => (
            <div key={o.id} className="flex items-center gap-2 text-sm">
              <span className="w-5 shrink-0 text-muted-foreground">{i + 1}.</span>
              <span className="flex-1 min-w-0"><MathContent text={o.content} /></span>
              <Badge variant={o.isCorrect ? 'default' : 'secondary'} className="shrink-0 text-xs">
                {o.isCorrect ? 'Benar' : 'Salah'}
              </Badge>
            </div>
          ))}
        </div>
      ) : options.length > 0 ? (
        <div className="mt-2 grid gap-1 sm:grid-cols-2">
          {options.map((o, i) => (
            <div
              key={o.id}
              className={`flex items-center gap-2 rounded border px-2 py-1 text-sm ${
                o.isCorrect ? 'border-success-300 bg-success-50' : 'border-transparent bg-muted/50'
              }`}
            >
              <span className="shrink-0 font-medium">{String.fromCharCode(65 + i)}.</span>
              <span className="flex-1 min-w-0">
                {o.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={resolveAssetUrl(o.imageUrl)} alt="" className="max-w-full mb-1 max-h-16 w-auto rounded border object-contain" />
                )}
                <MathContent text={o.content} />
              </span>
              {o.isCorrect && <Badge className="shrink-0 text-[10px]">Kunci</Badge>}
            </div>
          ))}
        </div>
      ) : null}

      {q.type === 'SHORT_ANSWER' && q.answerKey && (
        <p className="mt-2 text-xs text-muted-foreground">
          Kunci: <span className="font-medium text-foreground">{q.answerKey}</span>
        </p>
      )}
      {q.type === 'ESSAY' && (
        <p className="mt-2 text-xs text-muted-foreground">Esai — dinilai manual.</p>
      )}
    </div>
  );
}

/**
 * Pemilih soal — daftar terpilih tampil penuh (soal + opsi + kunci) dengan
 * pagination; "Tambah Soal" membuka modal pencarian multi-select (soal yang
 * sudah dipilih tidak muncul lagi di modal).
 */
export function QuestionPicker({
  filters,
  onFiltersChange,
  selectedIds,
  onToggle,
  onAdd,
}: {
  filters: QuestionPickerFilters;
  onFiltersChange: (filters: QuestionPickerFilters) => void;
  selectedIds: string[];
  onToggle: (questionId: string) => void;
  /** Dipanggil sekali dengan semua id yang dipilih di modal (default: onToggle per id). */
  onAdd?: (questionIds: string[]) => void;
}) {
  const router = useRouter();
  const [questionSearch, setQuestionSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [toAdd, setToAdd] = useState<string[]>([]);
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(0);
  // Jalur edit soal mengikuti role.
  const pathname = usePathname();
  const editBase = pathname?.startsWith('/tutor') ? '/tutor/soal' : '/admin-academic/soal';

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

  // Cache item yang pernah tampil — soal terpilih tetap tampil walau filter
  // modal menyembunyikan daftarnya.
  const knownRef = useRef(new Map<string, QuestionSelectItem>());
  for (const q of questionsQ.data ?? []) knownRef.current.set(q.id, q);
  for (const q of selectedDetailQ.data ?? []) knownRef.current.set(q.id, q);
  const selectedItems = selectedIds
    .map((id) => knownRef.current.get(id))
    .filter((q): q is QuestionSelectItem => !!q);

  // Pagination daftar terpilih.
  useEffect(() => setPage(0), [selectedIds.length, pageSize]);
  const totalPages = pageSize > 0 ? Math.ceil(selectedItems.length / pageSize) : 1;
  const shownSelected =
    pageSize > 0
      ? selectedItems.slice(page * pageSize, (page + 1) * pageSize)
      : selectedItems;

  // Kandidat di modal = semua soal hasil filter KECUALI yang sudah dipilih.
  const candidates = (questionsQ.data ?? []).filter(
    (q) => !selectedIds.includes(q.id),
  );

  const toggleToAdd = (id: string) =>
    setToAdd((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const commitAdd = () => {
    if (!toAdd.length) return;
    if (onAdd) onAdd(toAdd);
    else toAdd.forEach((id) => onToggle(id));
    setToAdd([]);
    setAddOpen(false);
  };

  const cats = catsQ.data ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Label>Soal Ujian ({selectedIds.length})</Label>
        <Button type="button" size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="mr-1 size-4" /> Tambah Soal
        </Button>
      </div>

      {selectedIds.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
          Belum ada soal — tekan <b>Tambah Soal</b> untuk memilih dari bank soal.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{selectedItems.length} soal ditampilkan</span>
            <select
              className="h-8 rounded-md border border-input bg-background px-2"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
            >
              <option value={5}>5 / halaman</option>
              <option value={10}>10 / halaman</option>
              <option value={20}>20 / halaman</option>
              <option value={0}>Semua</option>
            </select>
          </div>
          {shownSelected.map((q, i) => (
            <SelectedQuestionCard
              key={q.id}
              no={(pageSize > 0 ? page * pageSize : 0) + i + 1}
              q={q}
              cats={cats}
              onEdit={() => router.push(`${editBase}/${q.id}/edit`)}
              onRemove={() => onToggle(q.id)}
            />
          ))}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 text-sm">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 0}
                onClick={() => setPage((p) => p - 1)}
              >
                ←
              </Button>
              <span className="text-xs text-muted-foreground">
                {page + 1} / {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                →
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Modal tambah soal — filter + cari + multi-select; soal yang sudah
          dipilih tidak ditampilkan lagi. */}
      <Dialog
        open={addOpen}
        onOpenChange={(o) => {
          setAddOpen(o);
          if (!o) setToAdd([]);
        }}
      >
        <DialogContent className="max-h-[92svh] w-[95vw] max-w-5xl overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Tambah Soal dari Bank Soal</DialogTitle>
          </DialogHeader>
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
                options={categoryOptions(cats)}
                placeholder="Semua tipe"
              />
            </div>

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
            <div className="max-h-[45svh] overflow-y-auto border rounded-md p-2">
              {candidates.map((q) => (
                <div key={q.id} className="flex items-start gap-2 p-2 hover:bg-muted/50">
                  <Checkbox
                    checked={toAdd.includes(q.id)}
                    onCheckedChange={() => toggleToAdd(q.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <label className="text-sm font-medium cursor-pointer block" onClick={() => toggleToAdd(q.id)}>
                      {plainPreview(q.content, 120)}
                    </label>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {q.subject && <Badge variant="default" className="text-xs">{q.subject.name}</Badge>}
                      {q.category && <Badge variant="secondary" className="text-xs">{categoryLabel(q.category, cats)}</Badge>}
                      <Badge variant="outline" className="text-xs">{TYPE_LABELS[q.type] ?? q.type}</Badge>
                      {q.difficulty && <Badge variant="secondary" className="text-xs">{q.difficulty}</Badge>}
                      {q.points != null && <Badge variant="outline" className="text-xs">{q.points} poin</Badge>}
                    </div>
                  </div>
                </div>
              ))}
              {candidates.length === 0 && !questionsQ.isLoading && (
                <p className="text-sm text-muted-foreground p-2">
                  {selectedIds.length
                    ? 'Semua soal pada hasil filter ini sudah dipilih / tidak ada soal lain yang cocok.'
                    : 'Tidak ada soal yang cocok.'}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 border-t pt-3">
              <span className="text-sm text-muted-foreground">
                {toAdd.length} soal dipilih untuk ditambahkan
              </span>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                  Batal
                </Button>
                <Button type="button" disabled={!toAdd.length} onClick={commitAdd}>
                  Tambahkan {toAdd.length ? `(${toAdd.length})` : ''}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
