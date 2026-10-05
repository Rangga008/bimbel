"use client";

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronRight, Pencil, Search, Upload, Users } from 'lucide-react';
import { UserAvatar } from '@/components/shared/user-avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SkeletonCards } from '@/components/shared/skeletons';
import { EmptyState } from '@/components/shared/empty-state';
import { ListPager } from '@/components/shared/list-pager';
import { ImportDialog } from '@/components/shared/import-dialog';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import type { ParentItem, StudentItem } from '@/lib/phase1a-types';
import {
  Phase1aFormDialog,
  Phase1aSelectField,
  type Phase1aField,
} from '@/components/phase1a/phase1a-form-dialog';

const CREATE_FIELDS: Phase1aField[] = [
  { name: 'name', label: 'Nama lengkap', placeholder: 'Nama siswa', required: true },
  { name: 'email', label: 'Email', type: 'email', placeholder: 'siswa@contoh.id', required: true },
  { name: 'password', label: 'Kata sandi awal (opsional — kosong = auto-generate)', type: 'password' },
  { name: 'phone', label: 'No. HP (opsional)', placeholder: '08...' },
  { name: 'dateOfBirth', label: 'Tanggal lahir (opsional)', type: 'date' },
  { name: 'address', label: 'Alamat (opsional)', placeholder: 'Jl. ...' },
  { name: 'schoolOrigin', label: 'Asal sekolah (opsional)', placeholder: 'SMPN 1 ...' },
];

const GENDER_OPTIONS = [
  { value: 'M', label: 'Laki-laki' },
  { value: 'F', label: 'Perempuan' },
  { value: 'OTHER', label: 'Lainnya' },
];

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

const EDIT_FIELDS: Phase1aField[] = [
  { name: 'name', label: 'Nama lengkap' },
  { name: 'email', label: 'Email (login)', type: 'email' },
  { name: 'phone', label: 'No. HP', placeholder: '08...' },
  { name: 'dateOfBirth', label: 'Tanggal lahir', type: 'date' },
  { name: 'address', label: 'Alamat', placeholder: 'Jl. ...' },
  { name: 'schoolOrigin', label: 'Asal sekolah', placeholder: 'SMPN 1 ...' },
  { name: 'isActive', label: 'Aktif? (true/false)', placeholder: 'true' },
];

