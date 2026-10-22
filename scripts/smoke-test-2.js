/* Smoke-test lanjutan: item yang tadi salah payload + alur kerja siswa penuh. */
const BASE = process.env.API_BASE || 'http://localhost:3000/api';
const results = [];
let seq = 0;
const uniq = () => `SMK${Date.now().toString(36).toUpperCase()}${seq++}`;
const uniqPhone = () => `08${String(Date.now()).slice(-9)}${String(seq++).padStart(1, '0')}`.slice(0, 13);

function report(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -> ${detail}` : ''}`);
}

async function req(token, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login(identifier, password) {
  for (let a = 0; a < 5; a++) {
    const r = await req(null, 'POST', '/auth/login', { identifier, password });
    if (r.status === 200 || r.status === 201) return r.body.accessToken;
    if (r.status === 429) { await sleep(20000); continue; }
    report(`login ${identifier}`, false, `${r.status}`);
    return null;
  }
  report(`login ${identifier}`, false, '429 berulang');
  return null;
}

async function main() {
  console.log(`=== SMOKE TEST 2 ${BASE} ===\n`);
  const finance = await login('adminfinance1@bimbel.test', 'AdminFinance123!');
  const academic = await login('adminacademic1@bimbel.test', 'AdminAcademic123!');
  const tutor = await login('tutor1@bimbel.test', 'Tutor123!');
  const parent = await login('ortu1@bimbel.test', 'OrangTua123!');
  const siswa = await login('siswa1@bimbel.test', 'Siswa123!');
  if (!finance || !academic) { console.log('login gagal'); process.exit(1); }

  // ref data berpasangan (level milik program yang sama)
  const programs = (await req(academic, 'GET', '/programs?include=levels')).body;
  const programsFull = await req(academic, 'GET', '/programs');
  const progWithLevel = (programsFull.body ?? []).find((p) => (p.levels ?? []).length > 0);
  const refLevel = progWithLevel?.levels?.[0];
  const refProgram = progWithLevel;
  report('ref program+level berpasangan', !!(refProgram && refLevel), `${refProgram?.name} / ${refLevel?.name}`);

  const subjects = (await req(academic, 'GET', '/master/subjects')).body;
  const refSubject = subjects?.[0];
  const groups = (await req(academic, 'GET', '/groups')).body;
  const refGroup = groups?.[0];
  const students = (await req(academic, 'GET', '/students')).body;
  const refStudent = students?.[0];

  // ---------- grade-levels (butuh code) ----------
  {
    const gl = await req(academic, 'POST', '/master/grade-levels', { code: `smk${seq}`, name: `GL ${uniq()}`, sortOrder: 99 });
    report('POST /master/grade-levels (code+name)', [200, 201].includes(gl.status), `${gl.status} ${gl.status >= 400 ? JSON.stringify(gl.body).slice(0, 200) : ''}`);
  }

  // ---------- kelompok: edit program+level berpasangan ----------
  {
    const create = await req(academic, 'POST', '/groups', { name: `Kelompok ${uniq()}`, programId: refProgram?.id, levelId: refLevel?.id, capacity: 8 });
    report('POST /groups', [200, 201].includes(create.status), `${create.status}`);
    const gid = create.body?.id;
    if (gid) {
      const upd = await req(academic, 'PATCH', `/groups/${gid}`, { capacity: 12, name: `Edit ${uniq()}`, code: `E${seq}` });
      report('PATCH /groups/:id (EDIT)', upd.status === 200, `${upd.status} ${upd.status >= 400 ? JSON.stringify(upd.body).slice(0, 250) : ''}`);
      const get = await req(academic, 'GET', `/groups/${gid}`);
      report('GET /groups/:id verifikasi', get.status === 200 && get.body?.capacity === 12, `cap=${get.body?.capacity}`);
      const del = await req(academic, 'DELETE', `/groups/${gid}`);
      report('DELETE /groups/:id', [200, 204].includes(del.status), `${del.status}`);
    }
  }

  // ---------- materi kategori valid ----------
  {
    const create = await req(tutor ?? academic, 'POST', '/materials', {
      title: `Materi ${uniq()}`, levelId: refLevel?.id, subjectId: refSubject?.id,
      category: 'HARIAN', content: '<p>konten</p>',
    });
    report('POST /materials (kategori HARIAN)', [200, 201].includes(create.status), `${create.status} ${create.status >= 400 ? JSON.stringify(create.body).slice(0, 250) : ''}`);
    const mid = create.body?.id;
    if (mid) {
      const upd = await req(tutor ?? academic, 'PATCH', `/materials/${mid}`, { title: `Edit ${uniq()}`, category: 'UTS' });
      report('PATCH /materials/:id (EDIT)', upd.status === 200, `${upd.status} ${upd.status >= 400 ? JSON.stringify(upd.body).slice(0, 250) : ''}`);
      const del = await req(tutor ?? academic, 'DELETE', `/materials/${mid}`);
      report('DELETE /materials/:id', [200, 204].includes(del.status), `${del.status}`);
    }
  }

  // ---------- schedules tanpa tutorId + dengan tutor yang memang tertugas ----------
  {
    const create = await req(academic, 'POST', '/schedules', {
      groupId: refGroup?.id, dayOfWeek: 4, startMin: 900, endMin: 1020,
      validFrom: new Date().toISOString().slice(0, 10),
    });
    report('POST /schedules (tanpa tutor)', [200, 201].includes(create.status), `${create.status} ${create.status >= 400 ? JSON.stringify(create.body).slice(0, 250) : ''}`);
    const schedId = create.body?.id;
    // tutor yang ditugaskan ke refGroup
    const groupDetail = refGroup ? (await req(academic, 'GET', `/groups/${refGroup.id}`)).body : null;
    const assignedTutor = groupDetail?.tutors?.[0]?.tutorId ?? groupDetail?.tutors?.[0]?.id;
    if (assignedTutor) {
      const s2 = await req(academic, 'POST', '/schedules', {
        groupId: refGroup.id, tutorId: assignedTutor, dayOfWeek: 5,
        startMin: 960, endMin: 1080, validFrom: new Date().toISOString().slice(0, 10),
      });
      report('POST /schedules (tutor tertugas)', [200, 201].includes(s2.status), `${s2.status} ${s2.status >= 400 ? JSON.stringify(s2.body).slice(0, 250) : ''}`);
      if (s2.body?.id) await req(academic, 'DELETE', `/schedules/${s2.body.id}`);
    } else {
      report('cari tutor tertugas di kelompok', false, 'refGroup tanpa tutor');
    }
    if (schedId) {
      const upd = await req(academic, 'PATCH', `/schedules/${schedId}`, { startMin: 930, tutorId: assignedTutor ?? undefined });
      report('PATCH /schedules/:id (EDIT)', upd.status === 200, `${upd.status} ${upd.status >= 400 ? JSON.stringify(upd.body).slice(0, 250) : ''}`);
      const del = await req(academic, 'DELETE', `/schedules/${schedId}`);
      report('DELETE /schedules/:id', [200, 204].includes(del.status), `${del.status}`);
    }
  }

  // ---------- absensi bulk (items) ----------
  {
    const s = await req(academic, 'POST', '/sessions', {
      groupId: refGroup?.id,
      startsAt: new Date(Date.now() + 86400e3).toISOString(),
      endsAt: new Date(Date.now() + 86400e3 + 5400e3).toISOString(),
    });
    const sid = s.body?.id;
    if (sid && refStudent) {
      const att = await req(tutor ?? academic, 'POST', `/sessions/${sid}/attendance`, {
        items: [{ studentId: refStudent.id, status: 'PRESENT' }],
      });
      report('POST /sessions/:id/attendance (items)', [200, 201].includes(att.status), `${att.status} ${att.status >= 400 ? JSON.stringify(att.body).slice(0, 250) : ''}`);
      // koreksi oleh academic (punya attendance.correct)
      const corr = await req(academic, 'PATCH', `/sessions/${sid}/attendance/${refStudent.id}`, { status: 'LATE', note: 'koreksi smoke' });
      report('PATCH /sessions/:id/attendance/:sid (koreksi admin)', [200, 201].includes(corr.status), `${corr.status} ${corr.status >= 400 ? JSON.stringify(corr.body).slice(0, 200) : ''}`);
      // koreksi oleh tutor harusnya 403 (by design)
      const corrT = tutor ? await req(tutor, 'PATCH', `/sessions/${sid}/attendance/${refStudent.id}`, { status: 'PRESENT' }) : null;
      report('koreksi absensi oleh tutor ditolak (by design)', corrT ? corrT.status === 403 : true, `${corrT?.status}`);
      await req(academic, 'DELETE', `/sessions/${sid}`);
    }
  }

  // ---------- payments/cash payload benar ----------
  {
    const inv = await req(finance, 'POST', '/invoices', {
      studentId: refStudent?.id,
      dueDate: new Date(Date.now() + 7 * 86400e3).toISOString().slice(0, 10),
      items: [{ description: 'Les smoke', quantity: 1, unitPrice: 100000 }],
    });
    const invId = inv.body?.id;
    if (invId) {
      await req(finance, 'PATCH', `/invoices/${invId}/issue`);
      const pay = await req(finance, 'POST', '/payments/cash', { invoiceId: invId, amount: 100000, note: 'smoke' });
      report('POST /payments/cash', [200, 201].includes(pay.status), `${pay.status} ${pay.status >= 400 ? JSON.stringify(pay.body).slice(0, 250) : ''}`);
      const payId = pay.body?.id;
      if (payId) {
        const ver = await req(finance, 'PATCH', `/payments/${payId}/verify`, { approve: true });
        report('PATCH /payments/:id/verify', [200, 201].includes(ver.status), `${ver.status} ${ver.status >= 400 ? JSON.stringify(ver.body).slice(0, 200) : ''}`);
        const inv2 = await req(finance, 'GET', `/invoices/${invId}`);
        report('invoice lunas setelah verify', inv2.status === 200 && (inv2.body?.status === 'PAID' || Number(inv2.body?.amountPaid) >= 100000), `status=${inv2.body?.status} paid=${inv2.body?.amountPaid}`);
      }
      await req(finance, 'PATCH', `/invoices/${invId}/void`);
    }
  }

  // ---------- enrollment program+level berpasangan ----------
  {
    const enr = await req(parent ?? finance, 'POST', '/me/enrollments', {
      childName: `Anak ${uniq()}`,
      programId: refProgram?.id,
      levelId: refLevel?.id,
      paymentPlan: 'MONTHLY',
    });
    report('POST /me/enrollments', [200, 201].includes(enr.status), `${enr.status} ${enr.status >= 400 ? JSON.stringify(enr.body).slice(0, 250) : ''}`);
    const enrId = enr.body?.id ?? enr.body?.enrollment?.id;
    if (enrId) {
      const acc = await req(academic, 'POST', `/enrollments/${enrId}/accept`, {});
      report('POST /enrollments/:id/accept', [200, 201].includes(acc.status), `${acc.status} ${acc.status >= 400 ? JSON.stringify(acc.body).slice(0, 200) : ''}`);
    }
  }

  // ---------- DELETE exam saat masih DRAFT ----------
  {
    const q = await req(academic, 'POST', '/questions', {
      subjectId: refSubject?.id, levelId: refLevel?.id, type: 'SINGLE_CHOICE',
      content: `Soal del ${uniq()}?`,
      options: [{ content: 'a', isCorrect: true, sortOrder: 0 }, { content: 'b', isCorrect: false, sortOrder: 1 }],
    });
    const e = await req(academic, 'POST', '/exams', {
      title: `Ujian del ${uniq()}`, levelId: refLevel?.id, subjectId: refSubject?.id,
      scheduledStartAt: new Date(Date.now() + 3600e3).toISOString(),
      scheduledEndAt: new Date(Date.now() + 7200e3).toISOString(),
      questionIds: q.body?.id ? [q.body.id] : [], points: [10],
    });
    const eid = e.body?.id;
    if (eid) {
      const del = await req(academic, 'DELETE', `/exams/${eid}`);
      report('DELETE /exams/:id (draft)', [200, 204].includes(del.status), `${del.status} ${del.status >= 400 ? JSON.stringify(del.body).slice(0, 150) : ''}`);
    }
    if (q.body?.id) await req(academic, 'DELETE', `/questions/${q.body.id}`);
  }

  // ---------- ALUR SISWA: latsol attempt ----------
  if (siswa) {
    const packs = await req(siswa, 'GET', '/latsol/packages');
    report('GET /latsol/packages (siswa)', packs.status === 200, `${packs.status}`);
    const pack = (packs.body ?? [])[0];
    if (pack) {
      const start = await req(siswa, 'POST', `/latsol/packages/${pack.id}/start`, {});
      report('POST latsol start', [200, 201].includes(start.status), `${start.status} ${start.status >= 400 ? JSON.stringify(start.body).slice(0, 200) : ''}`);
      const attId = start.body?.id ?? start.body?.attemptId;
      const q0 = start.body?.items?.[0]?.question ?? start.body?.questions?.[0];
      if (attId && q0) {
        const optId = q0.options?.[0]?.id;
        const ans = await req(siswa, 'POST', `/latsol/attempts/${attId}/answers/${q0.id}`, { selectedOptionIds: optId ? [optId] : [] });
        report('POST latsol answer', [200, 201].includes(ans.status), `${ans.status} ${ans.status >= 400 ? JSON.stringify(ans.body).slice(0, 200) : ''}`);
      }
      if (attId) {
        const sub = await req(siswa, 'POST', `/latsol/attempts/${attId}/submit`, {});
        report('POST latsol submit', [200, 201].includes(sub.status), `${sub.status} ${sub.status >= 400 ? JSON.stringify(sub.body).slice(0, 200) : ''}`);
      }
    } else {
      report('siswa punya paket latsol', false, 'tidak ada paket untuk siswa ini');
    }
    // ujian tersedia
    const avail = await req(siswa, 'GET', '/exams-available');
    report('GET /exams-available (siswa)', avail.status === 200, `${avail.status}`);
  }

  const fails = results.filter((r) => !r.ok);
  console.log(`\n=== HASIL: ${results.length - fails.length} pass, ${fails.length} FAIL ===`);
  fails.forEach((f) => console.log(`  - ${f.name}: ${f.detail}`));
}
main().catch((e) => { console.error('ERR:', e); process.exit(1); });
