'use client';
import { useState } from 'react';
import { SessionsManager } from '@/components/phase1c/sessions-manager';
import { TutorPlanner } from '@/components/phase1c/tutor-planner';
import { Separator } from '@/components/ui/separator';

/**
 * Halaman Jadwal & Sesi — alur baru per tanggal: papan penugasan tutor mingguan
 * di atas, kalender bulanan di bawah (klik tanggal = editor yang sama).
 * Template jadwal per-kelompok tidak dipakai lagi — sesi dibuat per tanggal.
 */
export function JadwalSesiManager({ canManage }: { canManage: boolean }) {
  const [detailId, setDetailId] = useState<string | null>(null);
  const toggle = (id: string | null) => setDetailId((cur) => (id !== null && cur === id ? null : id));
  return (
    <div className="flex flex-col gap-8">
      {canManage ? (
        <TutorPlanner
          onSessionClick={(id) => toggle(id)}
          selectedSessionId={detailId}
        />
      ) : null}
      {canManage ? <Separator /> : null}
      <SessionsManager canManage={canManage} detailId={detailId} onDetailChange={toggle} />
    </div>
  );
}
