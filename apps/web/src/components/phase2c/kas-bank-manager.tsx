"use client";
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { apiFetch, ApiError } from '@/lib/api-client';
import { rupiah } from '@/components/phase2a/invoices-manager';
import type { LedgerResponse } from '@/lib/phase2c-types';

function err(e: unknown, fb: string) {
  return e instanceof ApiError && e.message ? e.message : fb;
}

const TH = 'px-3 py-2 text-left font-medium whitespace-nowrap';
const THR = 'px-3 py-2 text-right font-medium whitespace-nowrap';
const TD = 'px-3 py-2 align-top';
const TDR = 'px-3 py-2 text-right align-top';

/** Fase 2c — mutasi kas/bank dari payment (IN) dan refund cash-out (OUT). */
export function KasBankManager() {
  const [accountId, setAccountId] = useState('');
  const qc = useQueryClient();
  // Baris mutasi REFUND yang diminta hapus — purge seluruh rantai salah input.
  const [purgeTarget, setPurgeTarget] = useState<{ refundId: string; description: string; amount: number } | null>(null);
  const q = useQuery({
    queryKey: ['ledger', accountId],
    queryFn: () => apiFetch<LedgerResponse>(`/ledger${accountId ? `?accountId=${accountId}` : ''}`),
  });
  const purgeM = useMutation({
    mutationFn: () =>
      apiFetch(`/refunds/${purgeTarget?.refundId}`, { method: 'DELETE' }),
    onSuccess: (r) => {
      const res = r as { payments?: number; refunds?: number };
      toast.success(
        `Jejak dihapus — ${res.payments ?? 0} pembayaran, ${res.refunds ?? 0} refund, mutasi & invoice ikut bersih.`,
      );
      setPurgeTarget(null);
      qc.invalidateQueries({ queryKey: ['ledger'] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['payments'] });
    },
    onError: (e) => toast.error(err(e, 'Gagal menghapus jejak.')),
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Kas/Bank</h1>
        <p className="text-sm text-muted-foreground">
          Mutasi masuk dari pembayaran terverifikasi, keluar dari refund cash-out. Saldo = IN − OUT.
        </p>
      </div>
      {q.isLoading ? <Skeleton className="h-24 w-full" /> : null}
      {q.isError ? <p className="text-sm text-destructive">Gagal memuat ledger.</p> : null}

      {(q.data?.accounts.length ?? 0) > 0 ? (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className={TH}>Akun</th>
                <th className={TH}>Tipe</th>
                <th className={THR}>Masuk</th>
                <th className={THR}>Keluar</th>
                <th className={THR}>Saldo</th>
                <th className={TH}></th>
              </tr>
            </thead>
            <tbody>
              {q.data?.accounts.map((a) => (
                <tr key={a.id} className={`border-b last:border-0 ${accountId === a.id ? 'bg-primary/5' : ''}`}>
                  <td className={`${TD} font-medium whitespace-nowrap`}>
                    {a.name} {a.code ? <span className="text-xs text-muted-foreground">({a.code})</span> : null}
                  </td>
                  <td className={TD}><Badge variant="outline">{a.type}</Badge></td>
                  <td className={`${TDR} tabular-nums whitespace-nowrap`}>{rupiah(a.totalIn)}</td>
                  <td className={`${TDR} tabular-nums whitespace-nowrap`}>{rupiah(a.totalOut)}</td>
                  <td className={`${TDR} font-medium tabular-nums whitespace-nowrap`}>{rupiah(a.balance)}</td>
                  <td className={`${TD} whitespace-nowrap text-right`}>
                    <button
                      type="button"
                      className="text-xs text-primary underline-offset-2 hover:underline"
                      onClick={() => setAccountId((cur) => (cur === a.id ? '' : a.id))}
                    >
                      {accountId === a.id ? 'Semua akun' : 'Lihat mutasi'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Mutasi</h2>
        {q.data?.entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada mutasi.</p>
        ) : null}
        {(q.data?.entries.length ?? 0) > 0 ? (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className={TH}>Tanggal</th>
                  <th className={TH}>Akun</th>
                  <th className={TH}>Arah</th>
                  <th className={TH}>Keterangan</th>
                  <th className={THR}>Jumlah</th>
                  <th className={TH}></th>
                </tr>
              </thead>
              <tbody>
                {q.data?.entries.map((e) => (
                  <tr key={e.id} className="border-b last:border-0">
                    <td className={`${TD} whitespace-nowrap text-muted-foreground`}>
                      {new Date(e.occurredAt).toLocaleString('id-ID')}
                    </td>
                    <td className={`${TD} whitespace-nowrap`}>{e.account.name}</td>
                    <td className={TD}>
                      <Badge variant={e.direction === 'IN' ? 'secondary' : 'destructive'}>{e.direction}</Badge>
                    </td>
                    <td className={`${TD} text-muted-foreground`}>{e.description}</td>
                    <td className={`${TDR} font-medium tabular-nums whitespace-nowrap`}>{rupiah(e.amount)}</td>
                    <td className={`${TD} text-right`}>
                      {e.sourceType === 'REFUND' ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Hapus jejak salah input"
                          title="Hapus jejak salah input — refund, pembayaran, kwitansi, mutasi & invoice ikut terhapus seolah uang tidak pernah masuk"
                          disabled={purgeM.isPending}
                          onClick={() =>
                            setPurgeTarget({
                              refundId: e.sourceId,
                              description: e.description,
                              amount: Number(e.amount),
                            })
                          }
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        open={!!purgeTarget}
        onOpenChange={(o) => !o && setPurgeTarget(null)}
        title="Hapus jejak salah input?"
        description={`${purgeTarget?.description ?? ''} (${rupiah(purgeTarget?.amount ?? 0)}) — refund ini beserta pembayaran asalnya, kwitansi, seluruh mutasi kas terkait, dan invoice-nya akan dihapus permanen. Hasilnya seolah uang tidak pernah masuk. Hanya untuk koreksi salah input; ditolak bila invoice masih tertaut program atau belum ter-refund penuh.`}
        confirmLabel="Ya, hapus permanen"
        pending={purgeM.isPending}
        onConfirm={() => purgeM.mutate()}
      />
    </div>
  );
}
