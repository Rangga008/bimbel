"use client";
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MessageCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { rupiah } from '@/components/phase2a/invoices-manager';
import type { ArInvoice, RefundRow } from '@/lib/phase2c-types';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

function err(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}

function reminderBadge(s: string) {
  if (s === 'SENT') return 'secondary' as const;
  if (s === 'PENDING') return 'outline' as const;
  return 'outline' as const;
}

const DAY_MS = 86400000;
function daysUntil(dueDate: string | null): number | null {
  if (!dueDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / DAY_MS);
}

/** Kelompok urgensi: lewat tempo → jatuh tempo ≤7 hari → belum jatuh tempo. */
function bucketOf(inv: ArInvoice): 'overdue' | 'dueSoon' | 'later' {
  const d = daysUntil(inv.dueDate);
  if (inv.isOverdue || (d !== null && d < 0)) return 'overdue';
  if (d !== null && d <= 7) return 'dueSoon';
  return 'later';
}

const BUCKET_META = {
  overdue: {
    title: 'Lewat jatuh tempo — perlu ditagih sekarang',
    cls: 'border-destructive/40 bg-destructive/5',
  },
  dueSoon: {
    title: 'Jatuh tempo ≤ 7 hari — kirim reminder sebelum lewat',
    cls: 'border-warning-300 bg-warning-50/60',
  },
  later: { title: 'Belum jatuh tempo', cls: '' },
} as const;

/**
 * Penagihan & Reminder — invoice outstanding yang dikelompokkan menurut
 * urgensi jatuh tempo. Fokus utama: kirim reminder WA ke orang tua.
 */
