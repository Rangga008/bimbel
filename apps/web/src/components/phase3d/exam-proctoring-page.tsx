'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft,
  CalendarClock,
  CircleAlert,
  FileQuestion,
  Lock,
  MonitorCheck,
  Search,
  ShieldAlert,
  Unlock,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { apiFetch, ApiError } from '@/lib/api-client';
import { ExamStatus } from '@/lib/phase3c-types';
import { useAuthStore } from '@/stores/auth-store';
import { categoryLabel, drillBackUrl, tingkatCode } from '@/lib/content-taxonomy';
import {
  useContentCategories,
  useContentLevels,
} from '@/components/shared/content-drilldown';
import { Phase1aSelectField } from '@/components/phase1a/phase1a-form-dialog';

function err(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}

interface OverviewAttempt {
  id: string;
  status: 'IN_PROGRESS' | 'SUBMITTED' | 'LOCKED';
  score: number;
  maxScore: number;
  violationCount: number;
  startedAt: string;
  submittedAt: string | null;
  lateByMs: number | null;
  lockedAt: string | null;
  lockedReason: string | null;
}

interface Participant {
  studentId: string;
  name: string;
  email: string;
  attempt: OverviewAttempt | null;
}

interface ProctoringOverview {
  exam: {
    id: string;
    title: string;
    status: ExamStatus;
    category: string | null;
    maxScore: number;
    durationMinutes: number | null;
    scheduledStartAt: string;
    scheduledEndAt: string;
    totalQuestions: number;
    program: { id: string; name: string } | null;
    level: { id: string; name: string } | null;
    subject: { id: string; name: string } | null;
  };
  stats: {
    totalAttempts: number;
    inProgress: number;
    submitted: number;
    locked: number;
    notStarted: number;
    violations: number;
  };
  groups: { id: string; name: string; members: Participant[] }[];
  ungrouped: Participant[];
}

const EXAM_STATUS_CFG = {
  DRAFT: { variant: 'secondary', label: 'Draft' },
  PUBLISHED: { variant: 'default', label: 'Dipublikasi' },
  LOCKED: { variant: 'destructive', label: 'Terkunci' },
  ENDED: { variant: 'outline', label: 'Berakhir' },
} as const;

function AttemptBadge({ attempt }: { attempt: OverviewAttempt | null }) {
  if (!attempt) return <Badge variant="secondary">Belum Mulai</Badge>;
  if (attempt.status === 'IN_PROGRESS')
    return <Badge variant="default">Mengerjakan</Badge>;
  if (attempt.status === 'SUBMITTED')
    return <Badge variant="outline">Terkumpul</Badge>;
  return <Badge variant="destructive">Terkunci</Badge>;
}

const th = 'px-3 py-2 text-left font-medium whitespace-nowrap';
const td = 'px-3 py-2 align-middle';

/** Satu baris peserta dalam tabel proctoring. */
function ParticipantRow({
  p,
  groupName,
  canUnlock,
  onUnlock,
}: {
  p: Participant;
  groupName: string;
  canUnlock: boolean;
  onUnlock: (p: Participant) => void;
}) {
  const a = p.attempt;
  return (
    <tr className="border-b last:border-0">
      <td className={td}>
        <div className="flex min-w-0 items-center gap-2">
          <UserRound className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{p.name}</div>
            <div className="truncate text-xs text-muted-foreground">{p.email}</div>
          </div>
        </div>
      </td>
      <td className={`${td} whitespace-nowrap text-muted-foreground`}>
        {groupName}
      </td>
      <td className={`${td} whitespace-nowrap`}>
        <AttemptBadge attempt={a} />
      </td>
      <td className={`${td} whitespace-nowrap`}>
        {a && a.violationCount > 0 ? (
          <Badge variant="destructive">
            <ShieldAlert className="size-3" /> {a.violationCount}
          </Badge>
        ) : (
          <span className="text-muted-foreground">0</span>
        )}
      </td>
      <td className={`${td} whitespace-nowrap text-xs text-muted-foreground`}>
        {a?.status === 'SUBMITTED' && (
          <span className="tabular-nums">
            {a.score}/{a.maxScore}
            {a.lateByMs ? ' · telat' : ''}
          </span>
        )}
        {a?.status === 'IN_PROGRESS' && (
          <span className="tabular-nums">
            mulai {new Date(a.startedAt).toLocaleTimeString('id-ID')}
          </span>
        )}
      </td>
      <td className={`${td} whitespace-nowrap text-right`}>
        {canUnlock && a?.status === 'LOCKED' && (
          <Button size="sm" variant="outline" onClick={() => onUnlock(p)}>
            <Unlock /> Unlock
          </Button>
        )}
      </td>
    </tr>
  );
}

