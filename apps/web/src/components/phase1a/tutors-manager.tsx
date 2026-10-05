"use client";

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Search, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ImportDialog } from '@/components/shared/import-dialog';
import { UserAvatar } from '@/components/shared/user-avatar';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import type { TutorItem } from '@/lib/phase1a-types';
import {
  Phase1aFormDialog,
  Phase1aSelectField,
  type Phase1aField,
} from '@/components/phase1a/phase1a-form-dialog';

interface SubjectOption {
  id: string;
  code: string;
  name: string;
}

interface CreatedTutor extends TutorItem {
  tempPassword?: string;
}

const CREATE_FIELDS: Phase1aField[] = [
  { name: 'name', label: 'Nama lengkap', required: true },
  { name: 'email', label: 'Email', type: 'email', required: true },
  { name: 'password', label: 'Kata sandi awal (opsional — kosong = auto-generate)', type: 'password' },
  { name: 'phone', label: 'No. HP / WA (wajib)', placeholder: '08...', required: true },
  { name: 'bio', label: 'Bio (opsional)', placeholder: 'Pengalaman, latar belakang…' },
];

const EDIT_FIELDS: Phase1aField[] = [
  { name: 'name', label: 'Nama lengkap' },
  { name: 'phone', label: 'No. HP / WA (wajib)', placeholder: '08...', required: true },
  { name: 'bio', label: 'Bio', placeholder: 'Pengalaman, latar belakang…' },
  { name: 'isActive', label: 'Aktif? (true/false)', placeholder: 'true' },
];

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

