# Fase 3d — Proctoring & Anti-Leak

Bagian keempat Fase 3. **Prasyarat: Fase 3c selesai** (exam-attempts & auto-submit sudah jalan stabil).

## Tujuan
Menambah lapisan pengamanan ke exam yang sudah berjalan di 3c: deteksi kecurangan dan mencegah kebocoran jawaban.

## Cakupan
- Module `exam-proctoring`: fullscreen request, deteksi visibility change/blur/tab-leave, warning counter, policy threshold → attempt `LOCKED`.
- Unlock hanya oleh permission `exam_proctor.unlock` — **lintas kelompok/program**, ditentukan oleh permission bukan relasi tutor-siswa. Semua LOCK/UNLOCK wajib masuk `audit_logs`.
- **Audit anti-leak:** review ulang semua endpoint exam dari Fase 3c — pastikan tidak ada response yang mengandung correct answer/solution sebelum attempt selesai (untuk siswa itu sendiri) atau sebelum result release (untuk siswa lain — result release logic detail ada di 3e, tapi larangan bocor jawaban berlaku dari sekarang).

## Di luar cakupan
Result release timing final & halaman pembahasan (3e).

## Definition of Done
- Attempt yang melanggar policy (mis. keluar fullscreen 3x) otomatis `LOCKED`.
- Unlock oleh user dengan permission `exam_proctor.unlock` dari kelompok BERBEDA berhasil, tercatat di audit log.
- Cek manual/otomatis: tidak ada endpoint yang mengembalikan correct answer sebelum attempt selesai untuk siswa terkait.

## Prompt siap-pakai (ringkas)
```
Kerjakan Fase 3d sesuai docs/phases/phase-3d-proctoring-anti-leak.md.
Fase 3c sudah selesai dan stabil, jangan ubah logic auto-submit yang sudah ada.
Fokus: fullscreen/blur/visibility detection, lock/unlock lintas kelompok via permission, audit log, dan review anti-leak endpoint existing.
Kalau ada tambahan teknis di luar ini, tulis "Usulan Tambahan" saja.
Selesai: ringkas hasil + DoD yang terverifikasi, termasuk hasil review anti-leak.
```
