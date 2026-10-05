"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { UserAvatar } from "@/components/shared/user-avatar";
import { ComboboxField } from "@/components/shared/combobox-field";
import type { ManagedUser, RoleItem } from "@/lib/users-types";
import { useAuthStore } from "@/stores/auth-store";
import {
  Phase1aFormDialog,
  type Phase1aField,
} from "@/components/phase1a/phase1a-form-dialog";
import { AccountRoleDialog } from "./account-role-dialog";

const CREATE_FIELDS: Phase1aField[] = [
  { name: "name", label: "Nama lengkap", required: true },
  { name: "email", label: "Email", type: "email", required: true },
  { name: "tempPassword", label: "Temporary password (min 8)", required: true },
  { name: "phone", label: "No. HP (opsional)" },
];

const EDIT_FIELDS: Phase1aField[] = [
  { name: "name", label: "Nama" },
  { name: "email", label: "Email", type: "email" },
  { name: "phone", label: "No. HP" },
];

const RESET_FIELDS: Phase1aField[] = [
  { name: "newPassword", label: "Password baru (min 8)", required: true },
];

function err(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}

/** Fase 0b — Halaman "Manajemen Akun" (Owner/Admin). */
export function AccountsManager({ basePath }: { basePath: string }) {
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const canManage = me?.permissions.includes("users.manage") ?? false;
  const canReset = me?.permissions.includes("users.reset_password") ?? false;

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<Record<string, string>>({});
  const [createRoles, setCreateRoles] = useState<string[]>([]);
  const [editUser, setEditUser] = useState<ManagedUser | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [resetUser, setResetUser] = useState<ManagedUser | null>(null);
  const [resetForm, setResetForm] = useState<Record<string, string>>({});
  const [userToToggle, setUserToToggle] = useState<ManagedUser | null>(null);
  const [roleUser, setRoleUser] = useState<ManagedUser | null>(null);

  const usersQuery = useQuery({
    queryKey: ["users", debouncedSearch, roleFilter, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (roleFilter) params.set("role", roleFilter);
      if (statusFilter) params.set("isActive", statusFilter === "aktif" ? "true" : "false");
      const qs = params.toString();
      return apiFetch<ManagedUser[]>(`/users${qs ? `?${qs}` : ""}`);
    },
  });
  const rolesQuery = useQuery({
    queryKey: ["user-roles"],
    queryFn: () => apiFetch<RoleItem[]>("/users/roles"),
    enabled: canManage,
  });
  const inv = () => qc.invalidateQueries({ queryKey: ["users"] });

  const createMutation = useMutation({
    mutationFn: () =>
      apiFetch<ManagedUser>("/users", {
        method: "POST",
        body: {
          name: createForm.name,
          email: createForm.email,
          phone: createForm.phone || undefined,
          tempPassword: createForm.tempPassword,
          roleIds: createRoles,
        },
      }),
    onSuccess: (u) => {
      toast.success(`Akun ${u.email} dibuat — sampaikan temporary password ke user.`);
      setCreateOpen(false);
      setCreateForm({});
      setCreateRoles([]);
      inv();
    },
    onError: (e) => toast.error(err(e, "Gagal membuat akun.")),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      apiFetch<ManagedUser>(`/users/${editUser!.id}`, {
        method: "PATCH",
        body: {
          name: editForm.name || undefined,
          email: editForm.email || undefined,
          phone: editForm.phone || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Akun diperbarui.");
      setEditUser(null);
      inv();
    },
    onError: (e) => toast.error(err(e, "Gagal memperbarui akun.")),
  });

  const toggleMutation = useMutation({
    mutationFn: (u: ManagedUser) =>
      apiFetch<ManagedUser>(`/users/${u.id}/${u.isActive ? "deactivate" : "activate"}`, {
        method: "POST",
      }),
    onSuccess: (u) => {
      setUserToToggle(null);
      toast.success(u.isActive ? "Akun diaktifkan." : "Akun dinonaktifkan — user tidak bisa login lagi.");
      inv();
    },
    onError: (e) => toast.error(err(e, "Gagal mengubah status akun.")),
  });

  const resetMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/users/${resetUser!.id}/reset-password`, {
        method: "POST",
        body: { newPassword: resetForm.newPassword },
      }),
    onSuccess: () => {
      toast.success("Password baru tersimpan — sampaikan ke user.");
      setResetUser(null);
      setResetForm({});
    },
    onError: (e) => toast.error(err(e, "Gagal reset password.")),
  });

  if (!canManage) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Anda tidak memiliki permission <code>users.manage</code> untuk membuka halaman ini.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Manajemen Akun</h1>
          <p className="text-sm text-muted-foreground">
            {usersQuery.data ? `${usersQuery.data.length} akun terdaftar` : "Memuat data akun..."}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>Buat Akun</Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <Input
          placeholder="Cari nama / email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <ComboboxField
          id="filter-role"
          label=""
          value={roleFilter}
          onChange={setRoleFilter}
          options={[
            { value: "", label: "Semua role" },
            ...(rolesQuery.data ?? []).map((r) => ({ value: r.name, label: r.name })),
          ]}
          placeholder="Semua role"
        />
        <ComboboxField
          id="filter-status"
          label=""
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: "", label: "Semua status" },
            { value: "aktif", label: "Aktif" },
            { value: "nonaktif", label: "Nonaktif" },
          ]}
          placeholder="Semua status"
        />
      </div>

      {usersQuery.isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : null}

      {usersQuery.isError ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-destructive">
            Gagal memuat data akun — cek koneksi / permission Anda.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {usersQuery.data?.map((u) => (
          <Card key={u.id}>
            <CardContent className="flex flex-col gap-2 py-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <UserAvatar name={u.name} avatarUrl={u.avatarUrl} className="size-10" />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{u.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                    {u.phone ? <p className="truncate text-xs text-muted-foreground">{u.phone}</p> : null}
                  </div>
                </div>
                <Badge variant={u.isActive ? "secondary" : "outline"}>
                  {u.isActive ? "Aktif" : "Nonaktif"}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-1">
                {u.roles.length === 0 ? (
                  <Badge variant="outline">tanpa role</Badge>
                ) : (
                  u.roles.map((r) => <Badge key={r} variant="outline">{r}</Badge>)
                )}
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <Link href={`${basePath}/akun/${u.id}`}>
                  <Button size="sm" variant="outline">Profil</Button>
                </Link>
                <Button size="sm" variant="outline" onClick={() => { setEditUser(u); setEditForm({ name: u.name, email: u.email, phone: u.phone ?? "" }); }}>
                  Edit
                </Button>
                <Button size="sm" variant="outline" onClick={() => setRoleUser(u)}>
                  Role
                </Button>
                {canReset ? (
                  <Button size="sm" variant="outline" onClick={() => { setResetUser(u); setResetForm({}); }}>
                    Reset PW
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant={u.isActive ? "destructive" : "outline"}
                  disabled={toggleMutation.isPending || (me?.id === u.id && u.isActive)}
                  title={me?.id === u.id ? "Tidak bisa menonaktifkan akun sendiri" : undefined}
                  onClick={() => setUserToToggle(u)}
                >
                  {u.isActive ? "Nonaktifkan" : "Aktifkan"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Phase1aFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Buat Akun Baru"
        description="Pilih role di bawah — akun Orang Tua/Siswa/Tutor otomatis dibuatkan profilnya. Langsung bisa dipakai login dengan temporary password."
        fields={CREATE_FIELDS}
        values={createForm}
        onChange={(n, v) => setCreateForm((p) => ({ ...p, [n]: v }))}
        onSubmit={() => createMutation.mutate()}
        isSubmitting={createMutation.isPending}
        submitLabel="Buat Akun"
        extra={
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Role akun</span>
            <div className="flex flex-wrap gap-2">
              {(rolesQuery.data ?? []).map((r) => (
                <Button
                  key={r.id}
                  type="button"
                  size="sm"
                  variant={createRoles.includes(r.id) ? "default" : "outline"}
                  onClick={() =>
                    setCreateRoles((p) =>
                      p.includes(r.id) ? p.filter((x) => x !== r.id) : [...p, r.id],
                    )
                  }
                >
                  {r.name}
                </Button>
              ))}
            </div>
          </div>
        }
      />

      <Phase1aFormDialog
        open={!!editUser}
        onOpenChange={(o) => { if (!o) setEditUser(null); }}
        title="Edit Akun"
        description={editUser?.email}
        fields={EDIT_FIELDS}
        values={editForm}
        onChange={(n, v) => setEditForm((p) => ({ ...p, [n]: v }))}
        onSubmit={() => updateMutation.mutate()}
        isSubmitting={updateMutation.isPending}
        submitLabel="Simpan"
      />

      <Phase1aFormDialog
        open={!!resetUser}
        onOpenChange={(o) => { if (!o) setResetUser(null); }}
        title="Reset Password"
        description={`Password baru untuk ${resetUser?.email ?? ""}. Sesi lama user di-revoke otomatis.`}
        fields={RESET_FIELDS}
        values={resetForm}
        onChange={(n, v) => setResetForm((p) => ({ ...p, [n]: v }))}
        onSubmit={() => resetMutation.mutate()}
        isSubmitting={resetMutation.isPending}
        submitLabel="Reset Password"
      />

      <AccountRoleDialog user={roleUser} roles={rolesQuery.data ?? []} onClose={() => setRoleUser(null)} />

      <ConfirmDialog
        open={userToToggle !== null}
        onOpenChange={(o) => {
          if (!o) setUserToToggle(null);
        }}
        title={userToToggle?.isActive ? "Nonaktifkan akun?" : "Aktifkan akun?"}
        description={
          userToToggle?.isActive
            ? `Akun "${userToToggle?.name}" (${userToToggle?.email}) tidak akan bisa login sampai diaktifkan kembali.`
            : `Akun "${userToToggle?.name}" (${userToToggle?.email}) akan bisa login kembali.`
        }
        confirmLabel={userToToggle?.isActive ? "Ya, nonaktifkan" : "Ya, aktifkan"}
        tone={userToToggle?.isActive ? "destructive" : "primary"}
        pending={toggleMutation.isPending}
        onConfirm={() => userToToggle && toggleMutation.mutate(userToToggle)}
      />
    </div>
  );
}

