"use client";
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, Circle, Clock, Hourglass } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { FormField, SubmitButton } from '@/components/shared/form-field';
import { apiFetch } from '@/lib/api-client';
import { rupiah } from '@/components/phase2a/invoices-manager';
import type { PaymentAccount, PaymentListItem, ReceiptItem } from '@/lib/phase2b-types';
import { err2b } from '@/components/phase2b/payment-shared';
import { PrintReceiptButton } from '@/components/phase2b/receipt-print';
import type { ChildInvoiceRow } from '@/components/phase2b/proofs-manager';

/** Satu baris angsuran pada timeline — invoice terbit atau rencana billingPlan. */
interface InstallmentRow {
  no: number;
  label: string;
  amount: number;
  sisa: number;
  dueDate: string | null;
  state: 'PAID' | 'DUE' | 'UPCOMING' | 'VERIFYING' | 'PLANNED' | 'VOID';
  invoice: {
    id: string;
    number: string;
    totalAmount: number;
    amountPaid: number;
    dueDate: string | null;
    items: { description: string }[];
  } | null;
  receipts: { id: string; number: string }[];
}

interface PlanEnrollment {
  id: string;
  status: string;
  paymentPlan: string | null;
  program: string;
  level: string;
  group: string | null;
  total: number;
  sisa: number;
  installments: InstallmentRow[];
}

interface OtherInvoice {
  id: string;
  number: string;
  description: string;
  totalAmount: number;
  amountPaid: number;
  sisa: number;
  dueDate: string | null;
  state: InstallmentRow['state'];
  receipts: { id: string; number: string }[];
}

interface ChildPlan {
  studentId: string;
  name: string;
  /** Tagihan yang bisa dibayar sekarang (jatuh tempo ≤ akhir bulan ini). */
  dueNow: number;
  /** Total sisa semua tagihan yang belum lunas. */
  totalDue: number;
  enrollments: PlanEnrollment[];
  otherInvoices: OtherInvoice[];
}

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const STATE_META: Record<
  InstallmentRow['state'],
  { text: string; cls: string; icon: 'check' | 'due' | 'clock' | 'plain' }
> = {
  PAID: { text: 'Lunas', cls: 'border-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/20', icon: 'check' },
  VERIFYING: { text: 'Menunggu verifikasi', cls: 'border-sky-300 bg-sky-50/60 dark:bg-sky-950/20', icon: 'clock' },
  DUE: { text: 'Jatuh Tempo', cls: 'border-amber-400 bg-amber-50/60 dark:bg-amber-950/20', icon: 'due' },
  UPCOMING: { text: 'Belum Jatuh Tempo', cls: '', icon: 'plain' },
  PLANNED: { text: 'Belum Terbit', cls: '', icon: 'plain' },
  VOID: { text: 'Dibatalkan', cls: 'opacity-60', icon: 'plain' },
};

function StateIcon({ icon }: { icon: 'check' | 'due' | 'clock' | 'plain' }) {
  if (icon === 'check') return <CheckCircle2 className="size-5 text-emerald-500" />;
  if (icon === 'due') return <Clock className="size-5 text-amber-500" />;
  if (icon === 'clock') return <Hourglass className="size-5 text-sky-500" />;
  return <Circle className="size-5 text-muted-foreground/40" />;
}

/** Fase 2b — Halaman "Pembayaran" (Orang Tua): pilih anak → timeline
 *  angsuran → checkout (metode → bayar) → riwayat & kwitansi per anak. */
