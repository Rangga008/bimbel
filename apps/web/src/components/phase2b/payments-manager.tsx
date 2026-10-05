"use client";
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch } from '@/lib/api-client';
import { rupiah } from '@/components/phase2a/invoices-manager';
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
  const [openCash, setOpenCash] = useState(false);
  const [invoiceId, setInvoiceId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [verifyId, setVerifyId] = useState<string | null>(null);
  const listQ = usePaymentsList(status, channel);
  const invoicesQ = useQuery({
    queryKey: ['invoices-issued-lite'],
    queryFn: () => apiFetch<InvoiceListItem[]>('/invoices?status=ISSUED'),
    enabled: openCash,
  });
  const pendingQ = useQuery({
    queryKey: ['payments-pending-count'],
    queryFn: () => apiFetch<{ count: number }>('/payments/pending-count'),
  });
  const cashM = useMutation({
    mutationFn: () =>
      apiFetch<PaymentListItem>('/payments/cash', {
        method: 'POST',
        body: { invoiceId, amount: Number(amount), note: note || undefined },
      }),
    onSuccess: (p) => {
      toast.success(`Cash terverifikasi — kwitansi ${p.receipts?.[0]?.number ?? 'terbit'}.`);
      setOpenCash(false);
      setInvoiceId('');
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
      </div>
      <PaymentsEmpty isLoading={listQ.isLoading} isError={listQ.isError} count={listQ.data?.length} />
      {(listQ.data?.length ?? 0) > 0 ? (
        <PaymentsTable items={listQ.data ?? []} canVerify={canVerify} onVerify={setVerifyId} />
      ) : null}
      <Dialog open={openCash} onOpenChange={setOpenCash}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Terima Pembayaran Tunai di Kantor</DialogTitle>
            <DialogDescription>
              Orang tua datang ke kantor dan membayar tunai — Anda yang mencatatnya di sini.
              Pembayaran langsung terverifikasi dan kwitansi otomatis terbit. Tidak perlu bukti transfer.
            </DialogDescription>
          </DialogHeader>
          <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); cashM.mutate(); }}>
            <Phase1aSelectField id="cash-invoice" label="Invoice ISSUED" value={invoiceId} onChange={setInvoiceId}
              options={(invoicesQ.data ?? []).map((i) => ({ value: i.id, label: `${i.number} — ${i.student.user.name} — ${rupiah(i.totalAmount)}` }))}
              placeholder={invoicesQ.isLoading ? 'Memuat...' : 'Pilih invoice...'} required />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cash-amount">Nominal (Rp)</Label>
              <Input id="cash-amount" type="number" min={1000} required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="mis. 1200000" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cash-note">Catatan (opsional)</Label>
              <Input id="cash-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Diterima dari..." />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={cashM.isPending}>{cashM.isPending ? 'Menyimpan...' : 'Simpan & Verifikasi'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <VerifyDialog verifyId={verifyId} onClose={() => setVerifyId(null)} />
    </div>
  );
}
