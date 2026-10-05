"use client";
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Building2, DoorOpen, Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { ImagePickerField } from '@/components/shared/image-picker-field';
import { Phase1aFormDialog, Phase1aSelectField } from '@/components/phase1a/phase1a-form-dialog';
import { apiFetch, ApiError, resolveAssetUrl } from '@/lib/api-client';
import type { BuildingItem, RoomItem } from '@/lib/phase1c-types';
import { useAuthStore } from '@/stores/auth-store';

function err(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}

/** CRUD gedung & ruangan — ruangan kini punya foto, kapasitas, dan gedung. */
export function FacilitiesManager() {
  const qc = useQueryClient();
  const canManage = useAuthStore((s) => s.user?.permissions.includes('facility.manage') ?? false);
  const [roomForm, setRoomForm] = useState<Record<string, string>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<RoomItem | null>(null);
  const [buildingOpen, setBuildingOpen] = useState(false);
  const [buildingForm, setBuildingForm] = useState<Record<string, string>>({});
  const [deleteRoom, setDeleteRoom] = useState<RoomItem | null>(null);
  const [deleteBuilding, setDeleteBuilding] = useState<BuildingItem | null>(null);
  const roomsQ = useQuery({ queryKey: ['rooms'], queryFn: () => apiFetch<RoomItem[]>('/rooms') });
  const buildingsQ = useQuery({ queryKey: ['buildings'], queryFn: () => apiFetch<BuildingItem[]>('/buildings') });
  const buildingOptions = (buildingsQ.data ?? []).map((b) => ({ value: b.id, label: b.name }));

  const saveM = useMutation({
    mutationFn: () => {
      const body = {
        name: roomForm.name,
        buildingId: roomForm.buildingId || undefined,
        capacity: roomForm.capacity ? Number(roomForm.capacity) : undefined,
        photoUrl: roomForm.photoUrl || undefined,
      };
      return editTarget
        ? apiFetch<RoomItem>(`/rooms/${editTarget.id}`, { method: 'PATCH', body })
        : apiFetch<RoomItem>('/rooms', { method: 'POST', body });
    },
    onSuccess: () => {
      toast.success(editTarget ? 'Ruangan diperbarui.' : 'Ruangan ditambahkan.');
      setCreateOpen(false);
      setEditTarget(null);
      setRoomForm({});
      qc.invalidateQueries({ queryKey: ['rooms'] });
    },
    onError: (e) => toast.error(err(e, 'Gagal menyimpan ruangan.')),
  });

  const buildingM = useMutation({
    mutationFn: () =>
      apiFetch('/buildings', {
        method: 'POST',
        body: { name: buildingForm.name, address: buildingForm.address || undefined },
      }),
    onSuccess: () => {
      toast.success('Gedung ditambahkan.');
      setBuildingOpen(false);
      setBuildingForm({});
      qc.invalidateQueries({ queryKey: ['buildings'] });
    },
    onError: (e) => toast.error(err(e, 'Gagal menambah gedung.')),
  });
  const delRoomM = useMutation({
    mutationFn: (id: string) => apiFetch(`/rooms/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Ruangan dihapus.');
      setDeleteRoom(null);
      qc.invalidateQueries({ queryKey: ['rooms'] });
      qc.invalidateQueries({ queryKey: ['buildings'] });
    },
    onError: (e) => { setDeleteRoom(null); toast.error(err(e, 'Gagal menghapus ruangan.')); },
  });
  const delBuildingM = useMutation({
    mutationFn: (id: string) => apiFetch(`/buildings/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Gedung dihapus.');
      setDeleteBuilding(null);
      qc.invalidateQueries({ queryKey: ['buildings'] });
    },
    onError: (e) => { setDeleteBuilding(null); toast.error(err(e, 'Gagal menghapus gedung.')); },
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Fasilitas</h1>
        <p className="text-sm text-muted-foreground">Kelola gedung dan ruangan untuk penjadwalan sesi.</p>
      </div>
      <Card><CardContent className="flex flex-col gap-3 py-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-lg bg-brand-blue-50 text-primary">
              <DoorOpen className="size-5" />
            </div>
            <p className="font-medium">Ruangan <span className="tabular-nums text-muted-foreground">({roomsQ.data?.length ?? '…'})</span></p>
          </div>
          {canManage ? (
            <Button size="sm" onClick={() => { setEditTarget(null); setRoomForm({}); setCreateOpen(true); }}>
              <Plus /> Tambah Ruangan
            </Button>
          ) : null}
        </div>
        {roomsQ.isLoading ? <Skeleton className="h-24 w-full" /> : null}
        {roomsQ.data?.length === 0 ? (
          <EmptyState icon={DoorOpen} title="Belum ada ruangan" description="Tambahkan ruangan pertama dengan tombol di atas." />
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {roomsQ.data?.map((r) => (
            <div key={r.id} className="flex gap-3 rounded-lg border p-3">
              <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground">
                {r.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- URL dinamis dari API
                  <img src={resolveAssetUrl(r.photoUrl)} alt={r.name} className="size-full object-cover" />
                ) : (
                  <DoorOpen className="size-6" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{r.name}</p>
                <p className="text-xs text-muted-foreground">
                  {r.building?.name ?? 'Tanpa gedung'}
                  {r.capacity ? ` · ${r.capacity} orang` : ''}
                </p>
                {!r.isActive ? <Badge variant="outline" className="mt-1">Nonaktif</Badge> : null}
              </div>
              {canManage ? (
                <div className="flex shrink-0 flex-col">
                  <Button
                    variant="ghost" size="icon"
                    onClick={() => {
                      setEditTarget(r);
                      setRoomForm({
                        name: r.name,
                        buildingId: r.building?.id ?? '',
                        capacity: r.capacity ? String(r.capacity) : '',
                        photoUrl: r.photoUrl ?? '',
                      });
                      setCreateOpen(true);
                    }}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost" size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    title="Hapus ruangan"
                    onClick={() => setDeleteRoom(r)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </CardContent></Card>
      <Card><CardContent className="flex flex-col gap-3 py-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Building2 className="size-5" />
            </div>
            <p className="font-medium">Gedung <span className="tabular-nums text-muted-foreground">({buildingsQ.data?.length ?? '…'})</span></p>
          </div>
          {canManage ? (
            <Button size="sm" variant="outline" onClick={() => { setBuildingForm({}); setBuildingOpen(true); }}>
              <Plus /> Tambah Gedung
            </Button>
          ) : null}
        </div>
        {buildingsQ.data?.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada gedung — tambahkan untuk mengelompokkan ruangan.</p>
        ) : null}
        <div className="flex flex-wrap gap-1.5">
          {buildingsQ.data?.map((b) => (
            <span key={b.id} className="inline-flex items-center gap-1 rounded-full border bg-secondary px-2 py-1 text-xs font-medium">
              <Building2 className="size-3.5" />
              {b.name}
              <span className="text-muted-foreground">({b.rooms?.length ?? 0} ruang)</span>
              {canManage ? (
                <button
                  type="button"
                  className="ml-0.5 text-muted-foreground hover:text-destructive"
                  title="Hapus gedung"
                  onClick={() => setDeleteBuilding(b)}
                >
                  <Trash2 className="size-3.5" />
                </button>
              ) : null}
            </span>
          ))}
        </div>
      </CardContent></Card>

      <Phase1aFormDialog
        open={createOpen}
        onOpenChange={(o) => { if (!o) { setCreateOpen(false); setEditTarget(null); } }}
        title={editTarget ? `Edit Ruangan — ${editTarget.name}` : 'Tambah Ruangan'}
        fields={[
          { name: 'name', label: 'Nama ruangan', required: true },
          { name: 'capacity', label: 'Kapasitas (opsional)', type: 'number', min: 1 },
        ]}
        values={roomForm}
        onChange={(name, value) => setRoomForm((prev) => ({ ...prev, [name]: value }))}
        onSubmit={() => saveM.mutate()}
        isSubmitting={saveM.isPending}
        submitLabel={editTarget ? 'Simpan Perubahan' : 'Tambah'}
        extra={
          <>
            <Phase1aSelectField
              id="room-building"
              label="Gedung (opsional)"
              value={roomForm.buildingId ?? ''}
              onChange={(v) => setRoomForm((prev) => ({ ...prev, buildingId: v }))}
              options={buildingOptions}
              placeholder="- Tanpa gedung -"
              emptyText="Belum ada gedung."
            />
            <ImagePickerField
              id="room-photo"
              label="Foto ruangan (opsional)"
              value={roomForm.photoUrl ?? ''}
              onChange={(v) => setRoomForm((prev) => ({ ...prev, photoUrl: v }))}
              category="ACADEMIC"
            />
          </>
        }
      />

      <Phase1aFormDialog
        open={buildingOpen}
        onOpenChange={setBuildingOpen}
        title="Tambah Gedung"
        fields={[
          { name: 'name', label: 'Nama gedung', required: true, placeholder: 'Gedung A' },
          { name: 'address', label: 'Alamat (opsional)', placeholder: 'Jl. …' },
        ]}
        values={buildingForm}
        onChange={(name, value) => setBuildingForm((prev) => ({ ...prev, [name]: value }))}
        onSubmit={() => buildingM.mutate()}
        isSubmitting={buildingM.isPending}
        submitLabel="Tambah"
      />

      <ConfirmDialog
        open={deleteRoom !== null}
        onOpenChange={(o) => { if (!o) setDeleteRoom(null); }}
        title={`Hapus ruangan ${deleteRoom?.name ?? ''}?`}
        description="Ruangan yang sudah dipakai sesi tidak bisa dihapus — nonaktifkan saja lewat tombol edit."
        confirmLabel="Hapus Ruangan"
        pending={delRoomM.isPending}
        onConfirm={() => deleteRoom && delRoomM.mutate(deleteRoom.id)}
      />
      <ConfirmDialog
        open={deleteBuilding !== null}
        onOpenChange={(o) => { if (!o) setDeleteBuilding(null); }}
        title={`Hapus gedung ${deleteBuilding?.name ?? ''}?`}
        description="Gedung hanya bisa dihapus bila sudah tidak punya ruangan."
        confirmLabel="Hapus Gedung"
        pending={delBuildingM.isPending}
        onConfirm={() => deleteBuilding && delBuildingM.mutate(deleteBuilding.id)}
      />
    </div>
  );
}
