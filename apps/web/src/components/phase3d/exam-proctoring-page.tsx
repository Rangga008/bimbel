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
  ShieldAlert,
  Unlock,
  UserRound,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
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
import { categoryLabel } from '@/lib/content-taxonomy';
import { useContentCategories } from '@/components/shared/content-drilldown';

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

function ParticipantRow({
  p,
  canUnlock,
  onUnlock,
}: {
  p: Participant;
  canUnlock: boolean;
  onUnlock: (p: Participant) => void;
}) {
  const a = p.attempt;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <UserRound className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{p.name}</div>
          <div className="truncate text-xs text-muted-foreground">{p.email}</div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <AttemptBadge attempt={a} />
        {a && a.violationCount > 0 && (
          <Badge variant="destructive">
            <ShieldAlert className="size-3" /> {a.violationCount} pelanggaran
          </Badge>
        )}
        {a?.status === 'SUBMITTED' && (
          <span className="tabular-nums text-muted-foreground">
            {a.score}/{a.maxScore}
            {a.lateByMs ? ' · telat' : ''}
          </span>
        )}
        {a?.status === 'IN_PROGRESS' && (
          <span className="tabular-nums text-muted-foreground">
            mulai {new Date(a.startedAt).toLocaleTimeString('id-ID')}
          </span>
        )}
        {canUnlock && a?.status === 'LOCKED' && (
          <Button size="sm" variant="outline" onClick={() => onUnlock(p)}>
            <Unlock /> Unlock
          </Button>
        )}
      </div>
    </div>
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          <Button
            size="icon"
            variant="outline"
            onClick={() => router.push(basePath)}
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

      {groups.length === 0 && ungrouped.length === 0 && (
        <EmptyState
          icon={Users}
          title="Belum ada peserta"
          description="Belum ada kelompok/attempt untuk ujian ini. Peserta muncul setelah siswa memulai ujian atau kelompok sejenjang terdaftar."
        />
      )}

      {groups.map((g) => (
        <Card key={g.id}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              <span className="flex items-center gap-2">
                <Users className="size-4 text-muted-foreground" /> {g.name}
              </span>
              <Badge variant="outline">{g.members.length} siswa</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {g.members.map((p) => (
              <ParticipantRow
                key={p.studentId}
                p={p}
                canUnlock={canUnlock}
                onUnlock={setUnlockTarget}
              />
            ))}
            {g.members.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Kelompok ini belum punya anggota.
              </p>
            )}
          </CardContent>
        </Card>
      ))}

      {ungrouped.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              <span className="flex items-center gap-2">
                <UserRound className="size-4 text-muted-foreground" /> Peserta
                tanpa kelompok
              </span>
              <Badge variant="outline">{ungrouped.length} siswa</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {ungrouped.map((p) => (
              <ParticipantRow
                key={p.studentId}
                p={p}
                canUnlock={canUnlock}
                onUnlock={setUnlockTarget}
              />
            ))}
          </CardContent>
        </Card>
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
