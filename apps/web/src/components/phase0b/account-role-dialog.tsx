"use client";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
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
	const me = useAuthStore((s) => s.user);
	// Ambil data user segar — snapshot dari list bisa basi setelah tambah/hapus role.
	const userQ = useQuery({
		queryKey: ["user", user?.id],
		queryFn: () => apiFetch<ManagedUser>(`/users/${user!.id}`),
		enabled: !!user,
	});
	const live = userQ.data ?? user;

	const refresh = () => {
		qc.invalidateQueries({ queryKey: ["users"] });
		qc.invalidateQueries({ queryKey: ["user", user?.id] });
	};

	const assign = useMutation({
		mutationFn: (roleId: string) =>
			apiFetch(`/users/${user!.id}/roles`, { method: "POST", body: { roleId } }),
		onSuccess: () => {
			toast.success("Role ditambahkan.");
			refresh();
		},
		onError: (e) =>
			toast.error(e instanceof ApiError ? e.message : "Gagal assign role."),
	});

	const revoke = useMutation({
		mutationFn: (roleId: string) =>
			apiFetch(`/users/${user!.id}/roles/${roleId}`, { method: "DELETE" }),
		onSuccess: () => {
			toast.success("Role dihapus.");
			refresh();
		},
		onError: (e) =>
			toast.error(e instanceof ApiError ? e.message : "Gagal menghapus role."),
	});

	const busy = assign.isPending || revoke.isPending;
	const isSelf = !!me && me.id === user?.id;
	const actorIsOwner = me?.roles.includes("OWNER") ?? false;

	return (
		<Dialog open={!!user} onOpenChange={(o) => { if (!o) onClose(); }}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Kelola Role</DialogTitle>
					<DialogDescription>
						{live?.email} — role: {(live?.roles ?? []).join(", ") || "tanpa role"}
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-2">
					{roles.map((r) => {
						const owned = live?.roles.includes(r.name);
						// Role OWNER hanya bisa ditambah/dicabut oleh Owner; role akun
						// sendiri tidak bisa dicabut (backend juga menolak).
						const locked = r.name === "OWNER" && !actorIsOwner;
						return (
							<div key={r.id} className="flex items-center justify-between gap-2 text-sm">
								<span>
									{r.name}
									{locked ? (
										<span className="ml-2 text-xs text-muted-foreground">(khusus Owner)</span>
									) : null}
								</span>
								<Button
									size="sm"
									variant={owned ? "outline" : "default"}
									className={owned ? "text-destructive hover:text-destructive" : ""}
									disabled={busy || locked || (owned && isSelf)}
									onClick={() => (owned ? revoke.mutate(r.id) : assign.mutate(r.id))}
								>
									{owned ? "Hapus" : "Tambah"}
								</Button>
							</div>
						);
					})}
				</div>
				{isSelf ? (
					<p className="text-xs text-muted-foreground">
						Role akun sendiri tidak bisa dicabut — minta admin/owner lain.
					</p>
				) : null}
			</DialogContent>
		</Dialog>
	);
}
