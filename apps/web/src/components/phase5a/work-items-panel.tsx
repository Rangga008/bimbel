"use client";
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ComboboxField } from '@/components/shared/combobox-field';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { apiFetch, ApiError } from '@/lib/api-client';
import { rupiah } from '@/components/phase2a/invoices-manager';
import type { TutorRef, WorkItemRow } from '@/lib/phase5a-types';
import { WORK_TYPES, workTypeLabel } from '@/lib/phase5a-types';

function err(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}

const selectCls = 'h-9 rounded-md border border-input bg-background px-3 text-sm';

interface TutorOption {
  id: string;
  user: { name: string };
}

/** Panel work items per periode — sumber audit angka payroll. */
export function WorkItemsPanel({ period, canManage }: { period: string; canManage: boolean }) {
  const qc = useQueryClient();
  const [tutorFilter, setTutorFilter] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [editItem, setEditItem] = useState<WorkItemRow | null>(null);
  const [itemToDelete, setItemToDelete] = useState<WorkItemRow | null>(null);
  const [manual, setManual] = useState({ tutorId: '', description: '', occurredAt: '', quantity: '1', unitAmount: '' });
  const [editForm, setEditForm] = useState({ workType: '', quantity: '', unitAmount: '' });

  const itemsQ = useQuery({
    queryKey: ['payroll', 'work-items', period, tutorFilter],
    queryFn: () => {
      const p = new URLSearchParams({ period });
      if (tutorFilter) p.set('tutorId', tutorFilter);
      return apiFetch<WorkItemRow[]>(`/payroll/work-items?${p.toString()}`);
    },
  });

  const tutorsQ = useQuery({
    enabled: canManage,
    queryKey: ['tutor-options'],
    queryFn: () => apiFetch<TutorOption[]>('/tutors?isActive=true'),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['payroll'] });

  const manualM = useMutation({
    mutationFn: () =>
      apiFetch('/payroll/work-items', {
        method: 'POST',
        body: {
          tutorId: manual.tutorId,
          description: manual.description,
          occurredAt: manual.occurredAt,
          quantity: Number(manual.quantity) || 1,
          ...(manual.unitAmount !== '' ? { unitAmount: Number(manual.unitAmount) } : {}),
        },
      }),
    onSuccess: () => {
      toast.success('Tugas khusus dicatat.');
      setManualOpen(false);
      setManual({ tutorId: '', description: '', occurredAt: '', quantity: '1', unitAmount: '' });
      invalidate();
    },
    onError: (e) => toast.error(err(e, 'Gagal mencatat tugas khusus.')),
  });

  const updateM = useMutation({
    mutationFn: () =>
      apiFetch(`/payroll/work-items/${editItem?.id}`, {
        method: 'PATCH',
        body: {
          ...(editForm.workType ? { workType: editForm.workType } : {}),
          ...(editForm.quantity !== '' ? { quantity: Number(editForm.quantity) } : {}),
          ...(editForm.unitAmount !== '' ? { unitAmount: Number(editForm.unitAmount) } : {}),
        },
      }),
    onSuccess: () => {
      toast.success('Work item diperbarui.');
      setEditItem(null);
      invalidate();
    },
    onError: (e) => toast.error(err(e, 'Gagal memperbarui work item.')),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => apiFetch(`/payroll/work-items/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      setItemToDelete(null);
      toast.success('Work item dihapus.');
      invalidate();
    },
    onError: (e) => toast.error(err(e, 'Gagal menghapus work item.')),
  });

  const items = itemsQ.data ?? [];
  const tutors: Array<{ id: string; name: string }> =
    tutorsQ.data?.map((t) => ({ id: t.id, name: t.user.name })) ??
    Array.from(new Map(items.filter((i) => i.tutor).map((i) => [(i.tutor as TutorRef).id, (i.tutor as TutorRef)])).values())
      .map((t) => ({ id: t.id, name: t.user.name }));

  const th = 'px-3 py-2 font-medium text-left';
  const thR = 'px-3 py-2 font-medium text-right';
  const td = 'px-3 py-2';
  const tdR = 'px-3 py-2 text-right';

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Work Items — {period}</CardTitle>
            <CardDescription>
              Ditarik dari sesi COMPLETED (absensi). Tugas khusus bisa ditambah manual.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-full sm:w-52">
              <ComboboxField
                id="wi-filter-tutor"
                value={tutorFilter}
                onChange={setTutorFilter}
                options={tutors.map((t) => ({ value: t.id, label: t.name }))}
                placeholder="Semua tutor"
              />
            </div>
            {canManage ? (
              <Button variant="outline" size="sm" onClick={() => setManualOpen(true)}>
                + Tugas Khusus
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {itemsQ.isLoading ? <Skeleton className="h-32 w-full" /> : null}
        {itemsQ.isError ? <p className="text-sm text-destructive">Gagal memuat work items.</p> : null}
        {items.length === 0 && !itemsQ.isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Belum ada work item — tekan &quot;Tarik Work Items&quot; untuk mengambil dari sesi mengajar.
          </p>
        ) : null}
        {items.length > 0 ? (
          <>
          {/* Mobile: kartu ringkas (tabel 9 kolom tidak nyaman di 360px) */}
          <div className="flex flex-col gap-2 md:hidden">
            {items.map((w) => (
              <div key={w.id} className="flex flex-col gap-2 rounded-xl border bg-card p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{workTypeLabel(w.workType)}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {new Date(w.occurredAt).toLocaleDateString('id-ID')} · {w.tutor?.user.name ?? '—'}
                    </p>
                  </div>
                  {w.payrollRunId ? (
                    <Badge variant="secondary">masuk run</Badge>
                  ) : (
                    <Badge variant="outline">belum</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{w.description}</p>
                <p className="text-sm tabular-nums">
                  {Number(w.quantity)} × {rupiah(w.unitAmount)} = <span className="font-semibold">{rupiah(w.amount)}</span>
                  {w.rateId === null && w.sourceType === 'SESSION' ? (
                    <Badge variant="destructive" className="ml-1">tanpa tarif</Badge>
                  ) : null}
                </p>
                {canManage ? (
                  <div className="flex gap-2 border-t pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditItem(w);
                        setEditForm({ workType: w.workType, quantity: String(Number(w.quantity)), unitAmount: '' });
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={deleteM.isPending}
                      onClick={() => setItemToDelete(w)}
                    >
                      Hapus
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          {/* Desktop: tabel dengan scroll horizontal */}
          <div className="hidden overflow-x-auto rounded-xl border md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className={th}>Tanggal</th>
                  <th className={th}>Tutor</th>
                  <th className={th}>Jenis</th>
                  <th className={th}>Deskripsi</th>
                  <th className={thR}>Qty</th>
                  <th className={thR}>Tarif</th>
                  <th className={thR}>Jumlah</th>
                  <th className={th}>Status</th>
                  {canManage ? <th className={th}></th> : null}
                </tr>
              </thead>
              <tbody>
                {items.map((w) => (
                  <tr key={w.id} className="border-b last:border-0">
                    <td className={td}>{new Date(w.occurredAt).toLocaleDateString('id-ID')}</td>
                    <td className={td}>{w.tutor?.user.name ?? '—'}</td>
                    <td className={td}>
                      {workTypeLabel(w.workType)}
                      {w.rateId === null && w.sourceType === 'SESSION' ? (
                        <Badge variant="destructive" className="ml-1">tanpa tarif</Badge>
                      ) : null}
                    </td>
                    <td className={td}>{w.description}</td>
                    <td className={tdR}>{Number(w.quantity)}</td>
                    <td className={tdR}>{rupiah(w.unitAmount)}</td>
                    <td className={tdR}>{rupiah(w.amount)}</td>
                    <td className={td}>
                      {w.payrollRunId ? (
                        <Badge variant="secondary">masuk run</Badge>
                      ) : (
                        <Badge variant="outline">belum</Badge>
                      )}
                    </td>
                    {canManage ? (
                      <td className={td}>
                        <div className="flex gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditItem(w);
                              setEditForm({ workType: w.workType, quantity: String(Number(w.quantity)), unitAmount: '' });
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={deleteM.isPending}
                            onClick={() => setItemToDelete(w)}
                          >
                            Hapus
                          </Button>
                        </div>
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

      {/* Dialog tugas khusus manual */}
      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tambah Tugas Khusus</DialogTitle>
            <DialogDescription>
              Hanya untuk kerja tanpa sesi (mis. menyusun soal, koreksi). Sesi mengajar ditarik otomatis.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              manualM.mutate();
            }}
          >
            <ComboboxField
              id="wi-manual-tutor"
              value={manual.tutorId}
              onChange={(v) => setManual({ ...manual, tutorId: v })}
              options={(tutorsQ.data ?? []).map((t) => ({ value: t.id, label: t.user.name }))}
              placeholder="Pilih tutor"
              required
            />
            <input
              className={selectCls}
              placeholder="Deskripsi tugas"
              value={manual.description}
              onChange={(e) => setManual({ ...manual, description: e.target.value })}
              required
            />
            <input
              type="datetime-local"
              className={selectCls}
              value={manual.occurredAt}
              onChange={(e) => setManual({ ...manual, occurredAt: e.target.value })}
              required
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                type="number"
                min={1}
                step="0.5"
                className={selectCls}
                placeholder="Qty"
                value={manual.quantity}
                onChange={(e) => setManual({ ...manual, quantity: e.target.value })}
              />
              <input
                type="number"
                min={0}
                className={selectCls}
                placeholder="Tarif/unit (kosong = tarif SPECIAL_TASK)"
                value={manual.unitAmount}
                onChange={(e) => setManual({ ...manual, unitAmount: e.target.value })}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={manualM.isPending}>
                {manualM.isPending ? 'Menyimpan...' : 'Simpan'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog edit work item */}
      <Dialog open={!!editItem} onOpenChange={(o) => !o && setEditItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Work Item</DialogTitle>
            <DialogDescription>
              {editItem?.description} — mengubah jenis kerja menarik ulang tarif yang berlaku;
              mengisi tarif manual melepas referensi rate.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              updateM.mutate();
            }}
          >
            <select
              className={selectCls}
              value={editForm.workType}
              onChange={(e) => setEditForm({ ...editForm, workType: e.target.value })}
            >
              {WORK_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <input
              type="number"
              min={0.01}
              step="0.01"
              className={selectCls}
              placeholder="Qty"
              value={editForm.quantity}
              onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
            />
            <input
              type="number"
              min={0}
              className={selectCls}
              placeholder="Tarif/unit manual (opsional — override)"
              value={editForm.unitAmount}
              onChange={(e) => setEditForm({ ...editForm, unitAmount: e.target.value })}
            />
            <DialogFooter>
              <Button type="submit" disabled={updateM.isPending}>
                {updateM.isPending ? 'Menyimpan...' : 'Simpan'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={itemToDelete !== null}
        onOpenChange={(o) => {
          if (!o) setItemToDelete(null);
        }}
        title="Hapus work item?"
        description={`"${itemToDelete?.description ?? ''}" (${itemToDelete ? rupiah(itemToDelete.amount) : ''}) akan dihapus dan total payroll tutor dihitung ulang.`}
        confirmLabel="Ya, hapus"
        pending={deleteM.isPending}
        onConfirm={() => itemToDelete && deleteM.mutate(itemToDelete.id)}
      />
    </Card>
  );
}
