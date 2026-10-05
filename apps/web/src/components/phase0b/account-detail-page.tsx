"use client";

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Mail, Phone, ShieldCheck, UserCog } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { UserAvatar } from '@/components/shared/user-avatar';
import { apiFetch } from '@/lib/api-client';
import type { ManagedUser } from '@/lib/users-types';

/** Halaman detail akun — profil lengkap (foto, kontak, role, permission). */
export function AccountDetailPage({ userId, basePath }: { userId: string; basePath: string }) {
  const userQ = useQuery({
    queryKey: ['users', userId],
    queryFn: () => apiFetch<ManagedUser>(`/users/${userId}`),
  });
  const u = userQ.data;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <Link href={`${basePath}/akun`} aria-label="Kembali ke manajemen akun">
          <Button variant="outline" size="icon"><ArrowLeft className="size-4" /></Button>
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{u ? u.name : 'Detail Akun'}</h1>
          <p className="truncate text-sm text-muted-foreground">{u?.email ?? 'Memuat...'}</p>
        </div>
      </div>
      {userQ.isLoading ? <Skeleton className="h-40 w-full" /> : null}
      {userQ.isError ? (
        <EmptyState
          icon={UserCog}
          title="Akun tidak ditemukan"
          description="Akun ini tidak ada atau Anda tidak memiliki akses."
          action={<Link href={`${basePath}/akun`}><Button size="sm" variant="outline">Kembali</Button></Link>}
        />
      ) : null}
      {u ? (
        <Card>
          <CardContent className="flex flex-col gap-4 py-4 sm:flex-row sm:items-start">
            <UserAvatar name={u.name} avatarUrl={u.avatarUrl} className="size-20 text-xl" />
            <div className="min-w-0 flex-1">
              <p className="text-lg font-semibold">{u.name}</p>
              <p className="flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                <Mail className="size-3.5 shrink-0" /> {u.email}
              </p>
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Phone className="size-3.5 shrink-0" /> {u.phone || '—'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Terdaftar {new Date(u.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
            <Badge variant={u.isActive ? 'secondary' : 'outline'}>{u.isActive ? 'Aktif' : 'Nonaktif'}</Badge>
          </CardContent>
        </Card>
      ) : null}
      {u ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Card>
            <CardContent className="py-4">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><ShieldCheck className="size-4" /> Role</p>
              <div className="flex flex-wrap gap-1.5">
                {u.roles.length === 0 ? <span className="text-xs text-muted-foreground">Tanpa role</span> : null}
                {u.roles.map((r) => <Badge key={r} variant="secondary">{r}</Badge>)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="mb-2 text-sm font-semibold">Permission ({u.permissions.length})</p>
              <div className="flex max-h-40 flex-wrap gap-1 overflow-y-auto">
                {u.permissions.map((p) => <Badge key={p} variant="outline" className="text-[10px]">{p}</Badge>)}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
