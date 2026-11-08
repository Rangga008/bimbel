"use client";
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch, apiFetchBlob, ApiError } from '@/lib/api-client';
import { rupiah } from '@/components/phase2a/invoices-manager';
import { PrintReceiptButton } from '@/components/phase2b/receipt-print';
import type { PaymentListItem } from '@/lib/phase2b-types';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function err2b(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}

export function ChannelBadges({ p }: { p: PaymentListItem }) {
  const sv = p.status === 'VERIFIED' ? 'secondary' as const : p.status === 'REJECTED' ? 'destructive' as const : 'outline' as const;
  const cv = p.channel === 'CASH' ? 'secondary' as const : p.channel === 'GATEWAY' ? 'default' as const : 'outline' as const;
  return (
    <>
      <Badge variant={sv}>{p.status}</Badge>
      <Badge variant={cv}>{p.channel}</Badge>
    </>
  );
}

export interface PaymentFilters {
  status?: string;
  channel?: string;
  studentId?: string;
  groupId?: string;
  levelId?: string;
  search?: string;
  /** Rentang tanggal dibuat/verifikasi (ISO date YYYY-MM-DD). */
  from?: string;
  to?: string;
}

export function usePaymentsList(filters: PaymentFilters) {
  const qs = (() => {
    const p = new URLSearchParams();
    if (filters.status) p.set('status', filters.status);
    if (filters.channel) p.set('channel', filters.channel);
    if (filters.studentId) p.set('studentId', filters.studentId);
    if (filters.groupId) p.set('groupId', filters.groupId);
    if (filters.levelId) p.set('levelId', filters.levelId);
    if (filters.search) p.set('search', filters.search);
    if (filters.from) p.set('from', filters.from);
    if (filters.to) p.set('to', filters.to);
    return p.toString();
  })();
  return useQuery({
    queryKey: ['payments', qs],
    queryFn: () => apiFetch<PaymentListItem[]>(`/payments${qs ? `?${qs}` : ''}`),
  });
}

export function useVerifyPayment(verifyId: string | null, rejectReason: string, onDone: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (action: 'APPROVE' | 'REJECT') =>
      apiFetch<PaymentListItem>(`/payments/${verifyId}/verify`, {
        method: 'PATCH',
        body: action === 'APPROVE' ? { action } : { action, reason: rejectReason },
      }),
    onSuccess: (p) => {
      toast.success(p.status === 'VERIFIED' ? `Disetujui — kwitansi ${p.receipts?.[0]?.number ?? 'terbit'}.` : 'Bukti ditolak.');
      onDone();
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['receipts'] });
    },
    onError: (e) => toast.error(err2b(e, 'Gagal memverifikasi.')),
  });
}

