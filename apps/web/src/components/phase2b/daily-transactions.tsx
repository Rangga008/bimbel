"use client";
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowDownLeft, ArrowUpRight, Plus, Trash2, Wallet } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { apiFetch, ApiError } from '@/lib/api-client';
import { rupiah } from '@/components/phase2a/invoices-manager';
import { Phase1aSelectField } from '@/components/phase1a/phase1a-form-dialog';
import type { PaymentListItem } from '@/lib/phase2b-types';
import type { ExpenseRow } from '@/lib/phase2d-types';
import type { LedgerEntryRow, LedgerResponse } from '@/lib/phase2c-types';

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function err(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}

const TH = 'px-3 py-2 text-left font-medium whitespace-nowrap';
const THR = 'px-3 py-2 text-right font-medium whitespace-nowrap';
const TD = 'px-3 py-2 align-top';
const TDR = 'px-3 py-2 text-right align-top';

/**
 * Transaksi Harian — uang masuk (pembayaran terverifikasi + pemasukan manual)
 * & uang keluar (pengeluaran + kas keluar manual) per tanggal.
 * "Catat Transaksi" untuk kejadian ad-hoc di luar siklus invoice/RAB:
 * melayani tamu, belanja mendadak (spidol habis), dll.
 */
export function DailyTransactions() {
  const qc = useQueryClient();
  const [date, setDate] = useState(todayLocal());
  const [openAdd, setOpenAdd] = useState(false);
  const [direction, setDirection] = useState<'IN' | 'OUT'>('OUT');
  const [accountId, setAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [toDelete, setToDelete] = useState<LedgerEntryRow | null>(null);
  const from = `${date}T00:00:00.000`;
  const to = `${date}T23:59:59.999`;

  const inQ = useQuery({
    queryKey: ['payments', 'daily', date],
    queryFn: () =>
      apiFetch<PaymentListItem[]>(
        `/payments?status=VERIFIED&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      ),
  });
  const outQ = useQuery({
    queryKey: ['expenses', 'daily', date],
    queryFn: () =>
      apiFetch<ExpenseRow[]>(`/expenses?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  });
  // Mutasi manual (di luar invoice & pengeluaran) untuk tanggal ini.
  const manualQ = useQuery({
    queryKey: ['ledger', 'daily-manual', date],
    queryFn: () =>
      apiFetch<LedgerResponse>(`/ledger?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  });
  const accountsQ = useQuery({
    queryKey: ['financial-accounts'],
    queryFn: () =>
      apiFetch<Array<{ id: string; name: string; code: string | null; isActive: boolean }>>(
        '/financial-accounts',
      ),
  });

  const manualRows = (manualQ.data?.entries ?? []).filter((e) => e.sourceType === 'MANUAL');
  const manualIn = manualRows.filter((e) => e.direction === 'IN');
  const manualOut = manualRows.filter((e) => e.direction === 'OUT');
  const totalIn =
    (inQ.data ?? []).reduce((a, p) => a + Number(p.amount), 0) +
    manualIn.reduce((a, e) => a + Number(e.amount), 0);
  const totalOut =
    (outQ.data ?? []).reduce((a, e) => a + Number(e.amount), 0) +
    manualOut.reduce((a, e) => a + Number(e.amount), 0);

  const saveM = useMutation({
    mutationFn: () =>
      apiFetch<LedgerEntryRow>('/ledger/manual', {
        method: 'POST',
        body: {
          direction,
          accountId,
          amount: Number(amount),
          description: description.trim(),
          occurredAt: `${date}T${new Date().toTimeString().slice(0, 8)}`,
        },
      }),
    onSuccess: () => {
      toast.success('Transaksi harian tercatat.');
      setOpenAdd(false);
      setAmount('');
      setDescription('');
      qc.invalidateQueries({ queryKey: ['ledger'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (e) => toast.error(err(e, 'Gagal mencatat transaksi.')),
  });

  const delM = useMutation({
    mutationFn: (id: string) => apiFetch(`/ledger/manual/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Transaksi manual dihapus.');
      setToDelete(null);
      qc.invalidateQueries({ queryKey: ['ledger'] });
    },
    onError: (e) => toast.error(err(e, 'Gagal menghapus transaksi.')),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Transaksi Harian</h1>
          <p className="text-sm text-muted-foreground">
            Uang masuk &amp; keluar per tanggal — termasuk transaksi ad-hoc di luar invoice &amp; RAB
            (melayani tamu, belanja mendadak, dsb).
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="daily-date">Tanggal</Label>
            <Input id="daily-date" type="date" className="h-9 w-44" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <Button onClick={() => setOpenAdd(true)}>
            <Plus className="size-4" /> Catat Transaksi
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <span className="rounded-full bg-emerald-500/15 p-2 text-emerald-600"><ArrowDownLeft className="size-5" /></span>
            <div>
              <p className="text-xs text-muted-foreground">Uang Masuk</p>
              <p className="text-lg font-semibold tabular-nums">{rupiah(totalIn)}</p>
              <p className="text-xs text-muted-foreground">
                {(inQ.data?.length ?? 0) + manualIn.length} transaksi
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <span className="rounded-full bg-rose-500/15 p-2 text-rose-600"><ArrowUpRight className="size-5" /></span>
            <div>
              <p className="text-xs text-muted-foreground">Uang Keluar</p>
              <p className="text-lg font-semibold tabular-nums">{rupiah(totalOut)}</p>
              <p className="text-xs text-muted-foreground">
                {(outQ.data?.length ?? 0) + manualOut.length} transaksi
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <span className="rounded-full bg-primary/15 p-2 text-primary"><Wallet className="size-5" /></span>
            <div>
              <p className="text-xs text-muted-foreground">Selisih Hari Ini</p>
              <p className="text-lg font-semibold tabular-nums">{rupiah(totalIn - totalOut)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Uang Masuk</h2>
        {inQ.isLoading || manualQ.isLoading ? <Skeleton className="h-24 w-full" /> : null}
        {inQ.isError ? <p className="text-sm text-destructive">Gagal memuat pembayaran.</p> : null}
        {(inQ.data?.length ?? 0) + manualIn.length > 0 ? (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className={TH}>Jam</th>
                  <th className={TH}>Invoice / Keterangan</th>
                  <th className={TH}>Siswa</th>
                  <th className={TH}>Kelas / Program</th>
                  <th className={TH}>Metode</th>
                  <th className={THR}>Jumlah</th>
                  <th className={TH}></th>
                </tr>
              </thead>
              <tbody>
                {(inQ.data ?? []).map((p) => {
                  const inv = p.allocations?.[0]?.invoice;
                  const enr = inv?.enrollmentLink;
                  const kelas = enr?.group?.name ?? [enr?.program?.name, enr?.level?.name].filter(Boolean).join(' · ');
                  return (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className={`${TD} whitespace-nowrap tabular-nums`}>{fmtTime(p.paidAt ?? p.createdAt)}</td>
                      <td className={`${TD} whitespace-nowrap font-medium`}>
                        {inv?.number ?? p.providerRef ?? '—'}
                        {p.receipts?.[0] ? <p className="text-xs font-normal text-muted-foreground">Kwitansi {p.receipts[0].number}</p> : null}
                      </td>
                      <td className={`${TD} whitespace-nowrap`}>{inv?.student?.user?.name ?? '—'}</td>
                      <td className={TD}>{kelas || <span className="text-xs text-muted-foreground">—</span>}</td>
                      <td className={`${TD} whitespace-nowrap`}>
                        {p.method} <Badge variant="outline" className="ml-1">{p.channel}</Badge>
                      </td>
                      <td className={`${TDR} font-medium tabular-nums whitespace-nowrap`}>{rupiah(p.amount)}</td>
                      <td className={TD}></td>
                    </tr>
                  );
                })}
                {manualIn.map((e) => (
                  <tr key={e.id} className="border-b last:border-0 bg-emerald-50/40">
                    <td className={`${TD} whitespace-nowrap tabular-nums`}>{fmtTime(e.occurredAt)}</td>
                    <td className={TD}>
                      {e.description}
                      <Badge variant="outline" className="ml-1.5">Manual</Badge>
                    </td>
                    <td className={`${TD} text-muted-foreground`}>—</td>
                    <td className={`${TD} text-muted-foreground`}>{e.account?.name ?? '—'}</td>
                    <td className={`${TD} whitespace-nowrap text-muted-foreground`}>Tunai/Lainnya</td>
                    <td className={`${TDR} font-medium tabular-nums whitespace-nowrap`}>{rupiah(e.amount)}</td>
                    <td className={`${TD} text-right`}>
                      <Button variant="ghost" size="icon-sm" aria-label="Hapus transaksi" onClick={() => setToDelete(e)}>
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {(inQ.data?.length ?? 0) + manualIn.length === 0 && !inQ.isLoading ? (
          <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Belum ada uang masuk pada tanggal ini.</CardContent></Card>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Uang Keluar</h2>
        {outQ.isLoading || manualQ.isLoading ? <Skeleton className="h-24 w-full" /> : null}
        {outQ.isError ? <p className="text-sm text-destructive">Gagal memuat pengeluaran.</p> : null}
        {(outQ.data?.length ?? 0) + manualOut.length > 0 ? (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className={TH}>Jam</th>
                  <th className={TH}>Keterangan</th>
                  <th className={TH}>Kategori</th>
                  <th className={TH}>Akun</th>
                  <th className={THR}>Jumlah</th>
                  <th className={TH}></th>
                </tr>
              </thead>
              <tbody>
                {(outQ.data ?? []).map((e) => (
                  <tr key={e.id} className="border-b last:border-0">
                    <td className={`${TD} whitespace-nowrap tabular-nums`}>{fmtTime(e.occurredAt)}</td>
                    <td className={TD}>{e.description}</td>
                    <td className={`${TD} whitespace-nowrap`}>{e.category}</td>
                    <td className={`${TD} whitespace-nowrap`}>{e.account?.name ?? '—'}</td>
                    <td className={`${TDR} font-medium tabular-nums whitespace-nowrap`}>{rupiah(e.amount)}</td>
                    <td className={TD}></td>
                  </tr>
                ))}
                {manualOut.map((e) => (
                  <tr key={e.id} className="border-b last:border-0 bg-rose-50/40">
                    <td className={`${TD} whitespace-nowrap tabular-nums`}>{fmtTime(e.occurredAt)}</td>
                    <td className={TD}>
                      {e.description}
                      <Badge variant="outline" className="ml-1.5">Manual</Badge>
                    </td>
                    <td className={`${TD} text-muted-foreground`}>Ad-hoc</td>
                    <td className={`${TD} whitespace-nowrap`}>{e.account?.name ?? '—'}</td>
                    <td className={`${TDR} font-medium tabular-nums whitespace-nowrap`}>{rupiah(e.amount)}</td>
                    <td className={`${TD} text-right`}>
                      <Button variant="ghost" size="icon-sm" aria-label="Hapus transaksi" onClick={() => setToDelete(e)}>
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {(outQ.data?.length ?? 0) + manualOut.length === 0 && !outQ.isLoading ? (
          <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Belum ada pengeluaran pada tanggal ini.</CardContent></Card>
        ) : null}
      </div>

      <Dialog open={openAdd} onOpenChange={setOpenAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Catat Transaksi Harian</DialogTitle>
            <DialogDescription>
              Untuk kejadian di luar invoice &amp; anggaran bulanan — mis. melayani tamu,
              belanja mendadak (spidol habis), pemasukan lain.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              saveM.mutate();
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label>Jenis</Label>
              <div className="grid grid-cols-2 gap-2">
                {(['IN', 'OUT'] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDirection(d)}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      direction === d ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:border-primary/50'
                    }`}
                  >
                    {d === 'IN' ? 'Uang Masuk' : 'Uang Keluar'}
                  </button>
                ))}
              </div>
            </div>
            <Phase1aSelectField
              id="daily-acc"
              label="Akun kas/bank"
              value={accountId}
              onChange={setAccountId}
              options={(accountsQ.data ?? [])
                .filter((a) => a.isActive)
                .map((a) => ({ value: a.id, label: `${a.name}${a.code ? ` (${a.code})` : ''}` }))}
              placeholder={accountsQ.isLoading ? 'Memuat akun...' : 'Pilih akun...'}
              required
            />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="daily-amt">Nominal (Rp)</Label>
              <Input id="daily-amt" type="number" min={1} required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="mis. 25000" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="daily-desc">Keterangan</Label>
              <Input id="daily-desc" required maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="mis. Beli spidol / Melayani tamu" />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={saveM.isPending || !accountId}>
                {saveM.isPending ? 'Menyimpan...' : 'Simpan Transaksi'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => { if (!o) setToDelete(null); }}
        title="Hapus transaksi manual?"
        description={`"${toDelete?.description ?? ''}" senilai ${toDelete ? rupiah(toDelete.amount) : ''} akan dihapus dari mutasi ${toDelete?.account?.name ?? ''}.`}
        confirmLabel="Ya, hapus"
        pending={delM.isPending}
        onConfirm={() => toDelete && delM.mutate(toDelete.id)}
      />
    </div>
  );
}
