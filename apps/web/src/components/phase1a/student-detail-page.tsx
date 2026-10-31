"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, BadgePercent, ClipboardCheck, GraduationCap, Layers, MapPin, Pencil, Plus, School, Trash2, Users, Wallet } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { ReminderButtons } from '@/components/shared/reminder-buttons';
import { UserAvatar } from '@/components/shared/user-avatar';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { SessionCalendar } from '@/components/shared/session-calendar';
import { LearningReportButton } from '@/components/shared/learning-report-button';
import { scoreLabel100 } from '@/lib/score';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import type { StudentItem } from '@/lib/phase1a-types';
import { Phase1aFormDialog, Phase1aSelectField, type Phase1aField } from '@/components/phase1a/phase1a-form-dialog';
import {
  PLAN_LABEL,
  ENROLLMENT_STATUS_META,
  type StaffEnrollment,
} from '@/components/enrollments/finance-enrollments';

interface ActivityItem {
  kind: 'ABSENSI' | 'UJIAN' | 'LATSOL';
  at: string;
  title: string;
  detail: string | null;
  status: string;
  score: number | null;
  maxScore: number | null;
}

interface PlanInstallment {
  no: number;
  label: string;
  amount: number;
  sisa: number;
  dueDate: string | null;
  state: string;
}
interface PlanEnrollment {
  id: string;
  program: string;
  level: string;
  total: number;
  sisa: number;
  installments: PlanInstallment[];
}
interface PlanStudent {
  studentId: string;
  enrollments: PlanEnrollment[];
}
interface CatalogProgram {
  id: string;
  name: string;
  category: string;
  levels: { id: string; name: string }[];
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
  { name: 'email', label: 'Email (login — opsional)', type: 'email' },
  { name: 'phone', label: 'No. HP', placeholder: '08...' },
  { name: 'dateOfBirth', label: 'Tanggal lahir', type: 'date' },
  { name: 'address', label: 'Alamat', placeholder: 'Jl. ...' },
  { name: 'schoolOrigin', label: 'Asal sekolah', placeholder: 'SMPN 1 ...' },
  { name: 'gender', label: 'Jenis kelamin', options: [ { value: 'M', label: 'Laki-laki' }, { value: 'F', label: 'Perempuan' }, { value: 'OTHER', label: 'Lainnya' } ] },
  { name: 'isActive', label: 'Status akun', options: [ { value: 'true', label: 'Aktif' }, { value: 'false', label: 'Nonaktif' } ] },
];

function err(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}

function rp(value: string | number | null | undefined) {
  if (value === null || value === undefined) return '-';
  const n = Number(value);
  if (Number.isNaN(n)) return '-';
  return `Rp ${n.toLocaleString('id-ID')}`;
}

