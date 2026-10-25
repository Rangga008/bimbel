"use client";

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Search, Upload, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ImportDialog } from '@/components/shared/import-dialog';
import { Card, CardContent } from '@/components/ui/card';
import { SkeletonCards } from '@/components/shared/skeletons';
import { EmptyState } from '@/components/shared/empty-state';
import { ListPager } from '@/components/shared/list-pager';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import type { ParentItem, StudentItem } from '@/lib/phase1a-types';
import {
  Phase1aFormDialog,
  Phase1aSelectField,
  type Phase1aField,
} from '@/components/phase1a/phase1a-form-dialog';
import { ParentLinkManager } from '@/components/phase1a/parent-link-manager';

const CREATE_FIELDS: Phase1aField[] = [
  { name: 'name', label: 'Nama lengkap', placeholder: 'Nama orang tua/wali', required: true },
  { name: 'email', label: 'Email (opsional — kosong = dibuat dari no HP)', type: 'email', placeholder: 'ortu@contoh.id' },
  { name: 'password', label: 'Kata sandi awal (opsional — kosong = auto-generate)', type: 'password' },
  { name: 'phone', label: 'No. HP/WhatsApp (wajib — dipakai untuk login & notifikasi)', placeholder: '08...', required: true },
];

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

interface CreatedParent extends ParentItem {
  tempPassword?: string;
}

const EDIT_FIELDS: Phase1aField[] = [
  { name: 'name', label: 'Nama lengkap' },
  { name: 'email', label: 'Email (login — opsional, kosong = pakai no HP)', type: 'email' },
  { name: 'phone', label: 'No. HP', placeholder: '08...', required: true },
  { name: 'isActive', label: 'Status akun', options: [ { value: 'true', label: 'Aktif' }, { value: 'false', label: 'Nonaktif' } ] },
];

