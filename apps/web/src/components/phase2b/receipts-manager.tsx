"use client";
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api-client';
import { rupiah } from '@/components/phase2a/invoices-manager';
import { PrintReceiptButton } from '@/components/phase2b/receipt-print';
import type { ReceiptItem } from '@/lib/phase2b-types';

/** Fase 2b — Daftar kwitansi + template cetak ala kwitansi manual lama. */
export function ReceiptsManager({ title }: { title: string }) {
  const [studentId, setStudentId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [search, setSearch] = useState('');
  const qs = (() => {
    const p = new URLSearchParams();
    if (studentId) p.set('studentId', studentId);
    if (groupId) p.set('groupId', groupId);
    if (search) p.set('search', search);
    return p.toString();
  })();
  const listQ = useQuery({
    queryKey: ['receipts', qs],
    queryFn: () => apiFetch<ReceiptItem[]>(`/receipts${qs ? `?${qs}` : ''}`),
  });
  const studentsQ = useQuery({
    queryKey: ['students-lite'],
    queryFn: () => apiFetch<{ id: string; user: { name: string } }[]>('/students'),
    staleTime: 60 * 1000,
  });
  const groupsQ = useQuery({
    queryKey: ['groups-lite'],
    queryFn: () => apiFetch<{ id: string; name: string }[]>('/groups'),
    staleTime: 60 * 1000,
  });
  const th = 'px-3 py-2 text-left font-medium whitespace-nowrap';
  const thR = 'px-3 py-2 text-right font-medium whitespace-nowrap';
  const td = 'px-3 py-2 align-top';
  const tdR = 'px-3 py-2 text-right align-top';
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">Kwitansi terbit otomatis tiap pembayaran sukses (tidak bisa dibuat manual).</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Input
          className="h-9 w-full sm:w-56"
          placeholder="Cari nomor kwitansi / invoice..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
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
      </div>
      {listQ.isLoading ? <Skeleton className="h-24 w-full" /> : null}
      {listQ.data?.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Belum ada kwitansi.</CardContent></Card>
      ) : null}
      {(listQ.data?.length ?? 0) > 0 ? (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className={th}>Nomor</th>
                <th className={th}>Siswa</th>
                <th className={th}>Invoice / Program</th>
                <th className={th}>Metode</th>
                <th className={th}>Tanggal</th>
                <th className={thR}>Jumlah</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {listQ.data?.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className={`${td} font-medium whitespace-nowrap`}>{r.number}</td>
                  <td className={`${td} whitespace-nowrap`}>{r.invoice?.student?.user?.name ?? r.student?.user?.name ?? '—'}</td>
                  <td className={`${td} text-muted-foreground`}>
                    {r.invoice?.number ?? '—'}
                    {(r.invoice?.enrollmentLink ?? r.invoice?.enrollment) ? (
                      <p className="text-xs">
                        {[(r.invoice?.enrollmentLink ?? r.invoice?.enrollment)?.program?.name, (r.invoice?.enrollmentLink ?? r.invoice?.enrollment)?.level?.name]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    ) : null}
                  </td>
                  <td className={`${td} whitespace-nowrap`}>{r.method}</td>
                  <td className={`${td} whitespace-nowrap text-muted-foreground`}>
                    {new Date(r.issuedAt).toLocaleString('id-ID')}
                  </td>
                  <td className={`${tdR} tabular-nums`}>{rupiah(r.amount)}</td>
                  <td className={`${td} text-right`}>
                    <PrintReceiptButton receiptId={r.id} detailBase="/receipts" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
