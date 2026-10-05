'use client';

import { useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CircleCheck,
  Download,
  FileSpreadsheet,
  FileText,
  FileUp,
  LoaderCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { apiFetch, apiFetchBlob, ApiError } from '@/lib/api-client';
import {
  useContentCategories,
  useContentLevels,
} from '@/components/shared/content-drilldown';
import { Phase1aSelectField } from '@/components/phase1a/phase1a-form-dialog';
import { categoryOptions, sortLevels, tingkatCode } from '@/lib/content-taxonomy';
import { QUESTION_TYPES } from '@/lib/phase3a-types';

interface ImportRowResult {
  no: number;
  content: string;
  type?: string;
  ok: boolean;
  errors: string[];
}

interface ImportResult {
  parsed: number;
  created: number;
  dryRun: boolean;
  rows: ImportRowResult[];
}

function errMsg(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}

/**
 * Wizard import soal Word (.docx) / Excel (.xlsx):
 * 1) pilih file, 2) pilih tujuan Tingkat → Jenjang → Mapel → Tipe,
 * 3) preview hasil parse (dryRun), 4) simpan.
 */
export function QuestionImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [tingkat, setTingkat] = useState('');
  const [levelId, setLevelId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [category, setCategory] = useState('');
  const [preview, setPreview] = useState<ImportResult | null>(null);

  const levelsQ = useContentLevels();
  const catsQ = useContentCategories();
  const levels = levelsQ.data ?? [];

  const tingkats = useMemo(() => {
    const opts = [
      ...new Set(levels.map((l) => tingkatCode(l)).filter(Boolean) as string[]),
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
      .sort((a, b) => a.sort - b.sort);
    if (levels.some((l) => !tingkatCode(l))) {
      opts.push({ value: 'none', label: 'Lainnya', sort: 9999 });
    }
    return opts;
  }, [levels]);
  const levelOptions = useMemo(
    () =>
      sortLevels(levels)
        .filter((l) => {
          const tk = tingkatCode(l);
          return !tingkat || (tingkat === 'none' ? !tk : tk === tingkat);
        })
        .map((l) => ({
          value: l.id,
          label: l.program?.name ? `${l.name} — ${l.program.name}` : l.name,
        })),
    [levels, tingkat],
  );
  const subjectOptions = useMemo(() => {
    const lvl = levels.find((l) => l.id === levelId);
    return (lvl?.levelSubjects ?? [])
      .map((ls) => ls.subject)
      .filter((s): s is { id: string; name: string } => !!s)
      .map((s) => ({ value: s.id, label: s.name }));
  }, [levels, levelId]);

  const reset = () => {
    setFile(null);
    setTingkat('');
    setLevelId('');
    setSubjectId('');
    setCategory('');
    setPreview(null);
  };

  const runImport = async (dryRun: boolean) => {
    if (!file) throw new ApiError('Pilih file .docx atau .xlsx dulu.', 400);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('levelId', levelId);
    fd.append('subjectId', subjectId);
    fd.append('category', category);
    const level = levels.find((l) => l.id === levelId);
    if (level?.program?.id) fd.append('programId', level.program.id);
    fd.append('dryRun', dryRun ? '1' : '0');
    return apiFetch<ImportResult>('/questions/import', {
      method: 'POST',
      body: fd,
    });
  };

  const previewM = useMutation({
    mutationFn: () => runImport(true),
    onSuccess: setPreview,
    onError: (e) => toast.error(errMsg(e, 'Gagal membaca file.')),
  });

  const importM = useMutation({
    mutationFn: () => runImport(false),
    onSuccess: (r) => {
      toast.success(`${r.created} soal berhasil diimport.`);
      qc.invalidateQueries({ queryKey: ['questions'] });
      qc.invalidateQueries({ queryKey: ['questions-summary'] });
      onOpenChange(false);
      reset();
    },
    onError: (e) => toast.error(errMsg(e, 'Import gagal.')),
  });

  const downloadTemplate = async (format: 'xlsx' | 'docx') => {
    try {
      const blob = await apiFetchBlob(
        `/questions/import/template?format=${format}`,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `template-import-soal.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(errMsg(e, 'Gagal mengunduh template.'));
    }
  };

  const ready = !!file && !!levelId && !!subjectId && !!category;
  const okCount = preview?.rows.filter((r) => r.ok).length ?? 0;
  const failCount = preview ? preview.rows.length - okCount : 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Soal dari Word / Excel</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Langkah 1 — file + template */}
          <div className="space-y-2">
            <p className="text-sm font-medium">1. Pilih file soal</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={() => fileRef.current?.click()}
              >
                <FileUp className="size-4" />
                {file ? file.name : 'Pilih File (.docx / .xlsx)'}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".docx,.xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setPreview(null);
                }}
              />
              <span className="text-xs text-muted-foreground">
                Belum punya formatnya?
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => downloadTemplate('docx')}
              >
                <FileText className="size-4" />
                Template Word
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => downloadTemplate('xlsx')}
              >
                <FileSpreadsheet className="size-4" />
                Template Excel
              </Button>
            </div>
          </div>

          {/* Langkah 2 — tujuan taksonomi */}
          <div className="space-y-2">
            <p className="text-sm font-medium">
              2. Tujuan soal — semua soal di file masuk ke kategori ini
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Phase1aSelectField
                id="imp-tingkat"
                label="Tingkat"
                value={tingkat}
                onChange={(v) => {
                  setTingkat(v);
                  setLevelId('');
                  setSubjectId('');
                  setPreview(null);
                }}
                options={tingkats}
                placeholder="Pilih tingkat"
              />
              <Phase1aSelectField
                id="imp-level"
                label="Jenjang/Kelas"
                value={levelId}
                onChange={(v) => {
                  setLevelId(v);
                  setSubjectId('');
                  setPreview(null);
                }}
                options={levelOptions}
                placeholder="Pilih jenjang"
              />
              <Phase1aSelectField
                id="imp-subject"
                label="Mapel"
                value={subjectId}
                onChange={(v) => {
                  setSubjectId(v);
                  setPreview(null);
                }}
                options={subjectOptions}
                placeholder="Pilih mapel"
              />
              <Phase1aSelectField
                id="imp-category"
                label="Tipe"
                value={category}
                onChange={(v) => {
                  setCategory(v);
                  setPreview(null);
                }}
                options={categoryOptions(catsQ.data)}
                placeholder="Pilih tipe"
              />
            </div>
          </div>

          {/* Langkah 3 — preview + commit */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={!ready || previewM.isPending}
              onClick={() => previewM.mutate()}
            >
              {previewM.isPending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              Preview Parse
            </Button>
            <Button
              disabled={
                !ready || !preview || okCount === 0 || importM.isPending
              }
              onClick={() => importM.mutate()}
            >
              {importM.isPending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <FileUp className="size-4" />
              )}
              Import {preview ? `${okCount} Soal` : ''}
            </Button>
          </div>

          {preview && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Badge variant="secondary">{preview.parsed} terbaca</Badge>
                <Badge className="bg-success-600">{okCount} valid</Badge>
                {failCount > 0 && (
                  <Badge variant="destructive">{failCount} bermasalah</Badge>
                )}
              </div>
              <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-lg border p-2">
                {preview.rows.map((r) => (
                  <div
                    key={r.no}
                    className="flex items-start gap-2 rounded-md bg-muted/40 p-2 text-xs"
                  >
                    {r.ok ? (
                      <CircleCheck className="mt-0.5 size-4 shrink-0 text-success-600" />
                    ) : (
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
                    )}
                    <div className="min-w-0">
                      <p className="font-medium">
                        Soal {r.no}
                        {r.type
                          ? ` — ${QUESTION_TYPES.find((t) => t.value === r.type)?.label ?? r.type}`
                          : ''}
                      </p>
                      <p className="truncate text-muted-foreground">
                        {r.content || '(kosong)'}
                      </p>
                      {r.errors.map((e, i) => (
                        <p key={i} className="text-destructive">
                          • {e}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
