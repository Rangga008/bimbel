'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ImageIcon, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch } from '@/lib/api-client';
import type { LevelItem, ProgramItem, SubjectItem } from '@/lib/phase3a-types';
import { QUESTION_TYPES, DIFFICULTY_LEVELS } from '@/lib/phase3a-types';
import { categoryOptions, tingkatCode } from '@/lib/content-taxonomy';
import {
  useContentCategories,
  useContentLevels,
} from '@/components/shared/content-drilldown';
import { Phase1aSelectField } from '@/components/phase1a/phase1a-form-dialog';
import { ImagePickerField, MediaLibraryDialog } from '@/components/shared/image-picker-field';

export interface QuestionOptionDraft {
  id?: string;
  content: string;
  imageUrl?: string;
  isCorrect: boolean;
  sortOrder: number;
}

export interface QuestionDraft {
  /** Tingkat sekolah (SD/SMP/…) — filter UI jenjang, tidak dikirim ke API. */
  tingkat: string;
  programId: string;
  levelId: string;
  subjectId: string;
  category: string;
  type: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'SHORT_ANSWER' | 'ESSAY';
  content: string;
  imageUrl: string;
  difficulty: string;
  points: string;
  explanation: string;
  explanationImageUrl: string;
  answerKey: string;
  isActive: boolean;
  options: QuestionOptionDraft[];
}

export function emptyQuestionDraft(): QuestionDraft {
  return {
    tingkat: '',
    programId: '',
    levelId: '',
    subjectId: '',
    category: '',
    type: 'SINGLE_CHOICE',
    content: '',
    imageUrl: '',
    difficulty: '',
    points: '',
    explanation: '',
    explanationImageUrl: '',
    answerKey: '',
    isActive: true,
    options: [],
  };
}

/**
 * Satu kartu form soal — dipakai di halaman "Tambah Soal" (bulk, banyak instance
 * sekaligus) maupun halaman "Edit Soal" (1 instance). Tiap instance punya query
 * Level sendiri berdasarkan Program yang dipilih DI KARTU INI (bukan filter luar).
 */
