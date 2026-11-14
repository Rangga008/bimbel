"use client";

// Editor roster per-sesi: centang siswa kelompok yang dijadwalkan hadir +
// pindahkan siswa ke sesi lain dalam kelompok yang sama. Dipakai admin
// (detail sesi) dan tutor (halaman absensi).
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowRightLeft, Check, Search, Square, SquareCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch, ApiError } from '@/lib/api-client';
import { ComboboxField } from '@/components/shared/combobox-field';
import type { SessionDetail, SessionItem } from '@/lib/phase1c-types';
import { fmtDateTime } from '@/lib/phase1c-types';
import { cn } from '@/lib/utils';

function errMsg(e: unknown, fallback: string) {
  return e instanceof ApiError ? e.message : fallback;
}

export function SessionRosterEditor({
  sessionId,
  onChanged,
}: {
  sessionId: string;
  onChanged?: () => void;
}) {
  const qc = useQueryClient();
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [moveTarget, setMoveTarget] = useState<Record<string, string>>({});
  // Filter nama peserta — kelompok besar butuh pencarian, bukan scroll.
  const [query, setQuery] = useState('');

  const detailQ = useQuery({
    queryKey: ['sessions', sessionId, 'roster-editor'],
    queryFn: () => apiFetch<SessionDetail>(`/sessions/${sessionId}`),
  });
  const d = detailQ.data;
  const groupId = d?.groupId ?? '';

  // Kandidat sesi tujuan pemindahan = sesi lain dalam kelompok yang sama
  // yang masih terjadwal (30 hari ke depan + sesi-sesi lewat hari ini).
  const siblingsQ = useQuery({
    queryKey: ['sessions', 'roster-siblings', groupId],
    queryFn: () => apiFetch<SessionItem[]>(`/sessions?groupId=${groupId}&take=100`),
    enabled: !!groupId,
  });
  const moveTargets = useMemo(
    () =>
      (siblingsQ.data ?? []).filter(
        (s) => s.id !== sessionId && s.status === 'SCHEDULED',
      ),
    [siblingsQ.data, sessionId],
  );

  // Roster saat ini dari server; `picked` = draft edit lokal (null = ikut server).
  const serverIds = useMemo(
    () => new Set((d?.students ?? []).map((s) => s.studentId)),
    [d?.students],
  );
  const active = picked ?? serverIds;
  const dirty =
    picked !== null &&
    (picked.size !== serverIds.size ||
      [...picked].some((id) => !serverIds.has(id)));

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['sessions', sessionId] });
    qc.invalidateQueries({ queryKey: ['sessions'] });
    qc.invalidateQueries({ queryKey: ['session-calendar'] });
    qc.invalidateQueries({ queryKey: ['attendance-roster', sessionId] });
    onChanged?.();
  };

  const saveM = useMutation({
    mutationFn: () =>
      apiFetch(`/sessions/${sessionId}/roster`, {
        method: 'PATCH',
        body: { studentIds: [...(picked ?? serverIds)] },
      }),
    onSuccess: () => {
      toast.success('Peserta sesi diperbarui.');
      setPicked(null);
      invalidate();
    },
    onError: (e) => toast.error(errMsg(e, 'Gagal menyimpan peserta sesi.')),
  });

  const moveM = useMutation({
    mutationFn: ({ studentId, toSessionId }: { studentId: string; toSessionId: string }) =>
      apiFetch(`/sessions/${sessionId}/students/${studentId}/move`, {
        method: 'POST',
        body: { toSessionId },
      }),
    onSuccess: (_r, v) => {
      toast.success('Siswa dipindahkan ke sesi lain.');
      setMoveTarget((prev) => ({ ...prev, [v.studentId]: '' }));
      qc.invalidateQueries({ queryKey: ['sessions', 'roster-siblings', groupId] });
      invalidate();
    },
    onError: (e) => toast.error(errMsg(e, 'Gagal memindahkan siswa.')),
  });

  function toggle(studentId: string) {
    setPicked((prev) => {
      const base = new Set(prev ?? serverIds);
      if (base.has(studentId)) base.delete(studentId);
      else base.add(studentId);
      return base;
    });
  }

  if (detailQ.isLoading) return <Skeleton className="h-24 w-full" />;
  if (!d) return <p className="text-sm text-muted-foreground">Detail sesi tidak tersedia.</p>;

  const members = d.group.members ?? [];
  const q = query.trim().toLowerCase();
  const filtered = q
    ? members.filter((m) => m.student.user.name.toLowerCase().includes(q))
    : members;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">
          Peserta sesi
          <Badge variant="secondary" className="ml-2">
            {active.size}/{members.length} siswa
          </Badge>
        </p>
        <div className="flex gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() =>
              setPicked((prev) => {
                const base = new Set(prev ?? serverIds);
                for (const m of filtered) base.add(m.studentId);
                return base;
              })
            }
          >
            {q ? 'Pilih hasil' : 'Pilih semua'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() =>
              setPicked((prev) => {
                const base = new Set(prev ?? serverIds);
                for (const m of filtered) base.delete(m.studentId);
                return base;
              })
            }
          >
            {q ? 'Kosongkan hasil' : 'Kosongkan'}
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Centang siswa yang dijadwalkan hadir di sesi ini. Satu kelompok boleh
        dipecah ke beberapa sesi — siswa yang berhalangan bisa dipindahkan ke
        sesi lain lewat dropdown di tiap baris.
      </p>
      {members.length > 0 ? (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 pl-7 text-xs"
            placeholder="Cari nama siswa…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      ) : null}
      <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
        {filtered.map((m) => {
          const on = active.has(m.studentId);
          const target = moveTarget[m.studentId] ?? '';
          return (
            <div
              key={m.studentId}
              className={cn(
                'flex flex-col gap-1.5 rounded-md border p-2 sm:flex-row sm:items-center sm:gap-2',
                !on && 'opacity-60',
              )}
            >
              <button
                type="button"
                className="-m-1 flex min-w-0 flex-1 items-center gap-2 rounded-md p-1 text-left transition-colors hover:bg-muted/60"
                onClick={() => toggle(m.studentId)}
              >
                {on ? (
                  <SquareCheck className="size-4 shrink-0 text-brand-blue-600" />
                ) : (
                  <Square className="size-4 shrink-0 text-muted-foreground" />
                )}
                <span className="truncate text-sm">{m.student.user.name}</span>
              </button>
              {on && moveTargets.length ? (
                <div className="flex items-center gap-1.5 pl-6 sm:pl-0">
                  <ArrowRightLeft className="size-3.5 shrink-0 text-muted-foreground" />
                  <div className="max-w-52 flex-1">
                    <ComboboxField
                      id={`roster-move-${sessionId}-${m.studentId}`}
                      value={target}
                      disabled={moveM.isPending}
                      onChange={(v) =>
                        setMoveTarget((prev) => ({ ...prev, [m.studentId]: v }))
                      }
                      options={moveTargets.map((s) => ({
                        value: s.id,
                        label: `${fmtDateTime(s.startsAt)}${s.subject ? ` — ${s.subject.name}` : ''}`,
                      }))}
                      placeholder="Pindah ke sesi…"
                      emptyText="Tidak ada sesi cocok."
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant={target ? 'default' : 'outline'}
                    className={cn('h-8 text-xs transition-all', target && 'shadow-sm')}
                    disabled={!target || moveM.isPending}
                    onClick={() => moveM.mutate({ studentId: m.studentId, toSessionId: target })}
                  >
                    {moveM.isPending ? '…' : 'Pindah'}
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
        {!members.length ? (
          <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
            Kelompok ini belum punya anggota siswa.
          </p>
        ) : null}
        {members.length > 0 && filtered.length === 0 ? (
          <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
            Tidak ada siswa bernama &quot;{query.trim()}&quot;.
          </p>
        ) : null}
      </div>
      {q ? (
        <p className="text-[11px] text-muted-foreground">
          Menampilkan {filtered.length} dari {members.length} siswa.
        </p>
      ) : null}
      {dirty ? (
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={saveM.isPending} onClick={() => saveM.mutate()}>
            <Check className="size-4" />
            {saveM.isPending ? 'Menyimpan...' : `Simpan peserta (${active.size})`}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPicked(null)}>
            Batal
          </Button>
        </div>
      ) : null}
    </div>
  );
}
