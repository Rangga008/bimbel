"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/lib/api-client";
import type { ManagedUser, RoleItem } from "@/lib/users-types";

export function AccountRoleDialog({
  user,
  roles,
  onClose,
}: {
  user: ManagedUser | null;
  roles: RoleItem[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const assign = useMutation({
    mutationFn: (roleId: string) =>
      apiFetch(`/users/${user!.id}/roles`, { method: "POST", body: { roleId } }),
    onSuccess: () => {
      toast.success("Role ditambahkan.");
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : "Gagal assign role."),
  });

  return (
    <Dialog open={!!user} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Kelola Role</DialogTitle>
          <DialogDescription>
            {user?.email} — role: {(user?.roles ?? []).join(", ") || "tanpa role"}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {roles.map((r) => {
            const owned = user?.roles.includes(r.name);
            return (
              <div key={r.id} className="flex items-center justify-between gap-2 text-sm">
                <span>{r.name}</span>
                <Button
                  size="sm"
                  variant={owned ? "outline" : "default"}
                  disabled={assign.isPending || owned}
                  onClick={() => assign.mutate(r.id)}
                >
                  {owned ? "Sudah punya" : "Tambah"}
                </Button>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
