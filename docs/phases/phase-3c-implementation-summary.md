# Fase 3c Implementation Summary

## Ringkasan Implementasi

### Backend (NestJS)

**1. Database Schema (`prisma/schema.prisma`)**
- `Exam`: Model ujian dengan `scheduledStartAt` dan `scheduledEndAt` GLOBAL
- `ExamItem`: Soal dalam ujian (snapshot dari bank soal)
- `ExamAttempt`: Attempt siswa dengan status IN_PROGRESS/SUBMITTED
- `ExamAnswer`: Jawaban siswa per soal
- Enums: `ExamStatus` (DRAFT, PUBLISHED, LOCKED), `ExamAttemptStatus` (IN_PROGRESS, SUBMITTED)

**2. Module `exams`**
- `exams.service.ts`: CRUD ujian dengan validasi timing global
- `exams.controller.ts`: API endpoints dengan RBAC
- `exams.module.ts`: Module registration
- `dto/exam.dto.ts`: DTO untuk CreateExamDto dan UpdateExamDto

**3. Module `exam-attempts`**
- `exam-attempts.service.ts`: Logic start attempt, autosave, manual submit, grading
- `exam-attempts.controller.ts`: API endpoints untuk siswa
- `exam-attempts.module.ts`: Module registration
- `dto/exam-attempt.dto.ts`: DTO untuk SaveExamAnswerDto dan SubmitExamDto

**4. Auto-Submit Scheduler**
- `exam-auto-submit.service.ts`: Service yang berjalan setiap 5 detik
  - Cek semua attempts IN_PROGRESS yang scheduled_end_at sudah lewat
  - Auto-submit dengan grading secara paralel
  - Tidak ada race condition karena menggunakan database transaction
- Manual trigger endpoint: `POST /api/exam-auto-submit/trigger` (untuk testing)

**5. RBAC Permissions**
- `EXAM_VIEW`: View exams (Admin Academic, Tutor)
- `EXAM_MANAGE`: Manage exams (Admin Academic, Owner)
- `EXAM_ATTEMPT`: Take exams (Siswa)
- Updated di `permissions.constants.ts` dan `seed.ts`

### Frontend (Next.js)

**1. Types (`lib/phase3c-types.ts`)**
- TypeScript types untuk Exam, ExamAttempt, ExamItem, DTOs

**2. Components**
- `exams-manager.tsx`: CRUD ujian untuk Admin Academic
- `exam-taker.tsx`: Interface mengerjakan ujian untuk siswa
  - Timer countdown berdasarkan scheduled_end_at GLOBAL
  - Autosave jawaban dengan debounce
  - Manual submit
  - Display hasil setelah submit
- `exam-list-student.tsx`: Daftar ujian yang tersedia untuk siswa

**3. Pages**
- Admin Academic: `/admin-academic/ujian` → ExamsManager
- Siswa: `/siswa/ujian` → ExamListStudent
- Siswa: `/siswa/ujian/[attemptId]` → ExamTaker
- Tutor: `/tutor/ujian` → ExamsManager (read-only)

**4. Navigation**
- Updated `role-nav.ts` untuk semua role

## Verifikasi Auto-Submit & Concurrency

### Logic Auto-Submit (PALING KRITIS)

**Server-Side Global Timing:**
1. `ExamAutoSubmitService` berjalan sebagai scheduler saat module di-init
2. Setiap 5 detik, service menjalankan `checkAndAutoSubmit()`
3. Query: `SELECT * FROM exam_attempts WHERE status = 'IN_PROGRESS' AND exam.scheduledEndAt < NOW()`
4. Setiap attempt yang ditemukan di-auto-submit secara paralel via `ExamAttemptsService.autoSubmit()`
5. Auto-submit melakukan grading dan update status ke SUBMITTED

**Anti-Race Condition:**
- Menggunakan Prisma transaction untuk grading
- Auto-submit hanya untuk attempts dengan status IN_PROGRESS
- Jika attempt sudah SUBMITTED, auto-submit akan skip (no-op)
- Query menggunakan database timestamp, bukan client-side time

### Testing Script

File: `apps/api/test-exam-concurrency.js`

**Steps:**
1. Buat exam via API dengan:
   - `scheduledStartAt` = now + 1 menit
   - `scheduledEndAt` = now + 2 menit
   - Status = PUBLISHED
