"use client";
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ListPager } from '@/components/shared/list-pager';
import { apiFetch } from '@/lib/api-client';
import { PaymentsEmpty, PaymentsTable, VerifyDialog, usePaymentsList } from '@/components/phase2b/payment-shared';

/** Bulan ini, format input[type=month] → YYYY-MM. */
function defaultMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function monthRange(month: string) {
  // month = "YYYY-MM" → { from: awal bulan, to: akhir bulan }
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return {};
  const last = new Date(y, m, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

interface Opts {
  students: { id: string; user: { name: string } }[];
  groups: { id: string; name: string }[];
  levels: { id: string; name: string }[];
}
interface SharedFilters {
  channel: string;
  studentId: string;
  groupId: string;
  levelId: string;
}

const SEL = 'h-9 rounded-md border border-input bg-background px-3 text-sm';

function FilterSelects({ f, set, o }: { f: SharedFilters; set: (k: keyof SharedFilters, v: string) => void; o: Opts }) {
  return (
    <>
      <select className={SEL} value={f.channel} onChange={(e) => set('channel', e.target.value)} aria-label="Filter channel">
        <option value="">Semua channel</option>
        <option value="MANUAL">MANUAL</option>
        <option value="GATEWAY">GATEWAY</option>
        <option value="CASH">CASH</option>
      </select>
      <select className={SEL} value={f.studentId} onChange={(e) => set('studentId', e.target.value)} aria-label="Filter siswa">
        <option value="">Semua siswa</option>
        {o.students.map((s) => (
          <option key={s.id} value={s.id}>{s.user.name}</option>
        ))}
      </select>
      <select className={SEL} value={f.groupId} onChange={(e) => set('groupId', e.target.value)} aria-label="Filter kelompok">
        <option value="">Semua kelompok</option>
        {o.groups.map((g) => (
          <option key={g.id} value={g.id}>{g.name}</option>
        ))}
      </select>
      <select className={SEL} value={f.levelId} onChange={(e) => set('levelId', e.target.value)} aria-label="Filter jenjang">
        <option value="">Semua jenjang</option>
        {o.levels.map((l) => (
          <option key={l.id} value={l.id}>{l.name}</option>
        ))}
      </select>
    </>
  );
}

/** Tampilan lanjutan: riwayat pembayaran per bulan + filter + pager. */
function ProofsHistory({
  o,
  filters,
  setFilter,
  onBack,
}: {
  o: Opts;
  filters: SharedFilters;
  setFilter: (k: keyof SharedFilters, v: string) => void;
  onBack: () => void;
}) {
  const [histMonth, setHistMonth] = useState(defaultMonth);
  const [histStatus, setHistStatus] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const histQ = usePaymentsList({
    status: histStatus,
    ...filters,
    ...monthRange(histMonth),
  });
  const rows = histQ.data ?? [];
  const pageCount = Math.ceil(rows.length / pageSize);
  const paged = rows.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Riwayat Bukti Pembayaran</h1>
          <p className="text-sm text-muted-foreground">
            {histQ.data ? `${rows.length} pembayaran` : 'Memuat…'} — pilih bulan & filter di bawah.
          </p>
        </div>
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="size-4" /> Kembali ke Antrean
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          type="month"
          className={SEL}
          value={histMonth}
          onChange={(e) => { setHistMonth(e.target.value); setPage(0); }}
          aria-label="Bulan riwayat"
        />
        <select className={SEL} value={histStatus} onChange={(e) => { setHistStatus(e.target.value); setPage(0); }} aria-label="Filter status">
          <option value="">Semua status</option>
          <option value="VERIFIED">Terverifikasi</option>
          <option value="REJECTED">Ditolak</option>
          <option value="PENDING">Pending</option>
        </select>
        <FilterSelects f={filters} set={(k, v) => { setFilter(k, v); setPage(0); }} o={o} />
      </div>

      {histQ.isLoading ? <Skeleton className="h-32 w-full" /> : null}
      {paged.length > 0 ? (
        <PaymentsTable items={paged} canVerify={false} onVerify={() => undefined} />
      ) : null}
      {!histQ.isLoading && rows.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Tidak ada pembayaran pada bulan/filter ini.</CardContent></Card>
      ) : null}
      <ListPager
        page={page}
        pageCount={pageCount}
        total={rows.length}
        shown={pageSize}
        onPageChange={setPage}
        pageSize={pageSize}
        onPageSizeChange={(s) => { setPageSize(s); setPage(0); }}
      />
    </div>
  );
}

