"use client";
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch, ApiError } from '@/lib/api-client';
import { rupiah } from '@/components/phase2a/invoices-manager';
import type { MyPayrollResponse } from '@/lib/phase5a-types';
import { workTypeLabel } from '@/lib/phase5a-types';

function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Fase 5a — panel "Profil & Status Kepegawaian" tutor: status + rincian honor sendiri. */
export function TutorHonorPanel() {
  const [period, setPeriod] = useState(currentPeriod());

  const q = useQuery({
    queryKey: ['payroll', 'me', period],
    queryFn: () => apiFetch<MyPayrollResponse>(`/payroll/me?period=${period}`),
  });

  const tutor = q.data?.tutor;
  const runs = q.data?.runs ?? [];
  const th = 'px-3 py-2 font-medium text-left';
  const thR = 'px-3 py-2 font-medium text-right';
  const td = 'px-3 py-2';
  const tdR = 'px-3 py-2 text-right';

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Status Kepegawaian</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {q.isLoading ? <Skeleton className="h-16 w-full" /> : null}
          {q.isError ? (
            <p className="text-destructive">
              {q.error instanceof ApiError ? q.error.message : 'Gagal memuat profil.'}
            </p>
          ) : null}
          {tutor ? (
            <div className="flex flex-col gap-1">
              <p className="font-medium">{tutor.user.name}</p>
              <p className="text-muted-foreground">{tutor.user.email}</p>
              <p>Spesialisasi: {tutor.specialization ?? '—'}</p>
              <p>
                Status:{' '}
                {tutor.isActive ? (
                  <Badge>Aktif</Badge>
                ) : (
                  <Badge variant="secondary">Nonaktif</Badge>
                )}
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Rincian Honor</CardTitle>
              <CardDescription>
                Honor Anda per periode — dihitung dari sesi mengajar & tugas yang tercatat.
              </CardDescription>
            </div>
            <input
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3"
            />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {q.isLoading ? <Skeleton className="h-32 w-full" /> : null}
          {runs.length === 0 && !q.isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Belum ada payroll untuk periode ini.
            </p>
          ) : null}
          {runs.map((r) => (
            <div key={r.id} className="flex flex-col gap-2 rounded-md border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">
                  {r.number} · {r.period}
                </p>
                {r.status === 'PAID' ? (
                  <Badge>Sudah dibayar{r.paidAt ? ` ${new Date(r.paidAt).toLocaleDateString('id-ID')}` : ''}</Badge>
                ) : (
                  <Badge variant="secondary">Belum dibayar</Badge>
                )}
              </div>
              {/* Mobile: list ringkas */}
              <div className="flex flex-col divide-y rounded-xl border text-xs sm:hidden">
                {r.workItems.map((w) => (
                  <div key={w.id} className="flex items-start justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <p className="font-medium">{workTypeLabel(w.workType)}</p>
                      <p className="text-muted-foreground">
                        {new Date(w.occurredAt).toLocaleDateString('id-ID')} · {w.description}
                      </p>
                      <p className="text-muted-foreground tabular-nums">
                        {Number(w.quantity)} × {rupiah(w.unitAmount)}
                      </p>
                    </div>
                    <p className="shrink-0 font-semibold tabular-nums">{rupiah(w.amount)}</p>
                  </div>
                ))}
              </div>
              {/* Desktop: tabel */}
              <div className="hidden overflow-x-auto rounded-md border sm:block">
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
                    {r.workItems.map((w) => (
                      <tr key={w.id} className="border-b last:border-0">
                        <td className={td}>{new Date(w.occurredAt).toLocaleDateString('id-ID')}</td>
                        <td className={td}>{workTypeLabel(w.workType)}</td>
                        <td className={td}>{w.description}</td>
                        <td className={tdR}>{Number(w.quantity)}</td>
                        <td className={tdR}>{rupiah(w.unitAmount)}</td>
                        <td className={tdR}>{rupiah(w.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {r.adjustments.length > 0 ? (
                <div className="flex flex-col gap-1">
                  {r.adjustments.map((a) => (
                    <p key={a.id} className="flex justify-between text-xs text-muted-foreground">
                      <span>Adjustment: {a.reason}</span>
                      <span>
                        {Number(a.amount) > 0 ? '+' : ''}
                        {rupiah(a.amount)}
                      </span>
                    </p>
                  ))}
                </div>
              ) : null}
              <div className="flex justify-between rounded-md bg-muted/50 px-3 py-2 font-semibold">
                <span>Net</span>
                <span>{rupiah(r.netAmount)}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
