"use client";
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, DoorOpen, GraduationCap, Layers, Package, Pencil, Trash2, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { apiFetch, ApiError } from '@/lib/api-client';
import { GroupDetailBody } from '@/components/phase1b/group-detail-body';
import { GroupEditDialog } from '@/components/phase1b/group-edit-dialog';
import { GroupReminders } from '@/components/feedback/group-reminders';
import { FeedbackMatrix } from '@/components/feedback/feedback-matrix';
import type { GroupDetail } from '@/lib/phase1b-types';

/** Halaman detail kelompok — kelola anggota siswa & tutor (sinkron dengan jadwal, sesi, dan absensi). */
export function GroupDetailPage({ groupId, basePath, canManage }: { groupId: string; basePath: string; canManage: boolean }) {
  const qc = useQueryClient();
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleteM = useMutation({
    mutationFn: () => apiFetch(`/groups/${groupId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Kelompok dihapus.');
      qc.invalidateQueries({ queryKey: ['groups'] });
      qc.invalidateQueries({ queryKey: ['sessions'] });
      router.push(`${basePath}/kelompok`);
    },
    onError: (e) => {
      setDeleteOpen(false);
      toast.error(e instanceof ApiError ? e.message : 'Gagal menghapus kelompok.');
    },
  });
  const detailQ = useQuery({
    queryKey: ['groups', groupId],
    queryFn: () => apiFetch<GroupDetail>(`/groups/${groupId}`),
  });
  const d = detailQ.data;
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['groups'] });
    qc.invalidateQueries({ queryKey: ['sessions'] });
    qc.invalidateQueries({ queryKey: ['session-calendar'] });
    qc.invalidateQueries({ queryKey: ['attendance'] });
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Link href={`${basePath}/kelompok`} aria-label="Kembali ke daftar kelompok">
            <Button variant="outline" size="icon"><ArrowLeft className="size-4" /></Button>
          </Link>
          <div className="min-w-0">
            {d ? (
              <>
                <h1 className="truncate text-2xl font-semibold tracking-tight">{d.name}</h1>
                <p className="flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                  <GraduationCap className="size-3.5 shrink-0" /> {d.program.name}
                  {d.level ? <span className="flex items-center gap-1"><Layers className="size-3.5 shrink-0" />{d.level.name}</span> : null}
                </p>
              </>
            ) : (
              <h1 className="text-2xl font-semibold tracking-tight">Detail Kelompok</h1>
            )}
          </div>
        </div>
        {d ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={d.isActive ? 'secondary' : 'outline'}>{d.isActive ? 'Aktif' : 'Nonaktif'}</Badge>

            {d.capacity ? <Badge variant="outline" className="tabular-nums"><DoorOpen />Kapasitas {d.capacity}</Badge> : null}
            {canManage ? (
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil /> Edit Kelompok
              </Button>
            ) : null}
            {canManage ? (
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 /> Hapus
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {detailQ.isLoading ? <Skeleton className="h-40 w-full" /> : null}
      {detailQ.isError ? (
        <EmptyState icon={Users} title="Kelompok tidak ditemukan" description="Kelompok ini tidak ada atau Anda tidak memiliki akses."
          action={<Link href={`${basePath}/kelompok`}><Button size="sm" variant="outline">Kembali</Button></Link>} />
      ) : null}
      {/* Reminder di atas — tombol WA ortu (bayar/jadwal/performa/feedback). */}
      {d ? <GroupReminders groupId={groupId} /> : null}
      {d ? (
        <Card>
          <CardContent className="py-4">
            <GroupDetailBody groupId={groupId} canManage={canManage} onChanged={invalidate} />
          </CardContent>
        </Card>
      ) : null}
      {d ? <FeedbackMatrix groupId={groupId} /> : null}
      {d && editOpen ? (
        <GroupEditDialog
          group={d}
          open={editOpen}
          onOpenChange={setEditOpen}
          onSaved={invalidate}
        />
      ) : null}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Hapus kelompok "${d?.name ?? ''}"?`}
        description="Anggota siswa & tutor, jadwal mingguan, dan seluruh sesi kelompok ikut terhapus. Kelompok yang sudah memiliki catatan absensi tidak bisa dihapus — nonaktifkan saja."
        confirmLabel="Ya, hapus"
        pending={deleteM.isPending}
        onConfirm={() => deleteM.mutate()}
      />
    </div>
  );
}
