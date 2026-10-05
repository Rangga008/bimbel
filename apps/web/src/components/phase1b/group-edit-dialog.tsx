"use client";
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { apiFetch, ApiError } from '@/lib/api-client';
import type { ProgramItem } from '@/lib/phase1a-types';
import type { GroupDetail } from '@/lib/phase1b-types';
import { Phase1aSelectField } from '@/components/phase1a/phase1a-form-dialog';

function err(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}

const INPUT_CLS =
  'h-9 rounded-lg border border-input bg-input/30 px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

/** Dialog edit data pokok kelompok: nama, kode, program → jenjang, kapasitas, status. */
export function GroupEditDialog({
  group,
  open,
  onOpenChange,
  onSaved,
}: {
  group: GroupDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(group.name);
  const [code, setCode] = useState(group.code ?? '');
  const [programId, setProgramId] = useState(group.programId);
  const [levelId, setLevelId] = useState(group.levelId ?? '');
  const [capacity, setCapacity] = useState(group.capacity != null ? String(group.capacity) : '');
  const [isActive, setIsActive] = useState(group.isActive);

  const programsQ = useQuery({
    queryKey: ['programs', 'options'],
    queryFn: () => apiFetch<ProgramItem[]>('/programs/options'),
    enabled: open,
  });

  const selProgram = programsQ.data?.find((p) => p.id === programId);
  const selLevel = selProgram?.levels?.find((l) => l.id === levelId);

  const saveM = useMutation({
    mutationFn: () =>
      apiFetch(`/groups/${group.id}`, {
        method: 'PATCH',
        body: {
          name: name.trim(),
          code: code.trim() || null,
          programId,
          levelId: levelId || null,
          capacity: capacity ? Number(capacity) : null,
          isActive,
        },
      }),
    onSuccess: () => {
      toast.success('Kelompok berhasil diperbarui.');
      qc.invalidateQueries({ queryKey: ['groups'] });
      onOpenChange(false);
      onSaved();
    },
    onError: (e) => toast.error(err(e, 'Gagal memperbarui kelompok.')),
  });

  const isValid = name.trim().length >= 3 && !!programId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Kelompok</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ge-name">Nama Kelompok *</Label>
            <Input id="ge-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: Kelas Reguler SD-5 A" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ge-code">Kode (opsional)</Label>
            <Input id="ge-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Contoh: REG-SD5A" />
          </div>
          <Phase1aSelectField
            id="ge-program"
            label="Program *"
            value={programId}
            onChange={(v) => { setProgramId(v); setLevelId(''); }}
            options={programsQ.data?.map((p) => ({ value: p.id, label: p.name })) || []}
          />
          <Phase1aSelectField
            id="ge-level"
            label="Level (opsional)"
            value={levelId}
            onChange={setLevelId}
            options={selProgram?.levels?.map((l) => ({ value: l.id, label: l.name })) || []}
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ge-capacity">Kapasitas (opsional)</Label>
            <input
              id="ge-capacity"
              type="number"
              min={1}
              className={INPUT_CLS}
              placeholder="Contoh: 8"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4" />
            Kelompok aktif
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
            <Button disabled={!isValid || saveM.isPending} onClick={() => saveM.mutate()}>
              <Save /> {saveM.isPending ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