export function QuestionFormCard({
  index,
  draft,
  onChange,
  onRemove,
  programsData,
  showActive,
}: {
  index: number;
  draft: QuestionDraft;
  onChange: (draft: QuestionDraft) => void;
  onRemove?: () => void;
  programsData: ProgramItem[];
  showActive?: boolean;
}) {
  // Semua jenjang dari master data (membawa gradeLevel + levelSubjects) —
  // difilter lokal per tingkat/program yang dipilih di kartu ini.
  const levelsQ = useContentLevels();
  const catsQ = useContentCategories();
  const levels = levelsQ.data ?? [];

  const tingkatOptions = [...new Set(levels.map((l) => tingkatCode(l)).filter((t): t is string => !!t))]
    .map((t) => ({
      value: t,
      label: t,
      sort: Math.min(...levels.filter((l) => tingkatCode(l) === t).map((l) => l.gradeLevel?.sortOrder ?? 9999)),
    }))
    .sort((a, b) => a.sort - b.sort);

  const levelOptions = levels
    .filter(
      (l) =>
        (!draft.tingkat || tingkatCode(l) === draft.tingkat) &&
        (!draft.programId || l.program?.id === draft.programId),
    )
    .map((l) => ({ value: l.id, label: l.name }));

  // Mapel jenjang terpilih; fallback seluruh master mapel bila belum pilih.
  const selectedLevel = levels.find((l) => l.id === draft.levelId);
  const subjectsQ = useQuery({
    queryKey: ['subjects'],
    queryFn: () => apiFetch<SubjectItem[]>('/master/subjects'),
    enabled: !selectedLevel?.levelSubjects?.length,
  });
  const subjectOptions = selectedLevel?.levelSubjects?.length
    ? selectedLevel.levelSubjects
        .map((ls) => ls.subject)
        .filter((s): s is { id: string; name: string } => !!s)
        .map((s) => ({ value: s.id, label: s.name }))
    : (subjectsQ.data?.map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` })) || []);

  const [optionImageIdx, setOptionImageIdx] = useState<number | null>(null);

  const needsOptions =
    draft.type === 'SINGLE_CHOICE' || draft.type === 'MULTIPLE_CHOICE' || draft.type === 'TRUE_FALSE';
  // Pilihan tunggal: tepat 1 jawaban benar (radio). Majemuk: >=1 (checkbox).
  const singleCorrect = draft.type === 'SINGLE_CHOICE' || draft.type === 'TRUE_FALSE';

  const TYPE_HINTS: Record<QuestionDraft['type'], string> = {
    SINGLE_CHOICE: 'Pilihan ganda dengan TEPAT 1 jawaban benar (radio).',
    MULTIPLE_CHOICE: 'Pilihan ganda majemuk — boleh lebih dari 1 jawaban benar (centang semua yang benar).',
    TRUE_FALSE: 'Benar/Salah — 2 opsi otomatis, tandai mana yang benar.',
    SHORT_ANSWER: 'Isian singkat — tanpa opsi; isi kunci jawaban untuk auto-grading.',
    ESSAY: 'Esai/uraian — tanpa opsi, dinilai manual.',
  };

  const setSingleCorrect = (idx: number) => {
    onChange({
      ...draft,
      options: draft.options.map((o, i) => ({ ...o, isCorrect: i === idx })),
    });
  };

  const addOption = () => {
    onChange({
      ...draft,
      options: [...draft.options, { content: '', isCorrect: false, sortOrder: draft.options.length }],
    });
  };

  const updateOption = (idx: number, field: 'content' | 'isCorrect' | 'imageUrl', value: string | boolean) => {
    const newOptions = [...draft.options];
    newOptions[idx] = { ...newOptions[idx], [field]: value };
    onChange({ ...draft, options: newOptions });
  };

  const removeOption = (idx: number) => {
    onChange({
      ...draft,
      options: draft.options.filter((_, i) => i !== idx).map((opt, i) => ({ ...opt, sortOrder: i })),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span>Soal {index + 1}</span>
          {onRemove && (
            <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={onRemove}>
              Hapus Kartu
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>Tipe Soal *</Label>
          <select
            className="h-9 rounded-md border border-input bg-background px-3"
            value={draft.type}
            onChange={(e) => {
              const type = e.target.value as QuestionDraft['type'];
              let options =
                type === 'TRUE_FALSE'
                  ? [
                      { content: 'Benar', isCorrect: false, sortOrder: 0 },
                      { content: 'Salah', isCorrect: false, sortOrder: 1 },
                    ]
                  : draft.options;
              // Pindah ke tipe pilihan tunggal → sisakan maks 1 jawaban benar.
              if (type === 'SINGLE_CHOICE' || type === 'TRUE_FALSE') {
                let seen = false;
                options = options.map((o) => {
                  if (o.isCorrect && seen) return { ...o, isCorrect: false };
                  if (o.isCorrect) seen = true;
                  return o;
                });
              }
              // Tipe tanpa opsi → buang opsi.
              if (type === 'SHORT_ANSWER' || type === 'ESSAY') options = [];
              onChange({ ...draft, type, options });
            }}
            required
          >
            {QUESTION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">{TYPE_HINTS[draft.type]}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Phase1aSelectField
            id={`q-${index}-tingkat`}
            label="Tingkat"
            value={draft.tingkat}
            onChange={(v) =>
              onChange({ ...draft, tingkat: v, levelId: '', subjectId: '' })
            }
            options={tingkatOptions}
            placeholder="SD/SMP/SMA…"
          />
          <Phase1aSelectField
            id={`q-${index}-level`}
            label="Jenjang"
            value={draft.levelId}
            onChange={(v) => {
              const lvl = levels.find((l) => l.id === v);
              onChange({
                ...draft,
                levelId: v,
                subjectId: '',
                programId: lvl?.program?.id ?? draft.programId,
              });
            }}
            options={levelOptions}
          />
          <Phase1aSelectField
            id={`q-${index}-subject`}
            label="Mapel"
            value={draft.subjectId}
            onChange={(v) => onChange({ ...draft, subjectId: v })}
            options={subjectOptions}
          />
          <Phase1aSelectField
            id={`q-${index}-category`}
            label="Tipe"
            value={draft.category}
            onChange={(v) => onChange({ ...draft, category: v })}
            options={categoryOptions(catsQ.data)}
            placeholder="Harian/UTS/TO/Bab…"
          />
          <Phase1aSelectField
            id={`q-${index}-program`}
            label="Program (opsional)"
            value={draft.programId}
            onChange={(v) => onChange({ ...draft, programId: v })}
            options={programsData.map((p) => ({ value: p.id, label: p.name }))}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Konten Soal * (mendukung KaTeX: $...$)</Label>
          <Textarea
            className="min-h-[100px]"
            value={draft.content}
            onChange={(e) => onChange({ ...draft, content: e.target.value })}
            placeholder="Konten soal. Gunakan $...$ untuk rumus matematika."
            required
          />
        </div>

        <ImagePickerField
          id="q-image"
          label="Gambar Soal (opsional)"
          value={draft.imageUrl}
          onChange={(url) => onChange({ ...draft, imageUrl: url })}
          hint="Upload file baru, pilih dari pustaka, atau tempel link eksternal."
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Tingkat Kesulitan (opsional)</Label>
            <select
              className="h-9 rounded-md border border-input bg-background px-3"
              value={draft.difficulty}
              onChange={(e) => onChange({ ...draft, difficulty: e.target.value })}
            >
              <option value="">Pilih tingkat</option>
              {DIFFICULTY_LEVELS.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Poin (opsional)</Label>
            <input
              type="number"
              min={1}
              className="h-9 rounded-md border border-input bg-background px-3"
              value={draft.points}
              onChange={(e) => onChange({ ...draft, points: e.target.value })}
              placeholder="Poin soal (default 1)"
            />
          </div>
        </div>

        {needsOptions && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>Opsi Jawaban * ({singleCorrect ? 'pilih 1 yang benar' : 'centang semua yang benar'})</Label>
              <Button type="button" size="sm" variant="outline" onClick={addOption}>+ Tambah Opsi</Button>
            </div>
            {draft.options.map((opt, idx) => (
              <div key={idx} className="flex items-start gap-2">
                {singleCorrect ? (
                  <input
                    type="radio"
                    name={`q-${index}-correct`}
                    checked={opt.isCorrect}
                    onChange={() => setSingleCorrect(idx)}
                    className="mt-3 h-4 w-4 shrink-0"
                    title="Jawaban benar"
                  />
                ) : (
                  <input
                    type="checkbox"
                    checked={opt.isCorrect}
                    onChange={(e) => updateOption(idx, 'isCorrect', e.target.checked)}
                    className="mt-3 h-4 w-4 shrink-0"
                    title="Jawaban benar"
                  />
                )}
                <div className="flex flex-1 flex-col gap-1.5">
                  <input
                    className="h-9 rounded-md border border-input bg-background px-3"
                    value={opt.content}
                    onChange={(e) => updateOption(idx, 'content', e.target.value)}
                    placeholder={opt.imageUrl ? `Opsi ${idx + 1} (teks opsional jika ada gambar)` : `Opsi ${idx + 1}`}
                  />
                  {opt.imageUrl && (
                    <div className="relative inline-flex items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={opt.imageUrl}
                        alt={`Gambar opsi ${idx + 1}`}
                        className="h-16 max-w-[200px] rounded border object-contain"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-destructive"
                        onClick={() => updateOption(idx, 'imageUrl', '')}
                        title="Hapus gambar opsi"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setOptionImageIdx(idx)}
                  title="Tambah/ganti gambar opsi"
                >
                  <ImageIcon className="h-4 w-4" />
                </Button>
                <Button type="button" size="sm" variant="destructive" onClick={() => removeOption(idx)}>×</Button>
              </div>
            ))}
            {draft.options.length === 0 && (
              <p className="text-xs text-muted-foreground">Belum ada opsi. Tambah minimal 1 opsi.</p>
            )}
            <MediaLibraryDialog
              open={optionImageIdx !== null}
              onOpenChange={(open) => !open && setOptionImageIdx(null)}
              onPick={(url) => {
                if (optionImageIdx !== null) updateOption(optionImageIdx, 'imageUrl', url);
                setOptionImageIdx(null);
              }}
            />
          </div>
        )}

        {draft.type === 'SHORT_ANSWER' && (
          <div className="flex flex-col gap-1.5">
            <Label>Kunci Jawaban Isian Singkat (opsional, untuk auto-grading)</Label>
            <input
              className="h-9 rounded-md border border-input bg-background px-3"
              value={draft.answerKey}
              onChange={(e) => onChange({ ...draft, answerKey: e.target.value })}
              placeholder="Jawaban yang dianggap benar (cocok tanpa memperhatikan huruf besar/kecil)"
            />
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label>Solusi / Pembahasan (opsional, mendukung KaTeX)</Label>
          <Textarea
            className="min-h-[80px]"
            value={draft.explanation}
            onChange={(e) => onChange({ ...draft, explanation: e.target.value })}
            placeholder="Solusi/pembahasan soal — akan ditampilkan di Latsol (feedback instan) dan sesi Pembahasan ujian setelah hasil dirilis."
          />
        </div>

        <ImagePickerField
          id={`q-${index}-explanation-image`}
          label="Gambar Solusi (opsional)"
          value={draft.explanationImageUrl}
          onChange={(url) => onChange({ ...draft, explanationImageUrl: url })}
          hint="Mis. foto langkah pengerjaan atau bentuk umum rumus."
        />

        {showActive && (
          <div className="flex items-center gap-2">
            <input
              id={`q-${index}-active`}
              type="checkbox"
              checked={draft.isActive}
              onChange={(e) => onChange({ ...draft, isActive: e.target.checked })}
              className="h-4 w-4"
            />
            <Label htmlFor={`q-${index}-active`}>
              Aktif — soal non-aktif tidak bisa dipilih ke paket latsol/ujian baru
            </Label>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
