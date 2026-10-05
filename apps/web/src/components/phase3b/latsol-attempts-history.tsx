"use client";
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, CircleAlert, History } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import type { LatsolAttemptItem, LatsolAttemptDetail } from '@/lib/phase3b-types';
import { EmptyState } from '@/components/shared/empty-state';
import { MathContent } from '@/components/shared/math-content';

/** Fase 3b — Riwayat attempt latsol untuk siswa. */
export function LatsolAttemptsHistory({ packageId }: { packageId?: string }) {
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null);

  const attemptsQ = useQuery({
    queryKey: ['latsol-attempts-mine', packageId],
    queryFn: () => {
      const p = new URLSearchParams();
      if (packageId) p.set('packageId', packageId);
      const qs = p.toString();
      return apiFetch<LatsolAttemptItem[]>(`/latsol/attempts/mine${qs ? `?${qs}` : ''}`);
    },
  });

  const detailQ = useQuery({
    queryKey: ['latsol-attempt-detail', selectedAttemptId],
    queryFn: () => apiFetch<LatsolAttemptDetail>(`/latsol/attempts/${selectedAttemptId}`),
    enabled: !!selectedAttemptId,
  });

  if (attemptsQ.isLoading) return <Skeleton className="h-24 w-full" />;
  if (attemptsQ.isError) {
    return (
      <EmptyState icon={CircleAlert} title="Gagal memuat riwayat" description="Riwayat attempt gagal dimuat. Coba muat ulang." />
    );
  }

  const attempts = attemptsQ.data || [];

  if (attempts.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="Belum ada riwayat"
        description="Riwayat latihan soal Anda akan muncul di sini setelah mengerjakan paket."
      />
    );
  }

  if (selectedAttemptId && detailQ.data) {
    const detail = detailQ.data;
    return (
      <div className="flex flex-col gap-4">
        <Button variant="outline" onClick={() => setSelectedAttemptId(null)}>
          <ArrowLeft /> Kembali ke Daftar
        </Button>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2">
              <span>Detail Attempt</span>
              <Badge variant={detail.status === 'SUBMITTED' ? 'default' : 'secondary'}>
                {detail.status}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center gap-4 text-sm">
              <p className="text-muted-foreground">Skor: {detail.score}/{detail.maxScore}</p>
              <p className="text-muted-foreground">
                Mulai: {new Date(detail.startedAt).toLocaleString('id-ID')}
              </p>
              {detail.submittedAt && (
                <p className="text-muted-foreground">
                  Selesai: {new Date(detail.submittedAt).toLocaleString('id-ID')}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-3">
              {detail.items.map((item, idx) => (
                <Card key={item.questionId} className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1">
                      <p className="font-medium text-sm">Soal {idx + 1}</p>
                      {!item.answered ? (
                        <p className="text-sm text-muted-foreground mt-1">
                          <MathContent text={item.question.content} />
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground mt-1">
                          <MathContent text={item.answer.question.content} />
                        </p>
                      )}
                    </div>
                    {item.answered ? (
                      <Badge
                        variant={
                          item.answer.isCorrect === null
                            ? 'secondary'
                            : item.answer.isCorrect
                            ? 'default'
                            : 'destructive'
                        }
                      >
                        {item.answer.isCorrect === null
                          ? 'Pending'
                          : item.answer.isCorrect
                          ? 'Benar'
                          : 'Salah'}
                      </Badge>
                    ) : (
                      <Badge variant="outline">Belum dijawab</Badge>
                    )}
                  </div>

                  {item.answered && (
                    <div className="flex flex-col gap-2 text-sm mt-3 p-3 bg-muted rounded">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Skor:</span>
                        <span className="font-medium">{item.answer.score}/{item.answer.maxScore}</span>
                      </div>

                      {item.answer.selectedOptionIds.length > 0 && (
                        <div>
                          <p className="text-muted-foreground mb-1">Jawaban Anda:</p>
                          <div className="flex flex-col gap-1">
                            {item.answer.question.options
                              .filter((opt) => item.answer.selectedOptionIds.includes(opt.id))
                              .map((opt) => (
                                <p key={opt.id} className="text-muted-foreground">
                                  • <MathContent text={opt.content} />
                                </p>
                              ))}
                          </div>
                        </div>
                      )}

                      {item.answer.textAnswer && (
                        <div>
                          <p className="text-muted-foreground mb-1">Jawaban Anda:</p>
                          <p className="text-muted-foreground">{item.answer.textAnswer}</p>
                        </div>
                      )}

                      {item.answer.question.explanation && (
                        <div>
                          <p className="text-muted-foreground mb-1">Pembahasan:</p>
                          <p className="text-muted-foreground">
                            <MathContent text={item.answer.question.explanation} />
                          </p>
                        </div>
                      )}

                      {item.answer.question.answerKey && (
                        <div>
                          <p className="text-muted-foreground mb-1">Kunci Jawaban:</p>
                          <p className="text-muted-foreground">{item.answer.question.answerKey}</p>
                        </div>
                      )}

                      {item.answer.question.correctOptionIds.length > 0 && (
                        <div>
                          <p className="text-muted-foreground mb-1">Jawaban Benar:</p>
                          <div className="flex flex-col gap-1">
                            {item.answer.question.options
                              .filter((opt) => item.answer.question.correctOptionIds.includes(opt.id))
                              .map((opt) => (
                                <p key={opt.id} className="text-muted-foreground">
                                  ✓ <MathContent text={opt.content} />
                                </p>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Riwayat Attempt</h2>
      {attempts.map((attempt) => (
        <Card key={attempt.id}>
          <CardContent className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="font-medium text-sm">{attempt.package.title}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(attempt.startedAt).toLocaleString('id-ID')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{attempt.score}/{attempt.maxScore}</Badge>
              <Badge variant={attempt.status === 'SUBMITTED' ? 'default' : 'secondary'}>
                {attempt.status}
              </Badge>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSelectedAttemptId(attempt.id)}
              >
                Lihat Detail
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