export function ParentPayments() {
  const qc = useQueryClient();
  const [childId, setChildId] = useState('');
  /** Invoice yang sedang di-checkout — null = daftar angsuran. */
  const [checkout, setCheckout] = useState<ChildInvoiceRow | null>(null);
  /** Langkah checkout: 2 = pilih metode, 3 = pembayaran. */
  const [step, setStep] = useState<2 | 3>(2);
  const [mode, setMode] = useState<'MANUAL' | 'GATEWAY' | null>(null);
  const [amount, setAmount] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofNote, setProofNote] = useState('');
  const [histSearch, setHistSearch] = useState('');
  const [histStatus, setHistStatus] = useState('');
  const [histChannel, setHistChannel] = useState('');
  const [accountId, setAccountId] = useState('');
  const planQ = useQuery({
    queryKey: ['me-payment-plan'],
    queryFn: () => apiFetch<ChildPlan[]>('/me/payment-plan'),
  });
  // Rekening tujuan transfer — ditampilkan ke ortu saat memilih metode manual.
  const accountsQ = useQuery({
    queryKey: ['me-payment-accounts'],
    queryFn: () => apiFetch<PaymentAccount[]>('/me/payment-accounts'),
    staleTime: 5 * 60 * 1000,
  });
  const payAccounts = accountsQ.data ?? [];
  const mineQ = useQuery({
    queryKey: ['me-payments'],
    queryFn: () => apiFetch<PaymentListItem[]>('/me/payments'),
  });
  const rcpQ = useQuery({
    queryKey: ['me-receipts'],
    queryFn: () => apiFetch<ReceiptItem[]>('/me/receipts'),
  });
  const children = planQ.data ?? [];
  const child = children.find((c) => c.studentId === childId) ?? null;
  const resetCheckout = () => {
    setCheckout(null);
    setStep(2);
    setMode(null);
    setAmount('');
    setProofFile(null);
    setProofNote('');
    setAccountId('');
  };
  const payM = useMutation({
    mutationFn: async () => {
      if (!checkout) throw new Error('Pilih tagihan dulu.');
      if (mode === 'MANUAL') {
        if (!proofFile) throw new Error('Pilih file bukti transfer dulu.');
        if (payAccounts.length > 0 && !accountId) {
          throw new Error('Pilih rekening tujuan transfer dulu.');
        }
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
            accountId: accountId || undefined,
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
      qc.invalidateQueries({ queryKey: ['me-payment-plan'] });
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
      qc.invalidateQueries({ queryKey: ['me-payment-plan'] });
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
      qc.invalidateQueries({ queryKey: ['me-payment-plan'] });
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
      planQ.refetch();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Bangun objek invoice untuk alur checkout dari baris angsuran. */
  const startCheckout = (
    c: ChildPlan,
    inv: InstallmentRow['invoice'],
    enr?: PlanEnrollment,
  ) => {
    if (!inv) return;
    setCheckout({
      id: inv.id,
      number: inv.number,
      totalAmount: inv.totalAmount,
      amountPaid: inv.amountPaid,
      dueDate: inv.dueDate,
      student: { id: c.studentId, user: { name: c.name } },
      package: null,
      enrollmentLink: enr
        ? {
            program: { name: enr.program },
            level: { name: enr.level },
            group: enr.group ? { name: enr.group } : null,
          }
        : null,
      enrollment: null,
      items: inv.items,
    } as ChildInvoiceRow);
    setAmount(String(inv.totalAmount - inv.amountPaid));
    setStep(2);
    setMode(null);
  };

  // Riwayat & kwitansi difilter ke anak yang sedang dibuka.
  const paymentChildId = (p: PaymentListItem) =>
    p.studentId ?? p.allocations?.[0]?.invoice?.student?.id ?? null;
  const visiblePayments = (mineQ.data ?? []).filter((p) => {
    if (childId && paymentChildId(p) !== childId) return false;
    if (histStatus && p.status !== histStatus) return false;
    if (histChannel && p.channel !== histChannel) return false;
    if (!histSearch.trim()) return true;
    const q = histSearch.trim().toLowerCase();
    return (
      (p.allocations ?? []).some((a) => a.invoice.number.toLowerCase().includes(q)) ||
      (p.proofNote ?? '').toLowerCase().includes(q) ||
      (p.method ?? '').toLowerCase().includes(q)
    );
  });
  const visibleReceipts = (rcpQ.data ?? []).filter(
    (r) => !childId || r.studentId === childId,
  );

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
        <p className="text-sm text-muted-foreground">
          Pilih anak → lihat angsuran → bayar. Tunai/cash dibayar langsung di kantor oleh admin.
        </p>
      </div>

      {/* Langkah 1 — pilih anak */}
      {!childId && !checkout ? (
        planQ.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : children.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {children.map((c) => (
              <button
                key={c.studentId}
                type="button"
                onClick={() => setChildId(c.studentId)}
                className="group rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-accent/40"
              >
                <p className="font-medium">{c.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {c.dueNow > 0
                    ? `Tagihan bulan ini: ${rupiah(c.dueNow)}`
                    : c.totalDue > 0
                      ? `Sisa tagihan: ${rupiah(c.totalDue)}`
                      : 'Tidak ada tagihan aktif'}
                </p>
                {c.dueNow > 0 ? (
                  <Badge variant="destructive" className="mt-2">Perlu dibayar</Badge>
                ) : c.totalDue > 0 ? (
                  <Badge variant="outline" className="mt-2">Cicilan berjalan</Badge>
                ) : (
                  <Badge variant="secondary" className="mt-2">Lunas</Badge>
                )}
              </button>
            ))}
          </div>
        ) : (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Belum ada anak yang tertaut ke akun ini.</CardContent></Card>
        )
      ) : null}

      {/* Langkah 2 — detail anak: total + timeline angsuran */}
      {child && !checkout ? (
        <div className="flex flex-col gap-5">
          <Button variant="outline" size="sm" className="w-fit" onClick={() => setChildId('')}>
            Kembali
          </Button>

          <Card>
            <CardContent className="py-6 text-center">
              <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
                Tagihan bulan ini
              </p>
              <p className="mt-1 text-3xl font-bold tabular-nums">{rupiah(child.dueNow)}</p>
              {child.totalDue > child.dueNow ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Total sisa semua cicilan: {rupiah(child.totalDue)}
                </p>
              ) : null}
            </CardContent>
          </Card>

          {child.enrollments.map((enr) => {
            const firstDue = enr.installments.find((x) => x.invoice && (x.state === 'DUE' || x.state === 'UPCOMING'));
            return (
              <Card key={enr.id}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">
                    {enr.program} · {enr.level}
                    {enr.group ? ` · ${enr.group}` : ''}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {enr.paymentPlan === 'FULL'
                      ? 'Tunai (lunas di awal)'
                      : enr.paymentPlan === 'TWO_TIMES'
                        ? 'Angsuran 2x'
                        : enr.paymentPlan === 'MONTHLY'
                          ? `Angsuran bulanan — ${enr.installments.length}x`
                          : 'Tagihan pendaftaran'}
                  </p>
                </CardHeader>
                <CardContent className="grid gap-0">
                  {enr.installments.map((inst) => {
                    if (inst.state === 'VOID') return null;
                    const meta = STATE_META[inst.state];
                    return (
                      <div
                        key={inst.no}
                        className={`flex items-center gap-3 border-l-2 py-2 pl-4 ${inst.state === 'PAID' ? 'border-emerald-400' : inst.state === 'DUE' || inst.state === 'VERIFYING' ? 'border-amber-400' : 'border-muted'}`}
                      >
                        <StateIcon icon={meta.icon} />
                        <div className={`flex-1 rounded-lg border px-3 py-2.5 ${meta.cls}`}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-medium">
                                Angsuran {inst.no} — {meta.text}
                                {inst.sisa > 0.009 ? ` (${rupiah(inst.sisa)})` : ` (${rupiah(inst.amount)})`}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {inst.invoice?.number ? `${inst.invoice.number} · ` : ''}
                                Jatuh tempo {fmtDate(inst.dueDate)}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              {inst.state === 'PAID'
                                ? inst.receipts.map((r) => (
                                    <PrintReceiptButton key={r.id} receiptId={r.id} detailBase="/me/receipts" />
                                  ))
                                : null}
                              {inst.invoice && (inst.state === 'DUE' || inst.state === 'UPCOMING') ? (
                                <Button size="sm" onClick={() => startCheckout(child, inst.invoice, enr)}>
                                  Bayar
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {firstDue ? (
                    <div className="mt-3 flex justify-end">
                      <Button onClick={() => startCheckout(child, firstDue.invoice, enr)}>
                        Bayar {rupiah(firstDue.sisa)}
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}

          {child.otherInvoices.length > 0 ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Tagihan lainnya</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-0">
                {child.otherInvoices.map((inv) => {
                  const meta = STATE_META[inv.state];
                  return (
                    <div key={inv.id} className="flex items-center gap-3 border-l-2 border-muted py-2 pl-4">
                      <StateIcon icon={meta.icon} />
                      <div className={`flex-1 rounded-lg border px-3 py-2.5 ${meta.cls}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">
                              {inv.description} — {meta.text} ({rupiah(inv.sisa)})
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {inv.number} · Jatuh tempo {fmtDate(inv.dueDate)}
                            </p>
                          </div>
                          {(inv.state === 'DUE' || inv.state === 'UPCOMING') ? (
                            <Button
                              size="sm"
                              onClick={() =>
                                startCheckout(child, {
                                  id: inv.id,
                                  number: inv.number,
                                  totalAmount: inv.totalAmount,
                                  amountPaid: inv.amountPaid,
                                  dueDate: inv.dueDate,
                                  items: [{ description: inv.description }],
                                })
                              }
                            >
                              Bayar
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ) : null}

          {child.enrollments.length === 0 && child.otherInvoices.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Tidak ada tagihan untuk {child.name}.</CardContent></Card>
          ) : null}
        </div>
      ) : null}

      {/* Indikator langkah checkout */}
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

      {/* Langkah 2 — pilih metode */}
      {checkout && step === 2 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Metode pembayaran — {checkout.number}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              {checkout.student.user.name} · Sisa tagihan{' '}
              <span className="font-semibold text-foreground">
                {rupiah(Number(checkout.totalAmount) - Number(checkout.amountPaid))}
              </span>
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
                  {checkout.enrollmentLink
                    ? ` · ${[checkout.enrollmentLink.program?.name, checkout.enrollmentLink.level?.name].filter(Boolean).join(' · ')}`
                    : checkout.package?.name ? ` · ${checkout.package.name}` : ''}
                </p>
              </div>
              <FormField htmlFor="pay-amount" label="Nominal yang dibayar (Rp)" required hint={`Sisa tagihan ${rupiah(Number(checkout.totalAmount) - Number(checkout.amountPaid))} — bisa bayar sebagian (angsuran).`}>
                <Input id="pay-amount" type="number" min={1000} max={Number(checkout.totalAmount) - Number(checkout.amountPaid)} required value={amount} onChange={(e) => setAmount(e.target.value)} />
              </FormField>
              {mode === 'MANUAL' ? (
                <>
                  {payAccounts.length > 0 ? (
                    <div className="flex flex-col gap-1.5">
                      <p className="text-sm font-medium">
                        Transfer ke rekening <span className="text-destructive">*</span>
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {payAccounts.map((acc) => (
                          <button
                            key={acc.id}
                            type="button"
                            onClick={() => setAccountId(acc.id)}
                            className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                              accountId === acc.id
                                ? 'border-primary bg-primary/5 ring-1 ring-primary'
                                : 'hover:border-primary/50'
                            }`}
                          >
                            <p className="text-sm font-medium">{acc.name}</p>
                            {acc.accountNumber ? (
                              <p className="mt-0.5 font-mono text-sm tracking-wide">
                                {acc.accountNumber}
                                <span
                                  role="button"
                                  tabIndex={0}
                                  className="ml-2 cursor-pointer text-xs font-normal text-primary underline-offset-2 hover:underline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard?.writeText(acc.accountNumber ?? '');
                                    toast.success('Nomor rekening disalin.');
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') e.stopPropagation();
                                  }}
                                >
                                  salin
                                </span>
                              </p>
                            ) : null}
                            {acc.holderName ? (
                              <p className="text-xs text-muted-foreground">a.n. {acc.holderName}</p>
                            ) : null}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Pilih rekening yang Anda tuju saat transfer — membantu admin mencocokkan bukti Anda.
                      </p>
                    </div>
                  ) : null}
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

      {/* Riwayat & kwitansi — hanya di daftar anak. Detail anak sudah
          menampilkan timeline angsuran + cetak kwitansi per baris, jadi
          tabel di bawah tidak perlu diulang. */}
      {!child ? (
        <>
      <h2 className="text-lg font-medium">Riwayat Pembayaran</h2>
      {(mineQ.data?.length ?? 0) > 0 ? (
        <div className="flex flex-wrap gap-2">
          <Input
            className="w-full sm:w-64"
            placeholder="Cari nomor invoice / catatan…"
            value={histSearch}
            onChange={(e) => setHistSearch(e.target.value)}
          />
          <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={histStatus} onChange={(e) => setHistStatus(e.target.value)} aria-label="Filter status pembayaran">
            <option value="">Semua status</option>
            <option value="VERIFIED">Terverifikasi</option>
            <option value="PENDING">Menunggu</option>
            <option value="REJECTED">Ditolak</option>
          </select>
          <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={histChannel} onChange={(e) => setHistChannel(e.target.value)} aria-label="Filter metode pembayaran">
            <option value="">Semua metode</option>
            <option value="MANUAL">Transfer manual</option>
            <option value="GATEWAY">Online</option>
            <option value="CASH">Tunai</option>
          </select>
        </div>
      ) : null}
      {visiblePayments.length > 0 ? (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[720px] text-sm">
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
              {visiblePayments.map((p) => (
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
        <p className="text-sm text-muted-foreground">
          {(mineQ.data?.length ?? 0) > 0
            ? 'Tidak ada pembayaran yang cocok dengan filter.'
            : 'Belum ada riwayat pembayaran.'}
        </p>
      )}
      <h2 className="text-lg font-medium">Kwitansi</h2>
      {visibleReceipts.length > 0 ? (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[720px] text-sm">
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
              {visibleReceipts.map((r) => (
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
        </>
      ) : null}
    </div>
  );
}
