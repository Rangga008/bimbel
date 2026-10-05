"use client";
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ComboboxField } from '@/components/shared/combobox-field';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { UserAvatar } from '@/components/shared/user-avatar';
import { apiFetch, ApiError } from '@/lib/api-client';
import type { ApiUserBrief } from '@/lib/phase1a-types';
import type { GroupDetail } from '@/lib/phase1b-types';

function err(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}
export function GroupDetailBody({ groupId, canManage, onChanged }: { groupId: string; canManage: boolean; onChanged: () => void }) {
  const qc = useQueryClient();
  const [studentId, setStudentId] = useState('');
  const [tutorId, setTutorId] = useState('');
  const [delTarget, setDelTarget] = useState<{ kind: string; id: string; label: string } | null>(null);
  const detailQ = useQuery({
    queryKey: ['groups', groupId],
    queryFn: () => apiFetch<GroupDetail>(`/groups/${groupId}`),
  });
  const studentsQ = useQuery({
    queryKey: ['students'],
    queryFn: () => apiFetch<Array<{ id: string; user: ApiUserBrief }>>('/students'),
    enabled: canManage,
  });
  const tutorsQ = useQuery({
    queryKey: ['tutors'],
    queryFn: () => apiFetch<Array<{ id: string; user: ApiUserBrief }>>('/tutors'),
    enabled: canManage,
  });
  const addS = useMutation({
    mutationFn: () => apiFetch(`/groups/${groupId}/students`, { method: 'POST', body: { studentId } }),
    onSuccess: () => {
      toast.success('Siswa ditambahkan.');
      setStudentId('');
      qc.invalidateQueries({ queryKey: ['groups', groupId] });
      onChanged();
    },
    onError: (e) => toast.error(err(e, 'Gagal menambahkan siswa.')),
  });
  const addT = useMutation({
    mutationFn: () => apiFetch(`/groups/${groupId}/tutors`, { method: 'POST', body: { tutorId } }),
    onSuccess: () => {
      toast.success('Tutor ditugaskan.');
      setTutorId('');
      qc.invalidateQueries({ queryKey: ['groups', groupId] });
      onChanged();
    },
    onError: (e) => toast.error(err(e, 'Gagal menugaskan tutor.')),
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
  const studentOptions = (studentsQ.data ?? [])
    .filter((s) => !memberIds.has(s.id))
    .map((s) => ({ value: s.id, label: s.user.name, imageUrl: s.user.avatarUrl }));
  const tutorOptions = (tutorsQ.data ?? [])
    .filter((t) => !tutorIds.has(t.id))
    .map((t) => ({ value: t.id, label: t.user.name, imageUrl: t.user.avatarUrl }));
  return (
    <div className="flex flex-col gap-4">
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
          <div className="mt-2 flex gap-2">
            <div className="flex-1">
              <ComboboxField
                id="grp-add-student"
                value={studentId}
                onChange={setStudentId}
                options={studentOptions}
                placeholder="- Pilih siswa -"
                emptyText="Semua siswa sudah jadi anggota."
              />
            </div>
            <Button disabled={!studentId || addS.isPending} onClick={() => addS.mutate()}>Tambah</Button>
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
          <div className="mt-2 flex gap-2">
            <div className="flex-1">
              <ComboboxField
                id="grp-add-tutor"
                value={tutorId}
                onChange={setTutorId}
                options={tutorOptions}
                placeholder="- Pilih tutor -"
                emptyText="Semua tutor sudah ditugaskan."
              />
            </div>
            <Button disabled={!tutorId || addT.isPending} onClick={() => addT.mutate()}>Tugaskan</Button>
          </div>
        ) : null}
      </div>
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

