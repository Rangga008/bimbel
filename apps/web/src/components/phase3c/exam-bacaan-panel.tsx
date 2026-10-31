'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpenText, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { ImagePickerField } from '@/components/shared/image-picker-field';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { plainPreview } from '@/components/shared/math-content';
import { apiFetch, ApiError, resolveAssetUrl } from '@/lib/api-client';
import type { ExamFormState } from '@/components/phase3c/exam-form';

interface BacaanQuestion {
  id: string;
  content: string | null;
  stimulus?: string | null;
  stimulusImageUrl?: string | null;
}

function err(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}

const norm = (s?: string | null) => (s ?? '').trim().replace(/\s+/g, ' ');

interface BacaanGroup {
  code: string;
  stimulus: string;
  imageUrl: string | null;
  /** questionId → nomor tampil (1-based sesuai urutan di ujian). */
  members: { questionId: string; no: number }[];
}

/** Panel "Bacaan" di halaman Kelola Soal ujian — menampilkan tiap teks
 *  bacaan (kode B1, B2, …), nomor soal yang memakainya, dan dialog untuk
 *  mengedit isi bacaan + soal mana saja yang disambungkan. */
export function ExamBacaanPanel({ form }: { form: ExamFormState }) {
  const qc = useQueryClient();
  const [editGroup, setEditGroup] = useState<BacaanGroup | 'new' | null>(null);
  const [deleteGroup, setDeleteGroup] = useState<BacaanGroup | null>(null);

  // Urutan soal = gabungan semua subtes (atau daftar flat) sesuai urutan form.
  const orderedIds = useMemo(() => {
    const ids = form.subtes.length
      ? form.subtes.flatMap((s) => s.questionIds)
      : form.questionIds;
    return [...new Set(ids)];
  }, [form]);

  const questionsQ = useQuery({
    queryKey: ['exam-bacaan-questions', orderedIds.join(',')],
    enabled: orderedIds.length > 0,
    queryFn: async () => {
      // Ambil bertahap supaya URL tidak kepanjangan.
      const out: BacaanQuestion[] = [];
      for (let i = 0; i < orderedIds.length; i += 40) {
        const chunk = orderedIds.slice(i, i + 40);
        out.push(
          ...(await apiFetch<BacaanQuestion[]>(
            `/questions?ids=${encodeURIComponent(chunk.join(','))}`,
          )),
        );
      }
      return out;
    },
  });

  const byId = useMemo(
    () => new Map((questionsQ.data ?? []).map((q) => [q.id, q])),
    [questionsQ.data],
  );

  // Kelompokkan per teks bacaan; kode B1.. mengikuti nomor soal pertama
  // yang memakainya.
  const groups = useMemo<BacaanGroup[]>(() => {
    const map = new Map<string, BacaanGroup>();
    orderedIds.forEach((id, i) => {
      const q = byId.get(id);
      const key = norm(q?.stimulus);
      if (!q || !key) return;
      const g = map.get(key);
      if (g) g.members.push({ questionId: id, no: i + 1 });
      else
        map.set(key, {
          code: `B${map.size + 1}`,
          stimulus: q.stimulus!.trim(),
          imageUrl: q.stimulusImageUrl ?? null,
          members: [{ questionId: id, no: i + 1 }],
        });
    });
    return [...map.values()];
  }, [orderedIds, byId]);

  const bulkM = useMutation({
    mutationFn: (body: { ids: string[]; stimulus: string | null; stimulusImageUrl?: string | null }) =>
      apiFetch<{ updated: number }>('/questions/stimulus/bulk', { method: 'POST', body }),
    onError: (e) => toast.error(err(e, 'Gagal menyimpan bacaan.')),
  });

  async function saveGroup(
    group: BacaanGroup | null,
    text: string,
    imageUrl: string,
    checkedIds: Set<string>,
  ) {
    const stimulus = text.trim();
    if (!stimulus) {
      toast.error('Teks bacaan tidak boleh kosong.');
      return;
    }
    const prevIds = new Set(group?.members.map((m) => m.questionId) ?? []);
    const toSet = [...checkedIds];
    const toClear = [...prevIds].filter((id) => !checkedIds.has(id));
    try {
      if (toClear.length)
        await bulkM.mutateAsync({ ids: toClear, stimulus: null });
      if (toSet.length)
        await bulkM.mutateAsync({ ids: toSet, stimulus, stimulusImageUrl: imageUrl || null });
      toast.success('Bacaan disimpan.');
      setEditGroup(null);
      await qc.invalidateQueries({ queryKey: ['exam-bacaan-questions'] });
      await qc.invalidateQueries({ queryKey: ['questions'] });
    } catch {
      /* toast sudah di onError */
    }
  }

  if (!orderedIds.length) return null;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 font-semibold">
              <BookOpenText className="size-4" /> Bacaan
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Satu teks bisa dipakai beberapa soal — soal yang memilih bacaan
              selalu menampilkan teks ini saat dikerjakan.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setEditGroup('new')}>
            <Plus className="mr-1 size-4" /> Bacaan Baru
          </Button>
        </div>

        {questionsQ.isLoading ? (
          <p className="text-sm text-muted-foreground">Memuat bacaan…</p>
        ) : groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Belum ada bacaan — impor soal dengan kolom Bacaan atau buat lewat
            tombol "Bacaan Baru".
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {groups.map((g) => (
              <div key={g.code} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2">
                    <Badge variant="secondary" className="mt-0.5 shrink-0">{g.code}</Badge>
                    <div className="min-w-0">
                      <p className="whitespace-pre-wrap text-sm">{g.stimulus}</p>
                      {g.imageUrl && (
                        <img
                          src={resolveAssetUrl(g.imageUrl)}
                          alt={`Gambar ${g.code}`}
                          className="mt-2 max-h-24 rounded border object-contain"
                        />
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="outline" onClick={() => setEditGroup(g)}>
                      <Pencil className="mr-1 size-3.5" /> Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      title="Lepas bacaan dari semua soal"
                      onClick={() => setDeleteGroup(g)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  <span className="text-xs text-muted-foreground">Dipakai soal:</span>
                  {g.members.map((m) => (
                    <Badge key={m.questionId} variant="outline">
                      No {m.no}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={deleteGroup !== null}
        onOpenChange={(o) => { if (!o) setDeleteGroup(null); }}
        title={`Hapus ${deleteGroup?.code ?? 'bacaan'}?`}
        description="Bacaan dilepas dari semua soal yang memakainya — soal itu sendiri tidak dihapus."
        confirmLabel="Ya, hapus bacaan"
        pending={bulkM.isPending}
        onConfirm={async () => {
          if (!deleteGroup) return;
          try {
            await bulkM.mutateAsync({
              ids: deleteGroup.members.map((m) => m.questionId),
              stimulus: null,
            });
            toast.success('Bacaan dihapus dari soal-soalnya.');
            setDeleteGroup(null);
            await qc.invalidateQueries({ queryKey: ['exam-bacaan-questions'] });
            await qc.invalidateQueries({ queryKey: ['questions'] });
          } catch { /* toast dari onError */ }
        }}
      />
      {editGroup !== null && (
        <BacaanEditDialog
          group={editGroup === 'new' ? null : editGroup}
          orderedIds={orderedIds}
          byId={byId}
          pending={bulkM.isPending}
          onClose={() => setEditGroup(null)}
          onSave={saveGroup}
        />
      )}
    </Card>
  );
}

function BacaanEditDialog({
  group,
  orderedIds,
  byId,
  pending,
  onClose,
  onSave,
}: {
  group: BacaanGroup | null;
  orderedIds: string[];
  byId: Map<string, BacaanQuestion>;
  pending: boolean;
  onClose: () => void;
  onSave: (group: BacaanGroup | null, text: string, imageUrl: string, ids: Set<string>) => void;
}) {
  const [text, setText] = useState(group?.stimulus ?? '');
  const [imageUrl, setImageUrl] = useState(group?.imageUrl ?? '');
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(group?.members.map((m) => m.questionId) ?? []),
  );

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{group ? `Edit ${group.code}` : 'Bacaan Baru'}</DialogTitle>
          <DialogDescription>
            Isi teks bacaan lalu centang nomor soal yang memakainya.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto pr-1">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Teks Bacaan</label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              placeholder="Tulis teks bacaan panjang di sini…"
            />
          </div>
          <ImagePickerField
            id="bacaan-image"
            label="Gambar Bacaan (opsional)"
            value={imageUrl}
            onChange={setImageUrl}
            hint="Grafik/tabel/gambar pendamping bacaan."
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">
              Sambungkan ke soal ({checked.size} dipilih)
            </label>
            <div className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-md border p-2">
              {orderedIds.map((id, i) => {
                const q = byId.get(id);
                return (
                  <label
                    key={id}
                    className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-muted/60"
                  >
                    <Checkbox
                      checked={checked.has(id)}
                      onCheckedChange={() => toggle(id)}
                    />
                    <span className="w-10 shrink-0 text-xs font-semibold text-muted-foreground">
                      No {i + 1}
                    </span>
                    <span className="truncate text-sm">
                      {plainPreview(q?.content ?? '', 90)}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button disabled={pending} onClick={() => onSave(group, text, imageUrl, checked)}>
            {pending ? 'Menyimpan…' : 'Simpan Bacaan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
