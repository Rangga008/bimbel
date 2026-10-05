"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, ClipboardCheck, GraduationCap, Layers, MapPin, Pencil, School, Trash2, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { UserAvatar } from '@/components/shared/user-avatar';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { SessionCalendar } from '@/components/shared/session-calendar';
import { apiFetch, ApiError } from '@/lib/api-client';
import type { StudentItem } from '@/lib/phase1a-types';
import { Phase1aFormDialog, Phase1aSelectField, type Phase1aField } from '@/components/phase1a/phase1a-form-dialog';

interface ActivityItem {
  kind: 'ABSENSI' | 'UJIAN' | 'LATSOL';
  at: string;
  title: string;
  detail: string | null;
  status: string;
  score: number | null;
  maxScore: number | null;
}

const ACTIVITY_BADGE: Record<ActivityItem['kind'], 'secondary' | 'warning' | 'outline'> = {
  ABSENSI: 'secondary',
  UJIAN: 'warning',
  LATSOL: 'outline',
};

const GENDER_OPTIONS = [
  { value: 'M', label: 'Laki-laki' },
  { value: 'F', label: 'Perempuan' },
  { value: 'OTHER', label: 'Lainnya' },
];

const EDIT_FIELDS: Phase1aField[] = [
  { name: 'name', label: 'Nama lengkap', required: true },
  { name: 'email', label: 'Email (login)', type: 'email', required: true },
  { name: 'phone', label: 'No. HP', placeholder: '08...' },
  { name: 'dateOfBirth', label: 'Tanggal lahir', type: 'date' },
  { name: 'address', label: 'Alamat', placeholder: 'Jl. ...' },
  { name: 'schoolOrigin', label: 'Asal sekolah', placeholder: 'SMPN 1 ...' },
  { name: 'isActive', label: 'Aktif? (true/false)', placeholder: 'true' },
];

function err(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}

