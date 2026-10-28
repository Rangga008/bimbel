'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, FileUp, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  QuestionPicker,
  QuestionPickerFilters,
  emptyQuestionPickerFilters,
} from '@/components/shared/question-picker';
import { QuickQuestionCreate } from '@/components/shared/quick-question-create';
import { QuestionImportDialog } from '@/components/phase3a/question-import-dialog';
import { Phase1aSelectField } from '@/components/phase1a/phase1a-form-dialog';
import { categoryOptions } from '@/lib/content-taxonomy';
import { useContentCategories } from '@/components/shared/content-drilldown';

/** Satu subtes di form — nama, mapel opsional, dan soalnya sendiri.
 *  Berbeda dari ujian: latsol tidak punya durasi/jadwal. */
export interface LatsolSubtesForm {
  name: string;
  subjectId: string;
  pickerFilters: QuestionPickerFilters;
  questionIds: string[];
}

export function emptyLatsolSubtes(
  base?: Partial<QuestionPickerFilters>,
): LatsolSubtesForm {
  return {
    name: '',
    subjectId: '',
    pickerFilters: { ...emptyQuestionPickerFilters, ...(base ?? {}) },
    questionIds: [],
  };
}

export interface LatsolPackageFormState {
  /** Tingkat sekolah (SD/SMP/…) — filter UI picker, tidak dikirim ke API. */
  tingkat: string;
  programId: string;
  levelId: string;
  subjectId: string;
  category: string;
  title: string;
  description: string;
  /** Mode biasa — soal langsung milik paket. */
  questionIds: string[];
  /** Mode multi-subtes — bila terisi, `questionIds` diabaikan. */
  subtes: LatsolSubtesForm[];
  /** Filter pemilih soal mode biasa — tidak dikirim ke API. */
  pickerFilters: QuestionPickerFilters;
}

export function emptyLatsolPackageForm(): LatsolPackageFormState {
  return {
    tingkat: '',
    programId: '',
    levelId: '',
    subjectId: '',
    category: '',
    title: '',
    description: '',
    questionIds: [],
    subtes: [],
    pickerFilters: { ...emptyQuestionPickerFilters },
  };
}

/** Total soal terpilih — gabungan semua subtes bila mode subtes. */
export function latsolQuestionCount(form: LatsolPackageFormState): number {
  return form.subtes.length
    ? form.subtes.reduce((n, s) => n + s.questionIds.length, 0)
    : form.questionIds.length;
}

/**
 * Form Buat/Edit Paket Latsol — meniru ExamForm:
 * - `withQuestions=false` (halaman Buat/Detail) → hanya pengaturan paket.
 * - `questionsOnly=true` (halaman Kelola Soal) → hanya alat soal
 *   (subtes chips + picker + buat baru + import).
 */
