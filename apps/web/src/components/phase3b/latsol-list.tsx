"use client";
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api-client';
import type { LatsolPackageItem } from '@/lib/phase3b-types';

export function LatsolList() {
  const [search, setSearch] = useState('');
  const listQ = useQuery({
    queryKey: ['latsol-packages', search],
    queryFn: () => {
      const p = new URLSearchParams();
      if (search) p.set('search', search);
      const qs = p.toString();
      return apiFetch<LatsolPackageItem[]>(`/latsol/packages${qs ? `?${qs}` : ''}`);
    },
  });
  return (
    <div className="flex flex-col gap-3">
      <Input placeholder="Cari paket..." value={search} onChange={(e) => setSearch(e.target.value)} />
      {listQ.isLoading ? <Skeleton className="h-20 w-full" /> : null}
      {(listQ.data ?? []).map((pkg) => (
        <Card key={pkg.id}>
          <CardContent className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{pkg.title}</p>
              <p className="text-xs text-muted-foreground">{pkg._count.items} soal</p>
            </div>
            <Badge variant="secondary">Aktif</Badge>
          </CardContent>
        </Card>
      ))}
      <Button variant="outline">Muat</Button>
    </div>
  );
}