/** Halaman detail siswa — profil + kelompok + kalender sesi + log aktivitas. */
export function StudentDetailPage({ studentId, basePath, canManage }: { studentId: string; basePath: string; canManage: boolean }) {
  const canPrintReport =
    useAuthStore(
      (s) => s.user?.permissions.includes('analytics_student_performance.view'),
    ) ?? false;
  const router = useRouter();
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [discountTarget, setDiscountTarget] = useState<StaffEnrollment | null>(null);
  const [discountAmount, setDiscountAmount] = useState('');
  const [discountReason, setDiscountReason] = useState('');
  const [discountMonths, setDiscountMonths] = useState('');
  const [addProgramOpen, setAddProgramOpen] = useState(false);
  const [addForm, setAddForm] = useState({ programId: '', levelId: '', paymentPlan: 'MONTHLY', studentCount: '1', sessionCount: '1', paidInstallments: '0' });

  const studentQ = useQuery({
    queryKey: ['students', studentId],
    queryFn: () => apiFetch<StudentItem>(`/students/${studentId}`),
  });
  const s = studentQ.data;

  const activityQ = useQuery({
    queryKey: ['students', studentId, 'activity'],
    queryFn: () => apiFetch<ActivityItem[]>(`/students/${studentId}/activity`),
  });

  // Paket yang diambil siswa + rincian tagihannya — hanya untuk staff.
  const enrollmentsQ = useQuery({
    queryKey: ['students', studentId, 'enrollments'],
    queryFn: () =>
      apiFetch<StaffEnrollment[]>(`/enrollments?studentId=${studentId}`),
  });

  // Timeline angsuran per paket (endpoint sama seperti tampilan ortu) +
  // katalog program untuk dialog "Tambah Program".
  const planQ = useQuery({
    queryKey: ['students', studentId, 'payment-plan'],
    queryFn: () =>
      apiFetch<PlanStudent[]>(`/payment-plan/student/${studentId}`),
    enabled: canManage,
  });
  const programsQ = useQuery({
    queryKey: ['programs-catalog'],
    queryFn: () => apiFetch<CatalogProgram[]>('/programs/catalog'),
    enabled: canManage,
  });
  const addProgramSel = programsQ.data?.find((x) => x.id === addForm.programId);
  const addProgramIsReguler = addProgramSel?.category === 'REGULER';
  const addProgramIsPrivat = addProgramSel?.category === 'PRIVAT';
  const addProgramM = useMutation({
    mutationFn: () =>
      apiFetch(`/enrollments`, {
        method: 'POST',
        body: {
          studentId,
          programId: addForm.programId,
          levelId: addForm.levelId,
          paymentPlan: addProgramIsReguler ? addForm.paymentPlan : undefined,
          studentCount: addProgramIsPrivat ? Number(addForm.studentCount) : undefined,
          sessionCount: addProgramIsPrivat ? Number(addForm.sessionCount) : undefined,
          paidInstallments: Number(addForm.paidInstallments) || 0,
        },
      }),
    onSuccess: () => {
      toast.success('Program ditambahkan — jadwal angsuran sudah dibuat.');
      setAddProgramOpen(false);
      setAddForm({ programId: '', levelId: '', paymentPlan: 'MONTHLY', studentCount: '1', sessionCount: '1', paidInstallments: '0' });
      qc.invalidateQueries({ queryKey: ['students', studentId] });
      qc.invalidateQueries({ queryKey: ['enrollments'] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
    },
    onError: (e) => toast.error(err(e, 'Gagal menambahkan program.')),
  });

  // Diskon/bantuan/promo per siswa pada paket yang diambil — disebar ke
  // invoice pendaftaran yang belum lunas; paket/jenjang tidak berubah.
  const discountM = useMutation({
    mutationFn: () =>
      apiFetch<{ applied: number; invoices: string[] }>(
        `/enrollments/${discountTarget!.id}/discount`,
        {
          method: 'POST',
          body: {
            amount: Number(discountAmount),
            reason: discountReason,
            months: discountMonths ? Number(discountMonths) : null,
          },
        },
      ),
    onSuccess: (r) => {
      toast.success(`Diskon ${rp(r.applied)} diterapkan ke ${r.invoices.length} invoice.`);
      setDiscountTarget(null);
      setDiscountAmount('');
      setDiscountReason('');
      setDiscountMonths('');
      qc.invalidateQueries({ queryKey: ['students', studentId] });
      qc.invalidateQueries({ queryKey: ['enrollments'] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
    },
    onError: (e) => toast.error(err(e, 'Gagal menerapkan diskon.')),
  });

  const editM = useMutation({
    mutationFn: () =>
      apiFetch<StudentItem>(`/students/${studentId}`, {
        method: 'PATCH',
        body: {
          name: editForm.name || undefined,
          // '' → backend membuat placeholder dari no HP (hapus email login).
          email: editForm.email?.trim(),
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
      email: s.user.email?.endsWith('@hp.bimbel.local') ? '' : s.user.email,
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
        {canManage && s ? (
          <ReminderButtons targetType="students" targetId={s.id} />
        ) : null}
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
              {canPrintReport ? (
                <LearningReportButton
                  endpoint={`/analytics/student/${studentId}/learning-report/print`}
                />
              ) : null}
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
                        {a.score !== null ? scoreLabel100(a.score, a.maxScore) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      {s ? (
        <div className="flex flex-col gap-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Wallet className="size-5" /> Paket &amp; Rincian Harga
            {canManage ? (
              <Button
                size="sm"
                variant="outline"
                className="ml-auto gap-1"
                onClick={() => setAddProgramOpen(true)}
              >
                <Plus className="size-3.5" /> Tambah Program
              </Button>
            ) : null}
          </h2>
          {enrollmentsQ.isLoading ? <Skeleton className="h-20 w-full" /> : null}
          {(enrollmentsQ.data?.length ?? 0) === 0 && !enrollmentsQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Belum ada pendaftaran paket.</p>
          ) : null}
          <div className="grid gap-3 lg:grid-cols-2">
            {enrollmentsQ.data?.map((e) => {
              const invoices = e.invoices?.length ? e.invoices : e.invoice ? [e.invoice] : [];
              const statusMeta = ENROLLMENT_STATUS_META[e.status];
              return (
                <Card key={e.id}>
                  <CardContent className="flex flex-col gap-3 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {e.program.name} — {e.level.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {PLAN_LABEL[e.paymentPlan ?? ''] ?? 'Sesuai paket'}
                          {e.group ? ` · ${e.group.name}` : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Badge variant={statusMeta?.variant ?? 'outline'}>{statusMeta?.label ?? e.status}</Badge>
                        {canManage ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1"
                            onClick={() => {
                              setDiscountTarget(e);
                              setDiscountAmount('');
                              setDiscountReason('');
                              setDiscountMonths('');
                            }}
                          >
                            <BadgePercent className="size-3.5" /> Diskon
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      {invoices.map((inv) => {
                        const remaining = Number(inv.totalAmount) - Number(inv.amountPaid);
                        return (
                          <div key={inv.id} className="flex items-center justify-between gap-2 rounded border px-2.5 py-1.5 text-sm">
                            <span className="truncate text-muted-foreground">
                              {inv.number}
                              {('dueDate' in inv && inv.dueDate)
                                ? ` · ${new Date(String(inv.dueDate)).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}`
                                : ''}
                            </span>
                            <span className="shrink-0 tabular-nums">
                              {rp(inv.totalAmount)}
                              {Number(inv.amountPaid) > 0 ? (
                                <span className="ml-1.5 text-xs text-muted-foreground">
                                  (sisa {rp(remaining)})
                                </span>
                              ) : null}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    {(() => {
                      const plan = planQ.data?.[0]?.enrollments.find(
                        (x) => x.id === e.id,
                      );
                      if (!plan) return null;
                      const paidN = plan.installments.filter(
                        (i) => i.state === 'PAID',
                      ).length;
                      const dues = plan.installments
                        .map((i) => i.dueDate)
                        .filter(Boolean) as string[];
                      const fmtM = (d: string) =>
                        new Date(d).toLocaleDateString('id-ID', {
                          month: 'short',
                          year: 'numeric',
                        });
                      return (
                        <p className="text-xs text-muted-foreground">
                          {paidN >= plan.installments.length
                            ? `Lunas ${plan.installments.length} angsuran`
                            : `Angsuran ke-${paidN + 1} dari ${plan.installments.length}`}
                          {` · Terbayar ${rp(plan.total - plan.sisa)} · Sisa ${rp(plan.sisa)}`}
                          {dues.length
                            ? ` · Periode ${fmtM(dues[0])} – ${fmtM(dues[dues.length - 1])}`
                            : ''}
                        </p>
                      );
                    })()}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ) : null}

      <Dialog open={addProgramOpen} onOpenChange={setAddProgramOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tambah Program ke Siswa</DialogTitle>
            <DialogDescription>
              Daftarkan siswa ke program/jenjang baru — jadwal angsuran
              langsung dibuat. Isi &quot;lunas sampai angsuran ke-N&quot; bila
              siswa sudah membayar sebagian; sisanya jadi tagihan berjalan +
              rencana bulanan.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Phase1aSelectField
              id="ap-program"
              label="Program *"
              value={addForm.programId}
              onChange={(v) => setAddForm({ ...addForm, programId: v, levelId: '' })}
              options={(programsQ.data ?? []).map((x) => ({
                value: x.id,
                label: `${x.name} (${x.category})`,
              }))}
              placeholder="Pilih program"
            />
            <Phase1aSelectField
              id="ap-level"
              label="Jenjang *"
              value={addForm.levelId}
              onChange={(v) => setAddForm({ ...addForm, levelId: v })}
              options={(addProgramSel?.levels ?? []).map((l) => ({
                value: l.id,
                label: l.name,
              }))}
              placeholder="Pilih jenjang"
            />
            {addProgramIsReguler ? (
              <Phase1aSelectField
                id="ap-plan"
                label="Cara bayar"
                value={addForm.paymentPlan}
                onChange={(v) => setAddForm({ ...addForm, paymentPlan: v })}
                options={[
                  { value: 'FULL', label: 'Lunas di awal' },
                  { value: 'TWO_TIMES', label: '2× angsuran' },
                  { value: 'MONTHLY', label: 'Bulanan' },
                ]}
              />
            ) : null}
            {addProgramIsPrivat ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ap-students">Jumlah siswa privat</Label>
                  <Input
                    id="ap-students"
                    type="number"
                    min={1}
                    max={5}
                    value={addForm.studentCount}
                    onChange={(e) => setAddForm({ ...addForm, studentCount: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ap-sessions">Pertemuan di awal</Label>
                  <Input
                    id="ap-sessions"
                    type="number"
                    min={1}
                    max={48}
                    value={addForm.sessionCount}
                    onChange={(e) => setAddForm({ ...addForm, sessionCount: e.target.value })}
                  />
                </div>
              </div>
            ) : null}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ap-paid">Sudah lunas sampai angsuran ke-</Label>
              <Input
                id="ap-paid"
                type="number"
                min={0}
                value={addForm.paidInstallments}
                onChange={(e) => setAddForm({ ...addForm, paidInstallments: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                0 = belum bayar apa pun. N = angsuran 1 s.d. N ditandai lunas,
                angsuran berikutnya jadi tagihan berjalan.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddProgramOpen(false)}>
              Batal
            </Button>
            <Button
              disabled={!addForm.programId || !addForm.levelId || addProgramM.isPending}
              onClick={() => addProgramM.mutate()}
            >
              {addProgramM.isPending ? 'Menyimpan…' : 'Simpan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!discountTarget} onOpenChange={(o) => !o && setDiscountTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Diskon / Bantuan Paket</DialogTitle>
            <DialogDescription>
              {discountTarget
                ? `${discountTarget.program.name} — ${discountTarget.level.name} (${discountTarget.student.user.name}). Nominal dipotong dari SETIAP angsuran yang masih berjalan; paket & jenjang tetap sama.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="discount-amount">Diskon per angsuran (Rp)</Label>
              <Input
                id="discount-amount"
                type="number"
                min={0}
                placeholder="mis. 10000"
                value={discountAmount}
                onChange={(e) => setDiscountAmount(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Tiap invoice angsuran siswa ini dipotong sebesar nominal ini.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="discount-months">Berlaku untuk</Label>
              <select
                id="discount-months"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={discountMonths === '' ? 'all' : 'first'}
                onChange={(e) =>
                  setDiscountMonths(e.target.value === 'all' ? '' : '1')
                }
              >
                <option value="all">Semua angsuran sampai lunas</option>
                <option value="first">Hanya beberapa angsuran pertama</option>
              </select>
              {discountMonths !== '' ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    className="w-28"
                    value={discountMonths}
                    onChange={(e) => setDiscountMonths(e.target.value)}
                  />
                  <span className="text-xs text-muted-foreground">angsuran pertama</span>
                </div>
              ) : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="discount-reason">Alasan</Label>
              <Input
                id="discount-reason"
                placeholder="mis. Diskon saudara, bantuan, promo"
                value={discountReason}
                onChange={(e) => setDiscountReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiscountTarget(null)}>Batal</Button>
            <Button
              disabled={discountM.isPending || !(Number(discountAmount) > 0)}
              onClick={() => discountM.mutate()}
            >
              {discountM.isPending ? 'Menerapkan…' : 'Terapkan Diskon'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
