"use client";
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowDown, ArrowUp, ArrowUpDown, Banknote, Coins, Eye, Wallet,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ComboboxField } from '@/components/shared/combobox-field';
import { EmptyState } from '@/components/shared/empty-state';
import { ListPager } from '@/components/shared/list-pager';
import { SkeletonTableRows } from '@/components/shared/skeletons';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { apiFetch, ApiError } from '@/lib/api-client';
import { rupiah } from '@/components/phase2a/invoices-manager';
import type { FinancialAccount } from '@/lib/phase2d-types';
import type { PayrollRunDetail, PayrollRunRow } from '@/lib/phase5a-types';
import { workTypeLabel } from '@/lib/phase5a-types';
import { TutorRatesManager } from './tutor-rates-manager';
import { WorkItemsPanel } from './work-items-panel';

function err(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}

function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const selectCls = 'h-9 rounded-md border border-input bg-background px-3 text-sm';

/** Fase 5a — Payroll tutor: tarik work items dari sesi, hitung payroll, adjustment, bayar. */
export function PayrollManager({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const [period, setPeriod] = useState(currentPeriod());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [payTarget, setPayTarget] = useState<PayrollRunRow | null>(null);
  const [payAccountId, setPayAccountId] = useState('');
  const [adjForm, setAdjForm] = useState({ amount: '', reason: '' });
  const [adjToDelete, setAdjToDelete] = useState<{ id: string; reason: string; amount: string | number } | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['payroll'] });
    qc.invalidateQueries({ queryKey: ['ledger'] });
    qc.invalidateQueries({ queryKey: ['expenses'] });
  };

  const runsQ = useQuery({
    queryKey: ['payroll', 'runs', period],
    queryFn: () => apiFetch<PayrollRunRow[]>(`/payroll/runs?period=${period}`),
  });

  const detailQ = useQuery({
    enabled: !!detailId,
    queryKey: ['payroll', 'run', detailId],
    queryFn: () => apiFetch<PayrollRunDetail>(`/payroll/runs/${detailId}`),
  });

  const accountsQ = useQuery({
    // QueryKey unik per endpoint — dulu berbagi 'financial-accounts' dengan
    // Pengaturan (/financial-accounts = array) padahal ini /ledger = object,
    // bikin crash `.map is not a function` saat cache tertukar antar-halaman.
    queryKey: ['ledger-accounts'],
    queryFn: () => apiFetch<{ accounts: FinancialAccount[] }>('/ledger'),
    select: (d) => d.accounts.filter((a) => a.isActive),
  });

  const genItemsM = useMutation({
    mutationFn: () =>
      apiFetch<{ created: number; skippedExisting: number; unrated: unknown[] }>('/payroll/work-items/generate', {
        method: 'POST',
        body: { period },
      }),
    onSuccess: (r) => {
      toast.success(
        `Work items ditarik: ${r.created} dibuat, ${r.skippedExisting} sudah ada.` +
          (r.unrated.length ? ` ${r.unrated.length} sesi tanpa tarif — atur tarif lalu Reprice.` : ''),
      );
      invalidate();
    },
    onError: (e) => toast.error(err(e, 'Gagal menarik work items.')),
  });

  const repriceM = useMutation({
    mutationFn: () =>
      apiFetch<{ repriced: number; stillUnrated: number }>('/payroll/work-items/reprice', {
        method: 'POST',
        body: { period },
      }),
    onSuccess: (r) => {
      toast.success(`Reprice selesai: ${r.repriced} item diperbarui, ${r.stillUnrated} masih tanpa tarif.`);
      invalidate();
    },
    onError: (e) => toast.error(err(e, 'Gagal reprice.')),
  });

  const genRunsM = useMutation({
    mutationFn: () =>
      apiFetch<{ processed: number; created: number; updated: number; skippedPaid: string[] }>(
        '/payroll/runs/generate',
        { method: 'POST', body: { period } },
      ),
    onSuccess: (r) => {
      toast.success(
        `Payroll dihitung: ${r.created} run baru, ${r.updated} diperbarui.` +
          (r.skippedPaid.length ? ` ${r.skippedPaid.length} tutor sudah dibayar — dilewati.` : ''),
      );
      invalidate();
    },
    onError: (e) => toast.error(err(e, 'Gagal menghitung payroll.')),
  });

  const adjM = useMutation({
    mutationFn: () =>
      apiFetch(`/payroll/runs/${detailId}/adjustments`, {
        method: 'POST',
        body: { amount: Number(adjForm.amount), reason: adjForm.reason },
      }),
    onSuccess: () => {
      toast.success('Adjustment ditambahkan.');
      setAdjForm({ amount: '', reason: '' });
      invalidate();
    },
    onError: (e) => toast.error(err(e, 'Gagal menambah adjustment.')),
  });

  const delAdjM = useMutation({
    mutationFn: (adjustmentId: string) =>
      apiFetch(`/payroll/runs/${detailId}/adjustments/${adjustmentId}`, { method: 'DELETE' }),
    onSuccess: () => {
      setAdjToDelete(null);
      toast.success('Adjustment dihapus.');
      invalidate();
    },
    onError: (e) => toast.error(err(e, 'Gagal menghapus adjustment.')),
  });

  const payM = useMutation({
    mutationFn: () =>
      apiFetch(`/payroll/runs/${payTarget?.id}/pay`, { method: 'POST', body: { accountId: payAccountId } }),
    onSuccess: () => {
      toast.success('Payroll ditandai dibayar — kas/bank berkurang via ledger.');
      setPayTarget(null);
      setPayAccountId('');
      setDetailId(null);
      invalidate();
    },
    onError: (e) => toast.error(err(e, 'Gagal memproses pembayaran.')),
  });

  const runs = useMemo(() => runsQ.data ?? [], [runsQ.data]);
  const detail = detailQ.data;
  const th = 'px-3 py-2.5 font-medium text-left';
  const thR = 'px-3 py-2.5 font-medium text-right';
  const td = 'px-3 py-2.5';
  const tdR = 'px-3 py-2.5 text-right tabular-nums';

  // Sort & paginate client-side — tampilan saja, data/API tidak berubah.
  const [sort, setSort] = useState<{ key: 'tutor' | 'net' | null; dir: 1 | -1 }>({ key: null, dir: 1 });
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 10;
  const sortedRuns = useMemo(() => {
    if (!sort.key) return runs;
    return [...runs].sort((a, b) => {
      const av = sort.key === 'tutor' ? (a.tutor?.user.name ?? '') : Number(a.netAmount);
      const bv = sort.key === 'tutor' ? (b.tutor?.user.name ?? '') : Number(b.netAmount);
      return (av > bv ? 1 : av < bv ? -1 : 0) * sort.dir;
    });
  }, [runs, sort]);
  const pageCount = Math.ceil(sortedRuns.length / PAGE_SIZE);
  const pageRuns = sortedRuns.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function toggleSort(key: 'tutor' | 'net') {
    setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }));
    setPage(0);
  }

  function sortIcon(key: 'tutor' | 'net') {
    if (sort.key !== key) return <ArrowUpDown className="size-3.5 text-muted-foreground" />;
    return sort.dir === 1 ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Gaji Bulanan Tutor</h1>
        <p className="text-sm text-muted-foreground">
          Honor dihitung dari work items (ditarik dari sesi mengajar) x tarif tutor — bukan input manual.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="month"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3"
        />
        {canManage ? (
          <>
            <Button variant="outline" onClick={() => genItemsM.mutate()} disabled={genItemsM.isPending}>
              {genItemsM.isPending ? 'Menarik...' : 'Tarik Work Items'}
            </Button>
            <Button variant="outline" onClick={() => repriceM.mutate()} disabled={repriceM.isPending}>
              {repriceM.isPending ? 'Memproses...' : 'Reprice Tarif'}
            </Button>
            <Button onClick={() => genRunsM.mutate()} disabled={genRunsM.isPending}>
              {genRunsM.isPending ? 'Menghitung...' : 'Hitung Gaji'}
            </Button>
          </>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payroll Periode {period}</CardTitle>
          <CardDescription>gross = Σ work items · net = gross + Σ adjustment · status pembayaran per tutor.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {runsQ.isLoading ? <SkeletonTableRows /> : null}
          {runsQ.isError ? <p className="text-sm text-destructive">Gagal memuat payroll.</p> : null}
          {runs.length === 0 && !runsQ.isLoading ? (
            <EmptyState
              icon={Coins}
              title="Belum ada payroll"
              description='Tarik work items lalu tekan "Hitung Payroll" untuk membuat payroll periode ini.'
            />
          ) : null}
          {runs.length > 0 ? (
            <>
              {/* Mobile: kartu ringkas (tap untuk rincian) */}
              <div className="flex flex-col gap-2 md:hidden">
                {sortedRuns.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setDetailId(r.id)}
                    className="flex items-center gap-3 rounded-xl border bg-card px-3 py-3 text-left transition-colors hover:bg-muted/50"
                  >
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-blue-50 text-brand-blue-600">
                      <Wallet className="size-4.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {r.tutor?.user.name ?? '—'}
                      </p>
                      <p className="truncate text-xs text-muted-foreground tabular-nums">
                        {r.number} · {r._count?.workItems ?? 0} item
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums">{rupiah(r.netAmount)}</p>
                      {r.status === 'PAID' ? (
                        <Badge variant="success">Lunas</Badge>
                      ) : (
                        <Badge variant="warning">Belum dibayar</Badge>
                      )}
                    </div>
                  </button>
                ))}
              </div>

              {/* Desktop: tabel dengan sticky header, sortable, hover */}
              <div className="hidden max-h-[65vh] overflow-auto rounded-xl border md:block">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b bg-muted">
                      <th className={th}>No.</th>
                      <th className={th}>
                        <button
                          type="button"
                          onClick={() => toggleSort('tutor')}
                          className="inline-flex items-center gap-1 font-medium hover:text-foreground"
                        >
                          Tutor {sortIcon('tutor')}
                        </button>
                      </th>
                      <th className={thR}>Item</th>
                      <th className={thR}>Gross</th>
                      <th className={thR}>Adjustment</th>
                      <th className={thR}>
                        <button
                          type="button"
                          onClick={() => toggleSort('net')}
                          className="inline-flex items-center justify-end gap-1 font-medium hover:text-foreground"
                        >
                          Net {sortIcon('net')}
                        </button>
                      </th>
                      <th className={th}>Status</th>
                      <th className={th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRuns.map((r) => (
                      <tr
                        key={r.id}
                        className="border-b transition-colors last:border-0 hover:bg-muted/50"
                      >
                        <td className={`${td} font-mono text-xs`}>{r.number}</td>
                        <td className={td}>{r.tutor?.user.name ?? '—'}</td>
                        <td className={tdR}>{r._count?.workItems ?? 0}</td>
                        <td className={tdR}>{rupiah(r.grossAmount)}</td>
                        <td className={tdR}>
                          {Number(r.adjustmentAmount) !== 0 ? rupiah(r.adjustmentAmount) : '—'}
                        </td>
                        <td className={`${tdR} font-semibold`}>{rupiah(r.netAmount)}</td>
                        <td className={td}>
                          {r.status === 'PAID' ? (
                            <Badge variant="success">Lunas</Badge>
                          ) : (
                            <Badge variant="warning">Belum dibayar</Badge>
                          )}
                        </td>
                        <td className={td}>
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Rincian ${r.number}`}
                              onClick={() => setDetailId(r.id)}
                            >
                              <Eye className="size-4" />
                            </Button>
                            {canManage && r.status === 'UNPAID' ? (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Bayar ${r.number}`}
                                onClick={() => setPayTarget(r)}
                              >
                                <Banknote className="size-4 text-success-600" />
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ListPager
                page={page}
                pageCount={pageCount}
                total={sortedRuns.length}
                shown={PAGE_SIZE}
                onPageChange={setPage}
                className="hidden md:flex"
              />
            </>
          ) : null}
        </CardContent>
      </Card>

      <WorkItemsPanel period={period} canManage={canManage} />
      <TutorRatesManager canManage={canManage} />

      {/* Dialog rincian run: auditable — tiap angka bisa dilacak ke work items & adjustment. */}
      <Dialog open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Rincian Payroll {detail?.number ?? ''} — {detail?.tutor?.user.name ?? ''}
            </DialogTitle>
            <DialogDescription>
              Periode {detail?.period} · status {detail?.status === 'PAID' ? 'sudah dibayar' : 'belum dibayar'}
            </DialogDescription>
          </DialogHeader>
          {detailQ.isLoading ? <SkeletonTableRows rows={4} /> : null}
          {detail ? (
            <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto text-sm">
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className={th}>Tanggal</th>
                      <th className={th}>Jenis</th>
                      <th className={th}>Deskripsi</th>
                      <th className={thR}>Qty</th>
                      <th className={thR}>Tarif</th>
                      <th className={thR}>Jumlah</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.workItems.map((w) => (
                      <tr key={w.id} className="border-b last:border-0">
                        <td className={td}>{new Date(w.occurredAt).toLocaleDateString('id-ID')}</td>
                        <td className={td}>
                          {workTypeLabel(w.workType)}
                          {w.sessionId ? (
                            <span className="ml-1 text-xs text-muted-foreground">(sesi)</span>
                          ) : (
                            <span className="ml-1 text-xs text-muted-foreground">(manual)</span>
                          )}
                        </td>
                        <td className={td}>{w.description}</td>
                        <td className={tdR}>{Number(w.quantity)}</td>
                        <td className={tdR}>{rupiah(w.unitAmount)}</td>
                        <td className={tdR}>{rupiah(w.amount)}</td>
                      </tr>
                    ))}
                    <tr className="bg-muted/30 font-medium">
                      <td className={td} colSpan={5}>Gross</td>
                      <td className={tdR}>{rupiah(detail.grossAmount)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-2">
                <p className="font-medium">Adjustment</p>
                {detail.adjustments.length === 0 ? (
                  <p className="text-muted-foreground">Tidak ada adjustment.</p>
                ) : (
                  detail.adjustments.map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                      <div>
                        <p>{a.reason}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(a.createdAt).toLocaleString('id-ID')}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={Number(a.amount) < 0 ? 'text-destructive' : ''}>
                          {Number(a.amount) > 0 ? '+' : ''}
                          {rupiah(a.amount)}
                        </span>
                        {canManage && detail.status === 'UNPAID' ? (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setAdjToDelete({ id: a.id, reason: a.reason, amount: a.amount })}
                            disabled={delAdjM.isPending}
                          >
                            Hapus
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))
                )}
                {canManage && detail.status === 'UNPAID' ? (
                  <form
                    className="flex flex-wrap items-end gap-2 rounded-md border p-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      adjM.mutate();
                    }}
                  >
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-muted-foreground">Nominal (+/−)</label>
                      <input
                        type="number"
                        className={selectCls}
                        value={adjForm.amount}
                        onChange={(e) => setAdjForm({ ...adjForm, amount: e.target.value })}
                        required
                      />
                    </div>
                    <div className="flex min-w-48 flex-1 flex-col gap-1">
                      <label className="text-xs text-muted-foreground">Alasan (wajib)</label>
                      <input
                        className={selectCls}
                        value={adjForm.reason}
                        onChange={(e) => setAdjForm({ ...adjForm, reason: e.target.value })}
                        placeholder="Mis. bonus menggantikan, potongan izin"
                        required
                      />
                    </div>
                    <Button type="submit" size="sm" disabled={adjM.isPending}>
                      Tambah
                    </Button>
                  </form>
                ) : null}
              </div>

              <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 font-semibold">
                <span>Net Pay</span>
                <span>{rupiah(detail.netAmount)}</span>
              </div>
              {detail.status === 'PAID' ? (
                <p className="text-xs text-muted-foreground">
                  Dibayar {detail.paidAt ? new Date(detail.paidAt).toLocaleString('id-ID') : ''} via{' '}
                  {detail.account?.name ?? '—'} · ref expense {detail.expenseId ?? '—'}
                </p>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Dialog bayar */}
      <Dialog open={!!payTarget} onOpenChange={(o) => !o && setPayTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bayar Payroll {payTarget?.number}</DialogTitle>
            <DialogDescription>
              {payTarget?.tutor?.user.name} — net {payTarget ? rupiah(payTarget.netAmount) : ''}. Kas/bank
              berkurang via ledger dan tercatat sebagai expense HONOR_PEGAWAI.
            </DialogDescription>
          </DialogHeader>
          <ComboboxField
            id="pay-account"
            label="Akun Kas/Bank"
            value={payAccountId}
            onChange={setPayAccountId}
            options={(accountsQ.data ?? []).map((a) => ({ value: a.id, label: `${a.name} (${a.code || a.type})` }))}
            placeholder="Pilih akun"
          />
          <DialogFooter>
            <Button
              onClick={() => payM.mutate()}
              disabled={!payAccountId || payM.isPending}
            >
              {payM.isPending ? 'Memproses...' : 'Konfirmasi Bayar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={adjToDelete !== null}
        onOpenChange={(o) => {
          if (!o) setAdjToDelete(null);
        }}
        title="Hapus adjustment?"
        description={`Adjustment "${adjToDelete?.reason ?? ''}" (${adjToDelete ? rupiah(adjToDelete.amount) : ''}) akan dihapus dan total payroll dihitung ulang.`}
        confirmLabel="Ya, hapus"
        pending={delAdjM.isPending}
        onConfirm={() => adjToDelete && delAdjM.mutate(adjToDelete.id)}
      />
    </div>
  );
}
