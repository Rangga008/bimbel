"use client";
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { UserPlus, UserRoundPlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { UserAvatar } from '@/components/shared/user-avatar';
import { apiFetch, ApiError } from '@/lib/api-client';
import type { GroupDetail } from '@/lib/phase1b-types';
import { AddGroupStudentsDialog, AddGroupTutorDialog } from './group-member-picker';

function err(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}
export function GroupDetailBody({ groupId, canManage, onChanged }: { groupId: string; canManage: boolean; onChanged: () => void }) {
  const qc = useQueryClient();
  const [studentPickOpen, setStudentPickOpen] = useState(false);
  const [tutorPickOpen, setTutorPickOpen] = useState(false);
  const [delTarget, setDelTarget] = useState<{ kind: string; id: string; label: string } | null>(null);
  const detailQ = useQuery({
    queryKey: ['groups', groupId],
    queryFn: () => apiFetch<GroupDetail>(`/groups/${groupId}`),
  });
  const joinCodeM = useMutation({
    mutationFn: () =>
      apiFetch<GroupDetail>(`/groups/${groupId}/join-code`, { method: 'POST' }),
    onSuccess: (g) => {
      toast.success(`Kode gabung baru: ${g.joinCode}`);
      qc.invalidateQueries({ queryKey: ['groups', groupId] });
      onChanged();
    },
    onError: (e) => toast.error(err(e, 'Gagal membuat kode gabung.')),
  });
  const delM = useMutation({
    mutationFn: ({ kind, id }: { kind: string; id: string }) =>
      apiFetch(`/groups/${groupId}/${kind}/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Dihapus dari kelompok.');
      setDelTarget(null);
      qc.invalidateQueries({ queryKey: ['groups', groupId] });
      onChanged();
    },
    onError: (e) => toast.error(err(e, 'Gagal menghapus.')),
  });
  if (detailQ.isLoading) return <Skeleton className="h-24 w-full" />;
  if (detailQ.isError || !detailQ.data) return <p className="text-sm text-destructive">Gagal memuat detail.</p>;
  const d = detailQ.data;
  const memberIds = new Set(d.members.map((m) => m.studentId));
  const tutorIds = new Set(d.tutors.map((t) => t.tutorId));
  return (
    <div className="flex flex-col gap-4">
      {canManage ? (
        <div className="flex flex-col gap-1.5 rounded-md border border-dashed p-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Kode Gabung Kelompok</h3>
            <Button
              size="sm"
              variant="outline"
              disabled={joinCodeM.isPending}
              onClick={() => joinCodeM.mutate()}
            >
              {d.joinCode ? 'Buat Ulang' : 'Buat Kode'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Siswa dari luar bimbel bisa mendaftar sendiri di halaman Daftar Siswa
            dengan kode ini — langsung jadi anggota kelompok dan bisa mengerjakan
            ujiannya (mis. try out/promosi). Kode lama langsung tidak berlaku
            setelah dibuat ulang.
          </p>
          {d.joinCode ? (
            <button
              type="button"
              title="Klik untuk menyalin"
              onClick={() => {
                void navigator.clipboard?.writeText(d.joinCode!);
                toast.success('Kode disalin.');
              }}
              className="w-fit rounded-md bg-muted px-3 py-1.5 font-mono text-lg font-bold tracking-[0.3em]"
            >
              {d.joinCode}
            </button>
          ) : (
            <p className="text-xs text-muted-foreground">Belum ada kode.</p>
          )}
        </div>
      ) : null}
      <div>
        <h3 className="text-sm font-semibold">Siswa ({d.members.length})</h3>
        <div className="mt-2 flex flex-col gap-1.5">
          {d.members.map((m) => (
            <div key={m.studentId} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
              <span className="flex min-w-0 items-center gap-2.5 truncate">
                <UserAvatar name={m.student.user.name} avatarUrl={m.student.user.avatarUrl} className="size-7" />
                <span className="truncate">{m.student.user.name}</span>
              </span>
              {canManage ? (
                <Button variant="ghost" size="sm" onClick={() => setDelTarget({ kind: 'students', id: m.studentId, label: m.student.user.name })}>Keluarkan</Button>
              ) : null}
            </div>
          ))}
          {d.members.length === 0 ? <p className="text-xs text-muted-foreground">Belum ada siswa.</p> : null}
        </div>
        {canManage ? (
          <div className="mt-2">
            <Button variant="outline" size="sm" onClick={() => setStudentPickOpen(true)}>
              <UserPlus /> Tambah Siswa
            </Button>
          </div>
        ) : null}
      </div>
      <div>
        <h3 className="text-sm font-semibold">Tutor ({d.tutors.length}) - bisa lebih dari satu</h3>
        <div className="mt-2 flex flex-col gap-1.5">
          {d.tutors.map((t) => (
            <div key={t.tutorId} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
              <span className="flex min-w-0 items-center gap-2.5 truncate">
                <UserAvatar name={t.tutor.user.name} avatarUrl={t.tutor.user.avatarUrl} className="size-7" />
                <span className="truncate">{t.tutor.user.name}{t.isLead ? <Badge variant="secondary" className="ml-2">Lead</Badge> : null}</span>
              </span>
              {canManage ? (
                <Button variant="ghost" size="sm" onClick={() => setDelTarget({ kind: 'tutors', id: t.tutorId, label: t.tutor.user.name })}>Lepas</Button>
              ) : null}
            </div>
          ))}
          {d.tutors.length === 0 ? <p className="text-xs text-muted-foreground">Belum ada tutor.</p> : null}
        </div>
        {canManage ? (
          <div className="mt-2">
            <Button variant="outline" size="sm" onClick={() => setTutorPickOpen(true)}>
              <UserRoundPlus /> Tugaskan Tutor
            </Button>
          </div>
        ) : null}
      </div>
      <AddGroupStudentsDialog
        open={studentPickOpen}
        onOpenChange={setStudentPickOpen}
        groupId={groupId}
        excludeIds={memberIds}
        onAdded={onChanged}
      />
      <AddGroupTutorDialog
        open={tutorPickOpen}
        onOpenChange={setTutorPickOpen}
        groupId={groupId}
        excludeIds={tutorIds}
        onAdded={onChanged}
      />
      <ConfirmDialog
        open={delTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDelTarget(null);
        }}
        title={delTarget?.kind === 'students' ? 'Keluarkan siswa dari kelompok?' : 'Lepas tutor dari kelompok?'}
        description={`"${delTarget?.label ?? ''}" akan dihapus dari kelompok ini.`}
        confirmLabel={delTarget?.kind === 'students' ? 'Ya, keluarkan' : 'Ya, lepas'}
        pending={delM.isPending}
        onConfirm={() => {
          if (delTarget) delM.mutate({ kind: delTarget.kind, id: delTarget.id });
        }}
      />
    </div>
  );
}

