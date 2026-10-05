"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiFetch, ApiError } from "@/lib/api-client";

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
  overallStats: OverallStats;
}

export function StudentPerformance() {
  const performanceQ = useQuery({
    queryKey: ['analytics-my-performance'],
    queryFn: () => apiFetch<StudentPerformanceData>('/analytics/my-performance'),
  });

  if (performanceQ.isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Memuat data performa...</div>
      </div>
    );
  }

  if (performanceQ.isError) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-destructive">{err(performanceQ.error, 'Gagal memuat data performa.')}</div>
      </div>
    );
  }

  const data = performanceQ.data;

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Belum ada data performa tersedia</div>
      </div>
    );
  }

  const getWeaknessColor = (level: string) => {
    switch (level) {
      case "STRONG": return "bg-success-600 text-white";
      case "AVERAGE": return "bg-warning-500 text-white";
      case "WEAK": return "bg-destructive text-white";
      default: return "bg-neutral-500 text-white";
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Performa Saya</h1>
        <p className="text-muted-foreground">Analisis performa akademik Anda</p>
      </div>

      {/* Overall Statistics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Ujian</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.overallStats.totalExams}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rata-rata Nilai</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.overallStats.avgPercentage.toFixed(1)}%</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Akurasi Overall</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.overallStats.overallAccuracy.toFixed(1)}%</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Best Exam</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.overallStats.bestExam ? data.overallStats.bestExam.percentage.toFixed(0) : 0}%
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Exam History */}
      <Card>
        <CardHeader>
          <CardTitle>Riwayat Ujian</CardTitle>
          <CardDescription>Tren nilai Anda dari waktu ke waktu</CardDescription>
        </CardHeader>
        <CardContent>
          {data.examHistory.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Belum ada riwayat ujian
            </div>
          ) : (
            <div className="space-y-4">
              {data.examHistory.map((exam) => (
                <div
                  key={exam.examId}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div>
                    <div className="font-medium">{exam.examTitle}</div>
                    <div className="text-sm text-muted-foreground">
                      {new Date(exam.examDate).toLocaleDateString("id-ID")}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold">{exam.percentage.toFixed(1)}%</div>
                    <div className="text-sm text-muted-foreground">
                      {exam.score} / {exam.maxScore}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Topic Analysis */}
      <Card>
        <CardHeader>
          <CardTitle>Analisis Topik</CardTitle>
          <CardDescription>Identifikasi topik kuat dan lemah berdasarkan tingkat kesulitan</CardDescription>
        </CardHeader>
        <CardContent>
          {data.topicAnalysis.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Belum ada data analisis topik
            </div>
          ) : (
            <div className="space-y-4">
              {data.topicAnalysis.map((topic) => (
                <div
                  key={topic.topicName}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex-1">
                    <div className="font-medium">{topic.topicName}</div>
                    <div className="text-sm text-muted-foreground">
                      {topic.totalQuestions} soal • {topic.correctCount} benar
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-2xl font-bold">{topic.accuracy.toFixed(1)}%</div>
                      <div className="text-sm text-muted-foreground">
                        Avg: {topic.avgScore.toFixed(1)}
                      </div>
                    </div>
                    <Badge className={getWeaknessColor(topic.weaknessLevel)}>
                      {topic.weaknessLevel}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
