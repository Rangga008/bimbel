/* Smoke-test alur kerja BimbelGFS — jalankan: node scripts/smoke-test.js
 * Mensimulasikan: login per role -> list -> create -> EDIT -> verify -> cleanup.
 * Payload sudah disesuaikan DTO backend. */
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
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login(identifier, password) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await req(null, 'POST', '/auth/login', { identifier, password });
    if (r.status === 200 || r.status === 201) return r.body.accessToken;
    if (r.status === 429) { await sleep(15000); continue; }
    report(`login ${identifier}`, false, `${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
    return null;
  }
  report(`login ${identifier}`, false, '429 berulang (rate-limit)');
  return null;
}

async function main() {
  console.log(`=== SMOKE TEST ${BASE} ===\n`);

  const finance = await login('adminfinance1@bimbel.test', 'AdminFinance123!');
  const academic = await login('adminacademic1@bimbel.test', 'AdminAcademic123!');
  const owner = await login('owner1@bimbel.test', 'Owner123!');
  const tutor = await login('tutor1@bimbel.test', 'Tutor123!');
  const parent = await login('ortu1@bimbel.test', 'OrangTua123!');
  const siswa = await login('siswa1@bimbel.test', 'Siswa123!');
  if (!finance || !academic) {
    console.log('Login admin gagal — hentikan.');
    process.exit(1);
  }
  report('login semua role', !!(owner && tutor && parent && siswa));

  // ---------- REF DATA ----------
  const [programs, levels, packages, groups, students, parents, tutors, subjects, gradeLevels] =
    await Promise.all([
      req(academic, 'GET', '/programs'),
      req(academic, 'GET', '/levels'),
      req(academic, 'GET', '/packages'),
      req(academic, 'GET', '/groups'),
      req(academic, 'GET', '/students'),
      req(academic, 'GET', '/parents'),
      req(academic, 'GET', '/tutors'),
      req(academic, 'GET', '/master/subjects'),
      req(academic, 'GET', '/master/grade-levels'),
    ]);
  for (const [n, r] of [['programs', programs], ['levels', levels], ['packages', packages],
    ['groups', groups], ['students', students], ['parents', parents],
    ['tutors', tutors], ['master/subjects', subjects], ['master/grade-levels', gradeLevels]]) {
    report(`GET /${n}`, r.status === 200 && Array.isArray(r.body), `status ${r.status}`);
  }
  const refProgram = programs.body?.[0];
  const refLevel = levels.body?.[0];
  const refPackage = packages.body?.[0];
  const refGroup = groups.body?.[0];
  const refStudent = students.body?.[0];
  const refParent = parents.body?.[0];
  const refTutor = tutors.body?.[0];
  const refSubject = subjects.body?.[0];
  const refGrade = gradeLevels.body?.[0];

  // ---------- SETTINGS (EDIT) ----------
  {
    const before = await req(finance, 'GET', '/settings');
    const oldLimit = before.body?.exam?.violationLimit ?? 3;
    const put = await req(finance, 'PUT', '/settings/exam', { value: { violationLimit: 4 } });
    report('PUT /settings/exam (EDIT)', put.status === 200, `${put.status} ${put.status >= 400 ? JSON.stringify(put.body).slice(0, 150) : ''}`);
    const after = await req(finance, 'GET', '/settings');
    report('GET /settings verifikasi edit', after.status === 200 && after.body?.exam?.violationLimit === 4, `=${after.body?.exam?.violationLimit}`);
    await req(finance, 'PUT', '/settings/exam', { value: { violationLimit: oldLimit } });
  }

  // ---------- MASTER DATA ----------
  {
    const create = await req(academic, 'POST', '/master/subjects', { name: `Mapel ${uniq()}`, code: `smk${seq}` });
    report('POST /master/subjects', [200, 201].includes(create.status), `${create.status} ${create.status >= 400 ? JSON.stringify(create.body).slice(0, 150) : ''}`);
    const id = create.body?.id;
    if (id) {
      const upd = await req(academic, 'PATCH', `/master/subjects/${id}`, { name: `Mapel Edit ${uniq()}` });
      report('PATCH /master/subjects/:id (EDIT)', upd.status === 200, `${upd.status} ${upd.status >= 400 ? JSON.stringify(upd.body).slice(0, 150) : ''}`);
    }
    const gl = await req(academic, 'POST', '/master/grade-levels', { name: `GL ${uniq()}`, sortOrder: 99 });
    report('POST /master/grade-levels', [200, 201].includes(gl.status), `${gl.status} ${gl.status >= 400 ? JSON.stringify(gl.body).slice(0, 150) : ''}`);
    if (gl.body?.id) {
      const upd = await req(academic, 'PATCH', `/master/grade-levels/${gl.body.id}`, { name: `GL Edit ${uniq()}` });
      report('PATCH /master/grade-levels/:id (EDIT)', upd.status === 200, `${upd.status} ${upd.status >= 400 ? JSON.stringify(upd.body).slice(0, 150) : ''}`);
    }
  }

  // ---------- PROGRAM + LEVEL + PACKAGE ----------
  let newProgramId, newLevelId, newPackageId;
  {
    const create = await req(academic, 'POST', '/programs', {
      name: `Program ${uniq()}`, code: `smk${seq}`,
      subjectId: refSubject?.id, description: 'smoke', isActive: true,
    });
    report('POST /programs', [200, 201].includes(create.status), `${create.status} ${create.status >= 400 ? JSON.stringify(create.body).slice(0, 200) : ''}`);
    newProgramId = create.body?.id;
    if (newProgramId) {
      const upd = await req(academic, 'PATCH', `/programs/${newProgramId}`, { name: `Program Edit ${uniq()}`, description: 'edited' });
      report('PATCH /programs/:id (EDIT)', upd.status === 200, `${upd.status} ${upd.status >= 400 ? JSON.stringify(upd.body).slice(0, 200) : ''}`);
    }
  }
  if (newProgramId) {
    const create = await req(academic, 'POST', '/levels', {
      programId: newProgramId, name: `Level ${uniq()}`,
      gradeLevelId: refGrade?.id, sortOrder: 1,
    });
    report('POST /levels', [200, 201].includes(create.status), `${create.status} ${create.status >= 400 ? JSON.stringify(create.body).slice(0, 200) : ''}`);
    newLevelId = create.body?.id;
    if (newLevelId) {
      const upd = await req(academic, 'PATCH', `/levels/${newLevelId}`, { name: `Level Edit ${uniq()}` });
      report('PATCH /levels/:id (EDIT)', upd.status === 200, `${upd.status} ${upd.status >= 400 ? JSON.stringify(upd.body).slice(0, 200) : ''}`);
      const pkg = await req(academic, 'POST', '/packages', {
        levelId: newLevelId, name: `Paket ${uniq()}`, code: `smk${seq}`,
        totalSessions: 8, durationWeeks: 4, price: 300000, description: 'smoke',
      });
      report('POST /packages', [200, 201].includes(pkg.status), `${pkg.status} ${pkg.status >= 400 ? JSON.stringify(pkg.body).slice(0, 200) : ''}`);
      newPackageId = pkg.body?.id;
      if (newPackageId) {
        const upd = await req(academic, 'PATCH', `/packages/${newPackageId}`, { name: `Paket Edit ${uniq()}`, totalSessions: 10 });
        report('PATCH /packages/:id (EDIT)', upd.status === 200, `${upd.status} ${upd.status >= 400 ? JSON.stringify(upd.body).slice(0, 200) : ''}`);
        const price = await req(finance, 'PATCH', `/packages/${newPackageId}/price`, { price: 350000 });
        report('PATCH /packages/:id/price (EDIT harga)', price.status === 200, `${price.status} ${price.status >= 400 ? JSON.stringify(price.body).slice(0, 200) : ''}`);
      }
    }
  }

  // ---------- KELOMPOK (fokus user) ----------
  {
    const create = await req(academic, 'POST', '/groups', {
      name: `Kelompok ${uniq()}`,
      programId: newProgramId ?? refProgram?.id,
      levelId: newLevelId ?? refLevel?.id,
      capacity: 8,
      code: `smk${seq}`,
    });
    report('POST /groups', [200, 201].includes(create.status), `${create.status} ${create.status >= 400 ? JSON.stringify(create.body).slice(0, 250) : ''}`);
    const gid = create.body?.id;
    if (gid) {
      let upd = await req(academic, 'PATCH', `/groups/${gid}`, { name: `Kelompok Edit ${uniq()}` });
      report('PATCH /groups/:id nama (EDIT)', upd.status === 200, `${upd.status} ${upd.status >= 400 ? JSON.stringify(upd.body).slice(0, 250) : ''}`);
      upd = await req(academic, 'PATCH', `/groups/${gid}`, {
        capacity: 12,
        programId: refProgram?.id,
        levelId: refLevel?.id,
        code: `smked${seq}`,
      });
      report('PATCH /groups/:id kapasitas+program+level+code (EDIT)', upd.status === 200, `${upd.status} ${upd.status >= 400 ? JSON.stringify(upd.body).slice(0, 250) : ''}`);
      const get = await req(academic, 'GET', `/groups/${gid}`);
      report('GET /groups/:id verifikasi edit', get.status === 200 && get.body?.capacity === 12 && get.body?.programId === refProgram?.id, `cap=${get.body?.capacity} prog=${get.body?.programId === refProgram?.id}`);
      upd = await req(academic, 'PATCH', `/groups/${gid}`, { isActive: false });
      report('PATCH /groups/:id nonaktif (EDIT)', upd.status === 200, `${upd.status} ${upd.status >= 400 ? JSON.stringify(upd.body).slice(0, 150) : ''}`);
      if (refStudent) {
        const add = await req(academic, 'POST', `/groups/${gid}/students`, { studentId: refStudent.id });
        report('POST /groups/:id/students', [200, 201, 400, 409].includes(add.status), `${add.status} ${add.status >= 400 ? JSON.stringify(add.body).slice(0, 150) : ''}`);
        const del = await req(academic, 'DELETE', `/groups/${gid}/students/${refStudent.id}`);
        report('DELETE /groups/:id/students/:sid', [200, 204].includes(del.status), `${del.status}`);
      }
      if (refTutor) {
        const add = await req(academic, 'POST', `/groups/${gid}/tutors`, { tutorId: refTutor.id, isLead: true });
        report('POST /groups/:id/tutors', [200, 201, 400, 409].includes(add.status), `${add.status} ${add.status >= 400 ? JSON.stringify(add.body).slice(0, 150) : ''}`);
      }
      const del = await req(academic, 'DELETE', `/groups/${gid}`);
      report('DELETE /groups/:id', [200, 204].includes(del.status), `${del.status} ${del.status >= 400 ? JSON.stringify(del.body).slice(0, 150) : ''}`);
    }
  }

  // ---------- SISWA / ORTU / TUTOR ----------
  let newStudentId, newParentId, newTutorId;
  {
    const create = await req(finance, 'POST', '/students', {
      name: `Siswa ${uniq()}`, email: `smk-siswa-${uniq().toLowerCase()}@test.id`,
      phone: uniqPhone(), schoolOrigin: 'SMK Test', nis: uniq().slice(0, 10),
      dateOfBirth: '2010-01-01', gender: 'M', address: 'Jl. Test',
      majorChoice1: 'Teknik', majorChoice2: 'Kedokteran',
    });
    report('POST /students', [200, 201].includes(create.status), `${create.status} ${create.status >= 400 ? JSON.stringify(create.body).slice(0, 200) : ''}`);
    newStudentId = create.body?.id;
    if (newStudentId) {
      const upd = await req(finance, 'PATCH', `/students/${newStudentId}`, {
        name: `Siswa Edit ${uniq()}`, schoolOrigin: 'SMK Edit', nis: `NIS-${uniq().slice(0, 6)}`,
        address: 'Jl. Edit', phone: uniqPhone(), dateOfBirth: '2010-02-02', gender: 'F',
        majorChoice1: 'Hukum', majorChoice2: 'Ekonomi',
      });
      report('PATCH /students/:id (EDIT lengkap)', upd.status === 200, `${upd.status} ${upd.status >= 400 ? JSON.stringify(upd.body).slice(0, 250) : ''}`);
      const get = await req(finance, 'GET', `/students/${newStudentId}`);
      report('GET /students/:id verifikasi edit', get.status === 200 && get.body?.schoolOrigin === 'SMK Edit' && get.body?.gender === 'F', `school=${get.body?.schoolOrigin} gender=${get.body?.gender}`);
    }
  }
  {
    const create = await req(finance, 'POST', '/parents', {
      name: `Ortu ${uniq()}`, email: `smk-ortu-${uniq().toLowerCase()}@test.id`, phone: uniqPhone(),
    });
    report('POST /parents', [200, 201].includes(create.status), `${create.status} ${create.status >= 400 ? JSON.stringify(create.body).slice(0, 200) : ''}`);
    newParentId = create.body?.id;
    if (newParentId) {
      const upd = await req(finance, 'PATCH', `/parents/${newParentId}`, { name: `Ortu Edit ${uniq()}`, phone: uniqPhone() });
      report('PATCH /parents/:id (EDIT)', upd.status === 200, `${upd.status} ${upd.status >= 400 ? JSON.stringify(upd.body).slice(0, 200) : ''}`);
      if (newStudentId) {
        const link = await req(finance, 'POST', '/parent-students', { parentId: newParentId, studentId: newStudentId });
        report('POST /parent-students (link)', [200, 201, 409].includes(link.status), `${link.status} ${link.status >= 400 ? JSON.stringify(link.body).slice(0, 150) : ''}`);
        const unlink = await req(finance, 'DELETE', `/parent-students/${newParentId}/${newStudentId}`);
        report('DELETE /parent-students (unlink)', [200, 204].includes(unlink.status), `${unlink.status}`);
      }
    }
  }
  {
    const create = await req(academic, 'POST', '/tutors', {
      name: `Tutor ${uniq()}`, email: `smk-tutor-${uniq().toLowerCase()}@test.id`,
      phone: uniqPhone(), specialization: 'Matematika', bio: 'bio smoke',
    });
    report('POST /tutors', [200, 201].includes(create.status), `${create.status} ${create.status >= 400 ? JSON.stringify(create.body).slice(0, 200) : ''}`);
    newTutorId = create.body?.id;
    if (newTutorId) {
      const upd = await req(academic, 'PATCH', `/tutors/${newTutorId}`, { specialization: 'Fisika', name: `Tutor Edit ${uniq()}`, bio: 'bio edit' });
      report('PATCH /tutors/:id (EDIT)', upd.status === 200, `${upd.status} ${upd.status >= 400 ? JSON.stringify(upd.body).slice(0, 200) : ''}`);
    }
  }

  // ---------- CONTENT CATEGORY ----------
  {
    const create = await req(academic, 'POST', '/content-categories', { name: `Kategori ${uniq()}`, sortOrder: 50 });
    report('POST /content-categories', [200, 201].includes(create.status), `${create.status} ${create.status >= 400 ? JSON.stringify(create.body).slice(0, 200) : ''}`);
    const cid = create.body?.id;
    if (cid) {
      const upd = await req(academic, 'PATCH', `/content-categories/${cid}`, { name: `Kategori Edit ${uniq()}` });
      report('PATCH /content-categories/:id (EDIT)', upd.status === 200, `${upd.status} ${upd.status >= 400 ? JSON.stringify(upd.body).slice(0, 200) : ''}`);
      const del = await req(academic, 'DELETE', `/content-categories/${cid}`);
      report('DELETE /content-categories/:id', [200, 204, 400].includes(del.status), `${del.status}`);
    }
  }

  // ---------- MATERI ----------
  {
    const create = await req(tutor ?? academic, 'POST', '/materials', {
      title: `Materi ${uniq()}`,
      levelId: refLevel?.id,
      subjectId: refSubject?.id,
      category: 'materi',
      content: '<p>konten smoke</p>',
    });
    report('POST /materials', [200, 201].includes(create.status), `${create.status} ${create.status >= 400 ? JSON.stringify(create.body).slice(0, 250) : ''}`);
    const mid = create.body?.id;
    if (mid) {
      const upd = await req(tutor ?? academic, 'PATCH', `/materials/${mid}`, {
        title: `Materi Edit ${uniq()}`, content: '<p>konten diedit</p>',
      });
      report('PATCH /materials/:id (EDIT)', upd.status === 200, `${upd.status} ${upd.status >= 400 ? JSON.stringify(upd.body).slice(0, 250) : ''}`);
      const del = await req(tutor ?? academic, 'DELETE', `/materials/${mid}`);
      report('DELETE /materials/:id', [200, 204].includes(del.status), `${del.status}`);
    }
  }

  // ---------- SOAL ----------
  {
    const create = await req(tutor ?? academic, 'POST', '/questions', {
      subjectId: refSubject?.id,
      levelId: refLevel?.id,
      type: 'SINGLE_CHOICE',
      content: `Soal smoke ${uniq()}?`,
      options: [
        { content: 'A satu', isCorrect: true, sortOrder: 0 },
        { content: 'B dua', isCorrect: false, sortOrder: 1 },
      ],
    });
    report('POST /questions', [200, 201].includes(create.status), `${create.status} ${create.status >= 400 ? JSON.stringify(create.body).slice(0, 250) : ''}`);
    const qid = create.body?.id;
    if (qid) {
      const upd = await req(tutor ?? academic, 'PATCH', `/questions/${qid}`, {
        content: `Soal diedit ${uniq()}?`,
        options: [
          { content: 'A satu edit', isCorrect: false, sortOrder: 0 },
          { content: 'B dua edit', isCorrect: true, sortOrder: 1 },
          { content: 'C tiga', isCorrect: false, sortOrder: 2 },
        ],
      });
      report('PATCH /questions/:id (EDIT + opsi)', upd.status === 200, `${upd.status} ${upd.status >= 400 ? JSON.stringify(upd.body).slice(0, 250) : ''}`);
      const get = await req(academic, 'GET', `/questions/${qid}`);
      const opts = get.body?.options ?? [];
      report('GET /questions/:id verifikasi opsi edit', get.status === 200 && opts.length === 3 && opts.some((o) => o.isCorrect && /edit/i.test(o.content ?? '')), `opsi=${opts.length}`);
      const del = await req(tutor ?? academic, 'DELETE', `/questions/${qid}`);
      report('DELETE /questions/:id', [200, 204].includes(del.status), `${del.status}`);
    }
  }

  // ---------- LATSOL ----------
  {
    const q = await req(tutor ?? academic, 'POST', '/questions', {
      subjectId: refSubject?.id, levelId: refLevel?.id, type: 'SINGLE_CHOICE',
      content: `Soal latsol ${uniq()}?`,
      options: [
        { content: 'jawab', isCorrect: true, sortOrder: 0 },
        { content: 'salah', isCorrect: false, sortOrder: 1 },
      ],
    });
    const qid = q.body?.id;
    const create = await req(tutor ?? academic, 'POST', '/latsol/packages', {
      title: `Latsol ${uniq()}`,
      levelId: refLevel?.id, subjectId: refSubject?.id,
      questionIds: qid ? [qid] : [],
    });
    report('POST /latsol/packages', [200, 201].includes(create.status), `${create.status} ${create.status >= 400 ? JSON.stringify(create.body).slice(0, 250) : ''}`);
    const lid = create.body?.id;
    if (lid) {
      const upd = await req(tutor ?? academic, 'PATCH', `/latsol/packages/${lid}`, { title: `Latsol Edit ${uniq()}` });
      report('PATCH /latsol/packages/:id (EDIT)', upd.status === 200, `${upd.status} ${upd.status >= 400 ? JSON.stringify(upd.body).slice(0, 250) : ''}`);
      const del = await req(tutor ?? academic, 'DELETE', `/latsol/packages/${lid}`);
      report('DELETE /latsol/packages/:id', [200, 204].includes(del.status), `${del.status}`);
    }
    if (qid) await req(academic, 'DELETE', `/questions/${qid}`);
  }

  // ---------- UJIAN ----------
  {
    const q = await req(tutor ?? academic, 'POST', '/questions', {
      subjectId: refSubject?.id, levelId: refLevel?.id, type: 'SINGLE_CHOICE',
      content: `Soal ujian ${uniq()}?`,
      options: [
        { content: 'benar', isCorrect: true, sortOrder: 0 },
        { content: 'salah', isCorrect: false, sortOrder: 1 },
      ],
    });
    const qid = q.body?.id;
    const create = await req(tutor ?? academic, 'POST', '/exams', {
      title: `Ujian ${uniq()}`,
      levelId: refLevel?.id, subjectId: refSubject?.id,
      scheduledStartAt: new Date(Date.now() + 3600e3).toISOString(),
      scheduledEndAt: new Date(Date.now() + 7200e3).toISOString(),
      durationMinutes: 60,
      questionIds: qid ? [qid] : [],
      points: [10],
    });
    report('POST /exams', [200, 201].includes(create.status), `${create.status} ${create.status >= 400 ? JSON.stringify(create.body).slice(0, 250) : ''}`);
    const eid = create.body?.id;
    if (eid) {
      const upd = await req(tutor ?? academic, 'PATCH', `/exams/${eid}`, { title: `Ujian Edit ${uniq()}`, durationMinutes: 90 });
      report('PATCH /exams/:id (EDIT)', upd.status === 200, `${upd.status} ${upd.status >= 400 ? JSON.stringify(upd.body).slice(0, 250) : ''}`);
      const pub = await req(academic, 'POST', `/exams/${eid}/publish`);
      report('POST /exams/:id/publish', [200, 201, 400].includes(pub.status), `${pub.status} ${pub.status >= 400 ? JSON.stringify(pub.body).slice(0, 150) : ''}`);
      const del = await req(academic, 'DELETE', `/exams/${eid}`);
      report('DELETE /exams/:id', [200, 204].includes(del.status), `${del.status}`);
    }
    if (qid) await req(academic, 'DELETE', `/questions/${qid}`);
  }

  // ---------- JADWAL & SESI + FASILITAS ----------
  let newBuildingId, newRoomId;
  {
    const b = await req(academic, 'POST', '/buildings', { name: `Gedung ${uniq()}`, address: 'Jl. Test' });
    report('POST /buildings', [200, 201].includes(b.status), `${b.status} ${b.status >= 400 ? JSON.stringify(b.body).slice(0, 150) : ''}`);
    newBuildingId = b.body?.id;
    if (newBuildingId) {
      const r = await req(academic, 'POST', '/rooms', { buildingId: newBuildingId, name: `Ruang ${uniq()}`, capacity: 20 });
      report('POST /rooms', [200, 201].includes(r.status), `${r.status} ${r.status >= 400 ? JSON.stringify(r.body).slice(0, 150) : ''}`);
      newRoomId = r.body?.id;
      if (newRoomId) {
        const upd = await req(academic, 'PATCH', `/rooms/${newRoomId}`, { name: `Ruang Edit ${uniq()}`, capacity: 25 });
        report('PATCH /rooms/:id (EDIT)', upd.status === 200, `${upd.status} ${upd.status >= 400 ? JSON.stringify(upd.body).slice(0, 150) : ''}`);
      }
    }
  }
  {
    const create = await req(academic, 'POST', '/schedules', {
      groupId: refGroup?.id,
      dayOfWeek: 3,
      startMin: 960, endMin: 1080, // 16:00-18:00
      validFrom: new Date().toISOString().slice(0, 10),
      roomId: newRoomId,
      tutorId: refTutor?.id,
    });
    report('POST /schedules', [200, 201].includes(create.status), `${create.status} ${create.status >= 400 ? JSON.stringify(create.body).slice(0, 250) : ''}`);
    const schedId = create.body?.id;
    if (schedId) {
      const upd = await req(academic, 'PATCH', `/schedules/${schedId}`, { startMin: 1020, endMin: 1140 });
      report('PATCH /schedules/:id (EDIT)', upd.status === 200, `${upd.status} ${upd.status >= 400 ? JSON.stringify(upd.body).slice(0, 250) : ''}`);
      const gen = await req(academic, 'POST', `/schedules/${schedId}/generate`, { weeks: 2 });
      report('POST /schedules/:id/generate', [200, 201, 400].includes(gen.status), `${gen.status} ${gen.status >= 400 ? JSON.stringify(gen.body).slice(0, 150) : ''}`);
      const del = await req(academic, 'DELETE', `/schedules/${schedId}`);
      report('DELETE /schedules/:id', [200, 204].includes(del.status), `${del.status} ${del.status >= 400 ? JSON.stringify(del.body).slice(0, 150) : ''}`);
    }
  }
  {
    const s = await req(academic, 'POST', '/sessions', {
      groupId: refGroup?.id,
      startsAt: new Date(Date.now() + 86400e3).toISOString(),
      endsAt: new Date(Date.now() + 86400e3 + 7200e3).toISOString(),
    });
    report('POST /sessions', [200, 201].includes(s.status), `${s.status} ${s.status >= 400 ? JSON.stringify(s.body).slice(0, 250) : ''}`);
    const sid = s.body?.id;
    if (sid) {
      const upd = await req(academic, 'PATCH', `/sessions/${sid}`, {
        startsAt: new Date(Date.now() + 86400e3 + 1800e3).toISOString(),
      });
      report('PATCH /sessions/:id (EDIT)', upd.status === 200, `${upd.status} ${upd.status >= 400 ? JSON.stringify(upd.body).slice(0, 250) : ''}`);
      // absensi siswa
      if (refStudent) {
        const att = await req(tutor ?? academic, 'POST', `/sessions/${sid}/attendance`, { studentId: refStudent.id, status: 'PRESENT' });
        report('POST /sessions/:id/attendance', [200, 201, 400].includes(att.status), `${att.status} ${att.status >= 400 ? JSON.stringify(att.body).slice(0, 150) : ''}`);
        const attUpd = await req(tutor ?? academic, 'PATCH', `/sessions/${sid}/attendance/${refStudent.id}`, { status: 'LATE', note: 'smoke' });
        report('PATCH /sessions/:id/attendance/:sid (EDIT absensi)', [200, 400].includes(attUpd.status), `${attUpd.status} ${attUpd.status >= 400 ? JSON.stringify(attUpd.body).slice(0, 150) : ''}`);
      }
      const del = await req(academic, 'DELETE', `/sessions/${sid}`);
      report('DELETE /sessions/:id', [200, 204].includes(del.status), `${del.status}`);
    }
  }
  if (newRoomId) {
    const d = await req(academic, 'DELETE', `/rooms/${newRoomId}`);
    report('DELETE /rooms/:id', [200, 204].includes(d.status), `${d.status}`);
  }
  if (newBuildingId) {
    const d = await req(academic, 'DELETE', `/buildings/${newBuildingId}`);
    report('DELETE /buildings/:id', [200, 204].includes(d.status), `${d.status}`);
  }

  // ---------- FINANCE: akun, budget, expense ----------
  let accountId;
  {
    const a = await req(finance, 'POST', '/financial-accounts', { name: `Kas ${uniq()}`, type: 'CASH' });
    report('POST /financial-accounts', [200, 201].includes(a.status), `${a.status} ${a.status >= 400 ? JSON.stringify(a.body).slice(0, 200) : ''}`);
    accountId = a.body?.id;
    if (accountId) {
      const upd = await req(finance, 'PATCH', `/financial-accounts/${accountId}`, { name: `Kas Edit ${uniq()}` });
      report('PATCH /financial-accounts/:id (EDIT)', upd.status === 200, `${upd.status} ${upd.status >= 400 ? JSON.stringify(upd.body).slice(0, 150) : ''}`);
    }
  }
  {
    const b = await req(finance, 'POST', '/budgets', { category: 'MARKETING', period: '2026-11', amount: 1000000, description: 'smoke' });
    report('POST /budgets', [200, 201, 409].includes(b.status), `${b.status} ${b.status >= 400 ? JSON.stringify(b.body).slice(0, 200) : ''}`);
    const bid = b.body?.id;
    if (bid) {
      const upd = await req(finance, 'PATCH', `/budgets/${bid}`, { amount: 1500000 });
      report('PATCH /budgets/:id (EDIT)', upd.status === 200, `${upd.status} ${upd.status >= 400 ? JSON.stringify(upd.body).slice(0, 150) : ''}`);
      const del = await req(finance, 'DELETE', `/budgets/${bid}`);
      report('DELETE /budgets/:id', [200, 204].includes(del.status), `${del.status}`);
    }
  }
  {
    const e = await req(finance, 'POST', '/expenses', {
      amount: 75000, description: `Belanja ${uniq()}`, category: 'LAIN_LAIN',
      occurredAt: new Date().toISOString().slice(0, 10), accountId,
    });
    report('POST /expenses', [200, 201].includes(e.status), `${e.status} ${e.status >= 400 ? JSON.stringify(e.body).slice(0, 200) : ''}`);
    const eid = e.body?.id;
    if (eid) {
      const upd = await req(finance, 'PATCH', `/expenses/${eid}`, { amount: 90000, description: 'Belanja diedit' });
      report('PATCH /expenses/:id (EDIT)', upd.status === 200, `${upd.status} ${upd.status >= 400 ? JSON.stringify(upd.body).slice(0, 200) : ''}`);
      const del = await req(finance, 'DELETE', `/expenses/${eid}`);
      report('DELETE /expenses/:id', [200, 204].includes(del.status), `${del.status}`);
    }
  }
  if (accountId) {
    const del = await req(finance, 'DELETE', `/financial-accounts/${accountId}`);
    report('DELETE /financial-accounts/:id', [200, 204, 400, 409].includes(del.status), `${del.status}`);
  }

  // ---------- INVOICE + PAYMENT ----------
  {
    const inv = await req(finance, 'POST', '/invoices', {
      studentId: refStudent?.id,
      packageId: refPackage?.id,
      dueDate: new Date(Date.now() + 7 * 86400e3).toISOString().slice(0, 10),
      items: [{ description: 'Uang les test', quantity: 1, unitPrice: 100000 }],
    });
    report('POST /invoices', [200, 201].includes(inv.status), `${inv.status} ${inv.status >= 400 ? JSON.stringify(inv.body).slice(0, 250) : ''}`);
    const invId = inv.body?.id;
    if (invId) {
      const issue = await req(finance, 'PATCH', `/invoices/${invId}/issue`);
      report('PATCH /invoices/:id/issue', [200, 201].includes(issue.status), `${issue.status} ${issue.status >= 400 ? JSON.stringify(issue.body).slice(0, 150) : ''}`);
      const disc = await req(finance, 'POST', `/invoices/${invId}/discount`, { amount: 10000, reason: 'bantuan smoke' });
      report('POST /invoices/:id/discount', [200, 201].includes(disc.status), `${disc.status} ${disc.status >= 400 ? JSON.stringify(disc.body).slice(0, 150) : ''}`);
      const pay = await req(finance, 'POST', '/payments/cash', { invoiceId: invId, amount: 90000, method: 'CASH' });
      report('POST /payments/cash', [200, 201].includes(pay.status), `${pay.status} ${pay.status >= 400 ? JSON.stringify(pay.body).slice(0, 200) : ''}`);
      const payId = pay.body?.id;
      if (payId) {
        const ver = await req(finance, 'PATCH', `/payments/${payId}/verify`, { approve: true });
        report('PATCH /payments/:id/verify', [200, 201].includes(ver.status), `${ver.status} ${ver.status >= 400 ? JSON.stringify(ver.body).slice(0, 150) : ''}`);
      }
      const voided = await req(finance, 'PATCH', `/invoices/${invId}/void`);
      report('PATCH /invoices/:id/void', [200, 201, 400].includes(voided.status), `${voided.status} ${voided.status >= 400 ? JSON.stringify(voided.body).slice(0, 150) : ''}`);
    }
  }

  // ---------- AKUN USER ----------
  {
    const u = await req(finance, 'POST', '/users', {
      name: `Akun ${uniq()}`, email: `smk-akun-${uniq().toLowerCase()}@test.id`, tempPassword: 'Test1234!',
    });
    report('POST /users', [200, 201].includes(u.status), `${u.status} ${u.status >= 400 ? JSON.stringify(u.body).slice(0, 200) : ''}`);
    const uid = u.body?.id;
    if (uid) {
      const upd = await req(finance, 'PATCH', `/users/${uid}`, { name: `Akun Edit ${uniq()}`, phone: uniqPhone() });
      report('PATCH /users/:id (EDIT)', upd.status === 200, `${upd.status} ${upd.status >= 400 ? JSON.stringify(upd.body).slice(0, 200) : ''}`);
      const deact = await req(finance, 'POST', `/users/${uid}/deactivate`);
      report('POST /users/:id/deactivate', [200, 201].includes(deact.status), `${deact.status}`);
      const act = await req(finance, 'POST', `/users/${uid}/activate`);
      report('POST /users/:id/activate', [200, 201].includes(act.status), `${act.status}`);
      const del = await req(finance, 'DELETE', `/users/${uid}`);
      report('DELETE /users/:id', [200, 204].includes(del.status), `${del.status}`);
    }
  }

  // ---------- ENROLLMENT FLOW ----------
  {
    const enr = await req(parent ?? finance, 'POST', '/me/enrollments', {
      childName: `Anak ${uniq()}`,
      programId: refProgram?.id,
      levelId: refLevel?.id,
      paymentPlan: 'MONTHLY',
    });
    report('POST /me/enrollments (ortu daftar anak)', [200, 201].includes(enr.status), `${enr.status} ${enr.status >= 400 ? JSON.stringify(enr.body).slice(0, 250) : ''}`);
    const enrId = enr.body?.id ?? enr.body?.enrollment?.id;
    if (enrId) {
      const acc = await req(academic, 'POST', `/enrollments/${enrId}/accept`, {});
      report('POST /enrollments/:id/accept', [200, 201].includes(acc.status), `${acc.status} ${acc.status >= 400 ? JSON.stringify(acc.body).slice(0, 200) : ''}`);
      if (acc.status < 300) {
        const disc = await req(finance, 'POST', `/enrollments/${enrId}/discount`, { amount: 5000, reason: 'smoke', months: 2 });
        report('POST /enrollments/:id/discount (per angsuran)', [200, 201].includes(disc.status), `${disc.status} ${disc.status >= 400 ? JSON.stringify(disc.body).slice(0, 200) : ''}`);
        const place = await req(academic, 'POST', `/enrollments/${enrId}/place`, { groupId: refGroup?.id });
        report('POST /enrollments/:id/place', [200, 201, 400].includes(place.status), `${place.status} ${place.status >= 400 ? JSON.stringify(place.body).slice(0, 200) : ''}`);
      }
    }
  }

  // ---------- SEMUA REPORT ----------
  {
    const kinds = await req(finance, 'GET', '/reports/kinds');
    if (Array.isArray(kinds.body)) {
      for (const k of kinds.body) {
        const r = await req(finance, 'GET', `/reports/${k.kind}`);
        report(`GET /reports/${k.kind}`, r.status === 200, `${r.status} ${r.status >= 400 ? JSON.stringify(r.body).slice(0, 150) : ''}`);
      }
    }
  }

  // ---------- HALAMAN PER ROLE ----------
  const roleChecks = [
    ['siswa', siswa, ['/me/enrollments', '/me/invoices', '/materials', '/latsol/packages', '/exams-available', '/notifications/mine', '/attendance/mine-student']],
    ['ortu', parent, ['/me/enrollments', '/me/invoices', '/me/children', '/notifications/mine', '/attendance/mine-children', '/me/receipts']],
    ['tutor', tutor, ['/groups/mine', '/attendance/tutor', '/materials', '/exams', '/latsol/packages', '/notifications/mine']],
    ['academic', academic, ['/groups', '/enrollments', '/materials', '/exams', '/latsol/packages', '/attendance/recap']],
  ];
  for (const [name, tok, paths] of roleChecks) {
    if (!tok) continue;
    for (const p of paths) {
      const r = await req(tok, 'GET', p);
      report(`GET ${p} (${name})`, r.status === 200, `${r.status} ${r.status >= 400 ? JSON.stringify(r.body).slice(0, 120) : ''}`);
    }
  }

  const fails = results.filter((r) => !r.ok);
  console.log(`\n=== HASIL: ${results.length - fails.length} pass, ${fails.length} FAIL dari ${results.length} cek ===`);
  if (fails.length) {
    console.log('\nYANG GAGAL:');
    fails.forEach((f) => console.log(`  - ${f.name}: ${f.detail}`));
  }
}

main().catch((e) => { console.error('SMOKE ERROR:', e); process.exit(1); });
