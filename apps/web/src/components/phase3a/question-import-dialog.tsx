'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
import { Input } from '@/components/ui/input';
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
  images?: number;
  duplicate?: boolean;
  /** Soal lama diperbarui dari baris ini. */
  updated?: boolean;
}

interface ImportResult {
  parsed: number;
  created: number;
  /** Jumlah soal lama yang diperbarui (duplikat). */
  updated: number;
  dryRun: boolean;
  rows: ImportRowResult[];
  /** Id soal hasil import (baru + duplikat yang sudah ada). */
  questionIds?: string[];
}

/**
 * Dialog terpisah untuk mengunduh template — dipisah dari wizard import
 * supaya tampilan tetap ringkas.
 */
export function QuestionTemplateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [tplCount, setTplCount] = useState('5');
  const [tplTypes, setTplTypes] = useState<string[]>(
    QUESTION_TYPES.map((t) => t.value),
  );

  const download = async (format: 'xlsx' | 'docx') => {
    try {
      const p = new URLSearchParams({ format });
      if (tplCount.trim()) p.set('count', tplCount.trim());
      if (tplTypes.length) p.set('types', tplTypes.join(','));
      const blob = await apiFetchBlob(
        `/questions/import/template?${p.toString()}`,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `template-import-soal.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      onOpenChange(false);
    } catch (e) {
      toast.error(errMsg(e, 'Gagal mengunduh template.'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Unduh Template Soal</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Template berisi baris contoh yang bisa langsung diedit &amp; diimport —
            termasuk contoh bacaan bersama dan soal benar/salah multi-pernyataan.
          </p>
          <div className="space-y-2 rounded-md border bg-muted/30 px-3 py-2.5 text-xs">
            <p className="font-medium text-foreground">Isi template</p>
            <label className="flex items-center gap-1.5">
              Jumlah
              <Input
                type="number"
                min={1}
                max={100}
                value={tplCount}
                onChange={(e) => setTplCount(e.target.value)}
                className="h-7 w-16 px-2 text-xs"
              />
              soal
            </label>
            <div className="flex flex-wrap gap-x-3 gap-y-1.5">
              <span className="text-muted-foreground">Tipe:</span>
              {QUESTION_TYPES.map((t) => (
                <label key={t.value} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    className="size-3.5 accent-primary"
                    checked={tplTypes.includes(t.value)}
                    onChange={(e) =>
                      setTplTypes((prev) =>
                        e.target.checked
                          ? [...prev, t.value]
                          : prev.filter((v) => v !== t.value),
                      )
                    }
                  />
                  {t.label}
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => download('docx')}>
              <FileText className="size-4" /> Template Word
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => download('xlsx')}
            >
              <FileSpreadsheet className="size-4" /> Template Excel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
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
  initial,
  onImported,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Prefill tujuan taksonomi — mis. filter yang sedang dipakai di form ujian. */
  initial?: { tingkat?: string; levelId?: string; subjectId?: string; category?: string };
  /** Dipanggil setelah import sukses dengan semua id soal (baru + duplikat)
   * — dipakai form ujian/latsol untuk langsung memilih soal-soalnya. */
  onImported?: (questionIds: string[], result: ImportResult) => void;
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [tplOpen, setTplOpen] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [tingkat, setTingkat] = useState(initial?.tingkat ?? '');
  const [levelId, setLevelId] = useState(initial?.levelId ?? '');
  const [subjectId, setSubjectId] = useState(initial?.subjectId ?? '');
  const [category, setCategory] = useState(initial?.category ?? '');
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
    setTingkat(initial?.tingkat ?? '');
    setLevelId(initial?.levelId ?? '');
    setSubjectId(initial?.subjectId ?? '');
    setCategory(initial?.category ?? '');
    setPreview(null);
    setResult(null);
  };

  // Re-seed taksonomi tiap dialog dibuka — mengikuti filter form saat ini.
  useEffect(() => {
    if (open) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.levelId, initial?.subjectId, initial?.category, initial?.tingkat]);

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
      toast.success(
        r.updated > 0
          ? `${r.created} soal baru dibuat — ${r.updated} soal lama diperbarui.`
          : `${r.created} soal berhasil diimport.`,
      );
      qc.invalidateQueries({ queryKey: ['questions'] });
      qc.invalidateQueries({ queryKey: ['questions-select'] });
      qc.invalidateQueries({ queryKey: ['questions-summary'] });
      // Tetap di dialog — tampilkan ringkasan + tombol "Gunakan soal".
      setResult(r);
      setPreview(null);
    },
    onError: (e) => toast.error(errMsg(e, 'Import gagal.')),
  });

  const useImported = () => {
    if (!result) return;
    onImported?.(result.questionIds ?? [], result);
    onOpenChange(false);
    reset();
  };

  const ready = !!file && !!levelId && !!subjectId && !!category;
  const okCount = preview?.rows.filter((r) => r.ok).length ?? 0;
  const dupCount = preview?.rows.filter((r) => r.duplicate).length ?? 0;
  const createCount = okCount - dupCount;
  const failCount = preview ? preview.rows.length - okCount : 0;

  return (
    <>
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

        {result ? (
          /* ---------- HASIL IMPORT ---------- */
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="secondary">{result.parsed} terbaca</Badge>
              <Badge className="bg-success-600">{result.created} baru</Badge>
              {result.updated > 0 && (
                <Badge variant="outline" className="border-amber-500 text-amber-600">
                  {result.updated} diperbarui
                </Badge>
              )}
              {result.rows.length - result.created - result.updated > 0 && (
                <Badge variant="destructive">
                  {result.rows.length - result.created - result.updated} gagal
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Soal duplikat tidak dibuat ulang — soal lama di bank soal
              diperbarui dengan isi file ini dan ikut terpilih.
            </p>
            <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-lg border p-2">
              {result.rows.map((r) => (
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
                      {r.updated ? ' · diperbarui' : ''}
                      {r.images ? ` · +${r.images} gambar` : ''}
                    </p>
                    <p className="truncate text-muted-foreground">
                      {r.content || '(kosong)'}
                    </p>
                    {!r.ok &&
                      r.errors.map((e, i) => (
                        <p key={i} className="text-destructive">
                          • {e}
                        </p>
                      ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {onImported && (result.questionIds?.length ?? 0) > 0 && (
                <Button onClick={useImported}>
                  <CircleCheck className="size-4" />
                  Pilih {result.questionIds!.length} Soal ke Paket
                </Button>
              )}
              <Button
                variant={onImported && result.questionIds?.length ? 'outline' : 'default'}
                onClick={() => {
                  onOpenChange(false);
                  reset();
                }}
              >
                {onImported && result.questionIds?.length ? 'Tutup Tanpa Memilih' : 'Selesai'}
              </Button>
            </div>
          </div>
        ) : (
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
              <Button variant="ghost" size="sm" onClick={() => setTplOpen(true)}>
                <FileText className="size-4" />
                Unduh Template
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
            {preview && createCount === 0 && dupCount > 0 && (
              <p className="w-full text-xs text-muted-foreground">
                Semua soal sudah ada — file ini akan memperbarui {dupCount} soal
                lama dan tetap bisa dipilih.
              </p>
            )}
          </div>

          {preview && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Badge variant="secondary">{preview.parsed} terbaca</Badge>
                <Badge className="bg-success-600">{createCount} baru</Badge>
                {dupCount > 0 && (
                  <Badge variant="outline" className="border-amber-500 text-amber-600">
                    {dupCount} duplikat
                  </Badge>
                )}
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
                    {r.ok && !r.duplicate ? (
                      <CircleCheck className="mt-0.5 size-4 shrink-0 text-success-600" />
                    ) : (
                      <AlertTriangle
                        className={`mt-0.5 size-4 shrink-0 ${r.duplicate ? 'text-amber-500' : 'text-destructive'}`}
                      />
                    )}
                    <div className="min-w-0">
                      <p className="font-medium">
                        Soal {r.no}
                        {r.type
                          ? ` — ${QUESTION_TYPES.find((t) => t.value === r.type)?.label ?? r.type}`
                          : ''}
                        {r.images ? ` · +${r.images} gambar` : ''}
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
        )}
      </DialogContent>
    </Dialog>
    <QuestionTemplateDialog open={tplOpen} onOpenChange={setTplOpen} />
    </>
  );
}
