"use client";
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ComboboxField } from '@/components/shared/combobox-field';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { rupiah } from '@/components/phase2a/invoices-manager';
import type { ExpenseRow, ExpenseSummary, FinancialAccount } from '@/lib/phase2d-types';
import { BUDGET_CATEGORIES } from '@/lib/phase2d-types';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';

function err(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}

/** Fase 2d — Expense (Pengeluaran) management. */
export function ExpenseManager({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [category, setCategory] = useState('');
  const [accountId, setAccountId] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [open, setOpen] = useState(false);
  const [toDelete, setToDelete] = useState<ExpenseRow | null>(null);
  const [form, setForm] = useState({
    budgetId: '',
    accountId: '',
    amount: '',
    description: '',
    category: '',
    occurredAt: new Date().toISOString().slice(0, 10),
    receiptUrl: '',
  });

  const listQ = useQuery({
    queryKey: ['expenses', period, category, accountId, debouncedSearch],
    queryFn: () => {
      const p = new URLSearchParams();
      if (period) p.set('period', period);
      if (category) p.set('category', category);
      if (accountId) p.set('accountId', accountId);
      if (debouncedSearch) p.set('search', debouncedSearch);
      const qs = p.toString();
      return apiFetch<ExpenseRow[]>(`/expenses${qs ? `?${qs}` : ''}`);
    },
  });

  const summaryQ = useQuery({
    queryKey: ['expenses-summary', period],
    queryFn: () => apiFetch<ExpenseSummary>(`/expenses/summary${period ? `?period=${period}` : ''}`),
  });

  const accountsQ = useQuery({
    // QueryKey unik per endpoint — dulu berbagi 'financial-accounts' dengan
    // Pengaturan (/financial-accounts = array) padahal ini /ledger = object,
    // bikin crash `.map is not a function` saat cache tertukar antar-halaman.
    queryKey: ['ledger-accounts'],
    queryFn: () => apiFetch<{ accounts: FinancialAccount[] }>('/ledger'),
    select: (data) => data.accounts.filter((a) => a.isActive),
  });

  const createM = useMutation({
    mutationFn: () =>
      apiFetch<ExpenseRow>('/expenses', {
        method: 'POST',
        body: { ...form, amount: Number(form.amount) },
      }),
    onSuccess: () => {
      toast.success('Pengeluaran berhasil dicatat.');
      setOpen(false);
      setForm({
        budgetId: '',
        accountId: '',
        amount: '',
        description: '',
        category: '',
        occurredAt: new Date().toISOString().slice(0, 10),
        receiptUrl: '',
      });
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['ledger'] });
    },
    onError: (e) => toast.error(err(e, 'Gagal mencatat pengeluaran.')),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/expenses/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      setToDelete(null);
      toast.success('Pengeluaran berhasil dihapus.');
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['ledger'] });
    },
    onError: (e) => toast.error(err(e, 'Gagal menghapus pengeluaran.')),
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pengeluaran</h1>
        <p className="text-sm text-muted-foreground">
          Catat pengeluaran operasional dan hubungkan ke kategori RAB & akun kas/bank.
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
        <div className="w-full sm:w-56">
          <ComboboxField
            id="exp-filter-account"
            value={accountId}
            onChange={setAccountId}
            options={(accountsQ.data ?? []).map((a) => ({ value: a.id, label: `${a.name} (${a.code || a.type})` }))}
            placeholder="Semua akun"
          />
        </div>
        <input
          placeholder="Cari deskripsi..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 max-w-xs"
        />
        {canManage ? (
          <Button onClick={() => setOpen(true)}>Tambah Pengeluaran</Button>
        ) : null}
      </div>
      {summaryQ.data && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="secondary" className="px-2.5 py-1">
            Periode {summaryQ.data.period} — Total {rupiah(summaryQ.data.totalAmount)} · {summaryQ.data.expenseCount} transaksi
          </Badge>
        </div>
      )}
      {listQ.isLoading ? <Skeleton className="h-24 w-full" /> : null}
      {listQ.isError ? <p className="text-sm text-destructive">Gagal memuat pengeluaran.</p> : null}
      {!listQ.isLoading && listQ.data?.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Belum ada pengeluaran untuk periode ini.</CardContent></Card>
      ) : null}
      {(listQ.data?.length ?? 0) > 0 ? (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Tanggal</th>
                <th className="px-3 py-2 text-left font-medium">Deskripsi</th>
                <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Kategori</th>
                <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Akun</th>
                <th className="px-3 py-2 text-left font-medium whitespace-nowrap">RAB</th>
                <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Nominal</th>
                <th className="px-3 py-2 text-left font-medium">Bukti</th>
                {canManage ? <th className="px-3 py-2"></th> : null}
              </tr>
            </thead>
            <tbody>
              {listQ.data?.map((e) => (
                <tr key={e.id} className="border-b last:border-0">
                  <td className="px-3 py-2 align-top whitespace-nowrap text-muted-foreground">
                    {new Date(e.occurredAt).toLocaleDateString('id-ID')}
                  </td>
                  <td className="px-3 py-2 align-top">{e.description}</td>
                  <td className="px-3 py-2 align-top whitespace-nowrap">
                    <Badge variant="outline">{BUDGET_CATEGORIES.find((c) => c.value === e.category)?.label || e.category}</Badge>
                  </td>
                  <td className="px-3 py-2 align-top whitespace-nowrap">{e.account?.name || '—'}</td>
                  <td className="px-3 py-2 align-top whitespace-nowrap text-muted-foreground">
                    {e.budget ? `${e.budget.category} (${e.budget.period})` : '—'}
                  </td>
                  <td className="px-3 py-2 align-top text-right font-medium tabular-nums whitespace-nowrap">{rupiah(e.amount)}</td>
                  <td className="px-3 py-2 align-top">
                    {e.receiptUrl ? (
                      <a href={e.receiptUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Lihat</a>
                    ) : '—'}
                  </td>
                  {canManage ? (
                    <td className="px-3 py-2 align-top text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        disabled={deleteM.isPending}
                        onClick={() => setToDelete(e)}
                      >
                        Hapus
                      </Button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tambah Pengeluaran</DialogTitle>
            <DialogDescription>Catat pengeluaran operasional dan kurangi saldo kas/bank.</DialogDescription>
          </DialogHeader>
          <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); createM.mutate(); }}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="exp-category">Kategori</Label>
              <select
                id="exp-category"
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
            <ComboboxField
              id="exp-account"
              label="Akun Kas/Bank"
              value={form.accountId}
              onChange={(v) => setForm({ ...form, accountId: v })}
              options={(accountsQ.data ?? []).map((a) => ({ value: a.id, label: `${a.name} (${a.code || a.type})` }))}
              placeholder="Pilih akun"
              required
            />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="exp-amount">Nominal (Rp)</Label>
              <input
                id="exp-amount"
                type="number"
                min={1}
                className="h-9 rounded-md border border-input bg-background px-3"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="exp-desc">Deskripsi</Label>
              <input
                id="exp-desc"
                className="h-9 rounded-md border border-input bg-background px-3"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Keterangan pengeluaran"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="exp-date">Tanggal</Label>
              <input
                id="exp-date"
                type="date"
                className="h-9 rounded-md border border-input bg-background px-3"
                value={form.occurredAt}
                onChange={(e) => setForm({ ...form, occurredAt: e.target.value })}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="exp-receipt">URL Bukti (opsional)</Label>
              <input
                id="exp-receipt"
                className="h-9 rounded-md border border-input bg-background px-3"
                value={form.receiptUrl}
                onChange={(e) => setForm({ ...form, receiptUrl: e.target.value })}
                placeholder="Link bukti pengeluaran"
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={createM.isPending}>{createM.isPending ? 'Menyimpan...' : 'Simpan'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => {
          if (!o) setToDelete(null);
        }}
        title="Hapus pengeluaran?"
        description={`Pengeluaran "${toDelete?.description ?? ''}" (${toDelete ? rupiah(toDelete.amount) : ''}) akan dihapus permanen dan saldo kas/bank disesuaikan.`}
        confirmLabel="Ya, hapus"
        pending={deleteM.isPending}
        onConfirm={() => toDelete && deleteM.mutate(toDelete.id)}
      />
    </div>
  );
}