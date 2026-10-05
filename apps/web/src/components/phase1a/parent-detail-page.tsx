"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, GraduationCap, Layers, Pencil, Trash2, UserPlus, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { UserAvatar } from '@/components/shared/user-avatar';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { apiFetch, ApiError } from '@/lib/api-client';
import type { ApiUserBrief } from '@/lib/phase1a-types';
import { Phase1aFormDialog, type Phase1aField } from '@/components/phase1a/phase1a-form-dialog';

interface ParentDetail {
  id: string;
  isActive: boolean;
  user: ApiUserBrief;
  parentStudents: Array<{
    student: {
      id: string;
      user: ApiUserBrief;
      groupMembers?: Array<{
        group: {
          id: string;
          name: string;
          isActive: boolean;
          program?: { name: string; subject?: { code: string } | null } | null;
          level?: { name: string } | null;
        };
      }>;
    };
  }>;
}

const EDIT_FIELDS: Phase1aField[] = [
  { name: 'name', label: 'Nama lengkap', required: true },
  { name: 'email', label: 'Email (login)', type: 'email', required: true },
  { name: 'phone', label: 'No. HP/WhatsApp', placeholder: '08...' },
  { name: 'isActive', label: 'Aktif? (true/false)', placeholder: 'true' },
];

function err(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}

/** Halaman detail orang tua — profil + anak & kelompok anak + edit/hapus. */
export function ParentDetailPage({ parentId, basePath, canManage = false }: { parentId: string; basePath: string; canManage?: boolean }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [deleteOpen, setDeleteOpen] = useState(false);

  const parentQ = useQuery({
    queryKey: ['parents', parentId],
    queryFn: () => apiFetch<ParentDetail>(`/parents/${parentId}`),
  });
  const p = parentQ.data;

  const editM = useMutation({
    mutationFn: () =>
      apiFetch<ParentDetail>(`/parents/${parentId}`, {
        method: 'PATCH',
        body: {
          name: editForm.name || undefined,
          email: editForm.email || undefined,
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
      setEditOpen(false);
      qc.invalidateQueries({ queryKey: ['parents'] });
    },
    onError: (e) => toast.error(err(e, 'Gagal memperbarui orang tua.')),
  });

  const deleteM = useMutation({
    mutationFn: () => apiFetch(`/parents/${parentId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Orang tua dihapus permanen.');
      router.push(`${basePath}/orang-tua`);
    },
    onError: (e) => {
      setDeleteOpen(false);
      toast.error(err(e, 'Gagal menghapus orang tua.'));
    },
  });

  function openEdit() {
    if (!p) return;
    setEditForm({
      name: p.user.name,
      email: p.user.email,
      phone: p.user.phone ?? '',
      isActive: String(p.isActive),
    });
    setEditOpen(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <Link href={`${basePath}/orang-tua`} aria-label="Kembali ke daftar orang tua">
          <Button variant="outline" size="icon"><ArrowLeft className="size-4" /></Button>
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{p ? p.user.name : 'Detail Orang Tua'}</h1>
          <p className="truncate text-sm text-muted-foreground">{p?.user.email ?? 'Memuat...'}</p>
        </div>
      </div>
      {parentQ.isLoading ? <Skeleton className="h-40 w-full" /> : null}
      {parentQ.isError ? (
        <EmptyState
          icon={UserPlus}
          title="Orang tua tidak ditemukan"
          description="Data orang tua tidak ada atau Anda tidak memiliki akses."
          action={<Link href={`${basePath}/orang-tua`}><Button size="sm" variant="outline">Kembali</Button></Link>}
        />
      ) : null}
      {p ? (
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <UserAvatar name={p.user.name} avatarUrl={p.user.avatarUrl} className="size-16 text-lg" />
            <div className="min-w-0 flex-1">
              <p className="text-lg font-semibold">{p.user.name}</p>
              <p className="truncate text-sm text-muted-foreground">{p.user.email}{p.user.phone ? ` · ${p.user.phone}` : ''}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={p.isActive ? 'secondary' : 'outline'}>{p.isActive ? 'Aktif' : 'Nonaktif'}</Badge>
              {canManage ? (
                <>
                  <Button variant="outline" size="sm" onClick={openEdit}>
                    <Pencil className="size-3.5" /> Edit
                  </Button>
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteOpen(true)}>
                    <Trash2 className="size-3.5" /> Hapus
                  </Button>
                </>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}
      {p ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Anak ({p.parentStudents.length})</h2>
          {p.parentStudents.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum terhubung ke anak manapun.</p>
          ) : null}
          {p.parentStudents.map((l) => (
            <Card key={l.student.id}>
              <CardContent className="flex flex-col gap-2 py-3">
                <div className="flex items-center gap-2.5">
                  <UserAvatar name={l.student.user.name} avatarUrl={l.student.user.avatarUrl} className="size-9" />
                  <p className="font-medium">{l.student.user.name}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(l.student.groupMembers ?? []).map((gm) => (
                    <Badge key={gm.group.id} variant="outline" className="gap-1">
                      <GraduationCap className="size-3" />
                      {gm.group.name}
                      {gm.group.level ? <span className="flex items-center gap-0.5"><Layers className="size-3" />{gm.group.level.name}</span> : null}
                    </Badge>
                  ))}
                  {(l.student.groupMembers ?? []).length === 0 ? (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground"><Users className="size-3" /> Belum masuk kelompok.</span>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      <Phase1aFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title={`Edit Orang Tua — ${p?.user.name ?? ''}`}
        fields={EDIT_FIELDS}
        values={editForm}
        onChange={(name, value) => setEditForm((prev) => ({ ...prev, [name]: value }))}
        onSubmit={() => editM.mutate()}
        isSubmitting={editM.isPending}
        submitLabel="Simpan Perubahan"
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Hapus orang tua permanen?"
        description={`${p?.user.name ?? 'Orang tua ini'} beserta akun loginnya akan dihapus. Hanya bisa kalau tidak terhubung ke anak & tanpa riwayat pendaftaran.`}
        confirmLabel="Ya, hapus permanen"
        pending={deleteM.isPending}
        onConfirm={() => deleteM.mutate()}
      />
    </div>
  );
}
