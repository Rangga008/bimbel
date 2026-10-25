"use client";

import Link from "next/link";
import { useState } from "react";
import { Ban, Eye, KeyRound, Pencil, Search, Trash2, UserCog } from "lucide-react";
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
import { ListPager } from "@/components/shared/list-pager";
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
  { name: "email", label: "Email (opsional — isi email atau no HP, salah satu)", type: "email" },
  { name: "tempPassword", label: "Temporary password (min 8)", required: true },
  { name: "phone", label: "No. HP (opsional — wajib bila email kosong)" },
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
  const [verifiedFilter, setVerifiedFilter] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<Record<string, string>>({});
  const [createRoles, setCreateRoles] = useState<string[]>([]);
  const [editUser, setEditUser] = useState<ManagedUser | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [resetUser, setResetUser] = useState<ManagedUser | null>(null);
  const [resetForm, setResetForm] = useState<Record<string, string>>({});
  const [userToToggle, setUserToToggle] = useState<ManagedUser | null>(null);
  const [userToDelete, setUserToDelete] = useState<ManagedUser | null>(null);
  const [roleUser, setRoleUser] = useState<ManagedUser | null>(null);

  const usersQuery = useQuery({
    queryKey: ["users", debouncedSearch, roleFilter, statusFilter, verifiedFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (roleFilter) params.set("role", roleFilter);
      if (statusFilter) params.set("isActive", statusFilter === "aktif" ? "true" : "false");
      if (verifiedFilter) params.set("phoneVerified", verifiedFilter);
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
          email: createForm.email?.trim() || undefined,
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

  const deleteMutation = useMutation({
    mutationFn: () => apiFetch(`/users/${userToDelete!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      setUserToDelete(null);
      toast.success("Akun dihapus — email & no HP-nya bisa dipakai daftar ulang.");
      inv();
    },
    onError: (e) => toast.error(err(e, "Gagal menghapus akun.")),
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

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Cari nama / email / HP..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-9"
          />
        </div>
        <div className="w-full sm:w-48">
          <ComboboxField
            id="filter-role"
            label=""
            value={roleFilter}
            onChange={(v) => { setRoleFilter(v); setPage(0); }}
            options={[
              { value: "", label: "Semua tipe akun" },
              ...(rolesQuery.data ?? []).map((r) => ({ value: r.name, label: r.name })),
            ]}
            placeholder="Semua tipe akun"
          />
        </div>
        <div className="w-full sm:w-40">
          <ComboboxField
            id="filter-status"
            label=""
            value={statusFilter}
            onChange={(v) => { setStatusFilter(v); setPage(0); }}
            options={[
              { value: "", label: "Semua status" },
              { value: "aktif", label: "Aktif" },
              { value: "nonaktif", label: "Nonaktif" },
            ]}
            placeholder="Semua status"
          />
        </div>
        <div className="w-full sm:w-44">
          <ComboboxField
            id="filter-verified"
            label=""
            value={verifiedFilter}
            onChange={(v) => { setVerifiedFilter(v); setPage(0); }}
            options={[
              { value: "", label: "Semua verifikasi" },
              { value: "true", label: "HP terverifikasi" },
              { value: "false", label: "HP belum terverifikasi" },
            ]}
            placeholder="Semua verifikasi"
          />
        </div>
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

      {(() => {
        const users = usersQuery.data ?? [];
        const pageCount = Math.ceil(users.length / pageSize);
        const paged = users.slice(page * pageSize, (page + 1) * pageSize);
        return (
          <>
            {users.length > 0 ? (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-3 py-2 text-left font-medium">Akun</th>
                      <th className="px-3 py-2 text-left font-medium">No. HP</th>
                      <th className="px-3 py-2 text-left font-medium">Tipe / Role</th>
                      <th className="px-3 py-2 text-left font-medium">Status</th>
                      <th className="px-3 py-2 text-right font-medium">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((u) => (
                      <tr key={u.id} className="border-b last:border-0">
                        <td className="px-3 py-2">
                          <span className="flex items-center gap-2">
                            <UserAvatar name={u.name} avatarUrl={u.avatarUrl} className="size-8" />
                            <span className="min-w-0">
                              <span className="block truncate font-medium">{u.name}</span>
                              <span className="block truncate text-xs text-muted-foreground">{u.email}</span>
                            </span>
                          </span>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                          {u.phone || "—"}
                        </td>
                        <td className="px-3 py-2">
                          <span className="flex flex-wrap gap-1">
                            {u.roles.length === 0 ? (
                              <Badge variant="outline">tanpa role</Badge>
                            ) : (
                              u.roles.map((r) => (
                                <Badge key={r} variant="outline">{r}</Badge>
                              ))
                            )}
                          </span>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <Badge variant={u.isActive ? "secondary" : "outline"}>
                            {u.isActive ? "Aktif" : "Nonaktif"}
                          </Badge>
                          {u.phoneVerifiedAt === null ? (
                            <Badge
                              variant="outline"
                              className="ml-1 border-amber-400 text-amber-700 dark:text-amber-400"
                              title="Nomor HP belum diverifikasi lewat WhatsApp"
                            >
                              HP belum verifikasi
                            </Badge>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-right">
                          <span className="inline-flex items-center gap-1">
                            <Link href={`${basePath}/akun/${u.id}`}>
                              <Button variant="ghost" size="icon-sm" aria-label={`Profil ${u.name}`} title="Profil">
                                <Eye className="size-4" />
                              </Button>
                            </Link>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Edit ${u.name}`}
                              title="Edit"
                              onClick={() => { setEditUser(u); setEditForm({ name: u.name, email: u.email, phone: u.phone ?? "" }); }}
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Role ${u.name}`}
                              title="Atur role"
                              onClick={() => setRoleUser(u)}
                            >
                              <UserCog className="size-4" />
                            </Button>
                            {canReset ? (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Reset password ${u.name}`}
                                title="Reset password"
                                onClick={() => { setResetUser(u); setResetForm({}); }}
                              >
                                <KeyRound className="size-4" />
                              </Button>
                            ) : null}
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`${u.isActive ? "Nonaktifkan" : "Aktifkan"} ${u.name}`}
                              title={
                                me?.id === u.id
                                  ? "Tidak bisa menonaktifkan akun sendiri"
                                  : u.isActive ? "Nonaktifkan" : "Aktifkan"
                              }
                              disabled={toggleMutation.isPending || (me?.id === u.id && u.isActive)}
                              onClick={() => setUserToToggle(u)}
                            >
                              <Ban className={u.isActive ? "size-4 text-warning-500" : "size-4 text-success-600"} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Hapus ${u.name}`}
                              title={me?.id === u.id ? "Tidak bisa menghapus akun sendiri" : "Hapus"}
                              disabled={deleteMutation.isPending || me?.id === u.id}
                              onClick={() => setUserToDelete(u)}
                            >
                              <Trash2 className="size-4 text-destructive" />
                            </Button>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {users.length === 0 && !usersQuery.isLoading && !usersQuery.isError ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  Tidak ada akun yang cocok dengan filter.
                </CardContent>
              </Card>
            ) : null}
            <ListPager
              page={page}
              pageCount={pageCount}
              total={users.length}
              shown={pageSize}
              onPageChange={setPage}
              pageSize={pageSize}
              onPageSizeChange={(s) => { setPageSize(s); setPage(0); }}
            />
          </>
        );
      })()}

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

      <ConfirmDialog
        open={userToDelete !== null}
        onOpenChange={(o) => {
          if (!o) setUserToDelete(null);
        }}
        title="Hapus akun?"
        description={`Akun "${userToDelete?.name}" (${userToDelete?.email}) akan dihapus permanen: dinonaktifkan, sesi dicabut, dan email/no HP-nya dibebaskan untuk pendaftaran ulang. Riwayat transaksi & audit tetap tersimpan.`}
        confirmLabel="Ya, hapus akun"
        tone="destructive"
        pending={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  );
}