export function LatsolPackageForm({
  form,
  onChange,
  withQuestions = true,
  questionsOnly = false,
}: {
  form: LatsolPackageFormState;
  onChange: (form: LatsolPackageFormState) => void;
  withQuestions?: boolean;
  questionsOnly?: boolean;
}) {
  const catsQ = useContentCategories();
  // 'main' = daftar soal utama, angka = indeks subtes.
  const [importTarget, setImportTarget] = useState<'main' | number | null>(null);
  const [activeSubtes, setActiveSubtes] = useState(0);
  const subtesMode = form.subtes.length > 0;

  const toggleQuestion = (questionId: string) => {
    onChange({
      ...form,
      questionIds: form.questionIds.includes(questionId)
        ? form.questionIds.filter((id) => id !== questionId)
        : [...form.questionIds, questionId],
    });
  };

  const updateSubtes = (idx: number, patch: Partial<LatsolSubtesForm>) =>
    onChange({
      ...form,
      subtes: form.subtes.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    });

  /** Ubah jadi multi-subtes: semua soal yang sudah dipilih pindah ke subtes 1. */
  const convertToSubtes = () =>
    onChange({
      ...form,
      questionIds: [],
      subtes: [
        {
          ...emptyLatsolSubtes(form.pickerFilters),
          name: 'Bagian 1',
          questionIds: form.questionIds,
        },
      ],
    });

  const addSubtes = () => {
    // Mode flat masih punya soal → pindahkan semua ke subtes pertama.
    if (!form.subtes.length && form.questionIds.length) {
      convertToSubtes();
      return;
    }
    onChange({
      ...form,
      subtes: [
        ...form.subtes,
        {
          ...emptyLatsolSubtes(form.pickerFilters),
          name: `Bagian ${form.subtes.length + 1}`,
        },
      ],
    });
  };

  const removeSubtes = (idx: number) => {
    const next = form.subtes.filter((_, i) => i !== idx);
    onChange({
      ...form,
      subtes: next,
      // Subtes terakhir dihapus → soalnya kembali ke daftar utama.
      questionIds: next.length
        ? form.questionIds
        : form.subtes.flatMap((s) => s.questionIds),
    });
    setActiveSubtes(0);
  };

  const mergeImported = (ids: string[]) => {
    if (typeof importTarget === 'number') {
      const s = form.subtes[importTarget];
      updateSubtes(importTarget, {
        questionIds: [...new Set([...s.questionIds, ...ids])],
      });
    } else {
      onChange({
        ...form,
        questionIds: [...new Set([...form.questionIds, ...ids])],
      });
    }
    setImportTarget(null);
  };

  // Blok alat soal per subtes — picker + buat baru + import.
  const subtesQuestionTools = (idx: number, s: LatsolSubtesForm) => (
    <>
      <QuestionPicker
        filters={{ ...s.pickerFilters, category: form.category }}
        onFiltersChange={(pickerFilters) => updateSubtes(idx, { pickerFilters })}
        selectedIds={s.questionIds}
        onToggle={(qid) =>
          updateSubtes(idx, {
            questionIds: s.questionIds.includes(qid)
              ? s.questionIds.filter((id) => id !== qid)
              : [...s.questionIds, qid],
          })
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <QuickQuestionCreate
          seed={{
            tingkat: s.pickerFilters.tingkat,
            programId: s.pickerFilters.programId,
            levelId: s.pickerFilters.levelId,
            subjectId: s.pickerFilters.subjectId || s.subjectId || undefined,
            category: form.category,
          }}
          onCreated={(qid) =>
            updateSubtes(idx, { questionIds: [...s.questionIds, qid] })
          }
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setImportTarget(idx)}
        >
          <FileUp className="mr-1 h-4 w-4" /> Import Soal (Word/Excel)
        </Button>
      </div>
    </>
  );

  // Blok alat soal mode biasa (tanpa subtes).
  const mainQuestionTools = (
    <>
      <QuestionPicker
        filters={{ ...form.pickerFilters, category: form.category }}
        onFiltersChange={(pickerFilters) =>
          onChange({ ...form, pickerFilters, category: pickerFilters.category })
        }
        selectedIds={form.questionIds}
        onToggle={toggleQuestion}
      />
      <div className="flex flex-wrap items-center gap-2">
        <QuickQuestionCreate
          seed={{
            tingkat: form.pickerFilters.tingkat,
            programId: form.pickerFilters.programId,
            levelId: form.pickerFilters.levelId,
            subjectId: form.pickerFilters.subjectId || form.subjectId || undefined,
            category: form.category,
          }}
          onCreated={(qid) =>
            onChange({ ...form, questionIds: [...form.questionIds, qid] })
          }
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setImportTarget('main')}
        >
          <FileUp className="mr-1 h-4 w-4" /> Import Soal (Word/Excel)
        </Button>
      </div>
    </>
  );

  const importSeed =
    typeof importTarget === 'number'
      ? form.subtes[importTarget]?.pickerFilters
      : form.pickerFilters;

  const importDialog = (
    <QuestionImportDialog
      open={importTarget !== null}
      onOpenChange={(o) => {
        if (!o) setImportTarget(null);
      }}
      initial={
        importSeed
          ? {
              tingkat: importSeed.tingkat,
              levelId: importSeed.levelId,
              subjectId:
                typeof importTarget === 'number'
                  ? form.subtes[importTarget]?.subjectId ||
                    importSeed.subjectId
                  : importSeed.subjectId || form.subjectId || undefined,
              category: form.category,
            }
          : undefined
      }
      onImported={mergeImported}
    />
  );

  const questionSection = (
    <>
      {subtesMode ? (
        (() => {
          const idx = Math.min(activeSubtes, form.subtes.length - 1);
          const s = form.subtes[idx];
          return (
            <>
              {/* Navigasi antar-subtes: panah + chip (klik untuk lompat).
                  Chip menunjukkan jumlah soal yang sudah dipilih. */}
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={idx <= 0}
                  onClick={() => setActiveSubtes(idx - 1)}
                  aria-label="Subtes sebelumnya"
                >
                  <ChevronLeft />
                </Button>
                <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
                  {form.subtes.map((st, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setActiveSubtes(i)}
                      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        i === idx
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'bg-muted/40 hover:bg-muted'
                      }`}
                    >
                      {i + 1}. {st.name || '(tanpa nama)'}
                      <span
                        className={`rounded-full px-1.5 text-[10px] ${
                          st.questionIds.length > 0
                            ? i === idx
                              ? 'bg-primary-foreground/20'
                              : 'bg-emerald-100 text-emerald-700'
                            : i === idx
                              ? 'bg-primary-foreground/20'
                              : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {st.questionIds.length}
                      </span>
                    </button>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={idx >= form.subtes.length - 1}
                  onClick={() => setActiveSubtes(idx + 1)}
                  aria-label="Subtes berikutnya"
                >
                  <ChevronRight />
                </Button>
              </div>

              <div className="flex flex-col gap-2 rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">
                    Subtes {idx + 1}/{form.subtes.length}:{' '}
                    {s.name || '(tanpa nama)'}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => removeSubtes(idx)}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" /> Hapus Subtes
                  </Button>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`subtes-name-${idx}`}>Nama subtes</Label>
                  <Input
                    id={`subtes-name-${idx}`}
                    value={s.name}
                    onChange={(e) => updateSubtes(idx, { name: e.target.value })}
                    placeholder="Mis. Pengetahuan Umum, TKA Matematika…"
                  />
                </div>
                {subtesQuestionTools(idx, s)}
              </div>
            </>
          );
        })()
      ) : (
        mainQuestionTools
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addSubtes}
        >
          <Plus className="mr-1 h-4 w-4" />
          {subtesMode ? 'Tambah Subtes' : 'Jadikan Multi-Subtes'}
        </Button>
      </div>
      {importDialog}
    </>
  );

  // Mode Kelola Soal — hanya alat soal; pengaturan di halaman Detail.
  if (questionsOnly) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Kelola Soal</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Pilih soal dari bank soal, buat soal baru, atau impor dari
            Word/Excel. Total terpilih: <b>{latsolQuestionCount(form)}</b> soal.
          </p>
          {questionSection}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Detail Paket</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lp-title">Judul Paket *</Label>
          <Input
            id="lp-title"
            value={form.title}
            onChange={(e) => onChange({ ...form, title: e.target.value })}
            placeholder="Contoh: Latihan Matematika Dasar"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="lp-description">Deskripsi (opsional)</Label>
          <Textarea
            id="lp-description"
            className="min-h-[60px]"
            value={form.description}
            onChange={(e) => onChange({ ...form, description: e.target.value })}
            placeholder="Deskripsi paket latihan"
          />
        </div>
        <Phase1aSelectField
          id="lp-category"
          label="Kategori paket *"
          value={form.category}
          onChange={(v) => onChange({ ...form, category: v })}
          options={categoryOptions(catsQ.data)}
          placeholder="Harian/UTS/TO/Bab…"
        />
        {withQuestions ? questionSection : null}
      </CardContent>
    </Card>
  );
}
