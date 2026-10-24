'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { FileUp, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ExamStatus } from '@/lib/phase3c-types';
import {
  QuestionPicker,
  QuestionPickerFilters,
  emptyQuestionPickerFilters,
} from '@/components/shared/question-picker';
import { Phase1aSelectField } from '@/components/phase1a/phase1a-form-dialog';
import { categoryOptions } from '@/lib/content-taxonomy';
import { useContentCategories } from '@/components/shared/content-drilldown';
import { apiFetch, ApiError } from '@/lib/api-client';
import type { GroupListItem } from '@/lib/phase1b-types';
import type { ProgramItem, QuestionRow } from '@/lib/phase3a-types';
import {
  QuestionFormCard,
  emptyQuestionDraft,
  type QuestionDraft,
} from '@/components/phase3a/question-form-card';
import { QuestionImportDialog } from '@/components/phase3a/question-import-dialog';

/** Satu subtes di form — nama, durasi sendiri, mapel, dan soalnya sendiri. */
export interface ExamSubtesForm {
  name: string;
  durationMinutes: string;
  subjectId: string;
  pickerFilters: QuestionPickerFilters;
  questionIds: string[];
}

export function emptySubtes(base?: Partial<QuestionPickerFilters>): ExamSubtesForm {
  return {
    name: '',
    durationMinutes: '',
    subjectId: '',
    pickerFilters: { ...emptyQuestionPickerFilters, ...(base ?? {}) },
    questionIds: [],
  };
}

export interface ExamFormState {
  category: string;
  title: string;
  description: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  durationMinutes?: number;
  /** Proteksi fullscreen+kunci saat siswa keluar (default aktif). */
  proctoringEnabled: boolean;
  /** true = siswa langsung melihat nilai+kunci setelah submit. */
  showResultImmediately: boolean;
  /** true = ujian tampil di halaman publik /tryout (peserta luar). */
  isPublic: boolean;
  notes: string;
  /** Mode biasa — soal langsung milik ujian. */
  questionIds: string[];
  /** Mode multi-subtes (Try Out/UTBK) — bila terisi, `questionIds` diabaikan. */
  subtes: ExamSubtesForm[];
  /** Kelompok target — kosong = terbuka untuk semua siswa yang sesuai scope. */
  groupIds: string[];
  status?: ExamStatus;
  /** Filter pemilih soal mode biasa — tidak dikirim ke API. */
  pickerFilters: QuestionPickerFilters;
}

export function emptyExamForm(): ExamFormState {
  return {
    category: '',
    title: '',
    description: '',
    scheduledStartAt: '',
    scheduledEndAt: '',
    durationMinutes: undefined,
    proctoringEnabled: true,
    showResultImmediately: false,
    isPublic: false,
    notes: '',
    questionIds: [],
    subtes: [],
    groupIds: [],
    pickerFilters: { ...emptyQuestionPickerFilters },
  };
}

