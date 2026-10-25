"""Crosscheck role + simulasi traffic untuk modul ujian Bimbel GFS.

Jalan di host: python scripts/test_exam_e2e.py
Butuh: requests (pip install requests)
"""
import concurrent.futures as cf
import statistics
import sys
import time
from datetime import datetime, timedelta, timezone

import requests

# Proxy Next mengirim content-encoding gzip yang gagal didecode urllib3
# di beberapa environment — minta respons polos.
requests.utils.default_headers = lambda: {"Accept-Encoding": "identity", "User-Agent": "e2e-test"}
_orig_request = requests.Session.request


def _no_gzip_request(self, method, url, **kwargs):
    kwargs.setdefault("headers", {})
    kwargs["headers"].setdefault("Accept-Encoding", "identity")
    return _orig_request(self, method, url, **kwargs)


requests.Session.request = _no_gzip_request

BASE = "http://localhost:3001/api"
QIDS = ["seed-qe-b1-2", "seed-qi-b2-1", "seed-qi-b2-2"]
PASS, FAIL = [], []


def ok(name, cond, detail=""):
    (PASS if cond else FAIL).append(name)
    print(f"  {'PASS' if cond else 'FAIL'}  {name}{(' — ' + detail) if detail else ''}")


def login(identifier, password):
    # Endpoint auth di-throttle — retry dengan backoff saat kena 429.
    for attempt in range(6):
        r = requests.post(f"{BASE}/auth/login", json={"identifier": identifier, "password": password}, timeout=15)
        if r.status_code == 429:
            time.sleep(5 * (attempt + 1))
            continue
        r.raise_for_status()
        time.sleep(1.2)  # jaga jarak antar login
        return r.json()["accessToken"]
    r.raise_for_status()


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


