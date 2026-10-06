"use client";
import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { LatsolPackagesManager } from './latsol-packages-manager';
import { LatsolPlayer } from './latsol-player';
import { LatsolAttemptsHistory } from './latsol-attempts-history';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/** Fase 3b — Halaman utama Latsol untuk Siswa, Tutor, dan Admin Academic. */
export function LatsolPage({ canManage, basePath = '/latsol' }: { canManage: boolean; basePath?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'play' | 'history'>('list');

  // Deep-link dari materi: /…/latsol?play=<packageId> langsung membuka player.
  // Klik "Kerjakan" juga men-push ?play= — browser-back menutup player dan
  // posisi drill (?g&l&s&c) ikut terbawa di URL yang sama.
  useEffect(() => {
    const play = searchParams.get('play');
    if (play) {
      setSelectedPackageId(play);
      setView('play');
    } else {
      setView((v) => (v === 'play' ? 'list' : v));
    }
  }, [searchParams]);

  const handlePlayPackage = (packageId: string) => {
    const p = new URLSearchParams(searchParams.toString());
    p.set('play', packageId);
    router.push(`${pathname}?${p.toString()}`);
    setSelectedPackageId(packageId);
    setView('play');
  };

  const handleBackToList = () => {
    const p = new URLSearchParams(searchParams.toString());
    p.delete('play');
    const qs = p.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ''}`);
    setSelectedPackageId(null);
    setView('list');
  };

  if (view === 'play' && selectedPackageId) {
    return <LatsolPlayer packageId={selectedPackageId} onBack={handleBackToList} />;
  }

  return (
    <div className="flex flex-col gap-4">
      {canManage ? (
        <LatsolPackagesManager canManage basePath={basePath} onPlay={handlePlayPackage} />
      ) : (
        <Tabs value={view === 'history' ? 'history' : 'list'} onValueChange={(v) => setView(v as 'list' | 'play' | 'history')} className="w-full">
          <TabsList>
            <TabsTrigger value="list">Daftar Paket</TabsTrigger>
            <TabsTrigger value="history">Riwayat</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="mt-4">
            <LatsolPackagesManager canManage={false} basePath={basePath} onPlay={handlePlayPackage} />
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <LatsolAttemptsHistory />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
