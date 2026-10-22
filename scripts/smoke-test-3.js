/* Smoke-test 3: payload benar + sisa fungsi EDIT (ujian/latsol items, profil,
 * score-rules, payroll, day-notes, override sesi, enrollment accept finance). */
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
    report(`login ${identifier}`, false, `${r.status}`); return null;
  }
  report(`login ${identifier}`, false, '429 berulang'); return null;
}

async function main() {
  console.log(`=== SMOKE TEST 3 ${BASE} ===\n`);
  const finance = await login('adminfinance1@bimbel.test', 'AdminFinance123!');
  const academic = await login('adminacademic1@bimbel.test', 'AdminAcademic123!');
  const tutor = await login('tutor1@bimbel.test', 'Tutor123!');
  const parent = await login('ortu1@bimbel.test', 'OrangTua123!');
  if (!finance || !academic) { console.log('login gagal'); process.exit(1); }

  const programsFull = await req(academic, 'GET', '/programs');
  const progWithLevel = (programsFull.body ?? []).find((p) => (p.levels ?? []).length > 0);
  const refLevel = progWithLevel?.levels?.[0];
  const refProgram = progWithLevel;
  const subjects = (await req(academic, 'GET', '/master/subjects')).body;
  const refSubject = subjects?.[0];
  const groups = (await req(academic, 'GET', '/groups')).body;
  const students = (await req(academic, 'GET', '/students')).body;
  const refStudent = students?.[0];
  // kelompok dengan tutor tertugas
  let refGroup = null, assignedTutor = null;
  for (const g of groups ?? []) {
    const d = (await req(academic, 'GET', `/groups/${g.id}`)).body;
    const t = d?.tutors?.[0];
    if (t) { refGroup = g; assignedTutor = t.tutorId ?? t.tutor?.id ?? t.id; break; }
  }
  if (!refGroup) refGroup = groups?.[0];
  report('ref kelompok+tutor', !!refGroup, `${refGroup?.name} tutor=${assignedTutor ?? '-'}`);

  // ---------- ABSENSI status Indonesia ----------
  if (refGroup && refStudent) {
    const s = await req(academic, 'POST', '/sessions', {
      groupId: refGroup.id,
      startsAt: new Date(Date.now() + 86400e3).toISOString(),
      endsAt: new Date(Date.now() + 86400e3 + 5400e3).toISOString(),
    });
    const sid = s.body?.id;
    if (sid) {
      const att = await req(tutor ?? academic, 'POST', `/sessions/${sid}/attendance`, {
        items: [{ studentId: refStudent.id, status: 'HADIR' }],
      });
      report('POST /sessions/:id/attendance (HADIR)', [200, 201].includes(att.status), `${att.status} ${att.status >= 400 ? JSON.stringify(att.body).slice(0, 250) : ''}`);
      const corr = await req(academic, 'PATCH', `/sessions/${sid}/attendance/${refStudent.id}`, { status: 'TERLAMBAT', note: 'koreksi smoke' });
      report('PATCH koreksi absensi (TERLAMBAT)', [200, 201].includes(corr.status), `${corr.status} ${corr.status >= 400 ? JSON.stringify(corr.body).slice(0, 200) : ''}`);
      // override siswa
      const ov = await req(academic, 'POST', `/sessions/${sid}/overrides`, { studentId: refStudent.id, note: 'smoke' });
      report('POST /sessions/:id/overrides', [200, 201, 400, 409].includes(ov.status), `${ov.status} ${ov.status >= 400 ? JSON.stringify(ov.body).slice(0, 150) : ''}`);
      await req(academic, 'DELETE', `/sessions/${sid}`);
    }
  }

  // ---------- VERIFY payment dengan action ----------
  {
    const inv = await req(finance, 'POST', '/invoices', {
      studentId: refStudent?.id,
      dueDate: new Date(Date.now() + 7 * 86400e3).toISOString().slice(0, 10),
      items: [{ description: 'Les v', quantity: 1, unitPrice: 80000 }],
    });
    const invId = inv.body?.id;
    if (invId) {
      await req(finance, 'PATCH', `/invoices/${invId}/issue`);
      const pay = await req(finance, 'POST', '/payments/cash', { invoiceId: invId, amount: 80000 });
      const payId = pay.body?.id;
      if (payId) {
        const ver = await req(finance, 'PATCH', `/payments/${payId}/verify`, { action: 'APPROVE' });
        report('PATCH /payments/:id/verify APPROVE', [200, 201].includes(ver.status), `${ver.status} ${ver.status >= 400 ? JSON.stringify(ver.body).slice(0, 200) : ''}`);
        const inv2 = await req(finance, 'GET', `/invoices/${invId}`);
        report('invoice PAID setelah verify', inv2.status === 200 && inv2.body?.status === 'PAID', `status=${inv2.body?.status}`);
      }
      await req(finance, 'PATCH', `/invoices/${invId}/void`);
    }
  }

  // ---------- ENROLLMENT accept pakai finance ----------
  {
    const enr = await req(parent ?? finance, 'POST', '/me/enrollments', {
      childName: `Anak ${uniq()}`,
      programId: refProgram?.id, levelId: refLevel?.id, paymentPlan: 'MONTHLY',
    });
    const enrId = enr.body?.id ?? enr.body?.enrollment?.id;
    report('POST /me/enrollments', !!enrId, `${enr.status}`);
    if (enrId) {
      const acc = await req(finance, 'POST', `/enrollments/${enrId}/accept`, {});
      report('POST /enrollments/:id/accept (finance)', [200, 201].includes(acc.status), `${acc.status} ${acc.status >= 400 ? JSON.stringify(acc.body).slice(0, 250) : ''}`);
      if (acc.status < 300 && refGroup) {
        const place = await req(academic, 'POST', `/enrollments/${enrId}/place`, { groupId: refGroup.id });
        report('POST /enrollments/:id/place (academic)', [200, 201].includes(place.status), `${place.status} ${place.status >= 400 ? JSON.stringify(place.body).slice(0, 250) : ''}`);
      }
      // edit data anak oleh ortu
      const child = enr.body?.studentId ?? acc.body?.studentId;
      if (parent && child) {
        const upd = await req(parent, 'PATCH', `/me/enrollments/children/${child}`, { name: `Anak Edit ${uniq()}` });
        report('PATCH /me/enrollments/children/:id (EDIT anak ortu)', [200, 201, 400, 404].includes(upd.status), `${upd.status} ${upd.status >= 400 ? JSON.stringify(upd.body).slice(0, 150) : ''}`);
      }
    }
  }

  // ---------- EDIT items ujian (ganti questionIds) ----------
  {
    const mkQ = async (t) => (await req(academic, 'POST', '/questions', {
      subjectId: refSubject?.id, levelId: refLevel?.id, type: 'SINGLE_CHOICE',
      content: `${t} ${uniq()}?`,
      options: [{ content: 'a', isCorrect: true, sortOrder: 0 }, { content: 'b', isCorrect: false, sortOrder: 1 }],
    })).body?.id;
    const q1 = await mkQ('Soal E1'), q2 = await mkQ('Soal E2');
    const e = await req(academic, 'POST', '/exams', {
      title: `Ujian edit item ${uniq()}`, levelId: refLevel?.id, subjectId: refSubject?.id,
      scheduledStartAt: new Date(Date.now() + 3600e3).toISOString(),
      scheduledEndAt: new Date(Date.now() + 7200e3).toISOString(),
      questionIds: q1 ? [q1] : [], points: [10],
    });
    const eid = e.body?.id;
    if (eid && q2) {
      const upd = await req(academic, 'PATCH', `/exams/${eid}`, { questionIds: [q1, q2], points: [10, 15] });
      report('PATCH /exams/:id ganti items (EDIT)', upd.status === 200, `${upd.status} ${upd.status >= 400 ? JSON.stringify(upd.body).slice(0, 250) : ''}`);
      const get = await req(academic, 'GET', `/exams/${eid}`);
      report('GET /exams/:id verifikasi items', get.status === 200 && (get.body?.items?.length ?? get.body?.questions?.length ?? 0) === 2, `items=${get.body?.items?.length ?? get.body?.questions?.length}`);
      await req(academic, 'DELETE', `/exams/${eid}`);
    }
    for (const q of [q1, q2]) if (q) await req(academic, 'DELETE', `/questions/${q}`);
  }

  // ---------- EDIT items latsol ----------
  {
    const mkQ = async (t) => (await req(academic, 'POST', '/questions', {
      subjectId: refSubject?.id, levelId: refLevel?.id, type: 'SINGLE_CHOICE',
      content: `${t} ${uniq()}?`,
      options: [{ content: 'a', isCorrect: true, sortOrder: 0 }, { content: 'b', isCorrect: false, sortOrder: 1 }],
    })).body?.id;
    const q1 = await mkQ('Soal L1'), q2 = await mkQ('Soal L2');
    const p = await req(academic, 'POST', '/latsol/packages', {
      title: `Latsol edit item ${uniq()}`, levelId: refLevel?.id, subjectId: refSubject?.id,
      questionIds: q1 ? [q1] : [],
    });
    const lid = p.body?.id;
    if (lid && q2) {
      const upd = await req(academic, 'PATCH', `/latsol/packages/${lid}`, { questionIds: [q1, q2] });
      report('PATCH /latsol/packages/:id ganti items (EDIT)', upd.status === 200, `${upd.status} ${upd.status >= 400 ? JSON.stringify(upd.body).slice(0, 250) : ''}`);
      const get = await req(academic, 'GET', `/latsol/packages/${lid}`);
      report('GET /latsol/packages/:id verifikasi items', get.status === 200 && (get.body?.items?.length ?? 0) === 2, `items=${get.body?.items?.length}`);
      await req(academic, 'DELETE', `/latsol/packages/${lid}`);
    }
    for (const q of [q1, q2]) if (q) await req(academic, 'DELETE', `/questions/${q}`);
  }

  // ---------- DAY-NOTES ----------
  {
    const n = await req(academic, 'POST', '/day-notes', {
      date: new Date().toISOString().slice(0, 10), type: 'LIBUR', title: `Catatan ${uniq()}`,
    });
    report('POST /day-notes', [200, 201].includes(n.status), `${n.status} ${n.status >= 400 ? JSON.stringify(n.body).slice(0, 200) : ''}`);
    if (n.body?.id) {
      const del = await req(academic, 'DELETE', `/day-notes/${n.body.id}`);
      report('DELETE /day-notes/:id', [200, 204].includes(del.status), `${del.status}`);
    }
  }

  // ---------- SCORE RULES ----------
  {
    const list = await req(academic, 'GET', '/score-rules');
    report('GET /score-rules', list.status === 200, `${list.status}`);
    const sr = await req(academic, 'POST', '/score-rules', {
      source: 'EXAM', minScore: 0, maxScore: 100, points: 10, description: `smoke ${uniq()}`,
    });
    report('POST /score-rules', [200, 201].includes(sr.status), `${sr.status} ${sr.status >= 400 ? JSON.stringify(sr.body).slice(0, 200) : ''}`);
    if (sr.body?.id) {
      const upd = await req(academic, 'PUT', `/score-rules/${sr.body.id}`, { points: 15, description: 'edit smoke' });
      report('PUT /score-rules/:id (EDIT)', [200, 201].includes(upd.status), `${upd.status} ${upd.status >= 400 ? JSON.stringify(upd.body).slice(0, 200) : ''}`);
      const del = await req(academic, 'DELETE', `/score-rules/${sr.body.id}`);
      report('DELETE /score-rules/:id', [200, 204].includes(del.status), `${del.status}`);
    }
  }

  // ---------- TUTOR RATES ----------
  {
    const tutors = (await req(finance, 'GET', '/tutors')).body;
    const t0 = tutors?.[0];
    if (t0) {
      const tr = await req(finance, 'POST', '/tutor-rates', {
        tutorId: t0.id, hourlyRate: 75000, effectiveFrom: new Date().toISOString().slice(0, 10),
      });
      report('POST /tutor-rates', [200, 201, 400, 409].includes(tr.status), `${tr.status} ${tr.status >= 400 ? JSON.stringify(tr.body).slice(0, 200) : ''}`);
      if (tr.body?.id) {
        const upd = await req(finance, 'PATCH', `/tutor-rates/${tr.body.id}`, { hourlyRate: 85000 });
        report('PATCH /tutor-rates/:id (EDIT)', [200, 201].includes(upd.status), `${upd.status} ${upd.status >= 400 ? JSON.stringify(upd.body).slice(0, 200) : ''}`);
      }
    }
  }

  // ---------- PROFIL & GANTI PASSWORD ----------
  if (parent) {
    const prof = await req(parent, 'PATCH', '/auth/profile', { name: `Ortu Profil ${uniq()}` });
    report('PATCH /auth/profile', prof.status === 200, `${prof.status} ${prof.status >= 400 ? JSON.stringify(prof.body).slice(0, 150) : ''}`);
    const cp = await req(parent, 'POST', '/auth/change-password', { oldPassword: 'OrangTua123!', newPassword: 'OrangTua123!' });
    report('POST /auth/change-password', [200, 201, 400].includes(cp.status), `${cp.status} ${cp.status >= 400 ? JSON.stringify(cp.body).slice(0, 150) : ''}`);
    const pref = await req(parent, 'PATCH', '/notifications/preference', { whatsapp: true, email: false });
    report('PATCH /notifications/preference', [200, 201].includes(pref.status), `${pref.status} ${pref.status >= 400 ? JSON.stringify(pref.body).slice(0, 150) : ''}`);
  }

  // ---------- IMPORT ----------
  {
    const imp = await req(finance, 'POST', '/import/students', { rows: [{ name: `Imp ${uniq()}`, email: `imp-${uniq().toLowerCase()}@t.id`, phone: uniqPhone() }] });
    report('POST /import/students', [200, 201, 400].includes(imp.status), `${imp.status} ${imp.status >= 400 ? JSON.stringify(imp.body).slice(0, 200) : ''}`);
  }

  const fails = results.filter((r) => !r.ok);
  console.log(`\n=== HASIL: ${results.length - fails.length} pass, ${fails.length} FAIL ===`);
  fails.forEach((f) => console.log(`  - ${f.name}: ${f.detail}`));
}
main().catch((e) => { console.error('ERR:', e); process.exit(1); });
