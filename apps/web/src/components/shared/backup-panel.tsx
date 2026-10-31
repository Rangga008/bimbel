"use client";

import { useRef, useState } from "react";
import { DatabaseBackup, Download, LoaderCircle, ShieldAlert, Upload } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { apiFetch, apiFetchBlob, ApiError } from "@/lib/api-client";

function fmtSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

/**
 * Panel "Cadangan & Pemulihan Database" di halaman Pengaturan.
 * Export → unduh dump Postgres (.sql.gz) untuk arsip/pindah hosting.
 * Import → restore dump yang sama; menimpa SELURUH isi database secara
 * atomik (rollback otomatis bila gagal) — dipakai untuk migrasi hosting
 * atau pemulihan setelah insiden.
 */
export function BackupPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setExporting(true);
    setError(null);
    setNotice(null);
    try {
      const blob = await apiFetchBlob("/backup/export");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const iso = new Date().toISOString();
      a.href = url;
      a.download = `bimbel-backup-${iso.slice(0, 10).replace(/-/g, "")}.sql.gz`;
      a.click();
      URL.revokeObjectURL(url);
      setNotice("Backup berhasil diunduh — simpan di tempat aman (Drive/USB).");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Export gagal.");
    } finally {
      setExporting(false);
    }
  }

  async function handleImport() {
    if (!file) return;
    setConfirmOpen(false);
    setImporting(true);
    setError(null);
    setNotice(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await apiFetch<{ message: string }>("/backup/import", {
        method: "POST",
        body: fd,
      });
      setNotice(res.message ?? "Restore selesai.");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Restore gagal.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <Card className="border-amber-300/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <DatabaseBackup className="size-5" />
          Cadangan & Pemulihan Database
        </CardTitle>
        <CardDescription>
          Unduh seluruh data aplikasi sebagai file .sql.gz — untuk arsip rutin,
          pindah hosting, atau pemulihan bila terjadi insiden/serangan.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {notice ? (
          <p className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={handleExport} disabled={exporting}>
            {exporting ? (
              <LoaderCircle className="mr-1.5 size-4 animate-spin" />
            ) : (
              <Download className="mr-1.5 size-4" />
            )}
            {exporting ? "Membuat backup..." : "Unduh Backup (.sql.gz)"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Isi: seluruh tabel (akun, siswa, tagihan, soal, nilai, pengaturan)
            dalam format dump Postgres standar.
          </p>
        </div>

        <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <ShieldAlert className="size-4 text-amber-600" />
            Pulihkan dari file backup — <b>menimpa seluruh database saat ini</b>.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".sql,.gz,application/gzip,application/sql"
              className="text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm hover:file:bg-muted"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <Button
              variant="destructive"
              disabled={!file || importing}
              onClick={() => setConfirmOpen(true)}
            >
              {importing ? (
                <LoaderCircle className="mr-1.5 size-4 animate-spin" />
              ) : (
                <Upload className="mr-1.5 size-4" />
              )}
              {importing ? "Memulihkan..." : "Pulihkan Database"}
            </Button>
          </div>
          {file ? (
            <p className="text-xs text-muted-foreground">
              {file.name} — {fmtSize(file.size)}
            </p>
          ) : null}
        </div>

        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Pulihkan database dari backup?"
          description={`File "${file?.name}" akan MENIMPA seluruh isi database saat ini — semua perubahan setelah tanggal backup hilang. Proses berjalan atomik: bila gagal, database tidak berubah. Lanjutkan?`}
          confirmLabel="Ya, pulihkan sekarang"
          pending={importing}
          onConfirm={() => void handleImport()}
        />
      </CardContent>
    </Card>
  );
}
