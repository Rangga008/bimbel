"use client";
import { ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { score100 } from '@/lib/score';
import { resolveAssetUrl } from '@/lib/api-client';
import { MathContent } from '@/components/shared/math-content';
import type { LatsolAttemptDetail, LatsolOption, LatsolQuestionPlay } from '@/lib/phase3b-types';

type RevealQ = LatsolQuestionPlay & {
  explanation?: string | null;
  explanationImageUrl?: string | null;
  answerKey?: string | null;
  correctOptionIds?: string[];
};

/** Tandai "Salah" per-pernyataan BSK disimpan di textAnswer sebagai JSON {s:[ids]}. */
function sMarksOf(textAnswer?: string | null): string[] {
  try {
    return JSON.parse(textAnswer || '{}').s ?? [];
  } catch {
    return [];
  }
}

function StatusBadge({ correct, answered }: { correct: boolean | null | undefined; answered: boolean }) {
  if (!answered) return <Badge variant="secondary">Tidak dijawab</Badge>;
  if (correct === true) return <Badge>Benar</Badge>;
  if (correct === false) return <Badge variant="destructive">Salah</Badge>;
  return <Badge variant="secondary">Menunggu penilaian</Badge>;
}

function OptionReview({
  opt,
  selected,
  correctIds,
}: {
  opt: LatsolOption;
  selected: boolean;
  correctIds: string[];
}) {
  const isKey = correctIds.includes(opt.id);
  return (
    <div
      className={`p-2 rounded ${
        isKey
          ? 'bg-success-50 border border-success-300'
          : selected
            ? 'bg-destructive/10 border border-destructive/30'
            : 'bg-muted'
      }`}
    >
      {opt.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={resolveAssetUrl(opt.imageUrl)} alt="Gambar opsi" className="mb-1 max-h-40 w-auto rounded border object-contain" />
      )}
      <MathContent text={opt.content} />
      {isKey && <Badge className="ml-2">Kunci</Badge>}
      {selected && !isKey && <Badge variant="destructive" className="ml-2">Jawaban Anda</Badge>}
      {selected && isKey && <Badge className="ml-2">Jawaban Anda</Badge>}
    </div>
  );
}

/** Halaman hasil latsol — skor + review per soal setelah dikumpulkan. */
export function LatsolResultView({
  detail,
  onBack,
}: {
  detail: LatsolAttemptDetail;
  onBack: () => void;
}) {
  const total = detail.items.length;
  const correctCount = detail.items.filter(
    (it) => it.answered && it.answer.isCorrect === true,
  ).length;
  const answeredCount = detail.items.filter((it) => it.answered).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Hasil — {detail.package.title}</h1>
          <p className="text-sm text-muted-foreground">
            {correctCount} benar · {answeredCount}/{total} terjawab
            {detail.submittedAt && ` · Dikumpulkan ${new Date(detail.submittedAt).toLocaleString('id-ID')}`}
          </p>
        </div>
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-1 size-4" /> Kembali
        </Button>
      </div>

      <Card>
        <CardContent className="flex items-center justify-center gap-3 py-6">
          <span className="text-sm text-muted-foreground">Skor akhir</span>
          <span className="text-4xl font-bold text-primary">
            {score100(detail.score, detail.maxScore)}
          </span>
          <span className="text-lg text-muted-foreground">/100</span>
        </CardContent>
      </Card>

      {detail.items.map((it, idx) => {
        const q: RevealQ = it.answered ? it.answer.question : it.question;
        const ans = it.answered ? it.answer : null;
        const sMarks = sMarksOf(ans?.textAnswer);
        const correctIds = q.correctOptionIds ?? [];
        return (
          <Card key={it.questionId}>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                <span>
                  Soal {idx + 1} ({q.points ?? 1} poin)
                </span>
                <StatusBadge correct={ans?.isCorrect} answered={it.answered} />
                {ans && ans.score != null && (
                  <span className="text-xs font-normal text-muted-foreground">
                    skor {ans.score}/{ans.maxScore}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {q.stimulus && (
                <div className="rounded-md border border-brand-blue-200 bg-brand-blue-50 p-3">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Bacaan</p>
                  <MathContent text={q.stimulus} />
                  {q.stimulusImageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={resolveAssetUrl(q.stimulusImageUrl)} alt="Gambar bacaan" className="mt-2 max-h-64 w-auto rounded border object-contain" />
                  )}
                </div>
              )}
              <div className="prose prose-sm max-w-none">
                <MathContent text={q.content} />
                {q.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={resolveAssetUrl(q.imageUrl)} alt="Gambar soal" className="max-w-full h-auto rounded-lg" />
                )}
              </div>

              {q.type === 'TRUE_FALSE_COMPLEX' ? (
                <div className="flex flex-col gap-1">
                  {q.options.map((opt, oi) => {
                    const studentB = ans?.selectedOptionIds.includes(opt.id) === true;
                    const studentS = !studentB && sMarks.includes(opt.id);
                    const keyB = correctIds.includes(opt.id);
                    const rowOk = it.answered && studentB === keyB;
                    return (
                      <div
                        key={opt.id}
                        className={`flex items-start gap-2 p-2 rounded border ${
                          rowOk
                            ? 'bg-success-50 border-success-300'
                            : 'bg-destructive/10 border-destructive/30'
                        }`}
                      >
                        <span className="text-muted-foreground">{oi + 1}.</span>
                        <div className="flex-1 min-w-0">
                          {opt.imageUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={resolveAssetUrl(opt.imageUrl)} alt="Gambar pernyataan" className="mb-1 max-h-40 w-auto rounded border object-contain" />
                          )}
                          <MathContent text={opt.content} />
                        </div>
                        <span className="shrink-0 text-xs">
                          Anda: <b>{studentB ? 'Benar' : studentS ? 'Salah' : '—'}</b>
                          {' · '}Kunci: <b>{keyB ? 'Benar' : 'Salah'}</b>
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : q.options.length > 0 ? (
                <div className="flex flex-col gap-1">
                  {q.options.map((opt) => (
                    <OptionReview
                      key={opt.id}
                      opt={opt}
                      selected={ans?.selectedOptionIds.includes(opt.id) === true}
                      correctIds={correctIds}
                    />
                  ))}
                </div>
              ) : null}

              {(q.type === 'SHORT_ANSWER' || q.type === 'ESSAY') && (
                <>
                  <div>
                    <p className="text-muted-foreground mb-1">Jawaban Anda:</p>
                    <p>{it.answered && ans?.textAnswer && !ans.textAnswer.startsWith('{') ? ans.textAnswer : '—'}</p>
                  </div>
                  {q.answerKey && (
                    <div>
                      <p className="text-muted-foreground mb-1">Kunci Jawaban:</p>
                      <p className="font-medium">{q.answerKey}</p>
                    </div>
                  )}
                </>
              )}

              {(q.explanation || q.explanationImageUrl) && (
                <div className="bg-brand-blue-50 p-3 rounded-lg">
                  <p className="text-muted-foreground mb-1">Pembahasan:</p>
                  {q.explanation && <MathContent text={q.explanation} />}
                  {q.explanationImageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={resolveAssetUrl(q.explanationImageUrl)} alt="Gambar pembahasan" className="mt-2 max-h-80 w-auto rounded border object-contain" />
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
