'use client';

import { useMutation } from '@tanstack/react-query';
import { BellRing } from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { apiFetch, ApiError } from '@/lib/api-client';

const REMINDER_TYPES = [
  { value: 'payment-due', label: 'Ingatkan Tagihan' },
  { value: 'weekly-schedule', label: 'Jadwal Minggu Ini' },
  { value: 'monthly-performance', label: 'Performa Bulanan' },
  { value: 'feedback', label: 'Ajakan Isi Feedback' },
] as const;

interface ReminderResult {
  queued: number;
  recipients: number;
  skippedNoPhone?: number;
  skippedNothing?: number;
}

/** Tombol "Kirim Reminder" — dipakai di detail siswa (ke ortunya) dan
 *  detail ortu (untuk semua anaknya; yang tidak relevan otomatis diskip). */
export function ReminderButtons({
  targetType,
  targetId,
}: {
  targetType: 'students' | 'parents';
  targetId: string;
}) {
  const sendM = useMutation({
    mutationFn: (type: string) =>
      apiFetch<ReminderResult>(`/${targetType}/${targetId}/reminders/${type}`, {
        method: 'POST',
      }),
    onSuccess: (r) => {
      if (r.queued > 0) {
        toast.success(`Reminder terkirim ke ${r.queued} nomor WA.`);
      } else if ((r.skippedNothing ?? 0) > 0 && r.queued === 0) {
        toast.info('Tidak ada yang perlu diingatkan — semua sudah beres.');
      } else {
        toast.info(
          `Tidak ada nomor yang bisa dihubungi (${r.skippedNoPhone ?? 0} tanpa WA).`,
        );
      }
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiError ? e.message : 'Gagal mengirim reminder.',
      ),
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={sendM.isPending}
        className="inline-flex h-8 items-center gap-1 rounded-md border border-input bg-background px-3 text-sm font-medium shadow-xs hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
      >
        <BellRing className="size-4" />
        {sendM.isPending ? 'Mengirim…' : 'Kirim Reminder'}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Kirim pengingat WA ke orang tua
        </DropdownMenuLabel>
        {REMINDER_TYPES.map((t) => (
          <DropdownMenuItem
            key={t.value}
            onSelect={() => sendM.mutate(t.value)}
          >
            {t.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
