'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  CalendarClock,
  CircleAlert,
  MonitorCheck,
  Search,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { Phase1aSelectField } from '@/components/phase1a/phase1a-form-dialog';
import { apiFetch, ApiError } from '@/lib/api-client';
import type { ExamRow } from '@/lib/phase3c-types';
import { categoryLabel } from '@/lib/content-taxonomy';
import { useContentCategories } from '@/components/shared/content-drilldown';
import { ProctorUnlockPanel } from '@/components/phase3d/proctor-unlock-manager';

function err(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}

const th = 'px-3 py-2 text-left font-medium whitespace-nowrap';
const td = 'px-3 py-2 align-middle';

type LiveFilter = '' | 'RUNNING' | 'UPCOMING' | 'PAST' | 'ENDED';

const LIVE_FILTER_OPTIONS = [
  { value: 'RUNNING', label: 'Sedang berlangsung' },
  { value: 'UPCOMING', label: 'Terjadwal' },
  { value: 'PAST', label: 'Lewat jadwal' },
  { value: 'ENDED', label: 'Diakhiri (ENDED)' },
];

function liveState(e: ExamRow): Exclude<LiveFilter, ''> {
  if (e.status === 'ENDED') return 'ENDED';
  const now = Date.now();
  if (now < new Date(e.scheduledStartAt).getTime()) return 'UPCOMING';
  if (now > new Date(e.scheduledEndAt).getTime()) return 'PAST';
  return 'RUNNING';
}

const LIVE_BADGE: Record<Exclude<LiveFilter, ''>, { variant: 'default' | 'secondary' | 'outline' | 'destructive'; label: string }> = {
  RUNNING: { variant: 'default', label: 'Berlangsung' },
  UPCOMING: { variant: 'secondary', label: 'Terjadwal' },
  PAST: { variant: 'outline', label: 'Lewat Jadwal' },
  ENDED: { variant: 'outline', label: 'Berakhir' },
};

/**
 * Menu "Proctoring" — pusat pengawasan ujian, terpisah dari daftar ujian.
 * Tabel ujian (PUBLISHED/ENDED) dengan filter status & pencarian,
 * lalu panel attempt terkunci di bawahnya.
 */
export function ProctoringHubPage({ examBasePath }: { examBasePath: string }) {
  const router = useRouter();
  const catsQ = useContentCategories();
  const [search, setSearch] = useState('');
  const [liveFilter, setLiveFilter] = useState<LiveFilter>('RUNNING');

  const examsQ = useQuery({
    queryKey: ['exams'],
    queryFn: () => apiFetch<ExamRow[]>('/exams?all=1'),
    refetchInterval: 30000,
  });

  if (examsQ.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (examsQ.isError) {
    return (
      <EmptyState
        icon={CircleAlert}
        title="Gagal memuat ujian"
        description={err(examsQ.error, 'Daftar ujian tidak bisa dimuat.')}
      />
    );
  }

  const q = search.trim().toLowerCase();
  const rows = (examsQ.data ?? [])
    .filter((e) => e.status === 'PUBLISHED' || e.status === 'ENDED')
    .filter((e) => !liveFilter || liveState(e) === liveFilter)
    .filter(
      (e) =>
        !q ||
        e.title.toLowerCase().includes(q) ||
        e.level?.name.toLowerCase().includes(q) ||
        e.subject?.name.toLowerCase().includes(q),
    )
    .sort((a, b) => {
      const order: Record<string, number> = { RUNNING: 0, UPCOMING: 1, PAST: 2, ENDED: 3 };
      return (
        order[liveState(a)] - order[liveState(b)] ||
        new Date(a.scheduledEndAt).getTime() - new Date(b.scheduledEndAt).getTime()
      );
    });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Proctoring</h1>
        <p className="text-sm text-muted-foreground">
          Pusat pengawasan ujian — pilih ujian untuk melihat kelompok peserta dan
          status pengerjaan, atau buka attempt yang terkunci di bawah.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-56">
          <Phase1aSelectField
            id="proc-exam-status"
            label="Status Ujian"
            value={liveFilter}
            onChange={(v) => setLiveFilter(v as LiveFilter)}
            options={LIVE_FILTER_OPTIONS}
            placeholder="Semua ujian aktif"
          />
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Cari ujian / jenjang / mapel..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-sm text-muted-foreground">
            Tidak ada ujian yang cocok dengan filter.
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className={th}>Ujian</th>
                <th className={th}>Jenjang / Mapel / Tipe</th>
                <th className={th}>Jadwal</th>
                <th className={th}>Attempt</th>
                <th className={th}>Status</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((exam) => {
                const st = LIVE_BADGE[liveState(exam)];
                return (
                  <tr key={exam.id} className="border-b last:border-0">
                    <td className={`${td} font-medium`}>{exam.title}</td>
                    <td className={`${td} text-muted-foreground`}>
                      {[
                        exam.level?.name,
                        exam.subject?.name,
                        exam.category
                          ? categoryLabel(exam.category, catsQ.data)
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'Umum'}
                    </td>
                    <td className={`${td} whitespace-nowrap text-muted-foreground`}>
                      <span className="flex items-center gap-1.5">
                        <CalendarClock className="size-4 shrink-0" />
                        {new Date(exam.scheduledStartAt).toLocaleString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        {' — '}
                        {new Date(exam.scheduledEndAt).toLocaleString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </td>
                    <td className={`${td} whitespace-nowrap text-muted-foreground`}>
                      <span className="flex items-center gap-1.5">
                        <Users className="size-4 shrink-0" />
                        {exam._count.attempts}
                      </span>
                    </td>
                    <td className={`${td} whitespace-nowrap`}>
                      <Badge variant={st.variant}>{st.label}</Badge>
                    </td>
                    <td className={`${td} whitespace-nowrap text-right`}>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          router.push(`${examBasePath}/${exam.id}/proctoring`)
                        }
                      >
                        <MonitorCheck /> Pantau
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ProctorUnlockPanel />
    </div>
  );
}
