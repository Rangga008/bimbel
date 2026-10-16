"use client";
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api-client';
import type { PaymentListItem } from '@/lib/phase2b-types';
import { PaymentsEmpty, PaymentsTable, VerifyDialog, usePaymentsList } from '@/components/phase2b/payment-shared';

/** Fase 2b — Halaman "Bukti" (Admin Finance): antrean PENDING + verifikasi + riwayat. */
export function ProofsManager({ canVerify = true }: { canVerify?: boolean }) {
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
  const filters = { channel, studentId, groupId, levelId };
  const listQ = usePaymentsList({ status: 'PENDING', ...filters });
  const histQ = usePaymentsList(filters);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Bukti Pembayaran</h1>
        <p className="text-sm text-muted-foreground">Antrean PENDING dari orang tua + riwayat verifikasi.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={channel} onChange={(e) => setChannel(e.target.value)} aria-label="Filter channel">
          <option value="">Semua channel</option>
          <option value="MANUAL">MANUAL</option>
          <option value="GATEWAY">GATEWAY</option>
          <option value="CASH">CASH</option>
        </select>
        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={studentId} onChange={(e) => setStudentId(e.target.value)} aria-label="Filter siswa">
          <option value="">Semua siswa</option>
          {(studentsQ.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>{s.user.name}</option>
          ))}
        </select>
        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={groupId} onChange={(e) => setGroupId(e.target.value)} aria-label="Filter kelompok">
          <option value="">Semua kelompok</option>
          {(groupsQ.data ?? []).map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={levelId} onChange={(e) => setLevelId(e.target.value)} aria-label="Filter jenjang">
          <option value="">Semua jenjang</option>
          {(levelsQ.data ?? []).map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      </div>
      <h2 className="text-lg font-medium">Menunggu verifikasi ({listQ.data?.length ?? '…'})</h2>
      <PaymentsEmpty isLoading={listQ.isLoading} isError={listQ.isError} count={listQ.data?.length} />
      {(listQ.data?.length ?? 0) > 0 ? (
        <PaymentsTable items={listQ.data ?? []} canVerify={canVerify} onVerify={setVerifyId} />
      ) : null}
      <p className="text-xs text-muted-foreground">Kolom Aksi di tiap baris: setujui (terbit kwitansi) atau tolak dengan alasan.</p>
      <h2 className="text-lg font-medium">Riwayat terakhir</h2>
      {histQ.isLoading ? <Skeleton className="h-20 w-full" /> : null}
      {(histQ.data?.length ?? 0) > 0 ? (
        <PaymentsTable items={(histQ.data ?? []).slice(0, 10)} canVerify={false} onVerify={() => undefined} />
      ) : null}
      {histQ.data?.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Belum ada riwayat.</CardContent></Card>
      ) : null}
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
