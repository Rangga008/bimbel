/* E2E alur pendaftaran brosur — jalan sekali, bisa dihapus setelah verifikasi. */
const API = 'http://localhost:3000/api';
const stamp = Date.now().toString(36);
const phone = `081${stamp.slice(-9).padStart(9, '0')}`;

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text.slice(0, 200); }
  return { status: res.status, data };
}

const ok = (cond, label, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${label} ${extra}`);
  if (!cond) process.exitCode = 1;
};

// 1. Register ortu dengan no HP
const regRes = await call('POST', '/auth/register', {
  body: {
    name: 'Ortu E2E Brosur',
    email: `ortu.e2e.${stamp}@bimbel.test`,
    phone,
    password: 'Ortu12345!',
  },
});
ok(regRes.status === 201 || regRes.status === 200, 'register ortu', `(${regRes.status}) ${regRes.status >= 400 ? JSON.stringify(regRes.data) : ''}`);
const parentToken = regRes.data.accessToken;

// 2. Login via EMAIL
const loginEmail = await call('POST', '/auth/login', {
  body: { identifier: `ortu.e2e.${stamp}@bimbel.test`, password: 'Ortu12345!' },
});
ok(!!loginEmail.data.accessToken, 'login via email', `(${loginEmail.status})`);

// 3. Login via NO HP
const loginPhone = await call('POST', '/auth/login', {
  body: { identifier: phone, password: 'Ortu12345!' },
});
ok(!!loginPhone.data.accessToken, 'login via nomor HP', `(${loginPhone.status}) ${loginPhone.status !== 200 ? JSON.stringify(loginPhone.data) : ''}`);
const pToken = loginPhone.data.accessToken ?? parentToken;

// 4. Katalog brosur: kategori REGULER/EXTRA/PRIVAT
const catalog = await call('GET', '/programs/catalog', { token: pToken });
const cats = new Set((catalog.data ?? []).map((p) => p.category));
ok(cats.has('REGULER') && cats.has('EXTRA') && cats.has('PRIVAT'), 'katalog kategori brosur', `(${[...cats].join(',')})`);
const byCat = cat => catalog.data.find(p => p.category === cat && p.levels?.length);
const reguler = byCat('REGULER');
const level = reguler?.levels.find(l => l.price);
ok(!!reguler && !!level, 'program reguler + level berharga', `(${reguler?.name} / ${level?.name} ${level?.price}/${level?.priceUnit})`);
ok((level?.levelSubjects?.length ?? 0) >= 3, 'level reguler multi-mapel', `(${level?.levelSubjects?.length} mapel)`);

// 5. Ortu membuat pendaftaran → akun anak nonaktif + invoice
const enr = await call('POST', '/me/enrollments', {
  token: pToken,
  body: {
    childName: 'Anak E2E Brosur',
    programId: reguler.id,
    levelId: level.id,
    gender: 'M',
    schoolOrigin: 'SDN Contoh 1',
    dateOfBirth: '2016-05-12',
  },
});
ok(enr.status === 201 || enr.status === 200, 'buat pendaftaran', `(${enr.status}) ${enr.status >= 400 ? JSON.stringify(enr.data) : ''}`);
const enrId = enr.data.id;
const invoice = enr.data.invoice;
ok(!!invoice && invoice.items.length === 2, 'invoice = biaya daftar + bulan pertama', `(${invoice?.number} items=${invoice?.items?.length} total=${invoice?.totalAmount})`);
ok(enr.data.student.user.isActive === false, 'akun anak nonaktif sebelum verifikasi');

// 6. Akun anak tidak bisa login (belum ada kredensial + isActive false — cukup cek flag)

// 7. Finance bayar tunai → invoice lunas → enrollment PAID
const fLogin = await call('POST', '/auth/login', {
  body: { identifier: 'adminfinance1@bimbel.test', password: 'AdminFinance123!' },
});
ok(!!fLogin.data.accessToken, 'login finance', `(${fLogin.status})`);
const fToken = fLogin.data.accessToken;
const cash = await call('POST', '/payments/cash', {
  token: fToken,
  body: { invoiceId: invoice.id, amount: Number(invoice.totalAmount), note: 'E2E pembayaran pendaftaran' },
});
ok(cash.status === 201 || cash.status === 200, 'finance catat pembayaran tunai', `(${cash.status}) ${cash.status >= 400 ? JSON.stringify(cash.data) : ''}`);

const enrAfterPay = (await call('GET', `/enrollments?status=PAID`, { token: fToken })).data.find(e => e.id === enrId);
ok(enrAfterPay?.status === 'PAID', 'enrollment PAID setelah invoice lunas', `(${enrAfterPay?.status})`);

// 8. Finance verifikasi → ACCEPTED + akun anak aktif
const accept = await call('POST', `/enrollments/${enrId}/accept`, { token: fToken, body: { notes: 'E2E verified' } });
ok(accept.data.status === 'ACCEPTED', 'finance terima pendaftaran', `(${accept.data.status ?? accept.status})`);
ok(accept.data.student?.isActive === true && accept.data.student?.user?.isActive === true, 'akun anak aktif setelah diterima');

// 9. Academic: buat kelompok REG jenjang tsb lalu tempatkan
const aLogin = await call('POST', '/auth/login', {
  body: { identifier: 'adminacademic1@bimbel.test', password: 'AdminAcademic123!' },
});
const aToken = aLogin.data.accessToken;
const grp = await call('POST', '/groups', {
  token: aToken,
  body: { name: `E2E ${reguler.code}-${level.name}`, programId: reguler.id, levelId: level.id },
});
ok(grp.status === 201 || grp.status === 200, 'academic buat kelompok', `(${grp.status}) ${grp.status >= 400 ? JSON.stringify(grp.data) : ''}`);
const place = await call('POST', `/enrollments/${enrId}/place`, {
  token: aToken,
  body: { groupId: grp.data.id },
});
ok(place.data.status === 'PLACED', 'academic tempatkan ke kelompok', `(${place.data.status ?? place.status}) ${place.status >= 400 ? JSON.stringify(place.data) : ''}`);

// 10. Ortu melihat status akhir
const mine = await call('GET', '/me/enrollments', { token: pToken });
const mineRow = mine.data.find(e => e.id === enrId);
ok(mineRow?.status === 'PLACED' && mineRow?.group?.id === grp.data.id, 'ortu melihat status PLACED + kelompok', `(${mineRow?.group?.name})`);
console.log('DONE');
