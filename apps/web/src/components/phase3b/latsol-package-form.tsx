'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { QuestionPicker } from '@/components/shared/question-picker';
import { Phase1aSelectField } from '@/components/phase1a/phase1a-form-dialog';
import { categoryOptions } from '@/lib/content-taxonomy';
import { useContentCategories } from '@/components/shared/content-drilldown';

export interface LatsolPackageFormState {
  programId: string;
  levelId: string;
  subjectId: string;
  category: string;
  title: string;
  description: string;
  questionIds: string[];
}

export function emptyLatsolPackageForm(): LatsolPackageFormState {
  return { programId: '', levelId: '', subjectId: '', category: '', title: '', description: '', questionIds: [] };
}

/** Form Buat/Edit Paket Latsol — dipakai di halaman terpisah (bukan modal). */
export function LatsolPackageForm({
  form,
  onChange,
}: {
  form: LatsolPackageFormState;
  onChange: (form: LatsolPackageFormState) => void;
}) {
  const catsQ = useContentCategories();

  const toggleQuestion = (questionId: string) => {
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
        <QuestionPicker
          // Tipe di picker disinkronkan dengan kategori paket.
          filters={{ subjectId: form.subjectId, programId: form.programId, levelId: form.levelId, tingkat: '', category: form.category }}
          onFiltersChange={(f) => onChange({ ...form, subjectId: f.subjectId, programId: f.programId, levelId: f.levelId, category: f.category })}
          selectedIds={form.questionIds}
          onToggle={toggleQuestion}
        />
      </CardContent>
    </Card>
  );
}
