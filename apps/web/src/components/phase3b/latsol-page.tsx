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
  const siswaFocus = basePath === '/siswa/latsol';

  // Deep-link dari materi: /…/latsol?play=<packageId> langsung membuka player.
  // Klik "Kerjakan" juga men-push ?play= — browser-back menutup player dan
  // posisi drill (?g&l&s&c) ikut terbawa di URL yang sama.
  // Untuk siswa, player sekarang di halaman terpisah /siswa/latsol/<packageId>.
  useEffect(() => {
    const play = searchParams.get('play');
    if (play && siswaFocus) {
      const p = new URLSearchParams(searchParams.toString());
      p.delete('play');
      const qs = p.toString();
      router.replace(`/siswa/latsol/${play}${qs ? `?${qs}` : ''}`);
      return;
    }
    if (play) {
      setSelectedPackageId(play);
      setView('play');
    } else {
      setView((v) => (v === 'play' ? 'list' : v));
    }
  }, [searchParams, siswaFocus, router]);

  // Deep-link ?focus=<packageId> (mis. dari tombol latsol di halaman materi):
  // scroll + sorot kartu paket — tidak langsung membuka player.
  const focusId = searchParams.get('focus');
  useEffect(() => {
    if (!focusId) return;
    const t = setTimeout(() => {
      document.getElementById(`latsol-${focusId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
    return () => clearTimeout(t);
  }, [focusId, view]);

  const handlePlayPackage = (packageId: string) => {
    if (siswaFocus) {
      const p = new URLSearchParams(searchParams.toString());
      const qs = p.toString();
      router.push(`/siswa/latsol/${packageId}${qs ? `?${qs}` : ''}`);
      return;
    }
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
        <LatsolPackagesManager canManage basePath={basePath} onPlay={handlePlayPackage} focusId={focusId} />
      ) : (
        <Tabs value={view === 'history' ? 'history' : 'list'} onValueChange={(v) => setView(v as 'list' | 'play' | 'history')} className="w-full">
          <TabsList>
            <TabsTrigger value="list">Daftar Paket</TabsTrigger>
            <TabsTrigger value="history">Riwayat</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="mt-4">
            <LatsolPackagesManager canManage={false} basePath={basePath} onPlay={handlePlayPackage} focusId={focusId} />
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <LatsolAttemptsHistory />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