export function VerifyDialog({ verifyId, onClose }: { verifyId: string | null; onClose: () => void }) {
  const [rejectReason, setRejectReason] = useState('');
  const verifyM = useVerifyPayment(verifyId, rejectReason, () => { setRejectReason(''); onClose(); });
  return (
    <Dialog open={verifyId !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Verifikasi Bukti</DialogTitle>
          <DialogDescription>Setujui (terbit kwitansi) atau tolak dengan alasan wajib.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reject-reason">Alasan penolakan (wajib bila Tolak)</Label>
          <Input id="reject-reason" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="mis. bukti tidak terbaca" />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => verifyM.mutate('REJECT')} disabled={verifyM.isPending}>Tolak</Button>
          <Button onClick={() => verifyM.mutate('APPROVE')} disabled={verifyM.isPending}>
            {verifyM.isPending ? 'Memproses...' : 'Setujui'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Buka file bukti tersimpan (endpoint terproteksi → fetch blob + objectURL).
 *  Tab kosong dibuka SINKRON saat klik — kalau ditunda sampai fetch selesai,
 *  browser memblokirnya sebagai popup. Fitur 'noopener' tidak dipakai karena
 *  membuat window.open mengembalikan null di beberapa browser. */
async function openProof(paymentId: string) {
  const win = window.open('', '_blank');
  if (!win) {
    toast.error('Tab baru diblokir browser — izinkan popup untuk melihat bukti.');
    return;
  }
  win.opener = null;
  win.document.title = 'Memuat bukti…';
  win.document.body.innerHTML =
    '<p style="font-family:sans-serif;color:#555;padding:24px">Memuat file bukti…</p>';
  try {
    const blob = await apiFetchBlob(`/payments/${paymentId}/proof`);
    const url = URL.createObjectURL(blob);
    win.location.href = url;
    // Revoke ditunda — objectURL harus hidup sampai tab selesai render.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    win.close();
    toast.error(e instanceof ApiError ? e.message : 'Gagal membuka file bukti.');
  }
}

export function PaymentCard({ p, canVerify, onVerify }: { p: PaymentListItem; canVerify: boolean; onVerify: (id: string) => void }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-1.5 text-base">
          <ChannelBadges p={p} />
          <span className="font-semibold">{rupiah(p.amount)}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5 text-sm">
        <p className="text-muted-foreground">
          {p.allocations?.[0]?.invoice?.number ?? p.providerRef ?? p.id.slice(0, 8)} · {p.method}
          {p.account ? ` · ${p.account.name}` : ''}
        </p>
        {p.proofUrl ? (
          p.proofUrl.startsWith('proofs/') ? (
            <Button variant="outline" size="sm" className="w-fit text-xs" onClick={() => openProof(p.id)}>
              Lihat Bukti
            </Button>
          ) : (
            <p className="truncate text-xs">Bukti: {p.proofUrl}</p>
          )
        ) : null}
        {p.rejectReason ? <p className="text-xs text-destructive">Ditolak: {p.rejectReason}</p> : null}
        {p.receipts?.[0] ? <p className="text-xs text-muted-foreground">Kwitansi: {p.receipts[0].number}</p> : null}
        {canVerify && p.status === 'PENDING' ? (
          <Button variant="outline" size="sm" className="mt-1 w-fit" onClick={() => onVerify(p.id)}>Verifikasi</Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Daftar pembayaran dalam tabel — padat untuk banyak baris; wrapper
 *  overflow-x-auto menjaga tetap bisa dipakai di layar sempit. */
export function PaymentsTable({ items, canVerify, onVerify }: { items: PaymentListItem[]; canVerify: boolean; onVerify: (id: string) => void }) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full min-w-[920px] text-left text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2.5 font-medium">Invoice / Ref</th>
            <th className="px-3 py-2.5 font-medium">Siswa &amp; Kelas</th>
            <th className="px-3 py-2.5 font-medium">Orang Tua</th>
            <th className="px-3 py-2.5 font-medium">Metode</th>
            <th className="px-3 py-2.5 font-medium">Status</th>
            <th className="px-3 py-2.5 font-medium text-right">Jumlah</th>
            <th className="px-3 py-2.5 font-medium">Kwitansi</th>
            <th className="px-3 py-2.5 font-medium">Bukti</th>
            <th className="px-3 py-2.5 font-medium">Aksi</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {items.map((p) => {
            const inv = p.allocations?.[0]?.invoice;
            const enr = inv?.enrollmentLink ?? inv?.enrollment;
            const kelas = enr?.group?.name ?? [enr?.program?.name, enr?.level?.name].filter(Boolean).join(' · ');
            const parents = (inv?.student?.parentStudents ?? []).map((ps) => ps.parent.user.name).join(', ');
            return (
              <tr key={p.id} className="align-top hover:bg-muted/30">
                <td className="px-3 py-2.5">
                  <p className="font-medium">{inv?.number ?? p.providerRef ?? p.id.slice(0, 8)}</p>
                  {p.account?.name ? <p className="text-xs text-muted-foreground">{p.account.name}</p> : null}
                </td>
                <td className="px-3 py-2.5">
                  <p className="font-medium">{inv?.student?.user?.name || '—'}</p>
                  {kelas ? <p className="text-xs text-muted-foreground">{kelas}</p> : null}
                </td>
                <td className="px-3 py-2.5">{parents || '—'}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {p.method} <span className="text-xs text-muted-foreground">({p.channel})</span>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    <ChannelBadges p={p} />
                  </div>
                  {p.rejectReason ? <p className="mt-1 text-xs text-destructive">Ditolak: {p.rejectReason}</p> : null}
                </td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums whitespace-nowrap">
                  {rupiah(p.amount)}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap text-xs">
                  {p.receipts?.[0] ? p.receipts[0].number : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-3 py-2.5">
                  {p.proofUrl?.startsWith('proofs/') ? (
                    <Button variant="outline" size="sm" className="text-xs" onClick={() => openProof(p.id)}>
                      Lihat Bukti
                    </Button>
                  ) : p.proofUrl ? (
                    <p className="max-w-40 truncate text-xs text-muted-foreground" title={p.proofUrl}>{p.proofUrl}</p>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-1.5">
                    {canVerify && p.status === 'PENDING' ? (
                      <Button variant="outline" size="sm" onClick={() => onVerify(p.id)}>Verifikasi</Button>
                    ) : null}
                    {p.receipts?.[0] ? (
                      <PrintReceiptButton receiptId={p.receipts[0].id} detailBase="/receipts" />
                    ) : null}
                    {!((canVerify && p.status === 'PENDING') || p.receipts?.[0]) ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function PaymentsEmpty({ isLoading, isError, count }: { isLoading: boolean; isError: boolean; count: number | undefined }) {
  if (isLoading) return <Skeleton className="h-24 w-full" />;
  if (isError) return <p className="text-sm text-destructive">Gagal memuat pembayaran.</p>;
  if (count === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Belum ada pembayaran. Input cash kantor atau tunggu bukti dari orang tua.
        </CardContent>
      </Card>
    );
  }
  return null;
}
