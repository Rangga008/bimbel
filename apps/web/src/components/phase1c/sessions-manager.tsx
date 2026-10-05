"use client";
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Label } from '@/components/ui/label';
import { ComboboxField } from '@/components/shared/combobox-field';
import { apiFetch } from '@/lib/api-client';
import { SessionCalendar } from '@/components/shared/session-calendar';
import type { GroupListItem } from '@/lib/phase1b-types';
import { SessionOverrideBox } from '@/components/phase1c/session-override-box';

/** Kalender sesi konkret + override per-siswa (admin). Klik tanggal, lalu klik sesi untuk mengatur susulan 1 siswa. */
export function SessionsManager({
  groupId: groupIdProp,
  onGroupChange,
  hideGroupFilter,
  canManage,
  detailId: detailIdProp,
  onDetailChange,
}: {
  groupId?: string;
  onGroupChange?: (groupId: string) => void;
  hideGroupFilter?: boolean;
  /** Mode kelola: klik tanggal membuka editor sesi (tugas tutor/buat sesi). */
  canManage?: boolean;
  /** State detail opsional dari parent (dipakai bersama papan tutor). */
  detailId?: string | null;
  onDetailChange?: (id: string | null) => void;
}) {
  const [internalGroupId, setInternalGroupId] = useState('');
  const groupId = groupIdProp ?? internalGroupId;
  const setGroupId = onGroupChange ?? setInternalGroupId;
  const [internalDetail, setInternalDetail] = useState<string | null>(null);
  const detailId = detailIdProp !== undefined ? detailIdProp : internalDetail;
  const setDetailId = onDetailChange ?? setInternalDetail;
  const groupsQ = useQuery({ queryKey: ['groups'], queryFn: () => apiFetch<GroupListItem[]>('/groups') });
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Sesi Konkret</h2>
        <p className="text-sm text-muted-foreground">
          {canManage
            ? 'Klik tanggal untuk menugaskan tutor/mapel/ruangan atau membuat sesi baru; ikon detail untuk absensi & susulan per-siswa.'
            : 'Klik tanggal di kalender untuk melihat sesi hari itu.'}
        </p>
      </div>
      {!hideGroupFilter ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sess-filter-group">Filter kelompok</Label>
          <div className="w-full max-w-md">
            <ComboboxField
              id="sess-filter-group"
              value={groupId}
              onChange={setGroupId}
              options={(groupsQ.data ?? []).map((g) => ({ value: g.id, label: g.name }))}
              placeholder="- Semua sesi -"
            />
          </div>
        </div>
      ) : null}
      <SessionCalendar
        endpoint={`/sessions${groupId ? `?groupId=${groupId}` : ''}`}
        editable={canManage}
        onSessionClick={canManage ? (id) => setDetailId(detailId === id ? null : id) : undefined}
        selectedSessionId={detailId}
      />
      {detailId ? <SessionOverrideBox sessionId={detailId} onDeleted={() => setDetailId(null)} /> : null}
    </div>
  );
}
