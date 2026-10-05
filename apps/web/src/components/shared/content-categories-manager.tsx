'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { LoaderCircle, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { apiFetch, ApiError } from '@/lib/api-client';
import type { ContentCategoryItem } from '@/lib/content-taxonomy';

function errMsg(e: unknown, fallback: string) {
  return e instanceof ApiError ? e.message : fallback;
}

/**
 * Kelola tipe/kategori konten dinamis (mis. Bab 1, Bab 2, Remedial, dst.).
 * Dipakai di langkah "Pilih Tipe" pada drill-down materi/soal/latsol/ujian —
 * kategori yang dihapus permanen hanya bisa bila belum dipakai konten.
 */
export function ContentCategoriesManager({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const listQ = useQuery({
    queryKey: ['content-categories', 'all'],
    queryFn: () =>
      apiFetch<ContentCategoryItem[]>('/content-categories?all=1'),
    enabled: open,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['content-categories'] });
  };

  const createM = useMutation({
    mutationFn: (n: string) =>
      apiFetch<ContentCategoryItem>('/content-categories', {
        method: 'POST',
        body: JSON.stringify({ name: n }),
      }),
    onSuccess: (c) => {
      toast.success(`Tipe "${c.name}" ditambahkan.`);
      setName('');
      invalidate();
    },
    onError: (e) => toast.error(errMsg(e, 'Gagal menambah tipe.')),
  });

  const updateM = useMutation({
    mutationFn: ({
      id,
      ...data
    }: { id: string; name?: string; isActive?: boolean }) =>
      apiFetch<ContentCategoryItem>(`/content-categories/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      toast.success('Tipe diperbarui.');
      setEditId(null);
      invalidate();
    },
    onError: (e) => toast.error(errMsg(e, 'Gagal memperbarui tipe.')),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/content-categories/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Tipe dihapus.');
      invalidate();
    },
    onError: (e) => toast.error(errMsg(e, 'Gagal menghapus tipe.')),
  });

  const items = listQ.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Kelola Tipe Konten</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Tipe dipakai di langkah terakhir drill-down (mis. &quot;Bab 1&quot;,
          &quot;Bab 2&quot;, &quot;Remedial&quot;). Tipe yang masih dipakai konten
          hanya bisa dinonaktifkan.
        </p>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) createM.mutate(name.trim());
          }}
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nama tipe baru, mis. Bab 1"
            maxLength={100}
          />
          <Button type="submit" disabled={!name.trim() || createM.isPending}>
            {createM.isPending ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            Tambah
          </Button>
        </form>

        <div className="max-h-80 space-y-2 overflow-y-auto">
          {listQ.isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Memuat…
            </p>
          ) : (
            items.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-2 rounded-lg border p-2"
              >
                {editId === c.id ? (
                  <>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="h-8"
                      autoFocus
                    />
                    <Button
                      size="sm"
                      className="h-8"
                      disabled={updateM.isPending}
                      onClick={() =>
                        updateM.mutate({ id: c.id, name: editName.trim() })
                      }
                    >
                      Simpan
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8"
                      onClick={() => setEditId(null)}
                    >
                      Batal
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{c.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        kode: {c.code}
                      </p>
                    </div>
                    {!c.isActive && (
                      <Badge variant="outline" className="shrink-0">
                        Nonaktif
                      </Badge>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="size-8 shrink-0 p-0"
                      title="Ubah nama"
                      onClick={() => {
                        setEditId(c.id);
                        setEditName(c.name);
                      }}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="size-8 shrink-0 p-0"
                      title={c.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                      onClick={() =>
                        updateM.mutate({ id: c.id, isActive: !c.isActive })
                      }
                    >
                      <Power className="size-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="size-8 shrink-0 p-0 text-destructive"
                      title="Hapus (hanya bila belum dipakai)"
                      disabled={deleteM.isPending}
                      onClick={() => deleteM.mutate(c.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
