'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { apiFetch, ApiError } from '@/lib/api-client';

interface TutorReminderResult {
  periodKey: string;
  week: string;
  recipients: number;
  queued: number;
  skippedNoPhone: number;
  skippedPref: number;
}

/** Tombol kirim reminder jadwal mengajar minggu ini ke semua tutor via WA
 *  (satu pesan per tutor, lintas kelompok; dedupe per minggu di outbox). */
export function TutorWeeklyReminder() {
  const [confirming, setConfirming] = useState(false);
  const sendM = useMutation({
    mutationFn: () =>
      apiFetch<TutorReminderResult>('/reminders/tutor-weekly-schedule', {
        method: 'POST',
      }),
    onSuccess: (r) => {
      setConfirming(false);
      const skip =
        r.skippedNoPhone + r.skippedPref > 0
          ? ` (${r.skippedNoPhone} tanpa no. HP, ${r.skippedPref} menonaktifkan WA)`
          : '';
      toast.success(
        r.queued > 0
          ? `${r.queued} pesan WA diantrekan ke ${r.recipients} tutor.${skip}`
          : `Tidak ada pesan terkirim${skip ? ` —${skip}` : ' — sudah pernah dikirim minggu ini atau belum ada sesi terjadwal.'}`,
      );
    },
    onError: (e) => {
      setConfirming(false);
      toast.error(e instanceof ApiError ? e.message : 'Gagal mengirim reminder tutor.');
    },
  });

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={sendM.isPending}
        onClick={() => setConfirming(true)}
      >
        <CalendarClock className="mr-1.5 size-4" />
        Reminder Jadwal Tutor
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        tone="primary"
        title="Kirim reminder jadwal mingguan ke semua tutor?"
        description="Setiap tutor menerima satu pesan WhatsApp berisi seluruh sesinya minggu ini (lintas kelompok). Pesan yang sudah terkirim minggu ini tidak dikirim ulang."
        confirmLabel="Kirim ke WhatsApp"
        pending={sendM.isPending}
        onConfirm={() => sendM.mutate()}
      />
    </>
  );
}