/** Halaman "Siswa" — data nyata untuk Admin Finance/Academic & Owner. */
export function StudentsManager({ canManage, basePath }: { canManage: boolean; basePath: string }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [lastTempPassword, setLastTempPassword] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<StudentItem | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const th = 'px-3 py-2 text-left font-medium whitespace-nowrap';
  const td = 'px-3 py-2 align-top';

  const studentsQuery = useQuery({
    queryKey: ['students', debouncedSearch],
    queryFn: () =>
      apiFetch<Array<StudentItem & { tempPassword?: string }>>(
        `/students${debouncedSearch ? `?search=${encodeURIComponent(debouncedSearch)}` : ''}`,
      ),
  });

  const PAGE_SIZE = 12;
  const [visible, setVisible] = useState(PAGE_SIZE);
  const students = studentsQuery.data ?? [];
  const shownStudents = students.slice(0, visible);

  const parentsQuery = useQuery({
    queryKey: ['parents'],
    queryFn: () => apiFetch<ParentItem[]>('/parents'),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiFetch<StudentItem & { tempPassword?: string }>('/students', {
        method: 'POST',
        body: {
          name: form.name,
          email: form.email,
          password: form.password || undefined,
          phone: form.phone || undefined,
          dateOfBirth: form.dateOfBirth || undefined,
          gender: form.gender || undefined,
          address: form.address || undefined,
          schoolOrigin: form.schoolOrigin || undefined,
          parentIds: form.parentId ? [form.parentId] : undefined,
        },
      }),
    onSuccess: (created) => {
      toast.success('Siswa baru dibuat + akun login aktif.');
      setLastTempPassword(created.tempPassword ?? null);
      setCreateOpen(false);
      setForm({});
      queryClient.invalidateQueries({ queryKey: ['students'] });
    },
    onError: (error) => toast.error(errorMessage(error, 'Gagal membuat siswa.')),
  });

  const editMutation = useMutation({
    mutationFn: () =>
      apiFetch<StudentItem>(`/students/${editTarget?.id}`, {
        method: 'PATCH',
        body: {
          name: editForm.name || undefined,
          email: editForm.email || undefined,
          phone: editForm.phone || undefined,
          dateOfBirth: editForm.dateOfBirth || null,
          gender: editForm.gender || null,
          address: editForm.address || undefined,
          schoolOrigin: editForm.schoolOrigin || undefined,
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
      toast.success('Data siswa diperbarui.');
      setEditTarget(null);
      setEditForm({});
      queryClient.invalidateQueries({ queryKey: ['students'] });
    },
    onError: (error) => toast.error(errorMessage(error, 'Gagal memperbarui siswa.')),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Siswa</h1>
          <p className="text-sm text-muted-foreground">
            {studentsQuery.data
              ? `${studentsQuery.data.length} siswa terdaftar`
              : 'Memuat data siswa...'}
          </p>
        </div>
        {canManage ? (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="size-4" /> Import
            </Button>
            <Button onClick={() => { setCreateOpen(true); setLastTempPassword(null); }}>Tambah Siswa</Button>
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
          placeholder="Cari nama / email siswa..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setVisible(PAGE_SIZE);
          }}
          className="pl-9"
        />
      </div>

      {studentsQuery.isLoading ? <SkeletonCards /> : null}

      {studentsQuery.isError ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-destructive">
            Gagal memuat data siswa — cek koneksi / permission akun Anda.
          </CardContent>
        </Card>
      ) : null}

      {students.length === 0 && !studentsQuery.isLoading && !studentsQuery.isError ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={Users}
              title={search ? 'Siswa tidak ditemukan' : 'Belum ada siswa'}
              description={
                search
                  ? `Tidak ada siswa yang cocok dengan "${search}".`
                  : 'Tambahkan siswa pertama untuk mulai mengelola data.'
              }
            />
          </CardContent>
        </Card>
      ) : null}

      {shownStudents.length > 0 ? (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className={th}>Siswa</th>
                <th className={th}>Orang Tua</th>
                <th className={th}>Status</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {shownStudents.map((student) => (
                <tr key={student.id} className="border-b last:border-0">
                  <td className={td}>
                    <span className="flex items-center gap-2.5">
                      <UserAvatar name={student.user.name} avatarUrl={student.user.avatarUrl} className="size-8" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{student.user.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{student.user.email}</span>
                      </span>
                    </span>
                  </td>
                  <td className={`${td} text-muted-foreground`}>
                    {student.parentStudents.length > 0
                      ? student.parentStudents.map((l) => l.parent.user.name).join(', ')
                      : '—'}
                  </td>
                  <td className={`${td} whitespace-nowrap`}>
                    <Badge variant={student.isActive ? 'success' : 'outline'}>
                      {student.isActive ? 'Aktif' : 'Nonaktif'}
                    </Badge>
                  </td>
                  <td className={`${td} whitespace-nowrap text-right`}>
                    <span className="inline-flex items-center gap-1">
                      <Link href={`${basePath}/siswa/${student.id}`}>
                        <Button variant="ghost" size="sm" className="text-primary">Kelola <ChevronRight /></Button>
                      </Link>
                      {canManage ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditTarget(student);
                            setEditForm({
                              name: student.user.name,
                              email: student.user.email,
                              phone: student.user.phone ?? '',
                              dateOfBirth: student.dateOfBirth ? String(student.dateOfBirth).slice(0, 10) : '',
                              gender: student.gender ?? '',
                              address: student.address ?? '',
                              schoolOrigin: student.schoolOrigin ?? '',
                              isActive: String(student.isActive),
                            });
                          }}
                        >
                          <Pencil className="size-3.5" />
                          Edit
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
        pageCount={Math.ceil(students.length / PAGE_SIZE)}
        total={students.length}
        shown={shownStudents.length}
        onPageChange={(p) => setVisible((p + 1) * PAGE_SIZE)}
      />

      <Phase1aFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Tambah Siswa"
        description="Akun login siswa otomatis dibuat bersama profilnya + bisa langsung dihubungkan ke 1 orang tua (tambah ortu lain via Hubungkan Anak)."
        fields={CREATE_FIELDS}
        values={form}
        onChange={(name, value) => setForm((prev) => ({ ...prev, [name]: value }))}
        onSubmit={() => createMutation.mutate()}
        isSubmitting={createMutation.isPending || parentsQuery.isLoading}
        submitLabel="Buat Siswa"
        extra={
          <>
            <Phase1aSelectField
              id="fase1a-student-gender"
              label="Jenis kelamin (opsional)"
              value={form.gender ?? ''}
              onChange={(v) => setForm((prev) => ({ ...prev, gender: v }))}
              options={GENDER_OPTIONS}
              placeholder="- Pilih -"
            />
            <Phase1aSelectField
              id="fase1a-student-parentId"
              label="Orang tua (opsional — bisa tambah lagi nanti)"
              value={form.parentId ?? ''}
              onChange={(v) => setForm((prev) => ({ ...prev, parentId: v }))}
              options={(parentsQuery.data ?? []).map((p) => ({
                value: p.id,
                label: `${p.user.name} (${p.user.email})`,
                imageUrl: p.user.avatarUrl,
              }))}
              placeholder={parentsQuery.isLoading ? 'Memuat...' : 'Tanpa orang tua dulu...'}
            />
          </>
        }
      />

      <Phase1aFormDialog
        open={editTarget !== null}
        onOpenChange={(o) => { if (!o) setEditTarget(null); }}
        title={`Edit Siswa — ${editTarget?.user.name ?? ''}`}
        fields={EDIT_FIELDS}
        values={editForm}
        onChange={(name, value) => setEditForm((prev) => ({ ...prev, [name]: value }))}
        onSubmit={() => editMutation.mutate()}
        isSubmitting={editMutation.isPending}
        submitLabel="Simpan Perubahan"
        extra={
          <Phase1aSelectField
            id="fase1a-student-edit-gender"
            label="Jenis kelamin (opsional)"
            value={editForm.gender ?? ''}
            onChange={(v) => setEditForm((prev) => ({ ...prev, gender: v }))}
            options={GENDER_OPTIONS}
            placeholder="- Pilih -"
          />
        }
      />

      <ImportDialog
        entity="students"
        open={importOpen}
        onOpenChange={setImportOpen}
        invalidateKeys={['students']}
      />
    </div>
  );
}