export function ArManager({ canRefund }: { canRefund: boolean }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [reminder, setReminder] = useState('');
  const [overdue, setOverdue] = useState(false);
  const [refundInv, setRefundInv] = useState<ArInvoice | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  const listQ = useQuery({
    queryKey: ['ar', debouncedSearch, reminder, overdue],
    queryFn: () => {
      const p = new URLSearchParams();
      if (debouncedSearch) p.set('search', debouncedSearch);
      if (reminder) p.set('reminderStatus', reminder);
      if (overdue) p.set('overdue', '1');
      const qs = p.toString();
      return apiFetch<ArInvoice[]>(`/ar${qs ? `?${qs}` : ''}`);
    },
  });

  const remindM = useMutation({
    mutationFn: (args: { id: string; status: 'NONE' | 'PENDING' | 'SENT' }) =>
      apiFetch<ArInvoice>(`/ar/${args.id}/reminder`, { method: 'PATCH', body: { status: args.status } }),
    onSuccess: () => {
      toast.success('Status reminder diperbarui.');
      qc.invalidateQueries({ queryKey: ['ar'] });
    },
    onError: (e) => toast.error(err(e, 'Gagal mengubah reminder.')),
  });

  const sendRemindM = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ sent: number; skipped: number }>(`/ar/${id}/send-reminder`, { method: 'POST' }),
    onSuccess: (r) => {
      toast.success(
        `Pengingat WA masuk antrean untuk ${r.sent} orang tua${r.skipped ? ` (${r.skipped} tanpa nomor WA)` : ''}.`,
      );
      qc.invalidateQueries({ queryKey: ['ar'] });
    },
    onError: (e) => toast.error(err(e, 'Gagal mengirim pengingat WA.')),
  });

  // Reminder jatuh tempo massal — semua invoice outstanding yang jatuh tempo
  // ≤7 hari (termasuk lewat tempo) dikirimi WA ke ortu masing-masing.
  const sendDueM = useMutation({
    mutationFn: () =>
      apiFetch<{ invoices: number; sent: number; failed: number }>('/ar/send-due-reminders?days=7', { method: 'POST' }),
    onSuccess: (r) => {
      if (r.invoices === 0) {
        toast.info('Tidak ada tagihan yang jatuh tempo dalam 7 hari.');
      } else {
        toast.success(`Reminder jatuh tempo dikirim untuk ${r.sent}/${r.invoices} invoice${r.failed ? ` (${r.failed} gagal)` : ''}.`);
      }
      qc.invalidateQueries({ queryKey: ['ar'] });
    },
    onError: (e) => toast.error(err(e, 'Gagal mengirim reminder massal.')),
  });

  const refundM = useMutation({
    mutationFn: () =>
      apiFetch<RefundRow>('/refunds', {
        method: 'POST',
        body: { invoiceId: refundInv!.id, amount: Number(amount), reason },
      }),
    onSuccess: (r) => {
      toast.success(`Refund ${r.number} tercatat.`);
      setRefundInv(null);
      setAmount('');
      setReason('');
      qc.invalidateQueries({ queryKey: ['ar'] });
      qc.invalidateQueries({ queryKey: ['ledger'] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
    },
    onError: (e) => toast.error(err(e, 'Gagal memproses refund.')),
  });

  function dueLabel(inv: ArInvoice, d: number | null) {
    if (d === null) return '—';
    const dateStr = new Date(inv.dueDate!).toLocaleDateString('id-ID');
    if (d < 0) return `${dateStr} · lewat ${Math.abs(d)} hari`;
    if (d === 0) return `${dateStr} · hari ini`;
    return `${dateStr} · ${d} hari lagi`;
  }

  function renderRow(inv: ArInvoice) {
    const d = daysUntil(inv.dueDate);
    const enr = inv.enrollmentLink ?? inv.enrollment;
    const program = enr
      ? [enr.program?.name, enr.level?.name, enr.group?.name].filter(Boolean).join(' · ')
      : (inv.package?.name ?? '—');
    const parent = (inv.student.parentStudents ?? []).map((p) => p.parent.user.name).join(', ') || '—';
    return (
      <tr key={inv.id} className="border-b last:border-0">
        <td className="px-3 py-2 align-top font-medium whitespace-nowrap">{inv.number}</td>
        <td className="px-3 py-2 align-top whitespace-nowrap">{inv.student.user.name}</td>
        <td className="px-3 py-2 align-top text-muted-foreground">{parent}</td>
        <td className="px-3 py-2 align-top text-muted-foreground">{program}</td>
        <td className="px-3 py-2 align-top whitespace-nowrap">
          {dueLabel(inv, d)}
          {d !== null && d < 0 ? <Badge variant="destructive" className="ml-1.5">OVERDUE</Badge> : null}
        </td>
        <td className="px-3 py-2 align-top text-right font-medium tabular-nums whitespace-nowrap">
          {rupiah(inv.outstanding)}
          <p className="text-xs font-normal text-muted-foreground">dari {rupiah(inv.totalAmount)}</p>
        </td>
        <td className="px-3 py-2 align-top whitespace-nowrap">
          <Badge variant={reminderBadge(inv.reminderStatus)}>{inv.reminderStatus}</Badge>
          {inv.remindedAt ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {new Date(inv.remindedAt).toLocaleDateString('id-ID')}
            </p>
          ) : null}
        </td>
        <td className="px-3 py-2 align-top whitespace-nowrap text-right">
          <span className="inline-flex flex-wrap items-center justify-end gap-1">
            <Button
              size="sm"
              variant="default"
              disabled={sendRemindM.isPending}
              onClick={() => sendRemindM.mutate(inv.id)}
            >
              <MessageCircle className="size-4" />
              Kirim WA
            </Button>
            <Button size="sm" variant="ghost" disabled={remindM.isPending} onClick={() => remindM.mutate({ id: inv.id, status: 'PENDING' })}>
              Tandai
            </Button>
            <Button size="sm" variant="ghost" disabled={remindM.isPending} onClick={() => remindM.mutate({ id: inv.id, status: 'SENT' })}>
              Diingatkan
            </Button>
            {canRefund ? (
              <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => { setRefundInv(inv); setAmount(String(Math.round(inv.outstanding))); setReason(''); }}>
                Refund
              </Button>
            ) : null}
          </span>
        </td>
      </tr>
    );
  }

  const groups = (['overdue', 'dueSoon', 'later'] as const).map((b) => ({
    key: b,
    meta: BUCKET_META[b],
    items: (listQ.data ?? []).filter((inv) => bucketOf(inv) === b),
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Penagihan &amp; Reminder</h1>
          <p className="text-sm text-muted-foreground">
            Tagihan yang belum lunas — kirim reminder WhatsApp ke orang tua yang
            sudah jatuh tempo atau sebentar lagi jatuh tempo.
          </p>
        </div>
        {canRefund ? (
          <Button onClick={() => sendDueM.mutate()} disabled={sendDueM.isPending}>
            <MessageCircle className="size-4" />
            {sendDueM.isPending ? 'Mengirim...' : 'Kirim Semua Reminder Jatuh Tempo'}
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="destructive">Lewat tempo: {groups[0].items.length}</Badge>
        <Badge variant="warning">≤7 hari lagi: {groups[1].items.length}</Badge>
        <Badge variant="outline">Total outstanding: {listQ.data?.length ?? 0}</Badge>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input placeholder="Cari nomor / nama siswa" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={reminder} onChange={(e) => setReminder(e.target.value)} aria-label="Filter reminder">
          <option value="">Semua reminder</option>
          <option value="NONE">Belum dikirim</option>
          <option value="PENDING">PENDING</option>
          <option value="SENT">Sudah dikirim</option>
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={overdue} onChange={(e) => setOverdue(e.target.checked)} />
          Jatuh tempo saja
        </label>
      </div>

      {listQ.isLoading ? <Skeleton className="h-24 w-full" /> : null}
      {listQ.isError ? <p className="text-sm text-destructive">Gagal memuat piutang.</p> : null}
      {!listQ.isLoading && listQ.data?.length === 0 ? (
        <p className="text-sm text-muted-foreground">Tidak ada tagihan outstanding — semua lunas.</p>
      ) : null}

      {groups.map((g) =>
        g.items.length > 0 ? (
          <section key={g.key} className={`flex flex-col gap-2 ${g.meta.cls ? `rounded-lg border p-3 ${g.meta.cls}` : ''}`}>
            <h2 className="text-sm font-semibold">
              {g.meta.title}
              <span className="ml-2 font-normal text-muted-foreground">({g.items.length})</span>
            </h2>
            <div className="overflow-x-auto rounded-md border bg-background">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Invoice</th>
                    <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Siswa</th>
                    <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Orang Tua</th>
                    <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Program</th>
                    <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Jatuh Tempo</th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Sisa</th>
                    <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Reminder</th>
                    <th className="px-3 py-2 text-left font-medium"></th>
                  </tr>
                </thead>
                <tbody>{g.items.map(renderRow)}</tbody>
              </table>
            </div>
          </section>
        ) : null,
      )}

      <Dialog open={refundInv !== null} onOpenChange={(o) => { if (!o) setRefundInv(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refund {refundInv?.number}</DialogTitle>
            <DialogDescription>
              Partial/full: mengurangi tagihan (outstanding). Jika melebihi sisa unpaid, selisih di-cash-out dari Kas.
              Alasan wajib. Tidak bisa dihapus.
            </DialogDescription>
          </DialogHeader>
          <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); refundM.mutate(); }}>
            <p className="text-sm text-muted-foreground">
              Outstanding {refundInv ? rupiah(refundInv.outstanding) : '—'} · Dibayar {refundInv ? rupiah(refundInv.amountPaid) : '—'}
            </p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rf-amount">Nominal (Rp)</Label>
              <Input id="rf-amount" type="number" min={1} required value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rf-reason">Alasan</Label>
              <Input id="rf-reason" required maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Mis. siswa berhenti, sisa sesi dikembalikan" />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={refundM.isPending}>{refundM.isPending ? 'Memproses...' : 'Simpan refund'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