/**
 * Halaman pengawasan ujian (proctoring) — dipisah dari manajemen ujian karena
 * fitur ini akan berkembang. Menampilkan kelompok peserta + status attempt
 * masing-masing siswa, auto-refresh 15 detik selama ujian berjalan.
 */
export function ExamProctoringPage({
  examId,
  basePath,
}: {
  examId: string;
  basePath: string;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const canUnlock =
    me?.permissions.includes('exam_proctor.unlock') ?? false;
  const catsQ = useContentCategories();

  const overviewQ = useQuery({
    queryKey: ['exam-proctoring-overview', examId],
    queryFn: () =>
      apiFetch<ProctoringOverview>(`/exams/${examId}/proctoring-overview`),
    // Monitoring live: refresh otomatis selama ujian masih PUBLISHED.
    refetchInterval: (q) =>
      q.state.data?.exam.status === 'PUBLISHED' ? 15000 : false,
  });

  const [unlockTarget, setUnlockTarget] = useState<Participant | null>(null);
  const [reason, setReason] = useState('');

  // Filter peserta — client-side, tidak mengubah data backend.
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [violOnly, setViolOnly] = useState(false);
  const levelsQ = useContentLevels();

  const unlockM = useMutation({
    mutationFn: () =>
      apiFetch(`/exam-attempts/${unlockTarget!.attempt!.id}/unlock`, {
        method: 'POST',
        body: { reason: reason.trim() },
      }),
    onSuccess: () => {
      toast.success('Attempt berhasil dibuka kembali.');
      qc.invalidateQueries({
        queryKey: ['exam-proctoring-overview', examId],
      });
      setUnlockTarget(null);
      setReason('');
    },
    onError: (e) => toast.error(err(e, 'Gagal membuka attempt.')),
  });

  if (overviewQ.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (overviewQ.isError || !overviewQ.data) {
    return (
      <EmptyState
        icon={CircleAlert}
        title="Gagal memuat proctoring"
        description={err(overviewQ.error, 'Data pengawasan ujian tidak bisa dimuat.')}
        action={
          <Button size="sm" variant="outline" onClick={() => router.push(basePath)}>
            <ArrowLeft /> Kembali
          </Button>
        }
      />
    );
  }

  const { exam, stats, groups, ungrouped } = overviewQ.data;
  const st = EXAM_STATUS_CFG[exam.status] ?? {
    variant: 'secondary' as const,
    label: exam.status,
  };

  // Kembali ke daftar ujian di posisi drill yang sama dengan ujian ini.
  const backUrl = drillBackUrl(basePath, {
    tingkat: tingkatCode(levelsQ.data?.find((l) => l.id === exam.level?.id)),
    levelId: exam.level?.id,
    subjectId: exam.subject?.id,
    category: exam.category ?? undefined,
  });

  const q = search.trim().toLowerCase();
  const matches = (p: Participant) => {
    if (q && !p.name.toLowerCase().includes(q) && !p.email.toLowerCase().includes(q))
      return false;
    if (statusFilter === 'NONE') {
      if (p.attempt) return false;
    } else if (statusFilter && p.attempt?.status !== statusFilter) {
      return false;
    }
    if (violOnly && !(p.attempt && p.attempt.violationCount > 0)) return false;
    return true;
  };
  // Ratakan peserta per kelompok ke satu daftar baris tabel.
  const allRows = [
    ...groups.flatMap((g) =>
      g.members.map((p) => ({ p, groupId: g.id, groupName: g.name })),
    ),
    ...ungrouped.map((p) => ({ p, groupId: '__ungrouped', groupName: 'Tanpa kelompok' })),
  ];
  const rows = allRows.filter(
    (r) => (!groupFilter || r.groupId === groupFilter) && matches(r.p),
  );
  const filtering = !!q || !!statusFilter || !!groupFilter || violOnly;
  const matchCount = rows.length;
  const resetFilters = () => {
    setSearch('');
    setStatusFilter('');
    setGroupFilter('');
    setViolOnly(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          <Button
            size="icon"
            variant="outline"
            onClick={() => router.push(backUrl)}
            aria-label="Kembali"
          >
            <ArrowLeft />
          </Button>
          <div className="space-y-1">
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
              {exam.title}
              <Badge variant={st.variant}>{st.label}</Badge>
            </h1>
            <p className="text-sm text-muted-foreground">
              Pengawasan ujian per kelompok
              {exam.category ? ` · ${categoryLabel(exam.category, catsQ.data)}` : ''}
              {exam.level ? ` · ${exam.level.name}` : ''}
              {exam.subject ? ` · ${exam.subject.name}` : ''}
            </p>
          </div>
        </div>
        {exam.status === 'PUBLISHED' && (
          <Badge variant="outline" className="self-center">
            <MonitorCheck className="size-3.5" /> Live — refresh tiap 15 dtk
          </Badge>
        )}
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-4 text-sm">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <CalendarClock className="size-4" />
            {new Date(exam.scheduledStartAt).toLocaleString('id-ID')} —{' '}
            {new Date(exam.scheduledEndAt).toLocaleString('id-ID')}
          </span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <FileQuestion className="size-4" /> {exam.totalQuestions} soal
          </span>
          {exam.durationMinutes != null && (
            <span className="text-muted-foreground">
              Durasi {exam.durationMinutes} menit
            </span>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: 'Total Attempt', value: stats.totalAttempts, icon: Users },
          { label: 'Mengerjakan', value: stats.inProgress, icon: MonitorCheck },
          { label: 'Terkumpul', value: stats.submitted, icon: FileQuestion },
          { label: 'Terkunci', value: stats.locked, icon: Lock },
          { label: 'Belum Mulai', value: stats.notStarted, icon: UserRound },
          { label: 'Pelanggaran', value: stats.violations, icon: ShieldAlert },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <s.icon className="size-3.5" /> {s.label}
              </div>
              <div className="mt-1 text-xl font-semibold tabular-nums">
                {s.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {(groups.length > 0 || ungrouped.length > 0) && (
        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 pt-4">
            <div className="w-full sm:w-48">
              <Phase1aSelectField
                id="proc-group"
                label="Kelompok"
                value={groupFilter}
                onChange={setGroupFilter}
                options={[
                  ...groups.map((g) => ({ value: g.id, label: g.name })),
                  ...(ungrouped.length > 0
                    ? [{ value: '__ungrouped', label: 'Tanpa kelompok' }]
                    : []),
                ]}
                placeholder="Semua kelompok"
              />
            </div>
            <div className="w-full sm:w-44">
              <Phase1aSelectField
                id="proc-status"
                label="Status"
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { value: 'NONE', label: 'Belum Mulai' },
                  { value: 'IN_PROGRESS', label: 'Mengerjakan' },
                  { value: 'SUBMITTED', label: 'Terkumpul' },
                  { value: 'LOCKED', label: 'Terkunci' },
                ]}
                placeholder="Semua status"
              />
            </div>
            <div className="relative w-full sm:w-56">
              <Label htmlFor="proc-search" className="sr-only">
                Cari peserta
              </Label>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="proc-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari nama / email siswa..."
                className="pl-9"
              />
            </div>
            <Button
              type="button"
              size="sm"
              variant={violOnly ? 'default' : 'outline'}
              onClick={() => setViolOnly((v) => !v)}
            >
              <ShieldAlert /> Pelanggaran saja
            </Button>
            {filtering && (
              <Button type="button" size="sm" variant="ghost" onClick={resetFilters}>
                <X /> Reset
              </Button>
            )}
            {filtering && (
              <span className="text-xs text-muted-foreground">
                {matchCount} peserta cocok
              </span>
            )}
          </CardContent>
        </Card>
      )}

      {groups.length === 0 && ungrouped.length === 0 && (
        <EmptyState
          icon={Users}
          title="Belum ada peserta"
          description="Belum ada kelompok/attempt untuk ujian ini. Peserta muncul setelah siswa memulai ujian atau kelompok sejenjang terdaftar."
        />
      )}

      {filtering && matchCount === 0 && (groups.length > 0 || ungrouped.length > 0) && (
        <EmptyState
          icon={Search}
          title="Tidak ada peserta yang cocok"
          description="Coba ubah kata kunci atau filter status."
          action={
            <Button size="sm" variant="outline" onClick={resetFilters}>
              Reset filter
            </Button>
          }
        />
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className={th}>Siswa</th>
                <th className={th}>Kelompok</th>
                <th className={th}>Status</th>
                <th className={th}>Pelanggaran</th>
                <th className={th}>Nilai / Mulai</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <ParticipantRow
                  key={`${r.groupId}-${r.p.studentId}`}
                  p={r.p}
                  groupName={r.groupName}
                  canUnlock={canUnlock}
                  onUnlock={setUnlockTarget}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={!!unlockTarget}
        onOpenChange={(open) => {
          if (!open) setUnlockTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unlock Attempt</DialogTitle>
            <DialogDescription>
              {unlockTarget &&
                `Buka kembali attempt ${unlockTarget.name} untuk ujian "${exam.title}".`}
            </DialogDescription>
          </DialogHeader>
          {unlockTarget?.attempt?.lockedReason && (
            <p className="text-xs text-muted-foreground">
              Alasan lock: {unlockTarget.attempt.lockedReason}
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pg-unlock-reason">Alasan unlock *</Label>
            <Textarea
              id="pg-unlock-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Contoh: Sudah diverifikasi bukan kecurangan, koneksi siswa putus."
              required
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnlockTarget(null)}>
              Batal
            </Button>
            <Button
              disabled={!reason.trim() || unlockM.isPending}
              onClick={() => unlockM.mutate()}
            >
              {unlockM.isPending ? 'Memproses...' : 'Unlock'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
