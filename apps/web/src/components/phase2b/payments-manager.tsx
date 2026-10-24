"use client";
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch } from '@/lib/api-client';
import { rupiah } from '@/components/phase2a/invoices-manager';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import type { InvoiceListItem } from '@/lib/phase1a-types';
import type { PaymentListItem } from '@/lib/phase2b-types';
import { Phase1aSelectField } from '@/components/phase1a/phase1a-form-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PaymentsEmpty, PaymentsTable, VerifyDialog, err2b, usePaymentsList } from '@/components/phase2b/payment-shared';

/** Fase 2b — Halaman "Pembayaran" (Admin Finance): list + input cash + verifikasi. */
export function PaymentsManager({ canVerify }: { canVerify: boolean }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const [channel, setChannel] = useState('');
  const [filterStudent, setFilterStudent] = useState('');
  const [filterGroup, setFilterGroup] = useState('');
  const [search, setSearch] = useState('');
  const [openCash, setOpenCash] = useState(false);
  const [invoice, setInvoice] = useState<InvoiceListItem | null>(null);
  const [invSearch, setInvSearch] = useState('');
  const debouncedInvSearch = useDebouncedValue(invSearch);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [verifyId, setVerifyId] = useState<string | null>(null);
  const listQ = usePaymentsList({ status, channel, studentId: filterStudent, groupId: filterGroup, search });
  // Opsi filter siswa & kelompok untuk daftar pembayaran.
  const filterStudentsQ = useQuery({
    queryKey: ['students-lite'],
    queryFn: () => apiFetch<{ id: string; user: { name: string } }[]>('/students'),
    staleTime: 60 * 1000,
  });
  const groupsQ = useQuery({
    queryKey: ['groups-lite'],
    queryFn: () => apiFetch<{ id: string; name: string }[]>('/groups'),
    staleTime: 60 * 1000,
  });
  // Cari tagihan langsung per nomor invoice / nama siswa — tidak perlu
  // pilih siswa dulu (server mencari keduanya sekaligus).
  const invoicesQ = useQuery({
    queryKey: ['invoices-issued-cash', debouncedInvSearch],
    queryFn: () =>
      apiFetch<InvoiceListItem[]>(
        `/invoices?status=ISSUED${debouncedInvSearch ? `&search=${encodeURIComponent(debouncedInvSearch)}` : ''}`,
      ),
    enabled: openCash,
  });
  // Invoice masih ada sisa tagihannya saja yang bisa dibayar.
  const openInvoices = (invoicesQ.data ?? []).filter(
    (i) => Number(i.totalAmount) - Number(i.amountPaid) > 0.009,
  );
  const pendingQ = useQuery({
    queryKey: ['payments-pending-count'],
    queryFn: () => apiFetch<{ count: number }>('/payments/pending-count'),
  });
  const cashM = useMutation({
    mutationFn: () =>
      apiFetch<PaymentListItem>('/payments/cash', {
        method: 'POST',
        body: { invoiceId: invoice!.id, amount: Number(amount), note: note || undefined },
      }),
    onSuccess: (p) => {
      toast.success(`Cash terverifikasi — kwitansi ${p.receipts?.[0]?.number ?? 'terbit'}.`);
      setOpenCash(false);
      setInvoice(null);
      setInvSearch('');
      setAmount('');
      setNote('');
      qc.invalidateQueries({ queryKey: ['payments'] });
    },
    onError: (e) => toast.error(err2b(e, 'Gagal menyimpan pembayaran cash.')),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pembayaran</h1>
          <p className="text-sm text-muted-foreground">
            Tiga jalur: <b>CASH</b> — orang tua bayar tunai di kantor (admin yang input);
            <b> MANUAL</b> — bukti transfer yang diupload ortu (perlu verifikasi);
            <b> GATEWAY</b> — pembayaran online otomatis.{' '}
            {pendingQ.data ? `${pendingQ.data.count} menunggu verifikasi.` : ''}
          </p>
        </div>
        {canVerify ? <Button onClick={() => setOpenCash(true)}>Terima Tunai di Kantor</Button> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Input
          className="h-9 w-full sm:w-56"
          placeholder="Cari no invoice / ref..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter status">
          <option value="">Semua status</option>
          <option value="PENDING">PENDING</option>
          <option value="VERIFIED">VERIFIED</option>
          <option value="REJECTED">REJECTED</option>
        </select>
        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={channel} onChange={(e) => setChannel(e.target.value)} aria-label="Filter channel">
          <option value="">Semua channel</option>
          <option value="CASH">CASH</option>
          <option value="MANUAL">MANUAL</option>
          <option value="GATEWAY">GATEWAY</option>
        </select>
        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={filterStudent} onChange={(e) => setFilterStudent(e.target.value)} aria-label="Filter siswa">
          <option value="">Semua siswa</option>
          {(filterStudentsQ.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>{s.user.name}</option>
          ))}
        </select>
        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={filterGroup} onChange={(e) => setFilterGroup(e.target.value)} aria-label="Filter kelompok">
          <option value="">Semua kelompok</option>
          {(groupsQ.data ?? []).map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
      </div>
      <PaymentsEmpty isLoading={listQ.isLoading} isError={listQ.isError} count={listQ.data?.length} />
      {(listQ.data?.length ?? 0) > 0 ? (
        <PaymentsTable items={listQ.data ?? []} canVerify={canVerify} onVerify={setVerifyId} />
      ) : null}
      <Dialog open={openCash} onOpenChange={setOpenCash}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Terima Pembayaran Tunai di Kantor</DialogTitle>
            <DialogDescription>
              Orang tua datang ke kantor dan membayar tunai — Anda yang mencatatnya di sini.
              Pembayaran langsung terverifikasi dan kwitansi otomatis terbit. Tidak perlu bukti transfer.
            </DialogDescription>
          </DialogHeader>
          <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); if (invoice) cashM.mutate(); }}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cash-search">Cari tagihan (no invoice / nama siswa)</Label>
              <Input
                id="cash-search"
                value={invSearch}
                onChange={(e) => setInvSearch(e.target.value)}
                placeholder="Ketik untuk mencari..."
                autoComplete="off"
              />
            </div>
            {invoice ? (
              <div className="flex items-center justify-between rounded-md border border-primary bg-primary/5 px-3 py-2 text-sm">
                <div>
                  <p className="font-medium">{invoice.number} — {invoice.student?.user?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Sisa tagihan <span className="font-semibold text-foreground">{rupiah(Number(invoice.totalAmount) - Number(invoice.amountPaid))}</span>
                  </p>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => { setInvoice(null); setAmount(''); }}>
                  Ganti
                </Button>
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto rounded-md border">
                {invoicesQ.isLoading ? (
                  <p className="p-3 text-sm text-muted-foreground">Memuat tagihan...</p>
                ) : openInvoices.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">
                    {debouncedInvSearch ? 'Tidak ada tagihan yang cocok.' : 'Tidak ada tagihan terbuka.'}
                  </p>
                ) : (
                  openInvoices.slice(0, 30).map((i) => {
                    const sisa = Number(i.totalAmount) - Number(i.amountPaid);
                    return (
                      <button
                        key={i.id}
                        type="button"
                        className="flex w-full items-center justify-between gap-3 border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted/50"
                        onClick={() => { setInvoice(i); setAmount(String(Math.round(sisa))); }}
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">{i.number} — {i.student?.user?.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {i.dueDate ? `Jatuh tempo ${new Date(i.dueDate).toLocaleDateString('id-ID')}` : 'Tanpa jatuh tempo'}
                          </p>
                        </div>
                        <span className="shrink-0 font-medium tabular-nums">{rupiah(sisa)}</span>
                      </button>
                    );
                  })
                )}
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cash-amount">Nominal (Rp)</Label>
              <Input id="cash-amount" type="number" min={1000} required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="mis. 1200000" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cash-note">Catatan (opsional)</Label>
              <Input id="cash-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Diterima dari..." />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={!invoice || cashM.isPending}>{cashM.isPending ? 'Menyimpan...' : 'Simpan & Verifikasi'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <VerifyDialog verifyId={verifyId} onClose={() => setVerifyId(null)} />
    </div>
  );
}