/**
 * Fase 2b — Halaman "Bukti" (Admin Finance).
 * Tampilan utama: antrean PENDING saja. Riwayat dibuka sebagai tampilan
 * lanjutan (filter per bulan + status/channel/siswa/kelompok + pager).
 */
export function ProofsManager({ canVerify = true }: { canVerify?: boolean }) {
  const [view, setView] = useState<'queue' | 'history'>('queue');
  const [channel, setChannel] = useState('');
  const [studentId, setStudentId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [levelId, setLevelId] = useState('');
  const [verifyId, setVerifyId] = useState<string | null>(null);

  const studentsQ = useQuery({
    queryKey: ['students-lite'],
    queryFn: () => apiFetch<{ id: string; user: { name: string } }[]>('/students'),
  });
  const groupsQ = useQuery({
    queryKey: ['groups-lite'],
    queryFn: () => apiFetch<{ id: string; name: string }[]>('/groups'),
  });
  const levelsQ = useQuery({
    queryKey: ['levels-lite'],
    queryFn: () => apiFetch<{ id: string; name: string }[]>('/levels'),
  });

  const filters: SharedFilters = { channel, studentId, groupId, levelId };
  const setFilter = (k: keyof SharedFilters, v: string) => {
    if (k === 'channel') setChannel(v);
    else if (k === 'studentId') setStudentId(v);
    else if (k === 'groupId') setGroupId(v);
    else setLevelId(v);
  };
  const opts: Opts = {
    students: studentsQ.data ?? [],
    groups: groupsQ.data ?? [],
    levels: levelsQ.data ?? [],
  };
  const queueQ = usePaymentsList({ status: 'PENDING', ...filters });

  if (view === 'history') {
    return (
      <ProofsHistory
        o={opts}
        filters={filters}
        setFilter={setFilter}
        onBack={() => setView('queue')}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bukti Pembayaran</h1>
          <p className="text-sm text-muted-foreground">Antrean bukti yang menunggu verifikasi.</p>
        </div>
        <Button variant="outline" onClick={() => setView('history')}>
          <History className="size-4" /> Riwayat Verifikasi
        </Button>
      </div>

      <div className="flex flex-wrap gap-2"><FilterSelects f={filters} set={setFilter} o={opts} /></div>

      <h2 className="text-lg font-medium">Menunggu verifikasi ({queueQ.data?.length ?? '…'})</h2>
      <PaymentsEmpty isLoading={queueQ.isLoading} isError={queueQ.isError} count={queueQ.data?.length} />
      {(queueQ.data?.length ?? 0) > 0 ? (
        <PaymentsTable items={queueQ.data ?? []} canVerify={canVerify} onVerify={setVerifyId} />
      ) : null}
      <p className="text-xs text-muted-foreground">Kolom Aksi di tiap baris: setujui (terbit kwitansi) atau tolak dengan alasan.</p>

      <VerifyDialog verifyId={verifyId} onClose={() => setVerifyId(null)} />
    </div>
  );
}

export function useMeInvoices(childId: string) {
  return useQuery({
    queryKey: ['me-invoices', childId],
    queryFn: () => apiFetch<ChildInvoiceRow[]>(`/me/invoices${childId ? `?studentId=${childId}` : ''}`),
  });
}

export interface ChildInvoiceRow {
  id: string;
  number: string;
  totalAmount: string | number;
  amountPaid: string | number;
  dueDate?: string | null;
  student: { id: string; user: { name: string } };
  package?: { name: string } | null;
  enrollmentLink?: {
    program: { name: string } | null;
    level: { name: string } | null;
    group: { name: string } | null;
  } | null;
  enrollment?: {
    program: { name: string } | null;
    level: { name: string } | null;
    group: { name: string } | null;
  } | null;
  items: Array<{ description: string }>;
}

export function sisaInv(inv: ChildInvoiceRow) {
  return Number(inv.totalAmount) - Number(inv.amountPaid);
}
