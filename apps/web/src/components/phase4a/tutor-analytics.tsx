'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChartLine, ChevronDown, ChevronRight, ClipboardList, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { ComboboxField } from '@/components/shared/combobox-field';
import { score100 } from '@/lib/score';
import { apiFetch } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type { GroupListItem } from '@/lib/phase1b-types';

interface ExamHistoryItem {
  examId: string;
  examTitle: string;
  examDate: string;
  score: number;
  maxScore: number;
  percentage: number;
}
interface TopicItem {
  topicName: string;
  totalQuestions: number;
  correctCount: number;
  accuracy: number;
  weaknessLevel: 'STRONG' | 'AVERAGE' | 'WEAK';
}
interface StudentPerf {
  studentId: string;
  studentName: string;
  examHistory: ExamHistoryItem[];
  topicAnalysis: TopicItem[];
  overallStats: {
    totalExams: number;
    avgPercentage: number;
    bestExam: ExamHistoryItem | null;
  };
}
interface TutorGroupAnalytics {
  groupId: string;
  studentCount: number;
  studentPerformances: StudentPerf[];
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

const LEVEL_BADGE: Record<TopicItem['weaknessLevel'], 'success' | 'warning' | 'destructive'> = {
  STRONG: 'success',
  AVERAGE: 'warning',
  WEAK: 'destructive',
};
const LEVEL_LABEL: Record<TopicItem['weaknessLevel'], string> = {
  STRONG: 'Kuat',
  AVERAGE: 'Cukup',
  WEAK: 'Lemah',
};

/**
 * Analisis performa siswa per kelompok — tutor memilih kelompok yang dia ampu,
 * lalu melihat rata-rata nilai & topik lemah tiap siswa.
 */
export function TutorAnalytics() {
  const [groupId, setGroupId] = useState('');
  const [openStudent, setOpenStudent] = useState<string | null>(null);
  const [view, setView] = useState<'students' | 'exams'>('students');

  const groupsQ = useQuery({
    queryKey: ['groups', 'tutor-analytics'],
    queryFn: () => apiFetch<GroupListItem[]>('/groups'),
  });
  const analyticsQ = useQuery({
    queryKey: ['tutor-group-analytics', groupId],
    queryFn: () => apiFetch<TutorGroupAnalytics>(`/analytics/tutor/group/${groupId}/analytics`),
    enabled: !!groupId,
  });
  const data = analyticsQ.data;
  const perfs = data?.studentPerformances ?? [];

  const groupAvg = perfs.length
    ? perfs.reduce((s, p) => s + p.overallStats.avgPercentage, 0) / perfs.length
    : null;
  const weakCount = perfs.filter(
    (p) => p.overallStats.totalExams > 0 && p.overallStats.avgPercentage < 60,
  ).length;

  // Daftar ujian unik yang pernah dikerjakan siswa kelompok ini — untuk mode
  // "per ujian" (klik → detail rekap nilai/jawaban/analisis soal).
  const exams = new Map<string, { title: string; latestDate: string; takers: number }>();
  for (const p of perfs) {
    for (const h of p.examHistory) {
      const cur = exams.get(h.examId);
      if (cur) {
        cur.takers += 1;
        if (h.examDate > cur.latestDate) cur.latestDate = h.examDate;
      } else {
        exams.set(h.examId, { title: h.examTitle, latestDate: h.examDate, takers: 1 });
      }
    }
  }
  const examList = [...exams.entries()]
    .map(([id, e]) => ({ id, ...e }))
    .sort((a, b) => (a.latestDate < b.latestDate ? 1 : -1));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analisis Siswa</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Performa siswa per kelompok yang Anda ampu.
          </p>
        </div>
        <div className="w-full sm:w-72">
          <ComboboxField
            id="tutor-analytics-group"
            value={groupId}
            onChange={setGroupId}
            options={(groupsQ.data ?? []).map((g) => ({ value: g.id, label: g.name }))}
            placeholder="— Pilih kelompok —"
          />
        </div>
      </div>

      {groupId ? (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={view === 'students' ? 'default' : 'outline'}
            onClick={() => setView('students')}
          >
            <Users className="size-4" /> Per Siswa
          </Button>
          <Button
            size="sm"
            variant={view === 'exams' ? 'default' : 'outline'}
            onClick={() => setView('exams')}
          >
            <ClipboardList className="size-4" /> Per Ujian
          </Button>
        </div>
      ) : null}

      {!groupId ? (
        <Card>
          <CardContent className="py-10">
            <EmptyState
              icon={Users}
              title="Pilih kelompok"
              description="Pilih kelompok untuk melihat analisis performa siswanya."
            />
          </CardContent>
        </Card>
      ) : analyticsQ.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : analyticsQ.isError ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-destructive">
            Gagal memuat analisis — Anda mungkin tidak mengampu kelompok ini.
          </CardContent>
        </Card>
      ) : data ? (
        <>
          {view === 'exams' ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ClipboardList className="size-4" /> Ujian yang Dikerjakan
                </CardTitle>
              </CardHeader>
              <CardContent>
                {examList.length === 0 ? (
                  <EmptyState
                    icon={ClipboardList}
                    title="Belum ada ujian"
                    description="Belum ada siswa kelompok ini yang mengerjakan ujian."
                  />
                ) : (
                  <div className="flex flex-col divide-y rounded-md border">
                    {examList.map((e) => (
                      <Link
                        key={e.id}
                        href={`/tutor/analisis/${e.id}?groupId=${groupId}`}
                        className="group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium group-hover:text-primary">
                            {e.title}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {e.takers} siswa mengerjakan · terakhir {fmtDate(e.latestDate)}
                          </p>
                        </div>
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

          {view === 'students' ? (
          <>
          {/* KPI ringkas kelompok */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Card>
              <CardContent className="pt-5">
                <p className="text-xs text-muted-foreground">Jumlah siswa</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{data.studentCount}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <p className="text-xs text-muted-foreground">Rata-rata nilai kelompok</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {groupAvg !== null ? `${groupAvg.toFixed(1)}%` : '—'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <p className="text-xs text-muted-foreground">Perlu perhatian (&lt;60%)</p>
                <p
                  className={cn(
                    'mt-1 text-2xl font-semibold tabular-nums',
                    weakCount > 0 && 'text-destructive',
                  )}
                >
                  {weakCount} siswa
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Tabel performa per siswa */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <ChartLine className="size-4" /> Performa per Siswa
              </CardTitle>
            </CardHeader>
            <CardContent>
              {perfs.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title="Belum ada siswa"
                  description="Kelompok ini belum punya anggota."
                />
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-3 py-2 text-left font-medium">Siswa</th>
                        <th className="px-3 py-2 text-center font-medium">Ujian</th>
                        <th className="px-3 py-2 text-center font-medium">Rata-rata</th>
                        <th className="px-3 py-2 text-left font-medium">Terbaik</th>
                        <th className="px-3 py-2 text-left font-medium">Topik lemah</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {perfs.map((p) => {
                        const weakTopics = p.topicAnalysis.filter((t) => t.weaknessLevel === 'WEAK');
                        const open = openStudent === p.studentId;
                        return (
                          <Fragment key={p.studentId}>
                            <tr className="border-b last:border-0">
                              <td className="px-3 py-2 font-medium whitespace-nowrap">
                                {p.studentName}
                              </td>
                              <td className="px-3 py-2 text-center tabular-nums">
                                {p.overallStats.totalExams}
                              </td>
                              <td className="px-3 py-2 text-center">
                                <Badge
                                  variant={
                                    p.overallStats.totalExams === 0
                                      ? 'outline'
                                      : p.overallStats.avgPercentage >= 75
                                        ? 'success'
                                        : p.overallStats.avgPercentage >= 50
                                          ? 'warning'
                                          : 'destructive'
                                  }
                                >
                                  {p.overallStats.totalExams
                                    ? `${p.overallStats.avgPercentage.toFixed(1)}%`
                                    : '—'}
                                </Badge>
                              </td>
                              <td className="px-3 py-2 text-xs text-muted-foreground">
                                {p.overallStats.bestExam
                                  ? `${p.overallStats.bestExam.examTitle} (${p.overallStats.bestExam.percentage.toFixed(0)}%)`
                                  : '—'}
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex max-w-64 flex-wrap gap-1">
                                  {weakTopics.slice(0, 3).map((t) => (
                                    <Badge key={t.topicName} variant="destructive" className="text-xs">
                                      {t.topicName} {t.accuracy.toFixed(0)}%
                                    </Badge>
                                  ))}
                                  {weakTopics.length === 0 ? (
                                    <span className="text-xs text-muted-foreground">—</span>
                                  ) : null}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-right">
                                <button
                                  type="button"
                                  onClick={() => setOpenStudent(open ? null : p.studentId)}
                                  className="rounded-md p-1 hover:bg-muted"
                                  aria-label="Detail"
                                >
                                  <ChevronDown
                                    className={cn('size-4 transition-transform', open && 'rotate-180')}
                                  />
                                </button>
                              </td>
                            </tr>
                            {open ? (
                              <tr className="border-b bg-muted/30">
                                <td colSpan={6} className="px-4 py-3">
                                  <div className="grid gap-4 md:grid-cols-2">
                                    <div>
                                      <p className="mb-1.5 text-xs font-medium">Riwayat ujian</p>
                                      {p.examHistory.length === 0 ? (
                                        <p className="text-xs text-muted-foreground">
                                          Belum mengerjakan ujian.
                                        </p>
                                      ) : (
                                        <ul className="flex flex-col gap-1">
                                          {p.examHistory.slice(0, 8).map((h) => (
                                            <li
                                              key={h.examId}
                                              className="flex items-center justify-between gap-3 text-xs"
                                            >
                                              <Link
                                                href={`/tutor/analisis/${h.examId}?groupId=${groupId}`}
                                                className="truncate hover:text-primary hover:underline"
                                              >
                                                {h.examTitle}
                                                <span className="ml-1 text-muted-foreground no-underline">
                                                  {fmtDate(h.examDate)}
                                                </span>
                                              </Link>
                                              <span className="shrink-0 font-medium tabular-nums">
                                                {score100(h.score, h.maxScore)}/100
                                              </span>
                                            </li>
                                          ))}
                                        </ul>
                                      )}
                                    </div>
                                    <div>
                                      <p className="mb-1.5 text-xs font-medium">Analisis topik</p>
                                      {p.topicAnalysis.length === 0 ? (
                                        <p className="text-xs text-muted-foreground">
                                          Belum ada data topik.
                                        </p>
                                      ) : (
                                        <ul className="flex flex-col gap-1">
                                          {p.topicAnalysis.slice(0, 8).map((t) => (
                                            <li
                                              key={t.topicName}
                                              className="flex items-center justify-between gap-3 text-xs"
                                            >
                                              <span className="truncate">{t.topicName}</span>
                                              <Badge variant={LEVEL_BADGE[t.weaknessLevel]}>
                                                {LEVEL_LABEL[t.weaknessLevel]} {t.accuracy.toFixed(0)}%
                                              </Badge>
                                            </li>
                                          ))}
                                        </ul>
                                      )}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
          </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
