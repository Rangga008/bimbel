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

/** Buka file bukti tersimpan (endpoint terproteksi → fetch blob + objectURL). */
async function openProof(paymentId: string) {
  try {
    const blob = await apiFetchBlob(`/payments/${paymentId}/proof`);
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    // Revoke ditunda — objectURL harus hidup sampai tab terbuka & render.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
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

/** Daftar pembayaran berbasis kartu — tetap nyaman di layar sempit tanpa
 *  scroll horizontal panjang, dan semua aksi tetap terlihat. */
export function PaymentsTable({ items, canVerify, onVerify }: { items: PaymentListItem[]; canVerify: boolean; onVerify: (id: string) => void }) {
  return (
    <div className="grid gap-3">
      {items.map((p) => {
        const inv = p.allocations?.[0]?.invoice;
        const enr = inv?.enrollmentLink ?? inv?.enrollment;
        const kelas = enr?.group?.name ?? [enr?.program?.name, enr?.level?.name].filter(Boolean).join(' · ');
        const parents = (inv?.student?.parentStudents ?? []).map((ps) => ps.parent.user.name).join(', ');
        return (
          <Card key={p.id}>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 pb-3">
              <div className="min-w-0">
                <CardTitle className="text-base font-semibold">
                  {inv?.number ?? p.providerRef ?? p.id.slice(0, 8)}
                </CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  {p.account?.name ? `${p.account.name} · ` : ''}
                  {p.receipts?.[0] ? `Kwitansi ${p.receipts[0].number}` : 'Belum ada kwitansi'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <ChannelBadges p={p} />
                <span className="font-semibold tabular-nums">{rupiah(p.amount)}</span>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 pt-0 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Siswa & Kelas</p>
                <p className="mt-1 font-medium">{inv?.student?.user?.name || '—'}</p>
                {kelas ? <p className="text-xs text-muted-foreground">{kelas}</p> : null}
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Orang Tua</p>
                <p className="mt-1">{parents || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Metode</p>
                <p className="mt-1">{p.method} <span className="text-xs text-muted-foreground">({p.channel})</span></p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Bukti</p>
                <div className="mt-1">
                  {p.proofUrl?.startsWith('proofs/') ? (
                    <Button variant="outline" size="sm" className="text-xs" onClick={() => openProof(p.id)}>
                      Lihat Bukti
                    </Button>
                  ) : p.proofUrl ? (
                    <p className="break-all text-xs text-muted-foreground">{p.proofUrl}</p>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </div>
              </div>
              {p.rejectReason ? (
                <p className="text-xs text-destructive sm:col-span-2 lg:col-span-4">Ditolak: {p.rejectReason}</p>
              ) : null}
              {canVerify && p.status === 'PENDING' ? (
                <div className="sm:col-span-2 lg:col-span-4">
                  <Button variant="outline" size="sm" onClick={() => onVerify(p.id)}>Verifikasi</Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
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
