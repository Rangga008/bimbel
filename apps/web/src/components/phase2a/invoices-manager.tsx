"use client";
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Ban, Eye, FileCheck2, FileText, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { ListPager } from '@/components/shared/list-pager';
import { SkeletonCards } from '@/components/shared/skeletons';
import { UserAvatar } from '@/components/shared/user-avatar';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import type { InvoiceDetail, InvoiceListItem, ProgramItem, StudentItem } from '@/lib/phase1a-types';
import { ComboboxField } from '@/components/shared/combobox-field';
import { Phase1aFormDialog, Phase1aSelectField } from '@/components/phase1a/phase1a-form-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

function err(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}

export function rupiah(value: string | number) {
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return `Rp ${n.toLocaleString('id-ID')}`;
}

function statusVariant(s: string) {
  if (s === 'PAID') return 'success' as const;
  if (s === 'ISSUED') return 'warning' as const;
  if (s === 'VOID' || s === 'OVERDUE') return 'destructive' as const;
  if (s === 'DRAFT') return 'secondary' as const;
  return 'outline' as const;
}

/** Status efektif invoice — pakai displayStatus dari backend bila ada. */
function effStatus(inv: InvoiceListItem): string {
  return inv.displayStatus ?? inv.status;
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  ISSUED: 'Terbit (belum lunas)',
  OVERDUE: 'Lewat Jatuh Tempo',
  PAID: 'Lunas',
  VOID: 'Dibatalkan',
};

const STATUS_TABS: { value: string; label: string }[] = [
  { value: '', label: 'Semua' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'ISSUED', label: 'Belum Lunas' },
  { value: 'OVERDUE', label: 'Jatuh Tempo' },
  { value: 'PAID', label: 'Lunas' },
  { value: 'VOID', label: 'Batal' },
];

/**
 * Fase 2a — Halaman "Invoice" (Admin Finance): list + detail dengan item benar.
 * Status masih manual (DRAFT/ISSUED/VOID); pembayaran nyata menyusul Fase 2b.
 * Mobile: card-based (tanpa tabel berat), desktop: grid card yang sama.
 */