/** Total soal terpilih — gabungan semua subtes bila mode subtes. */
export function examQuestionCount(form: ExamFormState): number {
  return form.subtes.length
    ? form.subtes.reduce((n, s) => n + s.questionIds.length, 0)
    : form.questionIds.length;
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

/** Panel lipat "Buat soal baru" — soal tersimpan langsung dipilih ke ujian. */
function QuickQuestionCreate({
  seed,
  onCreated,
}: {
  seed: Partial<QuestionDraft>;
  onCreated: (questionId: string) => void;
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
      toast.success('Soal dibuat dan langsung dipilih ke ujian.');
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

/** Form Buat/Edit Ujian — dipakai di halaman terpisah (bukan modal). */
export function ExamForm({
  form,
  onChange,
  showStatus,
}: {
  form: ExamFormState;
  onChange: (form: ExamFormState) => void;
  showStatus?: boolean;
}) {
  const catsQ = useContentCategories();
  const groupsQ = useQuery({
    queryKey: ['groups'],
    queryFn: () => apiFetch<GroupListItem[]>('/groups'),
  });
  const [allLevelsGroups, setAllLevelsGroups] = useState(false);
  // Dialog import soal — 'main' = ujian biasa, angka = indeks subtes.
  const [importTarget, setImportTarget] = useState<'main' | number | null>(null);

  const groups = (groupsQ.data ?? []).filter(
    (g) =>
      g.isActive &&
      (allLevelsGroups || !form.pickerFilters.levelId || g.levelId === form.pickerFilters.levelId),
  );

  const toggleQuestionSelection = (questionId: string) => {
    onChange({
      ...form,
      questionIds: form.questionIds.includes(questionId)
        ? form.questionIds.filter((id) => id !== questionId)
        : [...form.questionIds, questionId],
    });
  };

  const toggleGroup = (groupId: string) => {
    onChange({
      ...form,
      groupIds: form.groupIds.includes(groupId)
        ? form.groupIds.filter((id) => id !== groupId)
        : [...form.groupIds, groupId],
    });
  };

  const updateSubtes = (idx: number, patch: Partial<ExamSubtesForm>) => {
    onChange({
      ...form,
      subtes: form.subtes.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    });
  };

  const subtesMode = form.subtes.length > 0;

  // Gabung id hasil import ke pilihan target (ujian utama atau subtes).
  const mergeImported = (ids: string[]) => {
    if (importTarget === null || !ids.length) return;
    if (importTarget === 'main') {
      onChange({
        ...form,
        questionIds: [...new Set([...form.questionIds, ...ids])],
      });
    } else {
      const s = form.subtes[importTarget];
      if (s) {
        updateSubtes(importTarget, {
          questionIds: [...new Set([...s.questionIds, ...ids])],
        });
      }
    }
  };

  // Filter taksonomi yang dipakai dialog import = filter picker target.
  const importSeed =
    importTarget === null
      ? null
      : importTarget === 'main'
        ? form.pickerFilters
        : form.subtes[importTarget]?.pickerFilters;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Detail Ujian</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Phase1aSelectField
          id="ex-category"
          label="Kategori ujian *"
          value={form.category}
          onChange={(v) => onChange({ ...form, category: v })}
          options={categoryOptions(catsQ.data)}
          placeholder="Harian/UTS/TO/Bab…"
        />
        <p className="-mt-1 text-xs text-muted-foreground">
          Jenjang &amp; mapel ujian mengikuti filter pemilih soal di bawah —
          daftar soal juga otomatis dibatasi ke tipe yang dipilih.
        </p>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ex-title">Judul Ujian *</Label>
          <Input
            id="ex-title"
            value={form.title}
            onChange={(e) => onChange({ ...form, title: e.target.value })}
            placeholder="Contoh: Ujian Bab 3 — Pecahan"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ex-description">Deskripsi</Label>
          <Textarea
            id="ex-description"
            value={form.description}
            onChange={(e) => onChange({ ...form, description: e.target.value })}
            placeholder="Deskripsi/petunjuk ujian (opsional)"
            rows={3}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ex-start">Waktu Mulai *</Label>
            <Input
              id="ex-start"
              type="datetime-local"
              value={form.scheduledStartAt}
              onChange={(e) => onChange({ ...form, scheduledStartAt: e.target.value })}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ex-end">Waktu Selesai *</Label>
            <Input
              id="ex-end"
              type="datetime-local"
              value={form.scheduledEndAt}
              onChange={(e) => onChange({ ...form, scheduledEndAt: e.target.value })}
              required
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ex-duration">Durasi (menit) — Opsional</Label>
          <Input
            id="ex-duration"
            type="number"
            value={form.durationMinutes || ''}
            placeholder="Mis. 60"
            onChange={(e) =>
              onChange({
                ...form,
                durationMinutes: e.target.value ? parseInt(e.target.value) : undefined,
              })
            }
          />
          {subtesMode && (
            <p className="text-xs text-muted-foreground">
              Mode subtes aktif — durasi per subtes diatur di tiap subtes di bawah;
              kolom ini hanya info total untuk tampilan.
            </p>
          )}
        </div>

        <label
          htmlFor="ex-proctoring"
          className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3"
        >
          <input
            id="ex-proctoring"
            type="checkbox"
            checked={form.proctoringEnabled}
            onChange={(e) => onChange({ ...form, proctoringEnabled: e.target.checked })}
            className="mt-0.5 h-4 w-4 accent-emerald-600"
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">Proteksi ujian (proctoring)</span>
            <span className="text-xs text-muted-foreground">
              Aktif: ujian berjalan fullscreen — siswa yang keluar halaman/aplikasi langsung
              terkunci dan harus dibuka pengawas. Nonaktif: siswa bebas keluar-masuk,
              hanya auto-submit saat waktu habis.
            </span>
          </span>
        </label>

        <label
          htmlFor="ex-showresult"
          className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3"
        >
          <input
            id="ex-showresult"
            type="checkbox"
            checked={form.showResultImmediately}
            onChange={(e) => onChange({ ...form, showResultImmediately: e.target.checked })}
            className="mt-0.5 h-4 w-4 accent-emerald-600"
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">Langsung tampilkan hasil setelah submit</span>
            <span className="text-xs text-muted-foreground">
              Aktif: siswa langsung melihat nilai, kunci, dan pembahasan begitu selesai.
              Nonaktif: hasil baru dirilis setelah waktu ujian berakhir / ujian diakhiri pengawas
              (cocok untuk try out serentak).
            </span>
          </span>
        </label>

        <label
          htmlFor="ex-ispublic"
          className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3"
        >
          <input
            id="ex-ispublic"
            type="checkbox"
            checked={form.isPublic}
            onChange={(e) => onChange({ ...form, isPublic: e.target.checked })}
            className="mt-0.5 h-4 w-4 accent-emerald-600"
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">
              Tampilkan di halaman Try Out publik
            </span>
            <span className="text-xs text-muted-foreground">
              Ujian muncul di halaman /tryout beranda — untuk try out promosi
              yang bisa diikuti peserta luar. Peserta luar daftar akun,
              verifikasi HP, lalu masukkan kode akses ujian.
            </span>
          </span>
        </label>

        {/* Target kelompok — multi-select. Kosong = ujian terbuka sesuai scope. */}
        <div className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <Label>Kelompok Peserta (opsional)</Label>
            {!!form.pickerFilters.levelId && (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={allLevelsGroups}
                  onChange={(e) => setAllLevelsGroups(e.target.checked)}
                  className="h-3.5 w-3.5"
                />
                Semua jenjang
              </label>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Bila dipilih, hanya anggota kelompok ini yang bisa mengerjakan —
            bisa lebih dari satu kelompok (mis. try out lintas kelas).
            Kosongkan untuk membuka ke semua siswa yang sesuai jenjang/mapel.
          </p>
          {groups.length === 0 ? (
            <p className="text-xs text-muted-foreground">Tidak ada kelompok aktif yang cocok.</p>
          ) : (
            <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
              {groups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => toggleGroup(g.id)}
                  className={`rounded-md border px-2 py-1 text-xs ${
                    form.groupIds.includes(g.id)
                      ? 'border-emerald-600 bg-emerald-50 font-medium text-emerald-800'
                      : 'bg-background text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {g.name}
                  {g.level?.name ? ` · ${g.level.name}` : ''}
                  <span className="ml-1 opacity-60">({g._count?.members ?? 0})</span>
                </button>
              ))}
            </div>
          )}
          {form.groupIds.length > 0 && (
            <Badge variant="secondary" className="w-fit">
              {form.groupIds.length} kelompok dipilih
            </Badge>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ex-notes">Catatan</Label>
          <Textarea
            id="ex-notes"
            value={form.notes}
            onChange={(e) => onChange({ ...form, notes: e.target.value })}
            placeholder="Catatan internal (opsional)"
            rows={2}
          />
        </div>
        {showStatus && form.status === 'ENDED' && (
          <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            Ujian sudah berakhir (ENDED) — status tidak bisa diubah, tetapi
            judul, jadwal, dan susunan soal masih bisa diperbarui.
          </p>
        )}
        {showStatus && form.status !== 'ENDED' && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ex-status">Status</Label>
            <select
              id="ex-status"
              value={form.status}
              onChange={(e) => onChange({ ...form, status: e.target.value as ExamStatus })}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="DRAFT">DRAFT</option>
              <option value="PUBLISHED">PUBLISHED</option>
              <option value="LOCKED">LOCKED</option>
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              DRAFT = belum terlihat siswa. PUBLISHED = siswa bisa mengerjakan. LOCKED = dikunci permanen.
              Status Berakhir (ENDED) hanya lewat tombol "Akhiri Ujian" — semua peserta auto-submit.
            </p>
          </div>
        )}

        {/* Mode subtes — Try Out/UTBK: tiap subtes mapel sendiri, durasi
            sendiri, soal sendiri, dikerjakan berurutan oleh siswa. */}
        <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={subtesMode}
              onChange={(e) =>
                onChange({
                  ...form,
                  subtes: e.target.checked
                    ? [emptySubtes({ ...form.pickerFilters, subjectId: '' })]
                    : [],
                })
              }
              className="mt-0.5 h-4 w-4 accent-emerald-600"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">Mode multi-subtes (Try Out / UTBK / TKA)</span>
              <span className="text-xs text-muted-foreground">
                Ujian dibagi beberapa subtes (mis. B. Indonesia → Matematika → IPA).
                Siswa mengerjakan satu per satu dengan durasi masing-masing;
                subtes yang selesai tidak bisa dibuka lagi.
              </span>
            </span>
          </label>

          {subtesMode && (
            <div className="flex flex-col gap-3">
              {form.subtes.map((s, idx) => (
                <div key={idx} className="flex flex-col gap-2 rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">Subtes {idx + 1}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-destructive"
                      onClick={() =>
                        onChange({ ...form, subtes: form.subtes.filter((_, i) => i !== idx) })
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="flex flex-col gap-1.5">
                      <Label>Nama Subtes *</Label>
                      <Input
                        value={s.name}
                        onChange={(e) => updateSubtes(idx, { name: e.target.value })}
                        placeholder="Mis. Bahasa Indonesia"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>Durasi (menit) *</Label>
                      <Input
                        type="number"
                        min={1}
                        value={s.durationMinutes}
                        onChange={(e) => updateSubtes(idx, { durationMinutes: e.target.value })}
                        placeholder="Mis. 20"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>Mapel subtes (opsional)</Label>
                      <SubtesSubjectSelect
                        levelId={form.pickerFilters.levelId}
                        value={s.subjectId}
                        onChange={(subjectId) => updateSubtes(idx, { subjectId })}
                      />
                    </div>
                  </div>
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
                        subjectId: s.pickerFilters.subjectId,
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
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={() =>
                  onChange({
                    ...form,
                    subtes: [
                      ...form.subtes,
                      emptySubtes({ ...form.pickerFilters, subjectId: '' }),
                    ],
                  })
                }
              >
                <Plus className="mr-1 h-4 w-4" /> Tambah Subtes
              </Button>
            </div>
          )}
        </div>

        {!subtesMode && (
          <>
            <QuestionPicker
              // Tipe di picker disinkronkan dengan kategori ujian — soal yang
              // ditawarkan selalu se-tipe dengan ujian yang dibuat.
              filters={{ ...form.pickerFilters, category: form.category }}
              onFiltersChange={(pickerFilters) =>
                onChange({ ...form, pickerFilters, category: pickerFilters.category })
              }
              selectedIds={form.questionIds}
              onToggle={toggleQuestionSelection}
            />
            <div className="flex flex-wrap items-center gap-2">
              <QuickQuestionCreate
                seed={{
                  tingkat: form.pickerFilters.tingkat,
                  programId: form.pickerFilters.programId,
                  levelId: form.pickerFilters.levelId,
                  subjectId: form.pickerFilters.subjectId,
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
        )}

        {/* Import soal langsung ke pilihan — soal duplikat otomatis memakai
            soal yang sudah ada di bank soal. */}
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
                    importTarget === 'main'
                      ? importSeed.subjectId
                      : typeof importTarget === 'number'
                        ? form.subtes[importTarget]?.subjectId || importSeed.subjectId
                        : importSeed.subjectId,
                  category: form.category,
                }
              : undefined
          }
          onImported={mergeImported}
        />
      </CardContent>
    </Card>
  );
}

/** Select mapel untuk subtes — mapel dari jenjang ujian bila sudah dipilih. */
function SubtesSubjectSelect({
  levelId,
  value,
  onChange,
}: {
  levelId: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const levelsQ = useQuery({
    queryKey: ['levels-all'],
    queryFn: () =>
      apiFetch<{ id: string; levelSubjects?: { subject: { id: string; name: string } }[] }[]>(
        '/levels',
      ),
  });
  const subjectsQ = useQuery({
    queryKey: ['subjects'],
    queryFn: () => apiFetch<{ id: string; name: string; code: string }[]>('/master/subjects'),
    enabled: !levelsQ.data?.find((l) => l.id === levelId)?.levelSubjects?.length,
  });
  const lvl = levelsQ.data?.find((l) => l.id === levelId);
  const options = lvl?.levelSubjects?.length
    ? lvl.levelSubjects.map((ls) => ({ value: ls.subject.id, label: ls.subject.name }))
    : (subjectsQ.data ?? []).map((s) => ({ value: s.id, label: s.name }));
  return (
    <select
      className="h-9 rounded-md border border-input bg-background px-3 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Pilih mapel…</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
