"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { apiFetch, ApiError } from "@/lib/api-client";
import { CategoryProgressChart, type CategoryProgressData } from "@/components/shared/category-progress-chart";
import { StudentPerformance } from "./student-performance";

function err(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}

interface ExamHistoryItem {
  examId: string;
  examTitle: string;
  examDate: string;
  score: number;
  maxScore: number;
  percentage: number;
}

interface TopicAnalysis {
  topicName: string;
  totalQuestions: number;
  correctCount: number;
  accuracy: number;
  avgScore: number;
  weaknessLevel: "STRONG" | "AVERAGE" | "WEAK";
}

interface OverallStats {
  totalExams: number;
  totalQuestionsAttempted: number;
  overallAccuracy: number;
  avgScore: number;
  avgPercentage: number;
  bestExam: ExamHistoryItem | null;
  worstExam: ExamHistoryItem | null;
}

interface StudentPerformanceData {
  studentId: string;
  studentName: string;
  examHistory: ExamHistoryItem[];
  topicAnalysis: TopicAnalysis[];
  categoryProgress?: CategoryProgressData;
  overallStats: OverallStats;
}

interface MonthlyReport {
  period: string;
  monthLabel: string;
  student: {
    id: string;
    name: string;
    school: string | null;
    groups: Array<{ name: string; levelName: string | null; programName: string }>;
  };
  attendance: {
    counts: Record<string, number>;
    total: number;
    presentPercent: number;
    sessions: Array<{
      date: string;
      subjectName: string | null;
      groupName: string;
      status: string;
    }>;
  };
  exams: Array<{
    title: string;
    subjectName: string | null;
    score: number;
    maxScore: number;
    percentage: number;
    date: string;
  }>;
  latsol: Array<{
    title: string;
    subjectName: string | null;
    score: number;
    maxScore: number;
    percentage: number;
    date: string;
  }>;
  pointsEarned: number;
}

interface ParentPerformanceProps {
  studentId: string;
}

function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const ATT_LABEL: Record<string, string> = {
  HADIR: "Hadir",
  TERLAMBAT: "Terlambat",
  IZIN: "Izin",
  SAKIT: "Sakit",
  ALFA: "Alfa",
};

/** Laporan bulanan anak — kehadiran + nilai ujian/latsol + poin (periode YYYY-MM). */
function MonthlyReportCard({ studentId }: { studentId: string }) {
  const [period, setPeriod] = useState(currentPeriod());
  const reportQ = useQuery({
    queryKey: ["analytics-child-monthly", studentId, period],
    queryFn: () =>
      apiFetch<MonthlyReport>(
        `/analytics/parent/child/${studentId}/monthly?period=${period}`,
      ),
    enabled: /^\d{4}-(0[1-9]|1[0-2])$/.test(period),
  });
  const r = reportQ.data;
  const att = r?.attendance.counts ?? {};

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Laporan Bulanan</CardTitle>
          <CardDescription>
            Rekap kehadiran, nilai ujian, latsol, dan poin per bulan — sama dengan
            yang dikirim admin lewat WhatsApp.
          </CardDescription>
        </div>
        <div className="w-40">
          <Input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            aria-label="Pilih bulan laporan"
          />
        </div>
      </CardHeader>
      <CardContent>
        {reportQ.isLoading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Memuat laporan {period}…
          </div>
        ) : !r ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Pilih bulan untuk melihat laporan.
          </div>
        ) : (
          <div className="space-y-5">
            <p className="text-sm font-medium">{r.monthLabel}</p>

            {/* Kehadiran */}
            <div>
              <h4 className="mb-2 text-sm font-medium">Kehadiran</h4>
              {r.attendance.total === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada sesi bulan ini.</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(ATT_LABEL).map(([k, label]) =>
                      (att[k] ?? 0) > 0 || k === "HADIR" ? (
                        <Badge
                          key={k}
                          variant={k === "HADIR" ? "default" : "outline"}
                        >
                          {label}: {att[k] ?? 0}
                        </Badge>
                      ) : null,
                    )}
                    <Badge variant="secondary">
                      Kehadiran {r.attendance.presentPercent}%
                    </Badge>
                  </div>
                  <div className="mt-3 overflow-x-auto rounded-md border">
                    <table className="w-full min-w-[420px] text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="px-3 py-2 text-left font-medium">Tanggal</th>
                          <th className="px-3 py-2 text-left font-medium">Mapel</th>
                          <th className="px-3 py-2 text-left font-medium">Kelompok</th>
                          <th className="px-3 py-2 text-left font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.attendance.sessions.map((s, i) => (
                          <tr key={i} className="border-b last:border-0">
                            <td className="px-3 py-1.5 tabular-nums">
                              {new Date(s.date).toLocaleDateString("id-ID")}
                            </td>
                            <td className="px-3 py-1.5">{s.subjectName ?? "-"}</td>
                            <td className="px-3 py-1.5">{s.groupName}</td>
                            <td className="px-3 py-1.5">
                              <Badge
                                variant={
                                  s.status === "HADIR" ? "default" : "outline"
                                }
                              >
                                {ATT_LABEL[s.status] ?? s.status}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            {/* Ujian */}
            <div>
              <h4 className="mb-2 text-sm font-medium">Ujian bulan ini</h4>
              {r.exams.length === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada ujian bulan ini.</p>
              ) : (
                <div className="space-y-2">
                  {r.exams.map((ex, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-lg border p-3 text-sm"
                    >
                      <div>
                        <p className="font-medium">{ex.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {ex.subjectName ?? "Umum"} ·{" "}
                          {new Date(ex.date).toLocaleDateString("id-ID")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold tabular-nums">{ex.percentage}%</p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {ex.score}/{ex.maxScore}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Latsol */}
            <div>
              <h4 className="mb-2 text-sm font-medium">Latsol bulan ini</h4>
              {r.latsol.length === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada latsol selesai bulan ini.</p>
              ) : (
                <div className="space-y-2">
                  {r.latsol.map((l, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-lg border p-3 text-sm"
                    >
                      <div>
                        <p className="font-medium">{l.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {l.subjectName ?? "Umum"} ·{" "}
                          {new Date(l.date).toLocaleDateString("id-ID")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold tabular-nums">{l.percentage}%</p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {l.score}/{l.maxScore}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <p className="text-sm text-muted-foreground">
              Poin prestasi bulan ini:{" "}
              <span className="font-semibold text-foreground tabular-nums">
                {r.pointsEarned}
              </span>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ParentPerformance({ studentId }: ParentPerformanceProps) {
  // Delegasi ke StudentPerformance — tampilan & tabel per-mapel/kesulitan
  // sama dengan halaman performa siswa, hanya endpoint-nya berbeda.
  return (
    <StudentPerformance
      endpoint={"/analytics/parent/child/" + studentId + "/performance"}
      subtitle="Analisis performa akademik anak Anda"
      showPoints={false}
    />
  );
}
