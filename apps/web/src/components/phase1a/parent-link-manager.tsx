"use client";

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronRight, Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/shared/user-avatar';
import { apiFetch, ApiError } from '@/lib/api-client';
import type { ParentItem, StudentItem } from '@/lib/phase1a-types';
import {
  Phase1aFormDialog,
  Phase1aSelectField,
} from '@/components/phase1a/phase1a-form-dialog';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

/** Kelola relasi parent <-> student (1 ortu bisa >1 anak). */
export function ParentLinkManager({
  parents,
  students,
  studentsLoading,
  onEdit,
  basePath,
}: {
  parents: ParentItem[];
  students: StudentItem[];
  studentsLoading?: boolean;
  onEdit?: (parent: ParentItem) => void;
  basePath: string;
}) {
  const queryClient = useQueryClient();
  const [linkOpen, setLinkOpen] = useState<string | null>(null);
  const [linkForm, setLinkForm] = useState<Record<string, string>>({});
  const [unlinkTarget, setUnlinkTarget] = useState<{
    parentId: string;
    studentId: string;
    label: string;
  } | null>(null);

  const linkMutation = useMutation({
    mutationFn: () =>
      apiFetch('/parent-students', {
        method: 'POST',
        body: { parentId: linkOpen, studentId: linkForm.studentId },
      }),
    onSuccess: () => {
      toast.success('Anak dihubungkan ke orang tua.');
      setLinkOpen(null);
      setLinkForm({});
      queryClient.invalidateQueries({ queryKey: ['parents'] });
      queryClient.invalidateQueries({ queryKey: ['students'] });
    },
    onError: (error) => toast.error(errorMessage(error, 'Gagal menghubungkan.')),
  });

  const unlinkMutation = useMutation({
    mutationFn: ({ parentId, studentId }: { parentId: string; studentId: string }) =>
      apiFetch(`/parent-students/${parentId}/${studentId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Relasi orang tua-anak dilepas.');
      setUnlinkTarget(null);
      queryClient.invalidateQueries({ queryKey: ['parents'] });
      queryClient.invalidateQueries({ queryKey: ['students'] });
    },
    onError: (error) => {
      setUnlinkTarget(null);
      toast.error(errorMessage(error, 'Gagal melepas relasi.'));
    },
  });

  const th = 'px-3 py-2 text-left font-medium whitespace-nowrap';
  const td = 'px-3 py-2 align-top';

  return (
    <>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className={th}>Orang Tua</th>
              <th className={th}>No. HP</th>
              <th className={th}>Anak</th>
              <th className={th}>Status</th>
              <th className={th}></th>
            </tr>
          </thead>
          <tbody>
            {parents.map((parent) => (
              <tr key={parent.id} className="border-b last:border-0">
                <td className={td}>
                  <span className="flex items-center gap-2.5">
                    <UserAvatar name={parent.user.name} avatarUrl={parent.user.avatarUrl} className="size-8" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{parent.user.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{parent.user.email}</span>
                    </span>
                  </span>
                </td>
                <td className={`${td} whitespace-nowrap text-muted-foreground`}>
                  {parent.user.phone ?? '—'}
                </td>
                <td className={td}>
                  <span className="flex flex-wrap gap-1.5">
                    {parent.parentStudents.map((l) => (
                      <span key={l.student.id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                        <Link href={`${basePath}/siswa/${l.student.id}`} className="hover:underline">
                          {l.student.user.name}
                        </Link>
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-destructive"
                          title="Lepas relasi"
                          onClick={() =>
                            setUnlinkTarget({
                              parentId: parent.id,
                              studentId: l.student.id,
                              label: `${l.student.user.name} ↔ ${parent.user.name}`,
                            })
                          }
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                    {parent.parentStudents.length === 0 ? (
                      <span className="text-xs text-muted-foreground">Belum ada anak terhubung.</span>
                    ) : null}
                  </span>
                </td>
                <td className={`${td} whitespace-nowrap`}>
                  <Badge variant={parent.isActive ? 'success' : 'outline'}>
                    {parent.isActive ? 'Aktif' : 'Nonaktif'}
                  </Badge>
                </td>
                <td className={`${td} whitespace-nowrap text-right`}>
                  <span className="inline-flex items-center gap-1">
                    <Link href={`${basePath}/orang-tua/${parent.id}`}>
                      <Button variant="ghost" size="sm" className="text-primary">Kelola <ChevronRight /></Button>
                    </Link>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setLinkOpen(parent.id);
                        setLinkForm({});
                      }}
                    >
                      Hubungkan Anak
                    </Button>
                    {onEdit ? (
                      <Button variant="ghost" size="sm" onClick={() => onEdit(parent)}>
                        <Pencil className="size-3.5" /> Edit
                      </Button>
                    ) : null}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Phase1aFormDialog
        open={linkOpen !== null}
        onOpenChange={(open) => {
          if (!open) setLinkOpen(null);
        }}
        title="Hubungkan Anak"
        description="Pilih siswa untuk dihubungkan ke orang tua ini (mendukung 1 ortu → ≥2 anak)."
        fields={[]}
        values={linkForm}
        onChange={(name, value) => setLinkForm((prev) => ({ ...prev, [name]: value }))}
        onSubmit={() => linkMutation.mutate()}
        isSubmitting={linkMutation.isPending}
        submitLabel="Hubungkan"
        extra={
          <Phase1aSelectField
            id="fase1a-studentId"
            label="Siswa"
            value={linkForm.studentId ?? ''}
            onChange={(v) => setLinkForm((prev) => ({ ...prev, studentId: v }))}
            options={students
              .filter((s) => {
                const linked = linkOpen
                  ? parents.find((p) => p.id === linkOpen)?.parentStudents.some((l) => l.student.id === s.id)
                  : false;
                return !linked;
              })
              .map((s) => ({
                value: s.id,
                label: `${s.user.name} (${s.user.email})`,
                imageUrl: s.user.avatarUrl,
              }))}
            placeholder={studentsLoading ? 'Memuat...' : 'Pilih siswa...'}
            required
          />
        }
      />
      <ConfirmDialog
        open={unlinkTarget !== null}
        onOpenChange={(open) => {
          if (!open) setUnlinkTarget(null);
        }}
        title="Lepas relasi orang tua-anak?"
        description={`Relasi ${unlinkTarget?.label ?? ''} akan dilepas. Akun tidak dihapus.`}
        confirmLabel="Ya, lepas"
        pending={unlinkMutation.isPending}
        onConfirm={() => {
          if (unlinkTarget)
            unlinkMutation.mutate({
              parentId: unlinkTarget.parentId,
              studentId: unlinkTarget.studentId,
            });
        }}
      />
    </>
  );
}