def main():
    print("== LOGIN SEMUA ROLE ==")
    admin = login("adminacademic1@bimbel.test", "AdminAcademic123!")
    tutor = login("tutor1@bimbel.test", "Tutor123!")
    siswa = login("siswa1@bimbel.test", "Siswa123!")
    ortu = login("ortu1@bimbel.test", "OrangTua123!")
    print("  login admin/tutor/siswa/ortu OK")

    # ---------- ADMIN: lifecycle lengkap ----------
    print("\n== ADMIN: buat ujian -> soal -> publish -> pause -> resume -> end ==")
    start = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    end = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
    r = requests.post(f"{BASE}/exams", headers=H(admin), json={
        "title": "E2E Test Exam", "category": "TO",
        "scheduledStartAt": start, "scheduledEndAt": end,
        "durationMinutes": 30, "showResultImmediately": True,
    }, timeout=15)
    ok("admin create draft tanpa soal", r.status_code == 201, r.text[:120])
    exam_id = r.json()["id"]

    r = requests.post(f"{BASE}/exams/{exam_id}/publish", headers=H(admin), timeout=15)
    ok("publish tanpa soal ditolak", r.status_code == 400, r.json().get("message", "")[:80])

    r = requests.patch(f"{BASE}/exams/{exam_id}", headers=H(admin), json={
        "questionIds": QIDS,
    }, timeout=15)
    ok("admin isi soal via PATCH", r.status_code == 200)

    # Clear taxonomy -> persist null
    r = requests.patch(f"{BASE}/exams/{exam_id}", headers=H(admin), json={
        "levelId": None, "subjectId": None, "programId": None,
    }, timeout=15)
    d = r.json()
    ok("clear jenjang/mapel -> null persist",
       r.status_code == 200 and d.get("levelId") is None and d.get("subjectId") is None)

    r = requests.post(f"{BASE}/exams/{exam_id}/publish", headers=H(admin), timeout=15)
    ok("publish setelah ada soal", r.status_code in (200, 201), r.text[:100])

    # ---------- SISWA: mulai -> jawab -> kumpul -> hasil ----------
    print("\n== SISWA: start -> autosave -> submit -> hasil langsung ==")
    r = requests.post(f"{BASE}/exam-attempts/start", headers=H(siswa), json={"examId": exam_id}, timeout=15)
    ok("siswa start attempt", r.status_code == 201, r.text[:100])
    attempt_id = r.json()["id"] if r.status_code == 201 else None

    r = requests.post(f"{BASE}/exam-attempts/start", headers=H(siswa), json={"examId": exam_id}, timeout=15)
    ok("start kedua ditolak", r.status_code == 400)

    if attempt_id:
        # Autosave burst — 10 paralel, semua harus 200 (upsert race-safe)
        def save(i):
            return requests.put(
                f"{BASE}/exam-attempts/{attempt_id}/answers/{QIDS[i % len(QIDS)]}",
                headers=H(siswa), json={"selectedOptionIds": []}, timeout=15)
        with cf.ThreadPoolExecutor(10) as ex:
            codes = [f.result().status_code for f in [ex.submit(save, i) for i in range(10)]]
        ok("autosave burst 10x paralel -> semua 200", all(c == 200 for c in codes), str(codes))

        # Double submit race — 5 paralel, tepat 1 sukses (POST => 201)
        def sub():
            return requests.post(f"{BASE}/exam-attempts/{attempt_id}/submit", headers=H(siswa), json={}, timeout=20)
        with cf.ThreadPoolExecutor(5) as ex:
            codes = [f.result().status_code for f in [ex.submit(sub) for _ in range(5)]]
        ok("submit race 5x -> tepat 1 sukses", sum(1 for c in codes if c in (200, 201)) == 1, str(codes))

        r = requests.get(f"{BASE}/exam-attempts/{attempt_id}", headers=H(siswa), timeout=15)
        d = r.json()
        ok("hasil langsung dirilis (showResultImmediately)",
           d.get("status") == "SUBMITTED" and d.get("resultReleased") is True,
           f"status={d.get('status')} released={d.get('resultReleased')} score={d.get('score')}")

    # ---------- PAUSE: blokir siswa, izinkan edit ----------
    print("\n== PAUSE / RESUME / END ==")
    r = requests.patch(f"{BASE}/exams/{exam_id}", headers=H(admin), json={"status": "LOCKED"}, timeout=15)
    ok("admin pause (PUBLISHED->LOCKED)", r.status_code == 200 and r.json().get("status") == "LOCKED")

    r = requests.post(f"{BASE}/exam-attempts/start", headers=H(siswa), json={"examId": exam_id}, timeout=15)
    ok("start saat dijeda ditolak", r.status_code == 400)

    r = requests.patch(f"{BASE}/exams/{exam_id}", headers=H(admin), json={"title": "E2E Test Exam (edited while paused)"}, timeout=15)
    ok("edit judul saat dijeda diizinkan", r.status_code == 200)

    r = requests.patch(f"{BASE}/exams/{exam_id}", headers=H(admin), json={"status": "PUBLISHED"}, timeout=15)
    ok("resume (LOCKED->PUBLISHED)", r.status_code == 200 and r.json().get("status") == "PUBLISHED")

    r = requests.post(f"{BASE}/exams/{exam_id}/end", headers=H(admin), timeout=30)
    ok("akhiri ujian", r.status_code in (200, 201) and r.json().get("status") == "ENDED", r.text[:120])

    # ---------- RACE: start paralel siswa baru ----------
    print("\n== RACE: N start() paralel -> tepat 1 attempt ==")
    start2 = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    end2 = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
    r = requests.post(f"{BASE}/exams", headers=H(admin), json={
        "title": "E2E Race Exam", "category": "TO",
        "scheduledStartAt": start2, "scheduledEndAt": end2,
        "durationMinutes": 30, "questionIds": QIDS,
    }, timeout=15)
    race_exam = r.json()["id"]
    requests.post(f"{BASE}/exams/{race_exam}/publish", headers=H(admin), timeout=15)

    # Pakai akun siswa lain yang belum punya attempt di exam ini
    siswa2 = None
    for cand in [("siswa2@bimbel.test", "Siswa123!"), ("siswa3@bimbel.test", "Siswa123!")]:
        try:
            siswa2 = login(*cand)
            break
        except Exception:
            continue
    if not siswa2:
        # fallback: reset attempt siswa1 di race_exam tidak ada — pakai student external? skip
        print("  (skip race start — tidak ada akun siswa kedua)")
    else:
        def start_race(_):
            return requests.post(f"{BASE}/exam-attempts/start", headers=H(siswa2),
                                 json={"examId": race_exam}, timeout=20).status_code
        with cf.ThreadPoolExecutor(8) as ex:
            codes = list(ex.map(start_race, range(8)))
        ok("8x start paralel -> tepat 1 sukses", codes.count(201) == 1, str(codes))

    # ---------- TUTOR ----------
    print("\n== TUTOR ==")
    r = requests.get(f"{BASE}/exams", headers=H(tutor), timeout=15)
    ok("tutor list ujian", r.status_code == 200, f"{len(r.json())} ujian")
    r = requests.post(f"{BASE}/exams", headers=H(tutor), json={
        "title": "E2E Tutor Exam", "category": "TO",
        "scheduledStartAt": start, "scheduledEndAt": end, "durationMinutes": 20,
    }, timeout=15)
    tutor_exam = r.json().get("id") if r.status_code == 201 else None
    ok("tutor buat ujian draft", r.status_code == 201, r.text[:100])
    if tutor_exam:
        r = requests.patch(f"{BASE}/exams/{tutor_exam}", headers=H(tutor), json={"questionIds": QIDS}, timeout=15)
        ok("tutor isi soal", r.status_code == 200, r.text[:100])
        r = requests.post(f"{BASE}/exams/{tutor_exam}/publish", headers=H(tutor), timeout=15)
        ok("tutor publish", r.status_code in (200, 201), r.text[:100])

    # ---------- ORTU ----------
    print("\n== ORTU ==")
    r = requests.get(f"{BASE}/me/payment-plan", headers=H(ortu), timeout=15)
    ok("ortu payment-plan", r.status_code == 200)
    r = requests.get(f"{BASE}/notifications/mine", headers=H(ortu), timeout=15)
    ok("ortu notifikasi", r.status_code == 200)

    # ---------- LOAD: daftar ujian konkuren ----------
    print("\n== LOAD: 40x GET /exams-available paralel ==")
    def avail(_):
        t0 = time.perf_counter()
        c = requests.get(f"{BASE}/exams-available", headers=H(siswa), timeout=30).status_code
        return c, (time.perf_counter() - t0) * 1000
    with cf.ThreadPoolExecutor(40) as ex:
        res = list(ex.map(avail, range(40)))
    codes = [c for c, _ in res]
    lat = [l for _, l in res]
    ok("40x paralel semua 200", all(c == 200 for c in codes),
       f"p50={statistics.median(lat):.0f}ms p95={sorted(lat)[int(len(lat)*.95)]:.0f}ms max={max(lat):.0f}ms")

    # ---------- CLEANUP ----------
    print("\n== CLEANUP ==")
    for eid in [exam_id, race_exam, tutor_exam]:
        if not eid:
            continue
        # kembali ke DRAFT lalu hapus bila belum ENDED; ENDED tak bisa dihapus lewat delete guard? coba saja
        requests.patch(f"{BASE}/exams/{eid}", headers=H(admin), json={"status": "DRAFT"}, timeout=15)
        d = requests.delete(f"{BASE}/exams/{eid}", headers=H(admin), timeout=15)
        print(f"  delete {eid[:8]} -> {d.status_code}")

    print(f"\n== HASIL: {len(PASS)} pass, {len(FAIL)} fail ==")
    if FAIL:
        print("GAGAL:", *FAIL, sep="\n  - ")
        sys.exit(1)


if __name__ == "__main__":
    main()