/** Kelola Orang Tua: buat akun + hubungkan ke ≥1 anak (1 ortu bisa 2 anak). */
export function ParentsManager({ canManage, basePath }: { canManage: boolean; basePath: string }) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [lastTempPassword, setLastTempPassword] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<ParentItem | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);

  const parentsQuery = useQuery({
    queryKey: ['parents', debouncedSearch],
    queryFn: () =>
      apiFetch<ParentItem[]>(
        `/parents${debouncedSearch ? `?search=${encodeURIComponent(debouncedSearch)}` : ''}`,
      ),
  });

  const PAGE_SIZE = 12;
  const [visible, setVisible] = useState(PAGE_SIZE);
  const parents = parentsQuery.data ?? [];
  const shownParents = parents.slice(0, visible);

  const studentsQuery = useQuery({
    queryKey: ['students'],
    queryFn: () => apiFetch<StudentItem[]>('/students'),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiFetch<CreatedParent>('/parents', {
        method: 'POST',
        body: {
          name: form.name,
          email: form.email?.trim() || undefined,
          password: form.password || undefined,
          phone: form.phone || undefined,
          studentIds: form.studentIds ? [form.studentIds] : undefined,
        },
      }),
    onSuccess: (created) => {
      toast.success('Orang tua baru dibuat + akun login aktif.');
      setLastTempPassword(created.tempPassword ?? null);
      setCreateOpen(false);
      setForm({});
      queryClient.invalidateQueries({ queryKey: ['parents'] });
      queryClient.invalidateQueries({ queryKey: ['students'] });
    },
    onError: (error) => toast.error(errorMessage(error, 'Gagal membuat orang tua.')),
  });

  const editMutation = useMutation({
    mutationFn: () =>
      apiFetch<ParentItem>(`/parents/${editTarget?.id}`, {
        method: 'PATCH',
        body: {
          name: editForm.name || undefined,
          // '' → backend membuat placeholder dari no HP (hapus email login).
          email: editForm.email?.trim(),
          phone: editForm.phone || undefined,
          isActive:
            editForm.isActive === ''
              ? undefined
              : editForm.isActive === 'true'
                ? true
                : editForm.isActive === 'false'
                  ? false
                  : undefined,
        },
      }),
    onSuccess: () => {
      toast.success('Data orang tua diperbarui.');
      setEditTarget(null);
      setEditForm({});
      queryClient.invalidateQueries({ queryKey: ['parents'] });
    },
    onError: (error) => toast.error(errorMessage(error, 'Gagal memperbarui orang tua.')),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Orang Tua</h1>
          <p className="text-sm text-muted-foreground">
            {parentsQuery.data
              ? `${parentsQuery.data.length} orang tua terdaftar — tiap akun otomatis bisa login`
              : 'Memuat data orang tua...'}
          </p>
        </div>
        {canManage ? (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="size-4" /> Import
            </Button>
            <Button onClick={() => { setCreateOpen(true); setLastTempPassword(null); }}>Tambah Orang Tua</Button>
          </div>
        ) : null}
      </div>

      {lastTempPassword ? (
        <Card className="border-warning-300 bg-warning-50">
          <CardContent className="py-3 text-sm">
            Password sementara akun baru (tampilkan sekali, jangan simpan di layar):{' '}
            <span className="font-mono font-semibold">{lastTempPassword}</span>
          </CardContent>
        </Card>
      ) : null}

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Cari nama / email / no HP orang tua..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setVisible(PAGE_SIZE);
          }}
          className="pl-9"
        />
      </div>

      {parentsQuery.isLoading ? <SkeletonCards /> : null}

      {parentsQuery.isError ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-destructive">
            Gagal memuat data orang tua — cek koneksi / permission akun Anda.
          </CardContent>
        </Card>
      ) : null}

      {parents.length === 0 && !parentsQuery.isLoading && !parentsQuery.isError ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={Users}
              title={search ? 'Orang tua tidak ditemukan' : 'Belum ada orang tua'}
              description={
                search
                  ? `Tidak ada orang tua yang cocok dengan "${search}".`
                  : 'Tambahkan orang tua pertama untuk mulai mengelola data.'
              }
            />
          </CardContent>
        </Card>
      ) : null}

      {shownParents.length > 0 ? (
        <ParentLinkManager
          parents={shownParents}
          students={studentsQuery.data ?? []}
          studentsLoading={studentsQuery.isLoading}
          basePath={basePath}
          onEdit={
            canManage
              ? (parent) => {
                  setEditTarget(parent);
                  setEditForm({
                    name: parent.user.name,
                    email: parent.user.email?.endsWith('@hp.bimbel.local')
                      ? ''
                      : parent.user.email,
                    phone: parent.user.phone ?? '',
                    isActive: String(parent.isActive),
                  });
                }
              : undefined
          }
        />
      ) : null}

      <ListPager
        mode="loadMore"
        page={0}
        pageCount={Math.ceil(parents.length / PAGE_SIZE)}
        total={parents.length}
        shown={shownParents.length}
        onPageChange={(p) => setVisible((p + 1) * PAGE_SIZE)}
      />

      <Phase1aFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Tambah Orang Tua"
        description="Akun login ORANG_TUA otomatis dibuat via createUserForPerson() + bisa langsung dihubungkan ke 1 anak (tambah anak lain via Hubungkan Anak)."
        fields={CREATE_FIELDS}
        values={form}
        onChange={(name, value) => setForm((prev) => ({ ...prev, [name]: value }))}
        onSubmit={() => createMutation.mutate()}
        isSubmitting={createMutation.isPending || studentsQuery.isLoading}
        submitLabel="Buat Orang Tua"
        extra={
          <Phase1aSelectField
            id="fase1a-parent-studentIds"
            label="Anak (opsional — bisa tambah lagi nanti)"
            value={form.studentIds ?? ''}
            onChange={(v) => setForm((prev) => ({ ...prev, studentIds: v }))}
            options={(studentsQuery.data ?? []).map((s) => ({
              value: s.id,
              label: `${s.user.name} (${s.user.email})`,
            }))}
            placeholder={studentsQuery.isLoading ? 'Memuat...' : 'Tanpa anak dulu...'}
          />
        }
      />

      <Phase1aFormDialog
        open={editTarget !== null}
        onOpenChange={(o) => { if (!o) setEditTarget(null); }}
        title={`Edit Orang Tua — ${editTarget?.user.name ?? ''}`}
        fields={EDIT_FIELDS}
        values={editForm}
        onChange={(name, value) => setEditForm((prev) => ({ ...prev, [name]: value }))}
        onSubmit={() => editMutation.mutate()}
        isSubmitting={editMutation.isPending}
        submitLabel="Simpan Perubahan"
      />

      <ImportDialog
        entity="parents"
        open={importOpen}
        onOpenChange={setImportOpen}
        invalidateKeys={['parents']}
      />
    </div>
  );
}
