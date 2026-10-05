"use client";
import { useState } from 'react';
import { LatsolPackagesManager } from './latsol-packages-manager';
import { LatsolPlayer } from './latsol-player';
import { LatsolAttemptsHistory } from './latsol-attempts-history';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/** Fase 3b — Halaman utama Latsol untuk Siswa, Tutor, dan Admin Academic. */
export function LatsolPage({ canManage, basePath = '/latsol' }: { canManage: boolean; basePath?: string }) {
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'play' | 'history'>('list');

  const handlePlayPackage = (packageId: string) => {
    setSelectedPackageId(packageId);
    setView('play');
  };

  const handleBackToList = () => {
    setSelectedPackageId(null);
    setView('list');
  };

  if (view === 'play' && selectedPackageId) {
    return <LatsolPlayer packageId={selectedPackageId} onBack={handleBackToList} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Latsol</h1>
        <p className="text-sm text-muted-foreground">
          Latihan soal dengan feedback instan. Beda dari ujian resmi, kerjakan kapan saja.
        </p>
      </div>

      {canManage ? (
        <LatsolPackagesManager canManage basePath={basePath} onPlay={handlePlayPackage} />
      ) : (
        <Tabs value={view} onValueChange={(v) => setView(v as 'list' | 'play' | 'history')} className="w-full">
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
