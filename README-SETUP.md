# Cara Pakai Paket Instruksi Ini

Paket ini dibuat untuk workflow: **VS Code + GitHub Copilot (Agent mode) + model Claude Sonnet 5**, membangun Aplikasi Manajemen Bimbel.

## 1. Letakkan file
Salin seluruh folder ini (`.github/`, `docs/`, `.gitignore`) ke **root repo project** Anda (repo kosong/baru).

```
your-repo/
  .github/
    copilot-instructions.md
    instructions/
      auth-rbac.instructions.md
      finance.instructions.md
      exam.instructions.md
      attendance-schedule.instructions.md
      ui-mobile-desktop.instructions.md
  docs/
    ROLE_PAGES.md
    phases/
      phase-0-foundation.md
      phase-1-core-ops.md
      phase-2-finance.md
      phase-3-learning-exam.md
      phase-4-analytics-ranking.md
      phase-5-payroll-whatsapp.md
      phase-6-reports-audit.md
      phase-7-hardening-deploy.md
  .gitignore
```

## 2. Pastikan model di VS Code
Di Copilot Chat (mode **Agent**), pilih model **Claude Sonnet 5**. `copilot-instructions.md` otomatis dibaca Copilot di setiap request selama file itu ada di `.github/`.

## 3. Alur kerja per fase (WAJIB berurutan)
Untuk tiap fase, **buka chat/sesi baru** di Copilot Agent (supaya konteks chat sebelumnya tidak ikut terbawa & memakan token), lalu paste prompt siap-pakai yang ada di akhir tiap file `docs/phases/phase-N-*.md`. Contoh untuk fase pertama:

```
Kerjakan Fase 0 (Foundation) sesuai .github/copilot-instructions.md dan docs/phases/phase-0-foundation.md.
Baca .github/instructions/auth-rbac.instructions.md dan .github/instructions/ui-mobile-desktop.instructions.md.
Jangan kerjakan modul bisnis lain di luar cakupan fase ini.
Setelah selesai, ringkas apa yang dibuat dan tandai item Definition of Done mana yang sudah/belum terverifikasi.
```

Setelah Copilot selesai dan Anda cek Definition of Done fase itu terpenuhi, baru lanjut ke fase berikutnya dengan chat baru.

## 4. Kenapa dipisah begini (soal hemat credit/token)
- `copilot-instructions.md` kecil & selalu ke-load → biaya tetap kecil di setiap request, walau Anda sedang kerjakan fase mana pun.
- File `*.instructions.md` per-domain memakai `applyTo` (path-scoped) — idealnya hanya "aktif" saat Copilot bekerja di path terkait, mengurangi context yang harus diproses.
- File fase (`docs/phases/phase-N-*.md`) dibaca **sekali per fase**, bukan sekaligus semua — jangan minta Copilot "baca semua docs/phases dulu" di awal karena akan memakan token besar tanpa manfaat.
- Chat baru per fase mencegah riwayat panjang menumpuk di context window.
- `.gitignore` mencegah Copilot ikut mengindeks `node_modules`, build artifact, file upload/seed besar.

## 5. Soal referensi mobile UI (demo EduBimbel)
Referensi pola navigasi mobile (`edubimbel-mobile-manager.lovable.app`) sudah dituangkan sebagai aturan tertulis di `.github/instructions/ui-mobile-desktop.instructions.md` dan `docs/ROLE_PAGES.md` — pola **bottom navigation 4-5 item + "Lainnya"**. Jika Anda punya screenshot tambahan dari demo tersebut (terutama dashboard tiap role), simpan di folder lokal (misal `docs/_screenshots-raw/`, sudah di-`.gitignore`-kan) dan lampirkan manual ke Copilot Chat saat mengerjakan fase UI terkait — jangan commit screenshot ke repo agar ukuran repo & context tetap ringan.

## 6. Menyesuaikan urutan/isi fase
Jika di tengah jalan Anda ingin menggabung/memecah fase lagi, cukup edit file `docs/phases/phase-N-*.md` terkait — struktur lain tidak perlu diubah.
