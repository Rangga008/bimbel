"use client";
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ComboboxField } from '@/components/shared/combobox-field';
import { CurrencyInput } from '@/components/shared/currency-input';
import { apiFetch } from '@/lib/api-client';
import { rupiah } from '@/components/phase2a/invoices-manager';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import type { PaymentListItem } from '@/lib/phase2b-types';

interface PlanInstallment {
  no: number;
  label: string;
  amount: number;
  sisa: number;
  dueDate: string | null;
  state: string;
  invoice: { id: string; number: string } | null;
}
interface PlanEnrollment {
  id: string;
  program: string;
  level: string;
  installments: PlanInstallment[];
}
interface PlanStudent {
  studentId: string;
  enrollments: PlanEnrollment[];
}

const PLAN_STATE_LABEL: Record<string, string> = {
  PAID: 'Lunas',
  VERIFYING: 'Menunggu verifikasi',
  DUE: 'Jatuh tempo',
  UPCOMING: 'Belum jatuh tempo',
  PLANNED: 'Belum terbit',
  VOID: 'Batal',
};
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
  const [studentSearch, setStudentSearch] = useState('');
  const debouncedStudentSearch = useDebouncedValue(studentSearch);
  const [cashStudent, setCashStudent] = useState<{ id: string; name: string } | null>(null);
  const [inst, setInst] = useState<PlanInstallment | null>(null);
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
  // Siswa untuk autocomplete — hasil difilter client-side dari daftar siswa
  // (sudah di-fetch untuk filter di atas).
  const cashStudentOptions = (filterStudentsQ.data ?? [])
    .filter((s) =>
      !debouncedStudentSearch ||
      s.user.name.toLowerCase().includes(debouncedStudentSearch.toLowerCase()),
    )
    .slice(0, 10);
  // Timeline angsuran siswa terpilih — endpoint yang sama seperti tampilan
  // ortu & detail siswa admin.
  const planQ = useQuery({
    queryKey: ['cash-plan', cashStudent?.id],
    queryFn: () =>
      apiFetch<PlanStudent[]>(`/payment-plan/student/${cashStudent!.id}`),
    enabled: openCash && !!cashStudent,
  });
  const pendingQ = useQuery({
    queryKey: ['payments-pending-count'],
    queryFn: () => apiFetch<{ count: number }>('/payments/pending-count'),
  });
  const cashM = useMutation({
    mutationFn: () =>
      apiFetch<PaymentListItem>('/payments/cash', {
        method: 'POST',
        body: {
          invoiceId: inst!.invoice!.id,
          amount: Number(amount),
          note: note || undefined,
        },
      }),
    onSuccess: (p) => {
      toast.success(`Cash terverifikasi — kwitansi ${p.receipts?.[0]?.number ?? 'terbit'}.`);
      setOpenCash(false);
      setCashStudent(null);
      setInst(null);
      setStudentSearch('');
      setAmount('');
      setNote('');
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['cash-plan'] });
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
        <div className="w-full sm:w-40">
          <ComboboxField
            id="pay-status-filter"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'PENDING', label: 'PENDING' },
              { value: 'VERIFIED', label: 'VERIFIED' },
              { value: 'REJECTED', label: 'REJECTED' },
            ]}
            placeholder="Semua status"
          />
        </div>
        <div className="w-full sm:w-40">
          <ComboboxField
            id="pay-channel-filter"
            value={channel}
            onChange={setChannel}
            options={[
              { value: 'CASH', label: 'CASH' },
              { value: 'MANUAL', label: 'MANUAL' },
              { value: 'GATEWAY', label: 'GATEWAY' },
            ]}
            placeholder="Semua channel"
          />
        </div>
        <div className="w-full sm:w-56">
          <ComboboxField
            id="pay-student-filter"
            value={filterStudent}
            onChange={setFilterStudent}
            options={(filterStudentsQ.data ?? []).map((s) => ({ value: s.id, label: s.user.name }))}
            placeholder="Semua siswa"
          />
        </div>
        <div className="w-full sm:w-52">
          <ComboboxField
            id="pay-group-filter"
            value={filterGroup}
            onChange={setFilterGroup}
            options={(groupsQ.data ?? []).map((g) => ({ value: g.id, label: g.name }))}
            placeholder="Semua kelompok"
          />
        </div>
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
          <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); if (inst?.invoice) cashM.mutate(); }}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cash-student">Cari siswa</Label>
              <Input
                id="cash-student"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="Ketik nama siswa..."
                autoComplete="off"
                disabled={!!cashStudent}
              />
            </div>

            {!cashStudent ? (
              <div className="max-h-48 overflow-y-auto rounded-md border">
                {cashStudentOptions.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">
                    {debouncedStudentSearch ? 'Siswa tidak ditemukan.' : 'Ketik nama untuk mencari siswa.'}
                  </p>
                ) : (
                  cashStudentOptions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="flex w-full items-center justify-between gap-3 border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted/50"
                      onClick={() => {
                        setCashStudent({ id: s.id, name: s.user.name });
                        setStudentSearch(s.user.name);
                      }}
                    >
                      <span className="truncate font-medium">{s.user.name}</span>
                    </button>
                  ))
                )}
              </div>
            ) : inst ? (
              <div className="flex items-center justify-between rounded-md border border-primary bg-primary/5 px-3 py-2 text-sm">
                <div>
                  <p className="font-medium">{inst.label} — {cashStudent.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {inst.invoice?.number} · Sisa{' '}
                    <span className="font-semibold text-foreground">{rupiah(inst.sisa)}</span>
                  </p>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => { setInst(null); setAmount(''); }}>
                  Ganti
                </Button>
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto rounded-md border">
                {planQ.isLoading ? (
                  <p className="p-3 text-sm text-muted-foreground">Memuat angsuran...</p>
                ) : (planQ.data?.[0]?.enrollments ?? []).length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">Siswa belum punya paket/tagihan.</p>
                ) : (
                  planQ.data![0].enrollments.map((enr) => (
                    <div key={enr.id}>
                      <p className="border-b bg-muted/40 px-3 py-1.5 text-xs font-semibold">
                        {enr.program} · {enr.level}
                      </p>
                      {enr.installments.map((i) => {
                        const payable = !!i.invoice && i.sisa > 0.009;
                        return (
                          <button
                            key={i.no}
                            type="button"
                            disabled={!payable}
                            className="flex w-full items-center justify-between gap-3 border-b px-3 py-2 text-left text-sm last:border-0 enabled:hover:bg-muted/50 disabled:opacity-50"
                            onClick={() => { setInst(i); setAmount(String(Math.round(i.sisa))); }}
                          >
                            <div className="min-w-0">
                              <p className="truncate font-medium">
                                Angsuran {i.no} — {i.label}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {i.dueDate
                                  ? `Jatuh tempo ${new Date(i.dueDate).toLocaleDateString('id-ID')}`
                                  : ''}{' '}
                                · {PLAN_STATE_LABEL[i.state] ?? i.state}
                              </p>
                            </div>
                            <span className="shrink-0 font-medium tabular-nums">
                              {i.state === 'PAID' ? rupiah(i.amount) : rupiah(i.sisa)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ))
                )}
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted/50"
                  onClick={() => { setCashStudent(null); setStudentSearch(''); }}
                >
                  ← Ganti siswa ({cashStudent.name})
                </button>
              </div>
            )}
            <CurrencyInput
              id="cash-amount"
              label="Nominal"
              required
              value={amount}
              onChange={setAmount}
              placeholder="mis. 1.200.000"
            />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cash-note">Catatan (opsional)</Label>
              <Input id="cash-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Diterima dari..." />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={!inst?.invoice || cashM.isPending}>{cashM.isPending ? 'Menyimpan...' : 'Simpan & Verifikasi'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <VerifyDialog verifyId={verifyId} onClose={() => setVerifyId(null)} />
    </div>
  );
}
