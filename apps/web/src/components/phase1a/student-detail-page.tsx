"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, BadgePercent, ClipboardCheck, RotateCcw, GraduationCap, Layers, Link2, MapPin, Pencil, Plus, School, Trash2, Users, Wallet } from 'lucide-react';
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
import { PhoneVerifyBadge } from '@/components/shared/phone-verify-badge';
import { CurrencyInput } from '@/components/shared/currency-input';
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
interface CatalogPackage {
  id: string;
  name: string;
  totalSessions: number;
  durationWeeks: number | null;
  price: string | number | null;
  isFeatured: boolean;
}
interface CatalogLevel {
  id: string;
  name: string;
  priceUnit: string | null;
  monthlyCount: number | null;
  packages: CatalogPackage[];
}
interface CatalogProgram {
  id: string;
  name: string;
  category: string;
  levels: CatalogLevel[];
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
  { name: 'isExternal', label: 'Asal daftar', options: [ { value: 'true', label: 'Daftar mandiri / orang luar' }, { value: 'false', label: 'Siswa GFS' } ] },
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
  const [addForm, setAddForm] = useState({ programId: '', levelId: '', packageId: '', paymentPlan: 'MONTHLY', studentCount: '1', sessionCount: '1', startDate: '', priceOverride: '', discountAmount: '', discountMonths: '', discountReason: '' });
  // Nominal terbayar per angsuran (mode migrasi) — index 0 = angsuran ke-1.
  const [addPaidRows, setAddPaidRows] = useState<string[]>([]);
  const [addMode, setAddMode] = useState<'baru' | 'migrasi'>('baru');
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkSearch, setLinkSearch] = useState('');
  const [linkUserId, setLinkUserId] = useState('');
  const [payTarget, setPayTarget] = useState<{ id: string; number: string; remaining: number; paid: number } | null>(null);
  const [payMode, setPayMode] = useState<'lunas' | 'sebagian' | 'total'>('lunas');
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState('');
  const [payNote, setPayNote] = useState('');
  const [removeTarget, setRemoveTarget] = useState<StaffEnrollment | null>(null);
  const [refundTarget, setRefundTarget] = useState<{ id: string; number: string; paid: number } | null>(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');

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
  const addLevelSel = addProgramSel?.levels.find((l) => l.id === addForm.levelId);
  const addPkgSel = addLevelSel?.packages.find((p) => p.id === addForm.packageId);
  const addProgramIsReguler = addProgramSel?.category === 'REGULER';
  const addProgramIsPrivat = addProgramSel?.category === 'PRIVAT';
  // Estimasi tagihan — paket = harga tetap dibagi cara bayar; tanpa paket
  // estimasi hanya ditampilkan bila harga paket terpilih (tarif jenjang
  // dihitung server-side dan bisa lebih kompleks).
  // Harga akhir efektif — override admin (kesepakatan) menang atas harga
  // paket standar.
  const addPkgStdPrice = addPkgSel?.price ? Number(addPkgSel.price) : 0;
  const addPkgPrice = addForm.priceOverride
    ? Number(addForm.priceOverride) || 0
    : addPkgStdPrice;
  const addDisc = Math.max(0, Number(addForm.discountAmount) || 0);
  const addInstCount =
    !addProgramIsReguler || addForm.paymentPlan === 'FULL'
      ? 1
      : addForm.paymentPlan === 'TWO_TIMES'
        ? 2
        : (addLevelSel?.monthlyCount ?? 10);
  const addDiscMonths =
    addDisc > 0
      ? addForm.discountMonths
        ? Math.min(Number(addForm.discountMonths), addInstCount)
        : addInstCount
      : 0;
  const addEstTotal = addPkgSel
    ? Math.max(0, addPkgPrice - addDisc * addDiscMonths)
    : null;
  const addEstPaid =
    addMode === 'migrasi'
      ? Math.min(
          addPaidRows.reduce((s, v) => s + (Number(v) || 0), 0),
          addEstTotal ?? Infinity,
        )
      : 0;
  // Label bulan per angsuran — dijangkar ke tanggal mulai (default bulan
  // ini) supaya admin mengisi nominal di bulan yang benar.
  const MONTHS_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const instMonthLabel = (i: number) => {
    const base = addForm.startDate
      ? new Date(`${addForm.startDate}T00:00:00`)
      : new Date();
    const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
    return `${MONTHS_ID[d.getMonth()]} ${d.getFullYear()}`;
  };
  // Perkiraan tagihan per angsuran (≈ — pembulatan akhir dihitung server).
  const instApprox = (i: number) =>
    Math.max(
      0,
      Math.round(addPkgPrice / Math.max(1, addInstCount)) -
        (i < addDiscMonths ? addDisc : 0),
    );
  const addProgramM = useMutation({
    mutationFn: () =>
      apiFetch(`/enrollments`, {
        method: 'POST',
        body: {
          studentId,
          programId: addForm.programId,
          levelId: addForm.levelId,
          packageId: addForm.packageId || undefined,
          paymentPlan: addProgramIsReguler ? addForm.paymentPlan : undefined,
          studentCount: addProgramIsPrivat ? Number(addForm.studentCount) : undefined,
          sessionCount: addProgramIsPrivat ? Number(addForm.sessionCount) : undefined,
          startDate: addForm.startDate || undefined,
          priceOverride:
            addPkgSel && addForm.priceOverride
              ? Number(addForm.priceOverride)
              : undefined,
          paidSchedule:
            addMode === 'migrasi' && addPaidRows.some((v) => Number(v) > 0)
              ? Array.from({ length: addInstCount }, (_, i) => Number(addPaidRows[i]) || 0)
              : undefined,
          discountAmount: addForm.discountAmount ? Number(addForm.discountAmount) : undefined,
          discountMonths: addForm.discountMonths ? Number(addForm.discountMonths) : undefined,
          discountReason: addForm.discountReason.trim() ? addForm.discountReason.trim() : undefined,
        },
      }),
    onSuccess: (created) => {
      const sum = (created as { paymentSummary?: string }).paymentSummary;
      toast.success(sum ? `Program ditambahkan — ${sum}.` : 'Program ditambahkan — jadwal angsuran sudah dibuat.');
      setAddProgramOpen(false);
      setAddMode('baru');
      setAddPaidRows([]);
      setAddForm({ programId: '', levelId: '', packageId: '', paymentPlan: 'MONTHLY', studentCount: '1', sessionCount: '1', startDate: '', priceOverride: '', discountAmount: '', discountMonths: '', discountReason: '' });
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
          // null → benar-benar dikosongkan; undefined berarti "jangan ubah".
          address: editForm.address || null,
          schoolOrigin: editForm.schoolOrigin || null,
          isActive:
            editForm.isActive === ''
              ? undefined
              : editForm.isActive === 'true'
                ? true
                : editForm.isActive === 'false'
                  ? false
                  : undefined,
          isExternal:
            editForm.isExternal === ''
              ? undefined
              : editForm.isExternal === 'true'
                ? true
                : editForm.isExternal === 'false'
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

  // "Catat Bayar" — pembayaran tunai/transfer yang SUDAH diterima (bisa
  // backdate lewat kolom tanggal) langsung terverifikasi ke invoice.
  // Tiga mode: 'lunas' = lunasi sisa, 'sebagian' = tambah pembayaran
  // sebesar nominal, 'total' = set total terbayar (sistem mencatat
  // selisihnya sebagai satu pembayaran).
  const payAmountNum = payMode === 'lunas'
    ? (payTarget?.remaining ?? 0)
    : Number(payAmount.replace(/\D/g, '')) - (payMode === 'total' ? (payTarget?.paid ?? 0) : 0);
  const payM = useMutation({
    mutationFn: () =>
      apiFetch('/payments/cash', {
        method: 'POST',
        body: {
          invoiceId: payTarget?.id,
          amount: payAmountNum,
          receivedAt: payDate || undefined,
          note: payNote.trim() || undefined,
        },
      }),
    onSuccess: () => {
      toast.success('Pembayaran tercatat & terverifikasi.');
      setPayTarget(null);
      qc.invalidateQueries({ queryKey: ['students'] });
    },
    onError: (e) => toast.error(err(e, 'Gagal mencatat pembayaran.')),
  });

  // Hapus satu program dari siswa — server menolak bila sudah diproses
  // atau ada tagihan yang sudah dibayar.
  const removeEnrollM = useMutation({
    mutationFn: () =>
      apiFetch(`/enrollments/${removeTarget?.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Program dihapus dari siswa.');
      setRemoveTarget(null);
      qc.invalidateQueries({ queryKey: ['students'] });
    },
    onError: (e) => toast.error(err(e, 'Gagal menghapus program.')),
  });

  // Refund pembayaran invoice — uang keluar tercatat di kas + invoice
  // terpotong otomatis. Prasyarat sebelum program bisa dihapus.
  const refundM = useMutation({
    mutationFn: () =>
      apiFetch(`/refunds`, {
        method: 'POST',
        body: {
          invoiceId: refundTarget?.id,
          amount: Number(refundAmount),
          reason: refundReason.trim(),
        },
      }),
    onSuccess: () => {
      toast.success('Refund tercatat — uang keluar masuk Transaksi Harian.');
      setRefundTarget(null);
      setRefundAmount('');
      setRefundReason('');
      qc.invalidateQueries({ queryKey: ['students', studentId] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['payment-plan'] });
    },
    onError: (e) => toast.error(err(e, 'Gagal mencatat refund.')),
  });

  // "Hubungkan Akun" — untuk siswa yang mendaftar sendiri padahal data
  // akademiknya dibuat admin/ortu (profil akun baru kosong → error
  // "tidak terhubung ke data siswa" di latsol/ujian).
  const linkCandidatesQ = useQuery({
    queryKey: ['student-account-candidates', linkSearch],
    queryFn: () =>
      apiFetch<
        { id: string; name: string; email: string; phone: string | null; student: { id: string } | null }[]
      >(`/student-account-candidates?search=${encodeURIComponent(linkSearch)}`),
    enabled: linkOpen && linkSearch.trim().length >= 2,
  });
  const linkM = useMutation({
    mutationFn: () =>
      apiFetch(`/students/${studentId}/link-account`, {
        method: 'POST',
        body: { userId: linkUserId },
      }),
    onSuccess: () => {
      toast.success('Akun login berhasil dihubungkan ke data siswa ini.');
      setLinkOpen(false);
      setLinkSearch('');
      setLinkUserId('');
      qc.invalidateQueries({ queryKey: ['students'] });
    },
    onError: (e) => toast.error(err(e, 'Gagal menghubungkan akun.')),
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
      isExternal: String(s.isExternal),
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
              <div className="mt-1">
                <PhoneVerifyBadge
                  userId={s.user.id}
                  phone={s.user.phone}
                  phoneVerifiedAt={s.user.phoneVerifiedAt}
                  invalidateKey={['students', studentId]}
                  canManage={canManage}
                />
              </div>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <School className="size-3.5 shrink-0" /> Asal sekolah: {s.schoolOrigin || '—'}
              </p>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="size-3.5 shrink-0" /> Alamat: {s.address || '—'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={s.isExternal ? 'warning' : 'secondary'} title={s.isExternal ? 'Mendaftar sendiri lewat halaman daftar siswa (orang luar)' : 'Dibuat lewat admin/orang tua'}>
                {s.isExternal ? 'Daftar sendiri' : 'Siswa GFS'}
              </Badge>
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
                  <Button variant="outline" size="sm" onClick={() => setLinkOpen(true)} title="Hubungkan data siswa ini ke akun login lain (misal akun yang dibuat sendiri oleh siswa)">
                    <Link2 className="size-3.5" /> Hubungkan Akun
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
                  <UserAvatar name={l.parent?.user?.name} avatarUrl={l.parent?.user?.avatarUrl} className="size-5" />
                  {l.parent?.user?.name}
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
                          <>
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
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1 text-destructive hover:text-destructive"
                              title="Hapus program dari siswa"
                              onClick={() => setRemoveTarget(e)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      {invoices.map((inv) => {
                        const remaining = Number(inv.totalAmount) - Number(inv.amountPaid);
                        const paid = Number(inv.amountPaid);
                        return (
                          <div key={inv.id} className="flex items-center justify-between gap-2 rounded border px-2.5 py-1.5 text-sm">
                            <span className="truncate text-muted-foreground">
                              {inv.number}
                              {('dueDate' in inv && inv.dueDate)
                                ? ` · ${new Date(String(inv.dueDate)).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}`
                                : ''}
                            </span>
                            <span className="flex shrink-0 items-center gap-1.5 tabular-nums">
                              <span>
                                {rp(inv.totalAmount)}
                                {paid > 0 ? (
                                  <span className="ml-1.5 text-xs text-muted-foreground">
                                    (terbayar {rp(paid)}
                                    {remaining > 0.009 ? ` · sisa ${rp(remaining)}` : ', lunas'})
                                  </span>
                                ) : null}
                              </span>
                              {canManage && remaining > 0.009 && inv.status === 'ISSUED' ? (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="h-6 px-2 text-[11px]"
                                  onClick={() => {
                                    setPayTarget({ id: inv.id, number: inv.number, remaining, paid });
                                    setPayMode('lunas');
                                    setPayAmount(String(Math.round(remaining)));
                                    setPayDate('');
                                    setPayNote('');
                                  }}
                                >
                                  Bayar
                                </Button>
                              ) : null}
                              {canManage && paid > 0.009 && inv.status === 'ISSUED' ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-2 text-[11px] text-warning-600"
                                  title="Kembalikan uang yang sudah dibayar — prasyarat hapus program"
                                  onClick={() => {
                                    setRefundTarget({ id: inv.id, number: inv.number, paid });
                                    setRefundAmount(String(Math.round(paid)));
                                    setRefundReason('');
                                  }}
                                >
                                  <RotateCcw className="size-3" /> Refund
                                </Button>
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
              {addMode === 'baru'
                ? 'Daftarkan siswa ke program/jenjang baru — tagihan mulai kosong dari angsuran pertama.'
                : 'Migrasi data lama: siswa ini sudah berjalan di program yang sama — sistem membuat jadwal lengkap, menandai N angsuran pertama lunas (dicatat sebagai pembayaran tunai + kwitansi + masuk kas), dan sisanya jadi tagihan berjalan.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-1 rounded-lg border p-1">
            {([
              { id: 'baru', label: 'Pendaftaran baru' },
              { id: 'migrasi', label: 'Data lama (migrasi)' },
            ] as const).map((m) => (
              <button
                key={m.id}
                type="button"
                className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${addMode === m.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                onClick={() => setAddMode(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-3">
            <Phase1aSelectField
              id="ap-program"
              label="Program *"
              value={addForm.programId}
              onChange={(v) => setAddForm({ ...addForm, programId: v, levelId: '', packageId: '' })}
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
              onChange={(v) => setAddForm({ ...addForm, levelId: v, packageId: '' })}
              options={(addProgramSel?.levels ?? []).map((l) => ({
                value: l.id,
                label: l.name,
              }))}
              placeholder="Pilih jenjang"
            />
            {(addLevelSel?.packages ?? []).length > 0 ? (
              <Phase1aSelectField
                id="ap-package"
                label="Paket (opsional — kosongkan = tarif jenjang)"
                value={addForm.packageId}
                onChange={(v) => {
                  const pkg = addLevelSel?.packages.find((p) => p.id === v);
                  setAddForm({
                    ...addForm,
                    packageId: v,
                    priceOverride: pkg?.price != null ? String(Number(pkg.price)) : '',
                  });
                }}
                options={(addLevelSel?.packages ?? []).map((p) => ({
                  value: p.id,
                  label: `${p.name}${p.price != null ? ` · ${rp(p.price)}` : ' · harga belum diisi'}`,
                }))}
                placeholder="Pilih paket harga"
              />
            ) : null}
            {addPkgSel ? (
              <div className="flex flex-col gap-1.5">
                <CurrencyInput
                  id="ap-price"
                  label="Harga akhir (bisa disesuaikan)"
                  value={addForm.priceOverride}
                  onChange={(v) => setAddForm({ ...addForm, priceOverride: v })}
                  placeholder="Harga kesepakatan"
                />
                <p className="text-xs text-muted-foreground">
                  Otomatis terisi harga paket standar ({rp(addPkgStdPrice)}) —
                  ubah bila ada kesepakatan/promo khusus untuk siswa ini.
                </p>
              </div>
            ) : null}
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
            <div className="flex flex-col gap-2 rounded-md border p-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ap-disc">Diskon per angsuran (opsional)</Label>
                <CurrencyInput
                  id="ap-disc"
                  value={addForm.discountAmount}
                  onChange={(v) => setAddForm({ ...addForm, discountAmount: v })}
                  placeholder="0 = tanpa diskon"
                />
              </div>
              {addForm.discountAmount && Number(addForm.discountAmount) > 0 ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="ap-discmonths">Berlaku N angsuran</Label>
                    <Input
                      id="ap-discmonths"
                      type="number"
                      min={1}
                      placeholder="Kosong = sampai lunas"
                      value={addForm.discountMonths}
                      onChange={(e) => setAddForm({ ...addForm, discountMonths: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="ap-discreason">Alasan</Label>
                    <Input
                      id="ap-discreason"
                      placeholder="cth: Beasiswa"
                      value={addForm.discountReason}
                      onChange={(e) => setAddForm({ ...addForm, discountReason: e.target.value })}
                    />
                  </div>
                </div>
              ) : null}
            </div>
            {addPkgSel ? (
              <div className="flex flex-col gap-0.5 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
                <span>
                  Paket <b>{addPkgSel.name}</b> — {rp(addPkgPrice)}
                  {addPkgSel.totalSessions ? ` · ${addPkgSel.totalSessions} sesi` : ''}
                </span>
                <span className="text-xs text-muted-foreground">
                  {addInstCount > 1
                    ? `${addInstCount} angsuran ≈ ${rp(Math.max(0, Math.round(addPkgPrice / addInstCount) - addDisc))}/angsuran`
                    : 'Ditagihkan sekaligus'}
                  {addDisc > 0 ? ` · diskon ${rp(addDisc)} × ${addDiscMonths} angsuran` : ''}
                  {' → '}Total tagihan <b>{rp(addEstTotal)}</b>
                  {addEstPaid > 0
                    ? ` · sudah dibayar ${rp(addEstPaid)} → sisa ${rp(Math.max(0, (addEstTotal ?? 0) - addEstPaid))}`
                    : ''}
                </span>
              </div>
            ) : null}
            {addMode === 'migrasi' ? (
              <div className="flex flex-col gap-3 rounded-md border border-dashed border-brand-gold-300 bg-brand-gold-50/50 p-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ap-start">Angsuran pertama mulai tanggal (wajib)</Label>
                  <Input
                    id="ap-start"
                    type="date"
                    max={new Date().toISOString().slice(0, 10)}
                    value={addForm.startDate}
                    onChange={(e) => setAddForm({ ...addForm, startDate: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Kapan siswa <b>benar-benar mulai membayar</b> — cth anak
                    yang bayar sejak Juli diisi tanggal Juli supaya cicilan
                    ke-5 jatuh di November dan kas masuk tercatat di bulan
                    yang benar.
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Yang sudah dibayar per bulan</Label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {Array.from({ length: addInstCount }, (_, i) => (
                      <div key={i} className="flex flex-col gap-1">
                        <Label htmlFor={`ap-row-${i}`} className="text-xs font-normal text-muted-foreground">
                          Angsuran {i + 1} — {instMonthLabel(i)}
                          {addPkgSel ? ` (tagihan ≈ ${rp(instApprox(i))})` : ''}
                        </Label>
                        <CurrencyInput
                          id={`ap-row-${i}`}
                          value={addPaidRows[i] ?? ''}
                          onChange={(v) =>
                            setAddPaidRows((rows) => {
                              const next = [...rows];
                              next[i] = v;
                              return next;
                            })
                          }
                          placeholder="0"
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Isi nominal yang dibayar di tiap bulannya — bulan yang
                    kosong berarti belum bayar dan tetap jadi tagihan. Setiap
                    bulan yang terisi dibuatkan payment terverifikasi +
                    kwitansi + masuk kas <b>di bulan itu juga</b>.
                  </p>
                  {addEstPaid > 0 ? (
                    <p className="text-xs font-medium">
                      Total terisi {rp(addEstPaid)}
                      {addEstTotal != null
                        ? ` dari ${rp(addEstTotal)} → sisa ${rp(Math.max(0, addEstTotal - addEstPaid))}`
                        : ''}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddProgramOpen(false)}>
              Batal
            </Button>
            <Button
              disabled={!addForm.programId || !addForm.levelId || (addMode === 'migrasi' && !addForm.startDate) || addProgramM.isPending}
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
                ? `${discountTarget.program.name} — ${discountTarget.level.name} (${discountTarget.student?.user?.name}). Nominal dipotong dari SETIAP angsuran yang masih berjalan; paket & jenjang tetap sama.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <CurrencyInput
                id="discount-amount"
                label="Diskon per angsuran"
                placeholder="mis. 10.000"
                value={discountAmount}
                onChange={setDiscountAmount}
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

      <Dialog open={!!payTarget} onOpenChange={(o) => !o && setPayTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Pembayaran</DialogTitle>
            <DialogDescription>
              {payTarget
                ? `Invoice ${payTarget.number} — terbayar ${rp(payTarget.paid)} · sisa ${rp(payTarget.remaining)}. Pembayaran dicatat langsung terverifikasi dan masuk ke kas.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Status pembayaran</Label>
              <div className="grid grid-cols-3 gap-1 rounded-lg border p-1">
                {([
                  { id: 'lunas', label: 'Lunas' },
                  { id: 'sebagian', label: 'Bayar sebagian' },
                  { id: 'total', label: 'Set total terbayar' },
                ] as const).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${payMode === m.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                    onClick={() => {
                      setPayMode(m.id);
                      if (m.id === 'total' && payTarget) {
                        setPayAmount(String(Math.round(payTarget.paid + payTarget.remaining)));
                      } else if (m.id === 'sebagian') {
                        setPayAmount('');
                      }
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            {payMode === 'lunas' ? (
              <p className="rounded-md bg-muted px-3 py-2 text-sm">
                Mencatat pelunasan <strong>{rp(payTarget?.remaining ?? 0)}</strong> — invoice
                ini langsung berstatus lunas.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                <CurrencyInput
                  id="pay-amount"
                  label={payMode === 'sebagian' ? 'Nominal dibayar sekarang' : 'Total yang sudah dibayar'}
                  placeholder={payMode === 'sebagian' ? 'mis. 250.000' : `lebih dari ${rp(payTarget?.paid ?? 0)}`}
                  value={payAmount}
                  onChange={setPayAmount}
                />
                <p className="text-xs text-muted-foreground">
                  {payMode === 'sebagian'
                    ? `Maks ${rp(payTarget?.remaining ?? 0)} — dicatat sebagai pembayaran tambahan.`
                    : `Sudah terbayar ${rp(payTarget?.paid ?? 0)} — sistem mencatat selisihnya (${rp(Math.max(0, payAmountNum))}) sebagai satu pembayaran.`}
                </p>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pay-date">Tanggal bayar (opsional)</Label>
              <Input
                id="pay-date"
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Kosongkan untuk tanggal hari ini — isi tanggal lama bila pembayaran sudah terjadi sebelumnya.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pay-note">Catatan (opsional)</Label>
              <Input
                id="pay-note"
                placeholder="mis. Transfer BCA 12 Jan, tunai di kantor"
                value={payNote}
                onChange={(e) => setPayNote(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayTarget(null)}>Batal</Button>
            <Button
              disabled={
                payM.isPending ||
                !payTarget ||
                payAmountNum <= 0 ||
                payAmountNum > payTarget.remaining + 0.009
              }
              onClick={() => payM.mutate()}
            >
              {payM.isPending ? 'Mencatat…' : `Catat ${rp(Math.max(0, payAmountNum))}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!refundTarget} onOpenChange={(o) => !o && setRefundTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refund Pembayaran</DialogTitle>
            <DialogDescription>
              {refundTarget
                ? `Invoice ${refundTarget.number} — sudah dibayar ${rp(refundTarget.paid)}. Refund mengurangi tagihan invoice & mencatat uang keluar di kas. Program baru bisa dihapus setelah semua tagihannya di-refund penuh.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <CurrencyInput
                id="refund-amount"
                label="Nominal refund"
                value={refundAmount}
                onChange={setRefundAmount}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">
                Terisi penuh = pembatalan total. Kurangi bila hanya sebagian
                yang dikembalikan.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="refund-reason">Alasan (wajib)</Label>
              <Input
                id="refund-reason"
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder="cth: siswa berhenti, salah input migrasi"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundTarget(null)}>Batal</Button>
            <Button
              disabled={
                refundM.isPending ||
                !refundTarget ||
                Number(refundAmount) <= 0 ||
                Number(refundAmount) - refundTarget.paid > 0.009 ||
                !refundReason.trim()
              }
              onClick={() => refundM.mutate()}
            >
              {refundM.isPending ? 'Mencatat…' : `Refund ${rp(Number(refundAmount) || 0)}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={linkOpen} onOpenChange={(o) => { setLinkOpen(o); if (!o) { setLinkSearch(''); setLinkUserId(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hubungkan Akun Login</DialogTitle>
            <DialogDescription>
              Pilih akun siswa yang akan memakai data {s?.user.name ?? 'siswa ini'} — misal akun
              yang dibuat sendiri oleh siswa lewat halaman daftar. Profil kosong milik
              akun itu dihapus; kalau profilnya sudah punya jejak data, penukaran ditolak.
              Akun lama ({s?.user.email}) tetap ada dan akan mendapat profil eksternal baru.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="link-search">Cari akun (nama / email / no. HP)</Label>
              <Input
                id="link-search"
                placeholder="Ketik minimal 2 huruf…"
                value={linkSearch}
                onChange={(e) => { setLinkSearch(e.target.value); setLinkUserId(''); }}
                autoFocus
              />
            </div>
            {linkCandidatesQ.isLoading ? <Skeleton className="h-20 w-full" /> : null}
            {linkSearch.trim().length >= 2 && linkCandidatesQ.data?.length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-3 text-center text-xs text-muted-foreground">
                Tidak ada akun siswa yang cocok.
              </p>
            ) : null}
            {(linkCandidatesQ.data?.length ?? 0) > 0 ? (
              <ul className="max-h-56 divide-y overflow-y-auto rounded-md border">
                {linkCandidatesQ.data!.map((u) => (
                  <li key={u.id}>
                    <label className={`flex cursor-pointer items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-muted/60 ${linkUserId === u.id ? 'bg-primary/5' : ''}`}>
                      <input
                        type="radio"
                        name="link-account"
                        className="size-4 accent-primary"
                        checked={linkUserId === u.id}
                        onChange={() => setLinkUserId(u.id)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{u.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {u.email}{u.phone ? ` · ${u.phone}` : ''}
                        </span>
                      </span>
                      {u.student ? (
                        <Badge variant="outline" className="shrink-0 text-[10px]">sudah punya profil</Badge>
                      ) : null}
                    </label>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLinkOpen(false)}>Batal</Button>
            <Button disabled={!linkUserId || linkM.isPending} onClick={() => linkM.mutate()}>
              {linkM.isPending ? 'Menghubungkan…' : 'Hubungkan'}
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
        excludeUserId={s?.user.id}
      />
      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(o) => !o && setRemoveTarget(null)}
        title={`Hapus program ${removeTarget?.program.name ?? ''} — ${removeTarget?.level.name ?? ''}?`}
        description="Pendaftaran dan seluruh tagihannya yang belum dibayar ikut dihapus dari siswa ini. Tagihan yang sudah dibayar harus di-refund penuh dulu — pakai tombol Refund di tiap invoice."
        confirmLabel="Ya, hapus program"
        pending={removeEnrollM.isPending}
        onConfirm={() => removeEnrollM.mutate()}
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
