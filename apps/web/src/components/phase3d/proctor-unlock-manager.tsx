'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
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
import { apiFetch, ApiError } from '@/lib/api-client';

function err(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}

interface LockedAttempt {
  id: string;
  examId: string;
  studentId: string;
  status: string;
  violationCount: number;
  lockedAt: string | null;
  lockedBy: string | null;
  lockedReason: string | null;
  startedAt: string;
  student: { id: string; user: { name: string; email: string } };
  exam: { id: string; title: string; scheduledStartAt: string; scheduledEndAt: string };
}

/**
 * Fase 3d — Panel "Attempt Terkunci (Proctoring)" di dalam halaman Ujian.
 * Pengawas membuka kembali attempt yang LOCKED karena pelanggaran proctoring.
 * Berlaku LINTAS kelompok/program: siapa pun yang memegang permission
 * `exam_proctor.unlock` bisa unlock attempt siswa manapun, bukan dibatasi
 * relasi tutor-siswa. Setiap unlock wajib tercatat di audit log (dilakukan
 * otomatis oleh backend saat endpoint unlock dipanggil).
 */
export function ProctorUnlockPanel() {
  const qc = useQueryClient();
  const [target, setTarget] = useState<LockedAttempt | null>(null);
  const [reason, setReason] = useState('');

  const lockedQ = useQuery({
    queryKey: ['exam-attempts-locked'],
    queryFn: () => apiFetch<LockedAttempt[]>('/exam-attempts/locked'),
    refetchInterval: 15000,
  });

  const unlockM = useMutation({
    mutationFn: () =>
      apiFetch(`/exam-attempts/${target!.id}/unlock`, {
        method: 'POST',
        body: { reason: reason.trim() },
      }),
    onSuccess: () => {
      toast.success('Attempt berhasil dibuka kembali.');
      qc.invalidateQueries({ queryKey: ['exam-attempts-locked'] });
      setTarget(null);
      setReason('');
    },
    onError: (e) => toast.error(err(e, 'Gagal membuka attempt.')),
  });

  if (lockedQ.isLoading) return <Skeleton className="h-24 w-full" />;
  if (lockedQ.isError) {
    return <p className="text-sm text-destructive">{err(lockedQ.error, 'Gagal memuat attempt terkunci.')}</p>;
  }

  const attempts = lockedQ.data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Attempt Terkunci (Proctoring)</h2>
        <p className="text-sm text-muted-foreground">
          Attempt dikunci otomatis saat siswa melanggar kebijakan proctoring (keluar fullscreen /
          pindah tab / kehilangan fokus berulang). Unlock berlaku lintas kelompok/program — ditentukan
          oleh permission <code>exam_proctor.unlock</code>, bukan relasi tutor-siswa. Semua unlock tercatat di audit log.
        </p>
      </div>

      {attempts.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-sm text-muted-foreground">
            Tidak ada attempt yang terkunci saat ini.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {attempts.map((a) => (
            <Card key={a.id} className="border-destructive/40">
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2">
                  <span>{a.exam.title}</span>
                  <Badge variant="destructive">LOCKED</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>
                  <span className="text-muted-foreground">Siswa:</span> {a.student.user.name} (
                  {a.student.user.email})
                </p>
                <p>
                  <span className="text-muted-foreground">Jumlah pelanggaran:</span> {a.violationCount}
                </p>
                <p>
                  <span className="text-muted-foreground">Alasan lock:</span> {a.lockedReason || '—'}
                </p>
                <p>
                  <span className="text-muted-foreground">Waktu lock:</span>{' '}
                  {a.lockedAt ? new Date(a.lockedAt).toLocaleString('id-ID') : '—'}
                </p>
                <Button
                  size="sm"
                  onClick={() => {
                    setTarget(a);
                    setReason('');
                  }}
                >
                  Unlock Attempt
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!target} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unlock Attempt</DialogTitle>
            <DialogDescription>
              {target && `Buka kembali attempt ${target.student.user.name} untuk ujian "${target.exam.title}".`}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="unlock-reason">Alasan unlock *</Label>
            <Textarea
              id="unlock-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Contoh: Sudah diverifikasi bukan kecurangan, koneksi siswa putus."
              required
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>
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