2. Jalankan script: `EXAM_ID=<exam_id> node test-exam-concurrency.js`
3. Script akan:
   - Login 3 siswa berbeda
   - Start 3 attempt secara bersamaan (concurrent)
   - Save jawaban secara bersamaan
   - Tunggu user input setelah scheduled_end_at tercapai
   - Cek status semua attempt
4. Verifikasi:
   - Semua 3 attempt status = SUBMITTED
   - Max time difference antar submission < 10 detik
   - Tidak ada attempt yang lolos (tetap IN_PROGRESS)

### Cara Manual Testing

**1. Buat Exam:**
```bash
curl -X POST http://localhost:3000/api/exams \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Exam",
    "scheduledStartAt": "2026-09-27T13:00:00Z",
    "scheduledEndAt": "2026-09-27T13:02:00Z",
    "questionIds": ["<question_id_1>", "<question_id_2>"]
  }'
```

**2. Set Status ke PUBLISHED:**
```bash
curl -X PATCH http://localhost:3000/api/exams/<exam_id> \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"status": "PUBLISHED"}'
```

**3. Start 3 Attempt (dari 3 browser/akun berbeda):**
```bash
# Siswa 1
curl -X POST http://localhost:3000/api/exam-attempts/start \
  -H "Authorization: Bearer <siswa1_token>" \
  -H "Content-Type: application/json" \
  -d '{"examId": "<exam_id>"}'

# Siswa 2
curl -X POST http://localhost:3000/api/exam-attempts/start \
  -H "Authorization: Bearer <siswa2_token>" \
  -H "Content-Type: application/json" \
  -d '{"examId": "<exam_id>"}'

# Siswa 3
curl -X POST http://localhost:3000/api/exam-attempts/start \
  -H "Authorization: Bearer <siswa3_token>" \
  -H "Content-Type: application/json" \
  -d '{"examId": "<exam_id>"}'
```

**4. Tunggu sampai scheduled_end_at tercapai (2 menit)**

**5. Cek Status Attempt:**
```bash
curl http://localhost:3000/api/exams/<exam_id>/attempts \
  -H "Authorization: Bearer <admin_token>"
```

**Expected Result:**
- Semua 3 attempt status = SUBMITTED
- Semua submittedAt ≈ scheduled_end_at (max deviation < 10 detik)
- Tidak ada attempt yang tetap IN_PROGRESS

## Definition of Done Verification

✅ Database schema untuk Exam dan ExamAttempt ditambahkan
✅ Module exams dengan CRUD ujian dari bank soal
✅ Module exam-attempts dengan start attempt, autosave jawaban
✅ Auto-submit scheduler yang berjalan setiap 5 detik
✅ RBAC permissions ditambahkan
✅ Frontend pages untuk exam management (Admin Academic)
✅ Frontend page untuk siswa mengerjakan ujian
✅ Testing script untuk simulasi concurrency
✅ Dokumentasi verifikasi auto-submit & concurrency

## Usulan Tambahan

**1. @nestjs/schedule Integration:**
- Saat ini menggunakan custom setInterval sederhana
- Bisa diganti dengan @nestjs/schedule @Cron() untuk lebih robust
- Perlu install package dan konfigurasi ScheduleModule

**2. WebSocket untuk Real-time Timer:**
- Saat ini timer countdown client-side
- Bisa tambahkan WebSocket untuk sync timer dari server
- Memastikan semua siswa melihat waktu yang sama

**3. Proctoring (Fase 3d):**
- Tidak diimplementasikan di fase ini (sesuai spec)
- Perlu tab detection, fullscreen enforcement, dll

**4. Result Release Lock (Fase 3e):**
- Saat ini hasil langsung terlihat setelah submit
- Perlu logic untuk lock result sampai waktu tertentu
- Ini akan diimplementasikan di Fase 3e

**5. Retry Logic untuk Autosave:**
- Saat ini autosave gagal hanya log error
- Bisa tambahkan retry dengan exponential backoff
- Queue failed saves untuk retry nanti

**6. Load Testing:**
- Test dengan lebih dari 3 concurrent attempts
- Test dengan 100+ attempts untuk scalability
- Monitor database performance dan auto-submit latency