export function InvoicesManager({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [status, setStatus] = useState('');
  const [filterProgramId, setFilterProgramId] = useState('');
  const [filterLevelId, setFilterLevelId] = useState('');
  const [open, setOpen] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  // Item tambahan manual (biaya admin, diskon — isi negatif, dsb).
  const [extraItems, setExtraItems] = useState<{ description: string; unitPrice: string }[]>([]);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [voidTarget, setVoidTarget] = useState<InvoiceListItem | null>(null);

  const listQ = useQuery({
    queryKey: ['invoices', debouncedSearch, status, filterProgramId, filterLevelId],
    queryFn: () => {
      const p = new URLSearchParams();
      if (debouncedSearch) p.set('search', debouncedSearch);
      if (status) p.set('status', status);
      if (filterProgramId) p.set('programId', filterProgramId);
      if (filterLevelId) p.set('levelId', filterLevelId);
      const qs = p.toString();
      return apiFetch<InvoiceListItem[]>(`/invoices${qs ? `?${qs}` : ''}`);
    },
  });
  const programsQ = useQuery({
    queryKey: ['programs', 'options'],
    queryFn: () => apiFetch<ProgramItem[]>('/programs/options'),
  });
  const studentsQ = useQuery({
    queryKey: ['students-lite'],
    queryFn: () => apiFetch<StudentItem[]>('/students'),
    enabled: open,
  });
  const detailQ = useQuery({
    queryKey: ['invoices', detailId],
    queryFn: () => apiFetch<InvoiceDetail>(`/invoices/${detailId}`),
    enabled: detailId !== null,
  });

  const PAGE_SIZE = 12;
  const [visible, setVisible] = useState(PAGE_SIZE);
  const invoices = listQ.data ?? [];
  const shownInvoices = invoices.slice(0, visible);
  const th = 'px-3 py-2 text-left font-medium whitespace-nowrap';
  const thR = 'px-3 py-2 text-right font-medium whitespace-nowrap';
  const td = 'px-3 py-2 align-top';
  const tdR = 'px-3 py-2 text-right align-top';

  const createM = useMutation({
    mutationFn: () => {
      if (!studentId) throw new Error('Pilih siswa dulu.');
      if (!desc || !amount) throw new Error('Isi deskripsi + nominal.');
      const extras = extraItems
        .filter((it) => it.description.trim() !== '' || it.unitPrice.trim() !== '')
        .map((it) => {
          if (!it.description.trim()) throw new Error('Isi deskripsi item tambahan.');
          const v = Number(it.unitPrice);
          if (!Number.isFinite(v) || it.unitPrice.trim() === '') throw new Error('Isi nominal item tambahan.');
          return { description: it.description.trim(), quantity: 1, unitPrice: v };
        });
      return apiFetch<InvoiceDetail>('/invoices', {
        method: 'POST',
        body: {
          studentId,
          dueDate: dueDate || undefined,
          items: [{ description: desc, quantity: 1, unitPrice: Number(amount) }, ...extras],
        },
      });
    },
    onSuccess: (created) => {
      toast.success(`Invoice ${created.number} dibuat (DRAFT).`);
      setOpen(false);
      setStudentId('');
      setDueDate('');
      setDesc('');
      setAmount('');
      setExtraItems([]);
      qc.invalidateQueries({ queryKey: ['invoices'] });
    },
    onError: (e) => toast.error(err(e, 'Gagal membuat invoice.')),
  });

  const issueM = useMutation({
    mutationFn: (id: string) => apiFetch<InvoiceDetail>(`/invoices/${id}/issue`, { method: 'PATCH', body: {} }),
    onSuccess: (updated) => {
      toast.success(`Invoice ${updated.number} diterbitkan.`);
      qc.invalidateQueries({ queryKey: ['invoices'] });
    },
    onError: (e) => toast.error(err(e, 'Gagal menerbitkan invoice.')),
  });

  const voidM = useMutation({
    mutationFn: (id: string) => apiFetch<InvoiceDetail>(`/invoices/${id}/void`, { method: 'PATCH', body: {} }),
    onSuccess: (updated) => {
      toast.success(`Invoice ${updated.number} dibatalkan.`);
      qc.invalidateQueries({ queryKey: ['invoices'] });
    },
    onError: (e) => toast.error(err(e, 'Gagal membatalkan invoice.')),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Invoice</h1>
          <p className="text-sm text-muted-foreground">
            {listQ.data ? `${listQ.data.length} invoice` : 'Memuat...'} — pilih kategori status di bawah.
          </p>
        </div>
        {canManage ? <Button onClick={() => setOpen(true)}>Buat Invoice</Button> : null}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Cari nomor / nama siswa..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setVisible(PAGE_SIZE);
            }}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {STATUS_TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => {
                setStatus(t.value);
                setVisible(PAGE_SIZE);
              }}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                status === t.value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'bg-background hover:border-primary/50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="w-full sm:w-56">
          <ComboboxField
            id="inv-filter-program"
            value={filterProgramId}
            onChange={(v) => { setFilterProgramId(v); setFilterLevelId(''); setVisible(PAGE_SIZE); }}
            options={(programsQ.data ?? []).map((p) => ({ value: p.id, label: `${p.name} (${p.code})` }))}
            placeholder="- Semua program -"
          />
        </div>
        <div className="w-full sm:w-48">
          <ComboboxField
            id="inv-filter-level"
            value={filterLevelId}
            onChange={(v) => { setFilterLevelId(v); setVisible(PAGE_SIZE); }}
            options={(programsQ.data?.find((p) => p.id === filterProgramId)?.levels ?? []).map((l) => ({ value: l.id, label: l.name }))}
            placeholder="- Semua level -"
          />
        </div>
      </div>

      {listQ.isLoading ? <SkeletonCards /> : null}
      {listQ.isError ? (
        <Card><CardContent className="py-10 text-center text-sm text-destructive">Gagal memuat invoice — cek permission akun Anda.</CardContent></Card>
      ) : null}
      {invoices.length === 0 && !listQ.isLoading && !listQ.isError ? (
        <Card><CardContent>
          <EmptyState
            icon={FileText}
            title={search || status ? 'Invoice tidak ditemukan' : 'Belum ada invoice'}
            description={
              search || status
                ? 'Coba ubah kata kunci atau filter status.'
                : 'Buat dari paket siswa (otomatis) atau manual.'
            }
          />
        </CardContent></Card>
      ) : null}

      {shownInvoices.length > 0 ? (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className={th}>Invoice</th>
                <th className={th}>Siswa</th>
                <th className={th}>Orang Tua</th>
                <th className={th}>Program / Paket</th>
                <th className={thR}>Total</th>
                <th className={thR}>Dibayar</th>
                <th className={th}>Status</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {shownInvoices.map((inv) => (
                <tr key={inv.id} className="border-b last:border-0">
                  <td className={`${td} font-medium whitespace-nowrap`}>{inv.number}</td>
                  <td className={td}>
                    <span className="flex items-center gap-2">
                      <UserAvatar name={inv.student.user.name} avatarUrl={inv.student.user.avatarUrl} className="size-7" />
                      <span className="truncate">{inv.student.user.name}</span>
                    </span>
                  </td>
                  <td className={`${td} text-muted-foreground`}>
                    {(inv.student.parentStudents ?? []).map((p) => p.parent.user.name).join(', ') || '—'}
                  </td>
                  <td className={`${td} text-muted-foreground`}>
                    {(() => {
                      const enr = inv.enrollmentLink ?? inv.enrollment;
                      if (enr) {
                        return [enr.program?.name, enr.level?.name, enr.group?.name]
                          .filter(Boolean)
                          .join(' · ');
                      }
                      return inv.package ? `Paket: ${inv.package.name}` : `${inv._count.items} item`;
                    })()}
                  </td>
                  <td className={`${tdR} font-medium tabular-nums whitespace-nowrap`}>{rupiah(inv.totalAmount)}</td>
                  <td className={`${tdR} tabular-nums whitespace-nowrap`}>{rupiah(inv.amountPaid)}</td>
                  <td className={`${td} whitespace-nowrap`}>
                    <Badge variant={statusVariant(effStatus(inv))}>{effStatus(inv)}</Badge>
                  </td>
                  <td className={`${td} whitespace-nowrap text-right`}>
                    <span className="inline-flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Detail ${inv.number}`}
                        onClick={() => setDetailId(inv.id)}
                      >
                        <Eye className="size-4" />
                      </Button>
                      {canManage && inv.status === 'DRAFT' ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Terbitkan ${inv.number}`}
                          onClick={() => issueM.mutate(inv.id)}
                          disabled={issueM.isPending}
                        >
                          <FileCheck2 className="size-4 text-success-600" />
                        </Button>
                      ) : null}
                      {canManage && inv.status !== 'VOID' ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Batalkan ${inv.number}`}
                          onClick={() => setVoidTarget(inv)}
                          disabled={voidM.isPending}
                        >
                          <Ban className="size-4 text-destructive" />
                        </Button>
                      ) : null}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <ListPager
        mode="loadMore"
        page={0}
        pageCount={Math.ceil(invoices.length / PAGE_SIZE)}
        total={invoices.length}
        shown={shownInvoices.length}
        onPageChange={(p) => setVisible((p + 1) * PAGE_SIZE)}
      />

      <Phase1aFormDialog
        open={open}
        onOpenChange={setOpen}
        title="Buat Invoice"
        description="Invoice manual — item utama + item tambahan (biaya admin, diskon, dsb)."
        fields={[
          { name: 'desc', label: 'Deskripsi item', placeholder: 'Biaya pendaftaran...', required: true },
          { name: 'amount', label: 'Nominal (Rp)', type: 'number', placeholder: '500000', required: true },
          { name: 'dueDate', label: 'Jatuh tempo (opsional YYYY-MM-DD)' },
        ]}
        values={{ desc, amount, dueDate }}
        onChange={(n, v) => {
          if (n === 'desc') setDesc(v);
          else if (n === 'amount') setAmount(v);
          else setDueDate(v);
        }}
        onSubmit={() => createM.mutate()}
        isSubmitting={createM.isPending || studentsQ.isLoading}
        submitLabel="Buat Invoice"
        extra={
          <div className="flex flex-col gap-3">
            <Phase1aSelectField
              id="inv-student"
              label="Siswa (wajib)"
              value={studentId}
              onChange={setStudentId}
              options={(studentsQ.data ?? []).map((s) => ({ value: s.id, label: `${s.user.name} (${s.user.email})`, imageUrl: s.user.avatarUrl }))}
              placeholder={studentsQ.isLoading ? 'Memuat...' : 'Pilih siswa...'}
              required
            />
            <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Item tambahan — biaya admin, diskon (isi negatif), dsb.
              </p>
              {extraItems.map((it, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    placeholder="Deskripsi (cth: Biaya admin / Diskon)"
                    value={it.description}
                    onChange={(e) =>
                      setExtraItems((prev) =>
                        prev.map((x, j) =>
                          j === i ? { ...x, description: e.target.value } : x,
                        ),
                      )
                    }
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    placeholder="Nominal"
                    value={it.unitPrice}
                    onChange={(e) =>
                      setExtraItems((prev) =>
                        prev.map((x, j) =>
                          j === i ? { ...x, unitPrice: e.target.value } : x,
                        ),
                      )
                    }
                    className="w-32"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Hapus item"
                    onClick={() =>
                      setExtraItems((prev) => prev.filter((_, j) => j !== i))
                    }
                  >
                    <Ban className="size-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={() =>
                  setExtraItems((prev) => [
                    ...prev,
                    { description: '', unitPrice: '' },
                  ])
                }
              >
                + Tambah Item
              </Button>
            </div>
          </div>
        }
      />

      <Dialog open={detailId !== null} onOpenChange={(o) => { if (!o) setDetailId(null); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detail Invoice</DialogTitle>
            <DialogDescription>Rincian item tagihan.</DialogDescription>
          </DialogHeader>
          {detailQ.isLoading ? <Skeleton className="h-24 w-full" /> : null}
          {detailQ.isError ? <p className="text-sm text-destructive">Gagal memuat detail.</p> : null}
          {detailQ.data ? (
            <div className="flex flex-col gap-3">
              <Card>
                <CardHeader><CardTitle className="text-base">{detailQ.data.number}</CardTitle></CardHeader>
                <CardContent className="flex flex-wrap gap-1.5 text-sm">
                  <Badge variant={statusVariant(detailQ.data.displayStatus ?? detailQ.data.status)}>
                    {STATUS_LABEL[detailQ.data.displayStatus ?? detailQ.data.status] ?? detailQ.data.status}
                  </Badge>
                  <span className="inline-flex items-center gap-1.5">
                    <UserAvatar name={detailQ.data.student.user.name} avatarUrl={detailQ.data.student.user.avatarUrl} className="size-6" />
                    <Badge variant="outline">{detailQ.data.student.user.name}</Badge>
                  </span>
                  {detailQ.data.package ? <Badge variant="outline">{detailQ.data.package.name}</Badge> : null}
                </CardContent>
              </Card>
              <div className="flex flex-col gap-1.5">
                {detailQ.data.items.map((it) => (
                  <div key={it.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                    <span className="min-w-0 truncate">{it.description} <span className="text-muted-foreground">×{it.quantity}</span></span>
                    <span className="font-medium">{rupiah(it.amount)}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between border-t pt-2 text-sm">
                <span className="text-muted-foreground">Total</span>
                <span className="font-semibold">{rupiah(detailQ.data.totalAmount)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Dibayar</span>
                <span className="font-medium">{rupiah(detailQ.data.amountPaid)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Status</span>
                <Badge variant={detailQ.data.status === 'PAID' ? 'default' : detailQ.data.status === 'OVERDUE' ? 'destructive' : 'secondary'}>
                  {detailQ.data.status}
                </Badge>
              </div>
              {Number(detailQ.data.amountPaid) < Number(detailQ.data.totalAmount) && (
                <p className="text-xs text-muted-foreground">
                  Sisa {rupiah(Number(detailQ.data.totalAmount) - Number(detailQ.data.amountPaid))}
                </p>
              )}
            </div>
          ) : null}
          <DialogFooter><Button variant="outline" onClick={() => setDetailId(null)}>Tutup</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={voidTarget !== null}
        onOpenChange={(o) => { if (!o) setVoidTarget(null); }}
        title={`Batalkan invoice ${voidTarget?.number ?? ''}?`}
        description="Invoice yang dibatalkan tidak dapat diterbitkan kembali atau dibayar."
        confirmLabel="Ya, batalkan"
        pending={voidM.isPending}
        onConfirm={() => {
          if (voidTarget) voidM.mutate(voidTarget.id);
          setVoidTarget(null);
        }}
      />
    </div>
  );
}

