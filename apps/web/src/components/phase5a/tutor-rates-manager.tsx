"use client";
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ComboboxField } from '@/components/shared/combobox-field';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { apiFetch, ApiError } from '@/lib/api-client';
import { rupiah } from '@/components/phase2a/invoices-manager';
import type { TutorRateRow } from '@/lib/phase5a-types';
import { WORK_TYPES, workTypeLabel } from '@/lib/phase5a-types';

function err(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}

const selectCls = 'h-9 rounded-md border border-input bg-background px-3 text-sm';

interface TutorOption {
  id: string;
  user: { name: string };
}

/** Kelola tarif honor per tutor per jenis kerja (dengan masa berlaku). */
export function TutorRatesManager({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    tutorId: '',
    workType: 'REGULAR_SESSION',
    amount: '',
    unit: 'SESSION',
    effectiveFrom: new Date().toISOString().slice(0, 10),
    effectiveTo: '',
  });

  const ratesQ = useQuery({
    queryKey: ['payroll', 'rates'],
    queryFn: () => apiFetch<TutorRateRow[]>('/tutor-rates'),
  });

  const tutorsQ = useQuery({
    enabled: canManage,
    queryKey: ['tutor-options'],
    queryFn: () => apiFetch<TutorOption[]>('/tutors?isActive=true'),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['payroll'] });

  const createM = useMutation({
    mutationFn: () =>
      apiFetch('/tutor-rates', {
        method: 'POST',
        body: {
          tutorId: form.tutorId,
          workType: form.workType,
          amount: Number(form.amount),
          unit: form.unit,
          effectiveFrom: form.effectiveFrom,
          ...(form.effectiveTo ? { effectiveTo: form.effectiveTo } : {}),
        },
      }),
    onSuccess: () => {
      toast.success('Tarif tutor disimpan.');
      setOpen(false);
      invalidate();
    },
    onError: (e) => toast.error(err(e, 'Gagal menyimpan tarif.')),
  });

  const toggleM = useMutation({
    mutationFn: (rate: TutorRateRow) =>
      apiFetch(`/tutor-rates/${rate.id}`, { method: 'PATCH', body: { isActive: !rate.isActive } }),
    onSuccess: () => invalidate(),
    onError: (e) => toast.error(err(e, 'Gagal mengubah tarif.')),
  });

  const rates = ratesQ.data ?? [];
  const th = 'px-3 py-2 font-medium text-left';
  const thR = 'px-3 py-2 font-medium text-right';
  const td = 'px-3 py-2';
  const tdR = 'px-3 py-2 text-right';

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Tarif Honor Tutor</CardTitle>
            <CardDescription>Tarif per jenis kerja dengan masa berlaku — dipakai saat work items ditarik/di-reprice.</CardDescription>
          </div>
          {canManage ? (
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
              + Tarif Baru
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {ratesQ.isLoading ? <Skeleton className="h-32 w-full" /> : null}
        {ratesQ.isError ? <p className="text-sm text-destructive">Gagal memuat tarif.</p> : null}
        {rates.length === 0 && !ratesQ.isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Belum ada tarif — buat dulu sebelum menarik work items.</p>
        ) : null}
        {rates.length > 0 ? (
          <>
          {/* Mobile: kartu ringkas */}
          <div className="flex flex-col gap-2 md:hidden">
            {rates.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-xl border bg-card p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{r.tutor?.user.name ?? '—'}</p>
                  <p className="text-xs text-muted-foreground">
                    {workTypeLabel(r.workType)} · {r.unit === 'HOUR' ? 'per jam' : 'per sesi'}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {new Date(r.effectiveFrom).toLocaleDateString('id-ID')} —{' '}
                    {r.effectiveTo ? new Date(r.effectiveTo).toLocaleDateString('id-ID') : 'seterusnya'}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <p className="font-semibold tabular-nums">{rupiah(r.amount)}</p>
                  {r.isActive ? <Badge>Aktif</Badge> : <Badge variant="secondary">Nonaktif</Badge>}
                  {canManage ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={toggleM.isPending}
                      onClick={() => toggleM.mutate(r)}
                    >
                      {r.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          {/* Desktop: tabel */}
          <div className="hidden overflow-x-auto rounded-xl border md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className={th}>Tutor</th>
                  <th className={th}>Jenis Kerja</th>
                  <th className={thR}>Tarif</th>
                  <th className={th}>Unit</th>
                  <th className={th}>Berlaku</th>
                  <th className={th}>Status</th>
                  {canManage ? <th className={th}></th> : null}
                </tr>
              </thead>
              <tbody>
                {rates.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className={td}>{r.tutor?.user.name ?? '—'}</td>
                    <td className={td}>{workTypeLabel(r.workType)}</td>
                    <td className={tdR}>{rupiah(r.amount)}</td>
                    <td className={td}>{r.unit === 'HOUR' ? 'per jam' : 'per sesi'}</td>
                    <td className={td}>
                      {new Date(r.effectiveFrom).toLocaleDateString('id-ID')}
                      {' — '}
                      {r.effectiveTo ? new Date(r.effectiveTo).toLocaleDateString('id-ID') : 'seterusnya'}
                    </td>
                    <td className={td}>
                      {r.isActive ? <Badge>Aktif</Badge> : <Badge variant="secondary">Nonaktif</Badge>}
                    </td>
                    {canManage ? (
                      <td className={td}>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={toggleM.isPending}
                          onClick={() => toggleM.mutate(r)}
                        >
                          {r.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        ) : null}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tarif Baru</DialogTitle>
            <DialogDescription>Tarif berlaku mulai tanggal effectiveFrom; kosongkan akhir untuk tanpa batas.</DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              createM.mutate();
            }}
          >
            <ComboboxField
              id="rate-tutor"
              value={form.tutorId}
              onChange={(v) => setForm({ ...form, tutorId: v })}
              options={(tutorsQ.data ?? []).map((t) => ({ value: t.id, label: t.user.name }))}
              placeholder="Pilih tutor"
              required
            />
            <select
              className={selectCls}
              value={form.workType}
              onChange={(e) => setForm({ ...form, workType: e.target.value })}
            >
              {WORK_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                type="number"
                min={0}
                className={selectCls}
                placeholder="Nominal (Rp)"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                required
              />
              <select
                className={selectCls}
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
              >
                <option value="SESSION">per sesi</option>
                <option value="HOUR">per jam</option>
              </select>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Berlaku dari</label>
                <input
                  type="date"
                  className={selectCls}
                  value={form.effectiveFrom}
                  onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })}
                  required
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Sampai (opsional)</label>
                <input
                  type="date"
                  className={selectCls}
                  value={form.effectiveTo}
                  onChange={(e) => setForm({ ...form, effectiveTo: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={createM.isPending}>
                {createM.isPending ? 'Menyimpan...' : 'Simpan'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
