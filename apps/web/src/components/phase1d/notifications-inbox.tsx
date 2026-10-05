"use client";
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch, ApiError } from '@/lib/api-client';
import type { NotificationItem, NotificationPreference } from '@/lib/phase1d-types';

/** Inbox in-app + preferensi. Fase 5b: polling 15 detik (near-real-time). */
const POLL_MS = 15_000;

export function NotificationsInbox() {
  const qc = useQueryClient();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const listQ = useQuery({
    queryKey: ['notifications', unreadOnly],
    queryFn: () => apiFetch<NotificationItem[]>(`/notifications/mine${unreadOnly ? '?unreadOnly=true' : ''}`),
    refetchInterval: POLL_MS,
  });
  const countQ = useQuery({
    queryKey: ['notifications-count'],
    queryFn: () => apiFetch<{ count: number }>('/notifications/unread-count'),
    refetchInterval: POLL_MS,
  });
  const prefQ = useQuery({ queryKey: ['notifications-pref'], queryFn: () => apiFetch<NotificationPreference>('/notifications/preference') });
  const readM = useMutation({
    mutationFn: (id: string) => apiFetch(`/notifications/${id}/read`, { method: 'PATCH' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notifications'] }); qc.invalidateQueries({ queryKey: ['notifications-count'] }); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Gagal menandai dibaca.'),
  });
  const readAllM = useMutation({
    mutationFn: () => apiFetch('/notifications/read-all', { method: 'POST' }),
    onSuccess: () => { toast.success('Semua ditandai dibaca.'); qc.invalidateQueries({ queryKey: ['notifications'] }); qc.invalidateQueries({ queryKey: ['notifications-count'] }); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Gagal menandai dibaca.'),
  });
  const prefM = useMutation({
    mutationFn: (body: Partial<NotificationPreference>) => apiFetch<NotificationPreference>('/notifications/preference', { method: 'PATCH', body }),
    onSuccess: () => { toast.success('Preferensi tersimpan.'); qc.invalidateQueries({ queryKey: ['notifications-pref'] }); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Gagal menyimpan preferensi.'),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Notifikasi {countQ.data && countQ.data.count > 0 ? `(${countQ.data.count} baru)` : ''}</h2>
          <p className="text-sm text-muted-foreground">In-app + WhatsApp (Fase 5b — provider dummy untuk dev).</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => readAllM.mutate()} disabled={readAllM.isPending}>Tandai semua dibaca</Button>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} /> Hanya yang belum dibaca
      </label>
      {listQ.isLoading ? <Skeleton className="h-20 w-full" /> : null}
      {listQ.data?.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Belum ada notifikasi.</CardContent></Card>
      ) : null}
      <div className="flex flex-col gap-2">
        {listQ.data?.map((n) => (
          <Card key={n.id} className={n.isRead ? 'opacity-70' : ''}>
            <CardContent className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{n.title}</p>
                {n.body ? <p className="truncate text-xs text-muted-foreground">{n.body}</p> : null}
                <p className="text-xs text-muted-foreground">{new Date(n.createdAt).toLocaleString('id-ID')}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {!n.isRead ? <Badge variant="secondary">Baru</Badge> : null}
                {!n.isRead ? <Button variant="outline" size="sm" onClick={() => readM.mutate(n.id)}>Tandai dibaca</Button> : null}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {prefQ.data ? (
        <Card><CardContent className="flex flex-col gap-2 py-4 text-sm">
          <p className="font-medium">Preferensi</p>
          {(['inAppEnabled', 'attendanceAlert', 'scheduleAlert', 'whatsAppEnabled'] as const).map((k) => (
            <label key={k} className="flex items-center gap-2">
              <input type="checkbox" checked={prefQ.data[k]} onChange={(e) => prefM.mutate({ [k]: e.target.checked })} /> {k}
            </label>
          ))}
        </CardContent></Card>
      ) : null}
    </div>
  );
}
