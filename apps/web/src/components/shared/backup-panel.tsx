"use client";

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DatabaseBackup, Download, HardDrive, LoaderCircle, ShieldAlert, Upload } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { apiFetch, apiFetchBlob, ApiError } from "@/lib/api-client";

interface StorageStats {
  databaseBytes: number;
  mediaDbBytes: number;
  mediaByCategory: { category: string; count: number; bytes: number }[];
  mediaDisk: { count: number; bytes: number };
  proofDisk: { count: number; bytes: number };
}

const CATEGORY_LABEL: Record<string, string> = {
  ACADEMIC: "Akademik (soal/materi)",
  FINANCE: "Keuangan",
  BRANDING: "Branding",
  PROFILE: "Foto profil",
};

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
  const storageQ = useQuery({
    queryKey: ["backup-storage"],
    queryFn: () => apiFetch<StorageStats>("/backup/storage"),
    refetchInterval: 60_000,
  });

  async function handleExport() {
    setExporting(true);
    setError(null);
    setNotice(null);
    try {
      const blob = await apiFetchBlob("/backup/export");
      if (blob.size === 0) {
        throw new ApiError(
          "Server mengirim file backup kosong. Coba ulangi export atau cek log API.",
          500,
        );
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const iso = new Date().toISOString();
      a.href = url;
      a.download = `bimbel-backup-${iso.slice(0, 10).replace(/-/g, "")}.sql.gz`;
      // Beberapa browser (Safari/Firefox lama) mengabaikan click() pada
      // anchor yang tidak menempel ke DOM — pasang sebentar lalu lepas lagi.
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
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

        {storageQ.data ? (
          <div className="grid gap-2 rounded-lg border p-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <HardDrive className="size-4" />
              Penggunaan storage saat ini
            </p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-3">
              <span className="flex justify-between gap-2">
                Database <b>{fmtSize(storageQ.data.databaseBytes)}</b>
              </span>
              <span className="flex justify-between gap-2">
                Media ({storageQ.data.mediaByCategory.reduce((a, c) => a + c.count, 0)} file){" "}
                <b>{fmtSize(storageQ.data.mediaDbBytes)}</b>
              </span>
              <span className="flex justify-between gap-2">
                Bukti bayar ({storageQ.data.proofDisk.count}){" "}
                <b>{fmtSize(storageQ.data.proofDisk.bytes)}</b>
              </span>
              {storageQ.data.mediaDisk.count > 0 ? (
                <span className="flex justify-between gap-2 text-muted-foreground">
                  Media disk lama ({storageQ.data.mediaDisk.count}){" "}
                  <b>{fmtSize(storageQ.data.mediaDisk.bytes)}</b>
                </span>
              ) : null}
            </div>
            {storageQ.data.mediaByCategory.length ? (
              <p className="text-[11px] text-muted-foreground">
                {storageQ.data.mediaByCategory
                  .map(
                    (c) =>
                      `${CATEGORY_LABEL[c.category] ?? c.category}: ${c.count} (${fmtSize(c.bytes)})`,
                  )
                  .join(" · ")}
              </p>
            ) : null}
          </div>
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
              onChange={(e) => {
                const picked = e.target.files?.[0] ?? null;
                setFile(picked);
                setNotice(null);
                setError(
                  picked && picked.size === 0
                    ? "File yang dipilih kosong (0 B). Ini biasanya unduhan gagal/berhenti — unduh ulang backup, tunggu selesai, lalu pilih file .sql.gz hasilnya."
                    : null,
                );
              }}
            />
            <Button
              variant="destructive"
              disabled={!file || file.size === 0 || importing}
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
          <p className="text-xs text-muted-foreground">
            Jangan tutup halaman sampai proses selesai — restore database besar
            bisa memakan waktu beberapa menit.
          </p>
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
