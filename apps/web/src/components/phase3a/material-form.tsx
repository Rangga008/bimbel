'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch } from '@/lib/api-client';
import type { GroupItem, ProgramItem, SubjectItem } from '@/lib/phase3a-types';
import { categoryOptions, sortLevels, tingkatCode } from '@/lib/content-taxonomy';
import {
  useContentCategories,
  useContentLevels,
} from '@/components/shared/content-drilldown';
import { Phase1aSelectField } from '@/components/phase1a/phase1a-form-dialog';
import { FilePickerField, ImagePickerField } from '@/components/shared/image-picker-field';

export interface MaterialFormState {
  /** Tingkat sekolah — filter UI jenjang, tidak dikirim ke API. */
  tingkat: string;
  programId: string;
  levelId: string;
  groupId: string;
  subjectId: string;
  category: string;
  title: string;
  description: string;
  content: string;
  imageUrl: string;
  fileUrl: string;
  fileType: string;
  fileSize: string;
  isActive: boolean;
}

export function emptyMaterialForm(): MaterialFormState {
  return {
    tingkat: '',
    programId: '',
    levelId: '',
    groupId: '',
    subjectId: '',
    category: '',
    title: '',
    description: '',
    content: '',
    imageUrl: '',
    fileUrl: '',
    fileType: '',
    fileSize: '',
    isActive: true,
  };
}

/** Form Tambah/Edit Materi — dipakai di halaman terpisah (bukan modal). */
export function MaterialForm({
  form,
  onChange,
  showActive,
}: {
  form: MaterialFormState;
  onChange: (form: MaterialFormState) => void;
  showActive?: boolean;
}) {
  const programsQ = useQuery({
    queryKey: ['programs-lite'],
    queryFn: () => apiFetch<ProgramItem[]>('/programs'),
  });

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
  // Jenjang tanpa gradeLevel (mis. paket Privat) → bucket "Lainnya".
  if (levels.some((l) => !tingkatCode(l))) {
    tingkatOptions.push({ value: 'none', label: 'Lainnya', sort: 9999 });
  }

  const levelOptions = sortLevels(levels)
    .filter((l) => {
      const tk = tingkatCode(l);
      const tingkatOk = !form.tingkat
        || (form.tingkat === 'none' ? !tk : tk === form.tingkat);
      return tingkatOk && (!form.programId || l.program?.id === form.programId);
    })
    .map((l) => ({
      value: l.id,
      label: l.program?.name ? `${l.name} — ${l.program.name}` : l.name,
    }));

  const selectedLevel = levels.find((l) => l.id === form.levelId);
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

  // Cascade: kelompok mengikuti level/program yang dipilih.
  const groupsQ = useQuery({
    queryKey: ['groups-lite', form.programId, form.levelId],
    queryFn: () =>
      apiFetch<GroupItem[]>(
        `/groups${form.levelId ? `?levelId=${form.levelId}` : form.programId ? `?programId=${form.programId}` : ''}`,
      ),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Detail Materi</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Phase1aSelectField
            id="mat-form-tingkat"
            label="Tingkat"
            value={form.tingkat}
            onChange={(v) => onChange({ ...form, tingkat: v, levelId: '', groupId: '', subjectId: '' })}
            options={tingkatOptions}
            placeholder="SD/SMP/SMA…"
          />
          <Phase1aSelectField
            id="mat-form-level"
            label="Jenjang"
            value={form.levelId}
            onChange={(v) => {
              const lvl = levels.find((l) => l.id === v);
              onChange({ ...form, levelId: v, groupId: '', subjectId: '', programId: lvl?.program?.id ?? form.programId });
            }}
            options={levelOptions}
          />
          <Phase1aSelectField
            id="mat-form-subject"
            label="Mapel"
            value={form.subjectId}
            onChange={(v) => onChange({ ...form, subjectId: v })}
            options={subjectOptions}
          />
          <Phase1aSelectField
            id="mat-form-category"
            label="Tipe"
            value={form.category}
            onChange={(v) => onChange({ ...form, category: v })}
            options={categoryOptions(catsQ.data)}
            placeholder="Harian/UTS/TO/Bab…"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Phase1aSelectField
            id="mat-form-program"
            label="Program (opsional)"
            value={form.programId}
            onChange={(v) => onChange({ ...form, programId: v })}
            options={programsQ.data?.map((p) => ({ value: p.id, label: p.name })) || []}
          />
          <Phase1aSelectField
            id="mat-form-group"
            label="Kelompok (opsional)"
            value={form.groupId}
            onChange={(v) => onChange({ ...form, groupId: v })}
            options={groupsQ.data?.map((g) => ({ value: g.id, label: g.name })) || []}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Tingkat → jenjang → mapel → tipe wajib diisi; kelompok/program opsional untuk mempersempit.
        </p>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mat-title">Judul *</Label>
          <Input
            id="mat-title"
            value={form.title}
            onChange={(e) => onChange({ ...form, title: e.target.value })}
            placeholder="Judul materi"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mat-desc">Deskripsi singkat (opsional)</Label>
          <Input
            id="mat-desc"
            value={form.description}
            onChange={(e) => onChange({ ...form, description: e.target.value })}
            placeholder="Ringkasan materi"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mat-content">Isi Materi (opsional)</Label>
          <Textarea
            id="mat-content"
            value={form.content}
            onChange={(e) => onChange({ ...form, content: e.target.value })}
            placeholder="Tulis isi materi di sini — penjelasan, rumus, contoh soal, dsb."
            rows={6}
          />
        </div>
        <ImagePickerField
          id="mat-image"
          label="Gambar Pendukung (opsional)"
          value={form.imageUrl}
          onChange={(url) => onChange({ ...form, imageUrl: url })}
          hint="Untuk contoh soal, diagram, atau ilustrasi materi."
        />
        <FilePickerField
          id="mat-url"
          label="File Materi (PDF/Word, opsional)"
          value={form.fileUrl}
          onChange={(url, meta) =>
            onChange({
              ...form,
              fileUrl: url,
              // Metadata terisi otomatis dari pustaka/upload.
              ...(meta
                ? { fileType: meta.mime, fileSize: String(meta.size) }
                : {}),
            })
          }
          hint="Upload PDF/Word ke pustaka, pilih dari pustaka, atau tempel link eksternal."
        />

        {showActive && (
          <div className="flex items-center gap-2">
            <input
              id="mat-active"
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => onChange({ ...form, isActive: e.target.checked })}
              className="h-4 w-4"
            />
            <Label htmlFor="mat-active">Aktif — materi non-aktif tidak tampil ke siswa</Label>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
