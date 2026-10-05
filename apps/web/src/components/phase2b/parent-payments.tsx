"use client";
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { FormField, SubmitButton } from '@/components/shared/form-field';
import { apiFetch } from '@/lib/api-client';
import { rupiah } from '@/components/phase2a/invoices-manager';
import type { PaymentListItem, ReceiptItem } from '@/lib/phase2b-types';
import { Phase1aSelectField } from '@/components/phase1a/phase1a-form-dialog';
import { err2b } from '@/components/phase2b/payment-shared';
import { PrintReceiptButton } from '@/components/phase2b/receipt-print';
import { sisaInv, useMeInvoices, type ChildInvoiceRow } from '@/components/phase2b/proofs-manager';

/** Fase 2b — Halaman "Pembayaran" (Orang Tua): invoice anak + upload bukti + gateway. */
export function ParentPayments() {
  const qc = useQueryClient();
  const [childId, setChildId] = useState('');
  /** Invoice yang sedang di-checkout — null = langkah 1 (pilih tagihan). */
  const [checkout, setCheckout] = useState<ChildInvoiceRow | null>(null);
  /** Langkah checkout: 2 = pilih metode, 3 = pembayaran. */
  const [step, setStep] = useState<2 | 3>(2);
  const [mode, setMode] = useState<'MANUAL' | 'GATEWAY' | null>(null);
  const [amount, setAmount] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofNote, setProofNote] = useState('');
  const invQ = useMeInvoices(childId);
  // Opsi filter anak harus dari daftar LENGKAP (tanpa filter) — kalau ikut
  // invQ yang terfilter, setelah pilih satu anak opsi anak lain hilang.
  const allInvQ = useMeInvoices('');
  const mineQ = useQuery({
    queryKey: ['me-payments'],
    queryFn: () => apiFetch<PaymentListItem[]>('/me/payments'),
  });
  const rcpQ = useQuery({
    queryKey: ['me-receipts'],
    queryFn: () => apiFetch<ReceiptItem[]>('/me/receipts'),
  });
  const resetCheckout = () => {
    setCheckout(null);
    setStep(2);
    setMode(null);
    setAmount('');
    setProofFile(null);
    setProofNote('');
  };
  // Ganti filter anak → batalkan checkout invoice anak sebelumnya supaya
  // bukti/nominal tidak nyangkut ke invoice yang salah.
  useEffect(() => {
    if (checkout && childId && checkout.student.id !== childId) resetCheckout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId]);
  const payM = useMutation({
    mutationFn: async () => {
      if (!checkout) throw new Error('Pilih invoice dulu.');
      if (mode === 'MANUAL') {
        if (!proofFile) throw new Error('Pilih file bukti transfer dulu.');
        const fd = new FormData();
        fd.append('file', proofFile);
        const up = await apiFetch<{ proofUrl: string }>('/me/payments/proof-upload', {
          method: 'POST',
          body: fd,
        });
        return apiFetch<PaymentListItem>('/me/payments/manual-proof', {
          method: 'POST',
          body: {
            invoiceId: checkout.id,
            amount: Number(amount),
            proofUrl: up.proofUrl,
            proofNote: proofNote.trim() || undefined,
          },
        });
      }
      return apiFetch<PaymentListItem>('/me/payments/gateway/initiate', {
        method: 'POST',
        body: { invoiceId: checkout.id, amount: Number(amount) },
      });
    },
    onSuccess: (created) => {
      toast.success(mode === 'MANUAL' ? 'Bukti terkirim — menunggu verifikasi admin.' : 'Tagihan gateway dibuat — lanjutkan pembayaran.');
      // Gateway asli (Midtrans): langsung buka halaman Snap-nya.
      if (mode === 'GATEWAY' && created.redirectUrl && created.provider !== 'DUMMY') {
        window.open(created.redirectUrl, '_blank', 'noopener,noreferrer');
      }
      resetCheckout();
      qc.invalidateQueries({ queryKey: ['me-payments'] });
      qc.invalidateQueries({ queryKey: ['me-invoices'] });
    },
    onError: (e) => toast.error(err2b(e, 'Gagal memproses pembayaran.')),
  });
  const simM = useMutation({
    mutationFn: (args: { providerRef: string; status: 'SUCCESS' | 'FAILED' | 'EXPIRED' }) =>
      apiFetch<PaymentListItem>('/me/payments/gateway/simulate', { method: 'POST', body: args }),
    onSuccess: (p) => {
      toast.success(p.status === 'VERIFIED' ? 'Pembayaran gateway berhasil (simulasi) — kwitansi terbit.' : `Simulasi ${p.status}.`);
      qc.invalidateQueries({ queryKey: ['me-payments'] });
      qc.invalidateQueries({ queryKey: ['me-invoices'] });
      qc.invalidateQueries({ queryKey: ['me-receipts'] });
    },
    onError: (e) => toast.error(err2b(e, 'Simulasi gateway gagal.')),
  });
  // Sinkron status ke provider — dipakai saat ortu kembali dari Snap
  // sebelum webhook Midtrans masuk. Backend tetap yang menentukan status final.
  const checkM = useMutation({
    mutationFn: (paymentId: string) =>
      apiFetch<PaymentListItem>(`/me/payments/${paymentId}/check-status`, { method: 'POST' }),
    onSuccess: (p) => {
      if (p.status === 'VERIFIED') toast.success('Pembayaran berhasil — kwitansi terbit.');
      else if (p.status === 'REJECTED') toast.info(`Pembayaran ${p.rejectReason ?? 'ditolak/kedaluwarsa'}.`);
      qc.invalidateQueries({ queryKey: ['me-payments'] });
      qc.invalidateQueries({ queryKey: ['me-invoices'] });
      qc.invalidateQueries({ queryKey: ['me-receipts'] });
    },
    onError: (e) => toast.error(err2b(e, 'Gagal memeriksa status pembayaran.')),
  });
  // Auto-check saat mount + saat tab kembali fokus (ortu pulang dari tab Snap).
  const autoChecked = useRef<Set<string>>(new Set());
  useEffect(() => {
    const pending = (mineQ.data ?? []).filter(
      (p) => p.channel === 'GATEWAY' && p.status === 'PENDING' && p.provider === 'MIDTRANS' && !autoChecked.current.has(p.id),
    );
    if (!pending.length) return;
    pending.forEach((p) => autoChecked.current.add(p.id));
    pending.forEach((p) => checkM.mutate(p.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mineQ.data]);
  useEffect(() => {
    const onFocus = () => {
      autoChecked.current.clear(); // izinkan cek ulang saat kembali dari Snap
      mineQ.refetch();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const children = [...new Map((allInvQ.data ?? []).map((i) => [i.student.id, i.student])).values()];
  const th = 'px-3 py-2 text-left font-medium whitespace-nowrap';
  const thR = 'px-3 py-2 text-right font-medium whitespace-nowrap';
  const td = 'px-3 py-2 align-top';
  const tdR = 'px-3 py-2 text-right align-top';

  const methodLabel = (m: 'MANUAL' | 'GATEWAY') =>
    m === 'MANUAL' ? 'Transfer Bank (upload bukti)' : 'Pembayaran Online (gateway)';

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pembayaran</h1>
        <p className="text-sm text-muted-foreground">Pilih tagihan → pilih metode → selesaikan pembayaran. Tunai/cash dibayar langsung di kantor oleh admin.</p>
      </div>
      {children.length > 1 && !checkout ? (
        <Phase1aSelectField id="pay-child" label="Filter anak" value={childId} onChange={setChildId}
          options={children.map((c) => ({ value: c.id, label: c.user.name }))} placeholder="Semua anak" />
      ) : null}

      {/* Indikator langkah ala e-commerce */}
      {checkout ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <button type="button" className="font-medium text-primary hover:underline" onClick={resetCheckout}>1. Pilih Tagihan</button>
          <span>›</span>
          <button
            type="button"
            className={step === 2 ? 'font-semibold text-foreground' : 'font-medium text-primary hover:underline'}
            onClick={() => { if (step === 3) setStep(2); }}
          >
            2. Metode Pembayaran
          </button>
          <span>›</span>
          <span className={step === 3 ? 'font-semibold text-foreground' : ''}>3. Pembayaran</span>
        </div>
      ) : null}

      {invQ.isLoading ? <Skeleton className="h-24 w-full" /> : null}
      {invQ.data?.length === 0 && !checkout ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Tidak ada tagihan aktif. Semua lunas.</CardContent></Card>
      ) : null}

      {/* Langkah 1 — pilih tagihan */}
      {!checkout && (invQ.data?.length ?? 0) > 0 ? (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className={th}>Invoice</th>
                <th className={th}>Anak / Program</th>
                <th className={th}>Jatuh Tempo</th>
                <th className={thR}>Sisa Tagihan</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {invQ.data?.map((inv) => {
                const enr = inv.enrollmentLink ?? inv.enrollment;
                const program = enr
                  ? [enr.program?.name, enr.level?.name, enr.group?.name].filter(Boolean).join(' · ')
                  : (inv.package?.name ?? inv.items?.[0]?.description ?? 'Tagihan');
                const overdue = inv.dueDate ? new Date(inv.dueDate) < new Date(new Date().toDateString()) : false;
                return (
                  <tr key={inv.id} className="border-b last:border-0">
                    <td className={`${td} font-medium whitespace-nowrap`}>{inv.number}</td>
                    <td className={td}>
                      <p className="font-medium whitespace-nowrap">{inv.student.user.name}</p>
                      <p className="text-xs text-muted-foreground">{program}</p>
                    </td>
                    <td className={`${td} whitespace-nowrap`}>
                      {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString('id-ID') : '—'}
                      {overdue ? <Badge variant="destructive" className="ml-1.5">Jatuh tempo</Badge> : null}
                    </td>
                    <td className={`${tdR} font-medium tabular-nums whitespace-nowrap`}>
                      {rupiah(sisaInv(inv))}
                      <p className="text-xs font-normal text-muted-foreground">dari {rupiah(inv.totalAmount)}</p>
                    </td>
                    <td className={`${td} text-right`}>
                      <Button
                        size="sm"
                        onClick={() => {
                          setCheckout(inv);
                          setStep(2);
                          setMode(null);
                          setAmount(String(sisaInv(inv)));
                        }}
                      >
                        Bayar
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* Langkah 2 — pilih metode */}
      {checkout && step === 2 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Metode pembayaran — {checkout.number}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              {checkout.student.user.name} · Sisa tagihan <span className="font-semibold text-foreground">{rupiah(sisaInv(checkout))}</span>
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(['MANUAL', 'GATEWAY'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                    mode === m ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:border-primary/50'
                  }`}
                >
                  <p className="font-medium">{methodLabel(m)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {m === 'MANUAL'
                      ? 'Transfer ke rekening bimbel lalu unggah bukti — diverifikasi admin.'
                      : 'Bayar langsung via payment gateway (Midtrans).'}
                  </p>
                </button>
              ))}
            </div>
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              Ingin bayar tunai/cash? Datang ke kantor — admin finance akan mencatat dan menerbitkan kwitansi langsung.
            </p>
            <div className="flex gap-2">
              <Button disabled={!mode} onClick={() => setStep(3)}>Lanjut ke Pembayaran</Button>
              <Button variant="outline" onClick={resetCheckout}>Batal</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Langkah 3 — selesaikan pembayaran */}
      {checkout && step === 3 && mode ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Pembayaran — {methodLabel(mode)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); payM.mutate(); }}>
              <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
                <p className="font-medium">{checkout.number}</p>
                <p className="text-xs text-muted-foreground">
                  {checkout.student.user.name}
                  {(checkout.enrollmentLink ?? checkout.enrollment)
                    ? ` · ${[(checkout.enrollmentLink ?? checkout.enrollment)!.program?.name, (checkout.enrollmentLink ?? checkout.enrollment)!.level?.name].filter(Boolean).join(' · ')}`
                    : checkout.package?.name ? ` · ${checkout.package.name}` : ''}
                </p>
              </div>
              <FormField htmlFor="pay-amount" label="Nominal yang dibayar (Rp)" required hint={`Sisa tagihan ${rupiah(sisaInv(checkout))} — bisa bayar sebagian (angsuran).`}>
                <Input id="pay-amount" type="number" min={1000} max={sisaInv(checkout)} required value={amount} onChange={(e) => setAmount(e.target.value)} />
              </FormField>
              {mode === 'MANUAL' ? (
                <>
                  <FormField
                    htmlFor="pay-proof"
                    label="File bukti transfer"
                    required
                    hint="JPG/PNG/WebP/PDF, maks 2MB."
                  >
                    <Input
                      id="pay-proof"
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      required
                      onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                    />
                  </FormField>
                  <FormField
                    htmlFor="pay-proof-note"
                    label="Catatan (opsional)"
                    hint="mis. transfer BCA a.n. Budi"
                  >
                    <Input id="pay-proof-note" value={proofNote} onChange={(e) => setProofNote(e.target.value)} placeholder="mis. transfer BCA a.n. Budi" />
                  </FormField>
                </>
              ) : null}
              <div className="flex gap-2">
                <SubmitButton
                  loading={payM.isPending}
                  loadingText="Memproses..."
                >
                  {mode === 'MANUAL' ? 'Kirim Bukti Pembayaran' : 'Bayar Sekarang'}
                </SubmitButton>
                <Button type="button" variant="outline" onClick={() => setStep(2)}>Kembali</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}
      <h2 className="text-lg font-medium">Riwayat saya</h2>
      {(mineQ.data?.length ?? 0) > 0 ? (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className={th}>Tanggal</th>
                <th className={th}>Metode</th>
                <th className={th}>Invoice</th>
                <th className={thR}>Jumlah</th>
                <th className={th}>Status</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {mineQ.data?.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className={`${td} whitespace-nowrap text-muted-foreground`}>
                    {new Date(p.createdAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td className={`${td} whitespace-nowrap`}>
                    {p.channel === 'GATEWAY' ? `Online (${p.provider ?? 'gateway'})` : p.method}
                    {p.proofNote ? <p className="text-xs text-muted-foreground">{p.proofNote}</p> : null}
                  </td>
                  <td className={`${td} whitespace-nowrap`}>
                    {(p.allocations ?? []).map((a) => a.invoice.number).join(', ') || '—'}
                  </td>
                  <td className={`${tdR} tabular-nums`}>{rupiah(p.amount)}</td>
                  <td className={`${td} whitespace-nowrap`}>
                    <Badge variant={p.status === 'VERIFIED' ? 'secondary' : p.status === 'REJECTED' ? 'destructive' : 'outline'}>
                      {p.status === 'VERIFIED' ? 'Terverifikasi' : p.status === 'REJECTED' ? `Ditolak${p.rejectReason ? ` — ${p.rejectReason}` : ''}` : 'Menunggu'}
                    </Badge>
                  </td>
                  <td className={`${td} whitespace-nowrap`}>
                    {p.channel === 'GATEWAY' && p.status === 'PENDING' && p.providerRef ? (
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        {p.provider === 'DUMMY' ? (
                          <>
                            <Button size="sm" variant="outline" disabled={simM.isPending}
                              onClick={() => simM.mutate({ providerRef: p.providerRef!, status: 'SUCCESS' })}>
                              Simulasi Sukses
                            </Button>
                            <Button size="sm" variant="outline" disabled={simM.isPending}
                              onClick={() => simM.mutate({ providerRef: p.providerRef!, status: 'FAILED' })}>
                              Simulasi Gagal
                            </Button>
                          </>
                        ) : (
                          <>
                            {p.paymentUrl ? (
                              <Button size="sm" onClick={() => window.open(p.paymentUrl!, '_blank', 'noopener,noreferrer')}>
                                Lanjutkan Bayar
                              </Button>
                            ) : null}
                            <Button size="sm" variant="outline" disabled={checkM.isPending}
                              onClick={() => checkM.mutate(p.id)}>
                              {checkM.isPending ? 'Memeriksa…' : 'Cek Status'}
                            </Button>
                          </>
                        )}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Belum ada riwayat pembayaran.</p>
      )}
      <h2 className="text-lg font-medium">Kwitansi</h2>
      {(rcpQ.data?.length ?? 0) > 0 ? (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className={th}>Nomor</th>
                <th className={th}>Metode</th>
                <th className={th}>Tanggal</th>
                <th className={thR}>Jumlah</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {rcpQ.data?.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className={`${td} font-medium whitespace-nowrap`}>{r.number}</td>
                  <td className={`${td} whitespace-nowrap`}>{r.method}</td>
                  <td className={`${td} whitespace-nowrap text-muted-foreground`}>
                    {new Date(r.issuedAt).toLocaleString('id-ID')}
                  </td>
                  <td className={`${tdR} tabular-nums`}>{rupiah(r.amount)}</td>
                  <td className={`${td} text-right`}>
                    <PrintReceiptButton receiptId={r.id} detailBase="/me/receipts" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Belum ada kwitansi.</p>
      )}
    </div>
  );
}