/** Halaman "Tutor" — data nyata untuk Admin Academic & Owner. */
export function TutorsManager({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [lastTempPassword, setLastTempPassword] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<TutorItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TutorItem | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const th = 'px-3 py-2 text-left font-medium whitespace-nowrap';
  const td = 'px-3 py-2 align-top';

  const tutorsQuery = useQuery({
    queryKey: ['tutors', debouncedSearch],
    queryFn: () =>
      apiFetch<TutorItem[]>(`/tutors${debouncedSearch ? `?search=${encodeURIComponent(debouncedSearch)}` : ''}`),
  });
  const subjectsQ = useQuery({
    queryKey: ['master-subjects'],
    queryFn: () => apiFetch<SubjectOption[]>('/master/subjects'),
    staleTime: 5 * 60 * 1000,
  });
  const subjectOptions = (subjectsQ.data ?? []).map((s) => ({
    value: s.name,
    label: `${s.code} — ${s.name}`,
  }));

  const createMutation = useMutation({
    mutationFn: () =>
      apiFetch<CreatedTutor>('/tutors', {
        method: 'POST',
        body: {
          name: form.name,
          email: form.email,
          password: form.password || undefined,
          phone: form.phone,
          specialization: form.specialization || undefined,
          bio: form.bio || undefined,
        },
      }),
    onSuccess: (created) => {
      toast.success('Tutor baru dibuat + akun login aktif.');
      setLastTempPassword(created.tempPassword ?? null);
      setCreateOpen(false);
      setForm({});
      queryClient.invalidateQueries({ queryKey: ['tutors'] });
    },
    onError: (error) => toast.error(errorMessage(error, 'Gagal membuat tutor.')),
  });

  const editMutation = useMutation({
    mutationFn: () =>
      apiFetch<TutorItem>(`/tutors/${editTarget?.id}`, {
        method: 'PATCH',
        body: {
          name: editForm.name || undefined,
          phone: editForm.phone || undefined,
          specialization: editForm.specialization || undefined,
          bio: editForm.bio || undefined,
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
      toast.success('Data tutor diperbarui.');
      setEditTarget(null);
      setEditForm({});
      queryClient.invalidateQueries({ queryKey: ['tutors'] });
    },
    onError: (error) => toast.error(errorMessage(error, 'Gagal memperbarui tutor.')),
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/tutors/${deleteTarget?.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Tutor dihapus — jadwal/sesi terkait kini menunggu penugasan tutor baru.');
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['tutors'] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
    onError: (error) => toast.error(errorMessage(error, 'Gagal menghapus tutor.')),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Tutor</h1>
        {canManage ? (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="size-4" /> Import
            </Button>
            <Button onClick={() => { setCreateOpen(true); setLastTempPassword(null); }}>Tambah Tutor</Button>
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
          placeholder="Cari nama / email tutor..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {tutorsQuery.isLoading ? <Skeleton className="h-20 w-full" /> : null}
      {tutorsQuery.isError ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-destructive">
            Gagal memuat data tutor.
          </CardContent>
        </Card>
      ) : null}

      {(tutorsQuery.data?.length ?? 0) > 0 ? (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className={th}>Tutor</th>
                <th className={th}>Spesialisasi</th>
                <th className={th}>No. HP</th>
                <th className={th}>Status</th>
                {canManage ? <th className={th}></th> : null}
              </tr>
            </thead>
            <tbody>
              {tutorsQuery.data?.map((tutor) => (
                <tr key={tutor.id} className="border-b last:border-0">
                  <td className={td}>
                    <span className="flex items-center gap-2.5">
                      <UserAvatar name={tutor.user.name} avatarUrl={tutor.user.avatarUrl} className="size-8" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{tutor.user.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{tutor.user.email}</span>
                      </span>
                    </span>
                  </td>
                  <td className={`${td} text-muted-foreground`}>{tutor.specialization ?? '—'}</td>
                  <td className={`${td} whitespace-nowrap`}>{tutor.user.phone ? (
                    <span className="tabular-nums">{tutor.user.phone}</span>
                  ) : (
                    <span className="text-xs text-destructive">Belum diisi</span>
                  )}</td>
                  <td className={`${td} whitespace-nowrap`}>
                    <Badge variant={tutor.isActive ? 'secondary' : 'outline'}>
                      {tutor.isActive ? 'Aktif' : 'Nonaktif'}
                    </Badge>
                  </td>
                  {canManage ? (
                    <td className={`${td} text-right`}>
                      <span className="inline-flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditTarget(tutor);
                            setEditForm({
                              name: tutor.user.name,
                              phone: tutor.user.phone ?? '',
                              specialization: tutor.specialization ?? '',
                              bio: tutor.bio ?? '',
                              isActive: String(tutor.isActive),
                            });
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:text-destructive"
                          aria-label={`Hapus ${tutor.user.name}`}
                          onClick={() => setDeleteTarget(tutor)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </span>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <Phase1aFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Tambah Tutor"
        description="Akun login tutor otomatis dibuat bersama profilnya."
        fields={CREATE_FIELDS}
        values={form}
        onChange={(name, value) => setForm((prev) => ({ ...prev, [name]: value }))}
        onSubmit={() => createMutation.mutate()}
        isSubmitting={createMutation.isPending}
        submitLabel="Buat Tutor"
        extra={
          <Phase1aSelectField
            id="tutor-spec-create"
            label="Spesialisasi / Mapel (opsional)"
            value={form.specialization ?? ''}
            onChange={(v) => setForm((prev) => ({ ...prev, specialization: v }))}
            options={subjectOptions}
            placeholder="- Pilih mapel -"
            emptyText="Belum ada mapel — tambahkan di Master Data."
          />
        }
      />

      <Phase1aFormDialog
        open={editTarget !== null}
        onOpenChange={(o) => { if (!o) setEditTarget(null); }}
        title={`Edit Tutor — ${editTarget?.user.name ?? ''}`}
        fields={EDIT_FIELDS}
        values={editForm}
        onChange={(name, value) => setEditForm((prev) => ({ ...prev, [name]: value }))}
        onSubmit={() => editMutation.mutate()}
        isSubmitting={editMutation.isPending}
        submitLabel="Simpan Perubahan"
        extra={
          <Phase1aSelectField
            id="tutor-spec-edit"
            label="Spesialisasi / Mapel"
            value={editForm.specialization ?? ''}
            onChange={(v) => setEditForm((prev) => ({ ...prev, specialization: v }))}
            options={subjectOptions}
            placeholder="- Pilih mapel -"
            emptyText="Belum ada mapel — tambahkan di Master Data."
          />
        }
      />

      <ImportDialog
        entity="tutors"
        open={importOpen}
        onOpenChange={setImportOpen}
        invalidateKeys={['tutors']}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
        title={`Hapus tutor ${deleteTarget?.user.name ?? ''}?`}
        description="Keanggotaan kelompok dilepas dan jadwal/sesi yang menunjuk tutor ini jadi 'tutor menyusul'. Tutor yang sudah punya riwayat absensi atau payroll tidak bisa dihapus — nonaktifkan saja."
        confirmLabel="Hapus Tutor"
        pending={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  );
}
