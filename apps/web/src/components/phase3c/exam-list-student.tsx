'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { KeyRound, Layers, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch, ApiError } from '@/lib/api-client';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { useContentCategories } from '@/components/shared/content-drilldown';
import { Phase1aSelectField } from '@/components/phase1a/phase1a-form-dialog';
import { categoryLabel } from '@/lib/content-taxonomy';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { ExamAttempt, ExamRow, ExamStatus } from '@/lib/phase3c-types';
import { useRouter, useSearchParams } from 'next/navigation';

function err(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}

async function fetchExamsWithAttempts() {
  const exams = await apiFetch<ExamRow[]>('/exams-available');
  const attemptsResults = await Promise.all(
    exams.map(async (exam) => {
      try {
        const attempts = await apiFetch<ExamAttempt[]>(`/exams/${exam.id}/my-attempts`);
        return { examId: exam.id, attempts };
      } catch {
        return { examId: exam.id, attempts: [] as ExamAttempt[] };
      }
    }),
  );
  const attemptsMap: Record<string, ExamAttempt> = {};
  attemptsResults.forEach(({ examId, attempts }) => {
    if (attempts.length > 0) attemptsMap[examId] = attempts[0];
  });
  return { exams, attemptsMap };
}

export function ExamListStudent() {
  const qc = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  // Daftar ujian siswa tanpa drill jenjang — ujian sudah di-scope server
  // ke jenjang/mapel/kelompok siswa, jadi cukup filter langsung per mapel
  // dan tipe. attemptUrl polos (tanpa ?g/l/s/c lagi).
  const attemptUrl = (attemptId: string) => `/siswa/ujian/${attemptId}`;
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [subjectFilter, setSubjectFilter] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [accessCode, setAccessCode] = useState('');

  const dataQ = useQuery({
    queryKey: ['exams-with-my-attempts'],
    queryFn: fetchExamsWithAttempts,
  });

  const catsQ = useContentCategories();

  const [startTarget, setStartTarget] = useState<ExamRow | null>(null);

  const startM = useMutation({
    mutationFn: (examId: string) => apiFetch<{ id: string }>('/exam-attempts/start', { method: 'POST', body: { examId } }),
    onSuccess: (data) => {
      setStartTarget(null);
      router.push(attemptUrl(data.id));
    },
    onError: (e) => toast.error(err(e, 'Gagal memulai ujian')),
  });

  /** Tukar kode ujian — khususnya peserta luar: akses terbuka, ujian
   *  langsung muncul di daftar dan dialog mulai terbuka. */
  const redeemM = useMutation({
    mutationFn: (code: string) =>
      apiFetch<{ exam: ExamRow; joined: boolean }>('/exams/redeem', {
        method: 'POST',
        body: { code },
      }),
    onSuccess: async (data) => {
      setAccessCode('');
      toast.success(`Akses "${data.exam.title}" dibuka.`);
      await qc.invalidateQueries({ queryKey: ['exams-with-my-attempts'] });
      const fresh = await qc.fetchQuery({
        queryKey: ['exams-with-my-attempts'],
        queryFn: fetchExamsWithAttempts,
      });
      const exam = fresh.exams.find((e) => e.id === data.exam.id);
      if (exam) setStartTarget(exam);
    },
    onError: (e) => toast.error(err(e, 'Kode ujian tidak dikenali.')),
  });

  // Deep-link dari materi: /siswa/ujian?exam=<id> → langsung buka ujian itu
  // (dialog mulai bila belum ada attempt, halaman attempt bila sudah ada).
  useEffect(() => {
    const target = searchParams.get('exam');
    const data = dataQ.data;
    if (!target || !data) return;
    const exam = data.exams.find((e) => e.id === target);
    if (!exam) return;
    const attempt = data.attemptsMap[exam.id];
    if (attempt) {
      router.replace(attemptUrl(attempt.id));
      return;
    }
    setStartTarget(exam);
    // Param sudah dikonsumsi — hapus supaya dialog tidak terbuka ulang
    // saat query revalidate atau user menekan browser-back.
    const p = new URLSearchParams(searchParams.toString());
    p.delete('exam');
    const qs = p.toString();
    router.replace(`${window.location.pathname}${qs ? `?${qs}` : ''}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, dataQ.data]);

  // Deep-link ?focus=<examId> (mis. dari tombol ujian di halaman materi):
  // scroll + sorot kartu ujian — tidak langsung membuka dialog mulai.
  const focusId = searchParams.get('focus');
  useEffect(() => {
    if (!focusId || !dataQ.data) return;
    const t = setTimeout(() => {
      document.getElementById(`exam-${focusId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, dataQ.data]);

  const continueExam = (attemptId: string) => {
    router.push(attemptUrl(attemptId));
  };

  const viewResult = (attemptId: string, resultReleased?: boolean) => {
    if (!resultReleased) {
      toast.error('Hasil ujian belum dirilis. Silakan tunggu sampai waktu ujian selesai untuk semua peserta.');
      return;
    }
    router.push(attemptUrl(attemptId));
  };

  const getStatusBadge = (status: ExamStatus) => {
    const cfg = {
      DRAFT: { variant: 'secondary', label: 'Draft' },
      PUBLISHED: { variant: 'default', label: 'Dibuka' },
      LOCKED: { variant: 'destructive', label: 'Terkunci' },
      ENDED: { variant: 'outline', label: 'Berakhir' },
    } as const;
    const c = cfg[status] ?? { variant: 'secondary' as const, label: status };
    return <Badge variant={c.variant}>{c.label}</Badge>;
  };

  const getExamStatus = (exam: ExamRow) => {
    // Ujian yang diakhiri manual oleh pengawas tetap dianggap selesai
    // meski jadwal belum lewat.
    if (exam.status === 'ENDED') return 'ENDED';
    const now = new Date();
    const start = new Date(exam.scheduledStartAt);
    const end = new Date(exam.scheduledEndAt);

    if (now < start) return 'NOT_STARTED';
    if (now > end) return 'ENDED';
    return 'ACTIVE';
  };

  const exams = dataQ.data?.exams ?? [];
  const myAttempts = dataQ.data?.attemptsMap ?? {};
  // Ujian PUBLISHED selalu tampil; ujian ENDED hanya tampil bila siswa
  // punya attempt (untuk melihat hasil yang sudah dirilis).
  const visibleExams = exams.filter(
    (exam) => exam.status === 'PUBLISHED' || (exam.status === 'ENDED' && myAttempts[exam.id]),
  );

  // Opsi filter diturunkan dari ujian yang benar-benar tersedia untuk
  // siswa ini — hanya mapel/tipe yang memang ada, jadi langsung menjurus.
  const subjectOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of visibleExams) {
      if (e.subject) map.set(e.subject.id, e.subject.name);
      // Ujian multi-subtes: tiap subtes ber-mapel sendiri.
      for (const s of e.subtes ?? []) {
        if (s.subject) map.set(s.subject.id, s.subject.name);
      }
    }
    return [...map.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [visibleExams]);

  const typeOptions = useMemo(() => {
    const codes = [...new Set(visibleExams.map((e) => e.category).filter((c): c is string => !!c))];
    return codes
      .map((c) => ({ value: c, label: categoryLabel(c, catsQ.data) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [visibleExams, catsQ.data]);

  const list = visibleExams.filter((e) => {
    if (subjectFilter) {
      const matchSubject =
        e.subject?.id === subjectFilter ||
        (e.subtes ?? []).some((s) => s.subject?.id === subjectFilter);
      if (!matchSubject) return false;
    }
    if (catFilter && e.category !== catFilter) return false;
    if (
      debouncedSearch &&
      !e.title.toLowerCase().includes(debouncedSearch.toLowerCase())
    )
      return false;
    return true;
  });

  const startExam = (examId: string) => {
    qc.invalidateQueries({ queryKey: ['exams-with-my-attempts'] });
    startM.mutate(examId);
  };

  if (dataQ.isLoading) {
    return <Skeleton className="h-24 w-full" />;
  }

  if (dataQ.isError) {
    return <div className="text-sm text-destructive">{err(dataQ.error, 'Gagal memuat daftar ujian.')}</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Ujian</h1>
        <p className="text-sm text-muted-foreground">
          Daftar ujian untuk jenjang &amp; kelompokmu — saring per mapel atau tipe.
        </p>
      </div>

      {/* Masuk lewat kode ujian — jalur utama peserta luar/try out umum. */}
      <Card>
        <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-end">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-gold-100 text-brand-gold-700">
            <KeyRound className="size-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">Punya kode ujian?</p>
            <p className="text-xs text-muted-foreground">
              Masukkan kode dari pengajar/panitia — ujian langsung terbuka tanpa perlu terdaftar di kelompoknya.
            </p>
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const code = accessCode.trim();
              if (code) redeemM.mutate(code);
            }}
          >
            <Input
              placeholder="cth: K7P4QX"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
              className="w-36 uppercase tracking-widest"
              maxLength={8}
            />
            <Button type="submit" disabled={redeemM.isPending || !accessCode.trim()}>
              {redeemM.isPending ? 'Memeriksa…' : 'Masuk'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-44">
          <Phase1aSelectField
            id="ex-subject"
            label="Mapel"
            value={subjectFilter}
            onChange={setSubjectFilter}
            options={subjectOptions}
            placeholder="Semua mapel"
          />
        </div>
        <div className="w-full sm:w-44">
          <Phase1aSelectField
            id="ex-type"
            label="Tipe"
            value={catFilter}
            onChange={setCatFilter}
            options={typeOptions}
            placeholder="Semua tipe"
          />
        </div>
        <div className="relative w-full sm:w-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Cari ujian..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="grid gap-4">
        {list.map((exam) => {
          const examStatus = getExamStatus(exam);
          const attempt = myAttempts[exam.id];
          const subtesNames = (exam.subtes ?? [])
            .map((s) => s.subject?.name ?? s.name)
            .filter(Boolean);

          return (
            <Card key={exam.id} id={`exam-${exam.id}`} className={exam.id === focusId ? 'ring-2 ring-primary' : undefined}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <CardTitle className="flex flex-wrap items-center gap-2">
                      {exam.title}
                      {getStatusBadge(exam.status)}
                      {exam.category && (
                        <Badge variant="outline">{categoryLabel(exam.category, catsQ.data)}</Badge>
                      )}
                      {exam.subject && <Badge variant="secondary">{exam.subject.name}</Badge>}
                      {(exam.subtes?.length ?? 0) > 0 && (
                        <Badge variant="secondary">
                          <Layers className="size-3" /> {exam.subtes!.length} subtes
                        </Badge>
                      )}
                    </CardTitle>
                    {subtesNames.length > 0 && (
                      <p className="text-xs text-muted-foreground">{subtesNames.join(' · ')}</p>
                    )}
                    {exam.description && (
                      <p className="text-sm text-muted-foreground">{exam.description}</p>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm mb-4">
                  <div>
                    <div className="text-muted-foreground">Mulai</div>
                    <div>{new Date(exam.scheduledStartAt).toLocaleString('id-ID')}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Selesai</div>
                    <div>{new Date(exam.scheduledEndAt).toLocaleString('id-ID')}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">
                      {exam.items.length} soal
                      {exam.durationMinutes ? ` · ${exam.durationMinutes} menit` : ''}
                    </div>
                    <div>Nilai maks {exam.maxScore}</div>
                  </div>
                </div>

                {examStatus === 'NOT_STARTED' && <Button disabled>Belum Dimulai</Button>}

                {examStatus === 'ACTIVE' && (
                  <>
                    {attempt && attempt.status === 'IN_PROGRESS' ? (
                      <Button onClick={() => continueExam(attempt.id)}>Lanjutkan</Button>
                    ) : attempt && attempt.status === 'LOCKED' ? (
                      <Button variant="destructive" onClick={() => continueExam(attempt.id)}>
                        Dikunci — Lihat Status
                      </Button>
                    ) : attempt && attempt.status === 'SUBMITTED' ? (
                      <Button
                        onClick={() => viewResult(attempt.id, attempt.resultReleased)}
                        variant="outline"
                        disabled={!attempt.resultReleased}
                      >
                        {attempt.resultReleased ? 'Hasil & Pembahasan' : 'Hasil Belum Dirilis'}
                      </Button>
                    ) : (
                      <Button onClick={() => setStartTarget(exam)} disabled={startM.isPending}>
                        Mulai Ujian
                      </Button>
                    )}
                  </>
                )}

                {examStatus === 'ENDED' && (
                  <>
                    {attempt ? (
                      <Button
                        onClick={() => viewResult(attempt.id, attempt.resultReleased)}
                        variant="outline"
                        disabled={!attempt.resultReleased}
                      >
                        {attempt.resultReleased ? 'Hasil & Pembahasan' : 'Hasil Belum Dirilis'}
                      </Button>
                    ) : (
                      <Button disabled>Ujian Selesai</Button>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {visibleExams.length === 0 && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">Tidak ada ujian yang tersedia saat ini.</p>
          </CardContent>
        </Card>
      )}
      {visibleExams.length > 0 && list.length === 0 && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Tidak ada ujian untuk filter ini — coba pilihan lain.
            </p>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={!!startTarget}
        onOpenChange={(open) => {
          if (!open) setStartTarget(null);
        }}
        tone="primary"
        title={`Mulai "${startTarget?.title ?? 'ujian'}"?`}
        description={
          startTarget
            ? `${startTarget.items.length} soal · nilai maks ${startTarget.maxScore}` +
              `${startTarget.durationMinutes ? ` · durasi ${startTarget.durationMinutes} menit` : ''}. ` +
              ((startTarget.subtes?.length ?? 0) > 0
                ? 'Ujian ini terdiri dari beberapa subtes yang dikerjakan berurutan — timer tiap subtes dimulai saat kamu menekan "Mulai Subtes". '
                : '') +
              (startTarget.proctoringEnabled === false
                ? 'Ujian ini tanpa proteksi — Anda bebas keluar-masuk halaman; jawaban tersimpan otomatis.'
                : 'Ujian ini diproteksi: berjalan layar penuh, dan keluar halaman/aplikasi akan mengunci attempt Anda sampai dibuka pengawas.')
            : undefined
        }
        confirmLabel="Ya, mulai sekarang"
        pending={startM.isPending}
        onConfirm={() => startTarget && startExam(startTarget.id)}
      />
    </div>
  );
}