/** Halaman detail siswa — profil + kelompok + kalender sesi + log aktivitas. */
export function StudentDetailPage({ studentId, basePath, canManage }: { studentId: string; basePath: string; canManage: boolean }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [deleteOpen, setDeleteOpen] = useState(false);

  const studentQ = useQuery({
    queryKey: ['students', studentId],
    queryFn: () => apiFetch<StudentItem>(`/students/${studentId}`),
  });
  const s = studentQ.data;

  const activityQ = useQuery({
    queryKey: ['students', studentId, 'activity'],
    queryFn: () => apiFetch<ActivityItem[]>(`/students/${studentId}/activity`),
  });

  const editM = useMutation({
    mutationFn: () =>
      apiFetch<StudentItem>(`/students/${studentId}`, {
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
      setEditOpen(false);
      qc.invalidateQueries({ queryKey: ['students'] });
    },
    onError: (e) => toast.error(err(e, 'Gagal memperbarui siswa.')),
  });

  const deleteM = useMutation({
    mutationFn: () => apiFetch(`/students/${studentId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Siswa dihapus permanen.');
      router.push(`${basePath}/siswa`);
    },
    onError: (e) => {
      setDeleteOpen(false);
      toast.error(err(e, 'Gagal menghapus siswa.'));
    },
  });

  function openEdit() {
    if (!s) return;
    setEditForm({
      name: s.user.name,
      email: s.user.email,
      phone: s.user.phone ?? '',
      dateOfBirth: s.dateOfBirth ? String(s.dateOfBirth).slice(0, 10) : '',
      gender: s.gender ?? '',
      address: s.address ?? '',
      schoolOrigin: s.schoolOrigin ?? '',
      isActive: String(s.isActive),
    });
    setEditOpen(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <Link href={`${basePath}/siswa`} aria-label="Kembali ke daftar siswa">
          <Button variant="outline" size="icon"><ArrowLeft className="size-4" /></Button>
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{s ? s.user.name : 'Detail Siswa'}</h1>
          <p className="truncate text-sm text-muted-foreground">{s?.user.email ?? 'Memuat...'}</p>
        </div>
      </div>

      {studentQ.isLoading ? <Skeleton className="h-40 w-full" /> : null}
      {studentQ.isError ? (
        <EmptyState
          icon={Users}
          title="Siswa tidak ditemukan"
          description="Data siswa tidak ada atau Anda tidak memiliki akses."
          action={<Link href={`${basePath}/siswa`}><Button size="sm" variant="outline">Kembali</Button></Link>}
        />
      ) : null}

      {s ? (
        <Card>
          <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
            <UserAvatar name={s.user.name} avatarUrl={s.user.avatarUrl} className="size-16 text-lg" />
            <div className="min-w-0 flex-1">
              <p className="text-lg font-semibold">{s.user.name}</p>
              <p className="truncate text-sm text-muted-foreground">{s.user.email}{s.user.phone ? ` · ${s.user.phone}` : ''}</p>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <School className="size-3.5 shrink-0" /> Asal sekolah: {s.schoolOrigin || '—'}
              </p>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="size-3.5 shrink-0" /> Alamat: {s.address || '—'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={s.isActive ? 'secondary' : 'outline'}>{s.isActive ? 'Aktif' : 'Nonaktif'}</Badge>
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

      {s ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Orang Tua ({s.parentStudents.length})</h2>
          {s.parentStudents.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum terhubung ke orang tua.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {s.parentStudents.map((l) => (
                <Badge key={l.parent.id} variant="secondary" className="gap-1.5 py-1.5">
                  <UserAvatar name={l.parent.user.name} avatarUrl={l.parent.user.avatarUrl} className="size-5" />
                  {l.parent.user.name}
                </Badge>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {s ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Kelompok ({s.groupMembers?.length ?? 0})</h2>
          {(s.groupMembers?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">Siswa ini belum masuk kelompok manapun.</p>
          ) : null}
          <div className="grid gap-3 md:grid-cols-2">
            {s.groupMembers?.map((m) => (
              <Card key={m.groupId}>
                <CardContent className="flex items-center gap-3 py-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-blue-50 text-primary">
                    <Users className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{m.group.name}</p>
                    <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                      <GraduationCap className="size-3.5 shrink-0" /> {m.group.program.name}
                      {m.group.program.subject ? `(${m.group.program.subject.code})` : null}
                      {m.group.level ? <span className="flex items-center gap-1"><Layers className="size-3.5 shrink-0" />{m.group.level.name}</span> : null}
                    </p>
                  </div>
                  <Badge variant={m.group.isActive ? 'secondary' : 'outline'}>{m.group.isActive ? 'Aktif' : 'Nonaktif'}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : null}

      {s ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Jadwal Sesi</h2>
          {(s.groupMembers?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada sesi — siswa belum masuk kelompok.</p>
          ) : (
            <SessionCalendar endpoint={`/sessions?studentId=${studentId}`} />
          )}
        </div>
      ) : null}

      {s ? (
        <div className="flex flex-col gap-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <ClipboardCheck className="size-5" /> Log Aktivitas
          </h2>
          {activityQ.isLoading ? <Skeleton className="h-24 w-full" /> : null}
          {(activityQ.data?.length ?? 0) === 0 && !activityQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Belum ada aktivitas tercatat.</p>
          ) : null}
          {(activityQ.data?.length ?? 0) > 0 ? (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Tanggal</th>
                    <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Jenis</th>
                    <th className="px-3 py-2 text-left font-medium">Aktivitas</th>
                    <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Status</th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Skor</th>
                  </tr>
                </thead>
                <tbody>
                  {activityQ.data?.map((a, i) => (
                    <tr key={`${a.kind}-${i}`} className="border-b last:border-0">
                      <td className="px-3 py-2 align-top whitespace-nowrap text-muted-foreground">
                        {new Date(a.at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-3 py-2 align-top whitespace-nowrap">
                        <Badge variant={ACTIVITY_BADGE[a.kind]}>{a.kind}</Badge>
                      </td>
                      <td className="px-3 py-2 align-top">
                        {a.title}
                        {a.detail ? <p className="text-xs text-muted-foreground">{a.detail}</p> : null}
                      </td>
                      <td className="px-3 py-2 align-top whitespace-nowrap text-muted-foreground">{a.status}</td>
                      <td className="px-3 py-2 align-top text-right tabular-nums whitespace-nowrap">
                        {a.score !== null ? `${a.score}/${a.maxScore ?? '—'}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      <Phase1aFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title={`Edit Siswa — ${s?.user.name ?? ''}`}
        fields={EDIT_FIELDS}
        values={editForm}
        onChange={(name, value) => setEditForm((prev) => ({ ...prev, [name]: value }))}
        onSubmit={() => editM.mutate()}
        isSubmitting={editM.isPending}
        submitLabel="Simpan Perubahan"
        extra={
          <Phase1aSelectField
            id="detail-student-edit-gender"
            label="Jenis kelamin (opsional)"
            value={editForm.gender ?? ''}
            onChange={(v) => setEditForm((prev) => ({ ...prev, gender: v }))}
            options={GENDER_OPTIONS}
            placeholder="- Pilih -"
          />
        }
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Hapus siswa permanen?"
        description={`${s?.user.name ?? 'Siswa ini'} beserta akun loginnya akan dihapus. Hanya bisa kalau belum ada absensi/invoice/pendaftaran/ujian — kalau ada, sistem akan menolak dan sarankan nonaktifkan.`}
        confirmLabel="Ya, hapus permanen"
        pending={deleteM.isPending}
        onConfirm={() => deleteM.mutate()}
      />
    </div>
  );
}
