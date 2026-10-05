'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ExamStatus } from '@/lib/phase3c-types';
import {
  QuestionPicker,
  QuestionPickerFilters,
  emptyQuestionPickerFilters,
} from '@/components/shared/question-picker';
import { Phase1aSelectField } from '@/components/phase1a/phase1a-form-dialog';
import { categoryOptions } from '@/lib/content-taxonomy';
import { useContentCategories } from '@/components/shared/content-drilldown';

export interface ExamFormState {
  category: string;
  title: string;
  description: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  durationMinutes?: number;
  notes: string;
  questionIds: string[];
  status?: ExamStatus;
  /** Filter pemilih soal — tidak dikirim ke API. */
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
    notes: '',
    questionIds: [],
    pickerFilters: { ...emptyQuestionPickerFilters },
  };
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

  const toggleQuestionSelection = (questionId: string) => {
    onChange({
      ...form,
      questionIds: form.questionIds.includes(questionId)
        ? form.questionIds.filter((id) => id !== questionId)
        : [...form.questionIds, questionId],
    });
  };

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
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ex-description">Deskripsi</Label>
          <Textarea
            id="ex-description"
            value={form.description}
            onChange={(e) => onChange({ ...form, description: e.target.value })}
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
            onChange={(e) =>
              onChange({
                ...form,
                durationMinutes: e.target.value ? parseInt(e.target.value) : undefined,
              })
            }
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ex-notes">Catatan</Label>
          <Textarea
            id="ex-notes"
            value={form.notes}
            onChange={(e) => onChange({ ...form, notes: e.target.value })}
            rows={2}
          />
        </div>
        {showStatus && (
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
      </CardContent>
    </Card>
  );
}
