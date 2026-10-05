# Cara Pakai Paket Instruksi Ini

Paket ini punya **dua set instruksi paralel** untuk dua workflow berbeda — pakai salah satu sesuai tool yang Anda gunakan:

| Workflow | Folder yang dipakai | Kapan pakai |
|---|---|---|
| VS Code + GitHub Copilot (Agent mode) + Claude Sonnet 5 | `.github/` | Kalau kredit Copilot tersedia |
| VS Code + **Cline** + model lokal (Ollama, gratis tanpa batas) | `.clinerules/` | Kalau kredit habis / mau full lokal-gratis |

Isi aturan bisnis & fase kerja **sama persis** di kedua folder — cuma format frontmatter-nya beda (`applyTo` vs `paths`) menyesuaikan mekanisme masing-masing tool. `docs/phases/` dan `docs/ROLE_PAGES.md` dipakai bersama oleh kedua workflow.

---

## A. Workflow Copilot (`.github/`)

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
    brand-assets/
      logo-gfs.png
    phases/
      phase-0-foundation.md
      phase-0b-account-management.md
      phase-1a-people-programs.md
      phase-1b-groups.md
      phase-1c-schedule-session.md
      phase-1d-attendance-notification.md
      phase-2a-invoice-core.md
      phase-2b-payment-channels.md
      phase-2c-ar-refund-cash.md
      phase-2d-rab-expense-reports.md
      phase-3a-materials-question-bank.md
      phase-3b-latsol.md
      phase-3c-exam-core-timing.md
      phase-3d-proctoring-anti-leak.md
      phase-3e-result-release-pembahasan.md
      phase-4a-analytics-dashboard.md
      phase-4b-score-rules-ranking.md
      phase-5a-payroll.md
      phase-5b-notification-whatsapp.md
      phase-6-reports-audit.md
      phase-7a-design-system.md
      phase-7b-navigation-shell.md
      phase-7c-dashboard-data-display.md
      phase-7d-forms-feedback.md
      phase-7e-responsive-audit.md
      phase-8-hardening-deploy.md
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

---

## B. Workflow Cline (`.clinerules/`) — model lokal gratis tanpa batas

### 1. Setup tool & model
- Install [Ollama](https://ollama.com), lalu `ollama pull deepseek-coder-v2:16b` (~9GB, MoE ~2.4B aktif — aman untuk CPU-only 32GB RAM tanpa GPU; **Qwen3-Coder 30B tidak direkomendasikan** di hardware seperti ini karena berisiko OOM/crash).
- Install extension **Cline** di VS Code.
- Cline Settings → API Provider: **Ollama** → Base URL `http://localhost:11434` → pilih model `deepseek-coder-v2:16b`.
- Set **Context Window 8192–16384** (jangan lebih, di RAM 32GB tanpa GPU) di Settings.

### 2. Letakkan file
Salin `.clinerules/`, `docs/`, `.gitignore` ke root repo (folder `.github/` boleh tetap ada, tidak mengganggu — Cline hanya membaca `.clinerules/`).

```
your-repo/
  .clinerules/
    00-project-overview.md   ← selalu aktif
    01-auth-rbac.md          ← aktif saat kerja di modules/auth|users|rbac
    02-finance.md            ← aktif saat kerja di modules/invoices|payments|...
    03-exam.md                ← aktif saat kerja di modules/exams|latsol|...
    04-attendance-schedule.md ← aktif saat kerja di modules/schedules|attendance|groups
    05-ui-mobile-desktop.md   ← aktif saat kerja di apps/web|components
  docs/            (sama seperti workflow Copilot)
  .gitignore
```

### 3. Alur kerja per sub-fase (PENTING lebih ketat di sini)
Karena model lokal punya context window lebih kecil & lebih lambat dari cloud, **selalu klik "New Task" di Cline** tiap ganti fase/sub-fase — jangan lanjutkan task panjang. Paste prompt siap-pakai dari file fase, contoh untuk yang sedang Anda kerjakan:

```
Kerjakan Fase 1a (People & Programs) sesuai docs/phases/phase-1a-people-programs.md.
Ini bagian pertama dari Fase 1 — jangan kerjakan Groups, Schedule, atau Attendance dulu.
Jika ada hal teknis yang menurutmu perlu ditambahkan di luar cakupan file ini, ikuti aturan "Inisiatif Agent" di 00-project-overview.md — tulis sebagai "Usulan Tambahan", jangan langsung implementasi besar.
Setelah selesai, ringkas apa yang dibuat, Definition of Done mana yang terverifikasi, dan sertakan Usulan Tambahan (jika ada).
```

### 4. Kalau model lokal keteteran
Beberapa tanda model lokal kurang kuat untuk suatu task: Cline gagal parsing tool-call berulang kali, menolak eksekusi command, atau "lupa" instruksi di tengah task. Kalau terjadi:
- Pecah task jadi lebih kecil lagi (per-file, bukan per-modul).
- Atau ganti provider ke OpenRouter/Anthropic (via API key) **khusus untuk task yang sulit itu saja**, lalu kembali ke Ollama untuk sisanya.

### 5. File `.github/` tetap dipertahankan?
Boleh dibiarkan di repo (untuk jaga-jaga kalau kredit Copilot terisi lagi) — Cline mengabaikannya. Tidak perlu dihapus.
