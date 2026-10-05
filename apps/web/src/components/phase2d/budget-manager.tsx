"use client";
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch, ApiError } from '@/lib/api-client';
import { rupiah } from '@/components/phase2a/invoices-manager';
import type { BudgetRow, BudgetSummary, BudgetVsActual } from '@/lib/phase2d-types';
import { BUDGET_CATEGORIES } from '@/lib/phase2d-types';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';

function err(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}

/** Warna pembeda per kategori RAB — memudahkan identifikasi sekilas. */
const CATEGORY_DOT: Record<string, string> = {
  PENGADAAN_RUANG_BELAJAR: 'bg-sky-500',
  PERSIAPAN_TAHUN_AJARAN: 'bg-indigo-500',
  OVERHEAD_RUMAH_TANGGA: 'bg-amber-500',
  LOGISTIK_PERAWATAN: 'bg-teal-500',
  AKADEMIK: 'bg-emerald-500',
  MARKETING: 'bg-fuchsia-500',
  KESEHATAN_TUNJANGAN: 'bg-rose-500',
  HONOR_PEGAWAI: 'bg-violet-500',
  LAIN_LAIN: 'bg-slate-400',
};

function categoryLabel(value: string) {
  return BUDGET_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

/** Fase 2d — RAB (Budget) management per kategori per periode. */
export function BudgetManager({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [category, setCategory] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BudgetRow | null>(null);
  const [form, setForm] = useState({ category: '', period: '', amount: '', description: '' });
  const [toDelete, setToDelete] = useState<BudgetRow | null>(null);

  const listQ = useQuery({
    queryKey: ['budgets', period, category],
    queryFn: () => {
      const p = new URLSearchParams();
      if (period) p.set('period', period);
      if (category) p.set('category', category);
      const qs = p.toString();
      return apiFetch<BudgetRow[]>(`/budgets${qs ? `?${qs}` : ''}`);
    },
  });

  const summaryQ = useQuery({
    queryKey: ['budgets-summary', period],
    queryFn: () => apiFetch<BudgetSummary>(`/budgets/summary${period ? `?period=${period}` : ''}`),
  });

  const saveM = useMutation({
    mutationFn: () =>
      editing
        ? apiFetch<BudgetRow>(`/budgets/${editing.id}`, {
            method: 'PATCH',
            body: { category: form.category, period: form.period, amount: Number(form.amount), description: form.description },
          })
        : apiFetch<BudgetRow>('/budgets', {
            method: 'POST',
            body: { ...form, amount: Number(form.amount) },
          }),
    onSuccess: () => {
      toast.success(editing ? 'Budget diperbarui.' : 'Budget berhasil dibuat.');
      setOpen(false);
      setEditing(null);
      setForm({ category: '', period: '', amount: '', description: '' });
      qc.invalidateQueries({ queryKey: ['budgets'] });
    },
    onError: (e) => toast.error(err(e, editing ? 'Gagal memperbarui budget.' : 'Gagal membuat budget.')),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/budgets/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      setToDelete(null);
      toast.success('Budget berhasil dihapus.');
      qc.invalidateQueries({ queryKey: ['budgets'] });
    },
    onError: (e) => toast.error(err(e, 'Gagal menghapus budget.')),
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">RAB (Anggaran)</h1>
        <p className="text-sm text-muted-foreground">
          Budget per kategori per periode untuk membandingkan dengan pengeluaran actual.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          type="month"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3"
        />
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">Semua kategori</option>
          {BUDGET_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        {canManage ? (
          <Button onClick={() => { setEditing(null); setForm({ ...form, period }); setOpen(true); }}>
            Tambah Budget
          </Button>
        ) : null}
      </div>
      {summaryQ.data && (
        <Card>
          <CardContent className="flex flex-col gap-3 py-4">
            <div className="flex items-center justify-between gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Periode {summaryQ.data.period}</p>
                <p>Total Budget {rupiah(summaryQ.data.totalBudget)} · Actual {rupiah(summaryQ.data.totalActual)} · Sisa {rupiah(summaryQ.data.remaining)}</p>
              </div>
              <Badge variant="outline">{summaryQ.data.budgetCount} budget</Badge>
            </div>
            {/* Ringkasan per kategori — sekilas tahu pos mana yang jebol */}
            <div className="flex flex-wrap gap-1.5">
              {(listQ.data ?? []).map((b) => {
                const actual = b.expenses.reduce((s, e) => s + Number(e.amount), 0);
                const sisa = Number(b.amount) - actual;
                return (
                  <span
                    key={b.id}
                    title={`${categoryLabel(b.category)} — terpakai ${rupiah(actual)} dari ${rupiah(b.amount)}`}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                      sisa < 0 ? 'border-destructive/50 bg-destructive/10 text-destructive' : ''
                    }`}
                  >
                    <span className={`size-2 rounded-full ${CATEGORY_DOT[b.category] ?? 'bg-slate-400'}`} />
                    {categoryLabel(b.category)}: <b>{sisa < 0 ? 'minus ' : 'sisa '}{rupiah(Math.abs(sisa))}</b>
                  </span>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
      {listQ.isLoading ? <Skeleton className="h-24 w-full" /> : null}
      {listQ.isError ? <p className="text-sm text-destructive">Gagal memuat budget.</p> : null}
      {!listQ.isLoading && listQ.data?.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada budget untuk periode ini.</p>
      ) : null}
      {(listQ.data?.length ?? 0) > 0 ? (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Kategori</th>
                <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Periode</th>
                <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Deskripsi</th>
                <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Budget</th>
                <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Actual</th>
                <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Sisa</th>
                <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Status</th>
                <th className="px-3 py-2 text-left font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {listQ.data?.map((b) => {
                const actual = b.expenses.reduce((sum, e) => sum + Number(e.amount), 0);
                const sisa = Number(b.amount) - actual;
                return (
                  <tr key={b.id} className="border-b last:border-0">
                    <td className="px-3 py-2 align-top font-medium whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`size-2.5 rounded-full ${CATEGORY_DOT[b.category] ?? 'bg-slate-400'}`} />
                        {categoryLabel(b.category)}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top whitespace-nowrap">{b.period}</td>
                    <td className="px-3 py-2 align-top text-muted-foreground">{b.description || '—'}</td>
                    <td className="px-3 py-2 align-top text-right tabular-nums whitespace-nowrap">{rupiah(b.amount)}</td>
                    <td className="px-3 py-2 align-top text-right tabular-nums whitespace-nowrap">
                      {rupiah(actual)}
                      <p className="text-xs font-normal text-muted-foreground">{b.expenses.length} expense</p>
                    </td>
                    <td className={`px-3 py-2 align-top text-right font-medium tabular-nums whitespace-nowrap ${sisa < 0 ? 'text-destructive' : ''}`}>
                      {rupiah(sisa)}
                    </td>
                    <td className="px-3 py-2 align-top whitespace-nowrap">
                      {b.isActive ? <Badge variant="secondary">Aktif</Badge> : <Badge variant="outline">Non-aktif</Badge>}
                    </td>
                    <td className="px-3 py-2 align-top whitespace-nowrap text-right">
                      {canManage ? (
                        <span className="inline-flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditing(b);
                              setForm({
                                category: b.category,
                                period: b.period,
                                amount: String(b.amount),
                                description: b.description ?? '',
                              });
                              setOpen(true);
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            disabled={deleteM.isPending}
                            onClick={() => setToDelete(b)}
                          >
                            Hapus
                          </Button>
                        </span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Budget' : 'Tambah Budget'}</DialogTitle>
            <DialogDescription>Set anggaran untuk kategori dan periode tertentu.</DialogDescription>
          </DialogHeader>
          <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); saveM.mutate(); }}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bud-category">Kategori</Label>
              <select
                id="bud-category"
                className="h-9 rounded-md border border-input bg-background px-3"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                required
              >
                <option value="">Pilih kategori</option>
                {BUDGET_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bud-period">Periode (YYYY-MM)</Label>
              <input
                id="bud-period"
                type="month"
                className="h-9 rounded-md border border-input bg-background px-3"
                value={form.period}
                onChange={(e) => setForm({ ...form, period: e.target.value })}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bud-amount">Nominal (Rp)</Label>
              <input
                id="bud-amount"
                type="number"
                min={0}
                className="h-9 rounded-md border border-input bg-background px-3"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bud-desc">Deskripsi (opsional)</Label>
              <input
                id="bud-desc"
                className="h-9 rounded-md border border-input bg-background px-3"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Keterangan budget"
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={saveM.isPending}>{saveM.isPending ? 'Menyimpan...' : 'Simpan'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => {
          if (!o) setToDelete(null);
        }}
        title="Hapus budget?"
        description={`Budget ${toDelete ? (BUDGET_CATEGORIES.find((c) => c.value === toDelete.category)?.label || toDelete.category) : ''} periode ${toDelete?.period ?? ''} akan dihapus permanen.`}
        confirmLabel="Ya, hapus"
        pending={deleteM.isPending}
        onConfirm={() => toDelete && deleteM.mutate(toDelete.id)}
      />
    </div>
  );
}