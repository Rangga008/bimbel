"use client";

import { useCallback, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { ArrowLeft, BookOpen, FileText, GraduationCap, Layers, Settings2, Tag } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { apiFetch } from '@/lib/api-client';
import {
  applyDrill,
  categoryLabel,
  DRILL_ALL,
  DRILL_NONE,
  drillBuckets,
  drillFromParams,
  tingkatCode,
  type ContentCategoryItem,
  type DrillValue,
  type HierarchyLevel,
  type TaxonomyItem,
} from '@/lib/content-taxonomy';

function DrillCard({
  icon: Icon,
  title,
  sub,
  dashed,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  sub?: string;
  dashed?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:border-brand-blue-500 hover:ring-2 hover:ring-brand-blue-500/20 ${dashed ? 'border-dashed' : ''}`}
    >
      <div className={`flex size-11 shrink-0 items-center justify-center rounded-lg ${dashed ? 'bg-muted text-muted-foreground' : 'bg-brand-blue-50 text-primary'}`}>
        <Icon className="size-5" />
      </div>
      <div className="min-w-0">
        <p className="truncate font-medium">{title}</p>
        {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
      </div>
    </button>
  );
}

/** Hierarki jenjang→mapel dari master data (GET /levels membawa
 *  levelSubjects). Role tanpa akses (mis. siswa) mendapat undefined —
 *  drill lalu jatuh ke mode turunan-item. */
export function useContentLevels() {
  return useQuery({
    queryKey: ['content-hierarchy-levels'],
    queryFn: () => apiFetch<HierarchyLevel[]>('/levels'),
    retry: false,
    staleTime: 60_000,
  });
}

/** State drill yang tersinkron ke query string (?g=&l=&s=&c=) via
 *  history.replaceState — tidak menambah entri riwayat browser, tapi posisi
 *  drill ikut tersimpan di URL sehingga kembali dari halaman lain
 *  (buat/edit/player) atau browser-back memulihkan posisi semula. */
export function useDrillState(): [
  DrillValue,
  (v: DrillValue | ((prev: DrillValue) => DrillValue)) => void,
] {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [drill, setDrill] = useState<DrillValue>(() =>
    drillFromParams((k) => searchParams.get(k)),
  );

  const update = useCallback(
    (v: DrillValue | ((prev: DrillValue) => DrillValue)) => {
      setDrill((prev) => {
        const d = typeof v === 'function' ? v(prev) : v;
        if (typeof window !== 'undefined') {
          // Pertahankan param non-drill (mis. play=, exam=) yang sedang aktif.
          const p = new URLSearchParams(window.location.search);
          p.delete('g');
          p.delete('l');
          p.delete('s');
          p.delete('c');
          if (d.gradeLevelId) p.set('g', d.gradeLevelId);
          if (d.levelId) p.set('l', d.levelId);
          if (d.subjectId) p.set('s', d.subjectId);
          if (d.category) p.set('c', d.category);
          const qs = p.toString();
          window.history.replaceState(null, '', `${pathname}${qs ? `?${qs}` : ''}`);
        }
        return d;
      });
    },
    [pathname],
  );

  return [drill, update];
}

/** Kategori/tipe konten dinamis dari master data (semua role boleh baca). */
export function useContentCategories() {
  return useQuery({
    queryKey: ['content-categories'],
    queryFn: () => apiFetch<ContentCategoryItem[]>('/content-categories'),
    staleTime: 60_000,
  });
}

/** Breadcrumb langkah drill — dipakai juga saat daftar sudah tampil. */
export function DrillBreadcrumb({
  items,
  levels,
  categories,
  value,
  onChange,
}: {
  items: TaxonomyItem[];
  levels?: HierarchyLevel[];
  categories?: ContentCategoryItem[];
  value: DrillValue;
  onChange: (v: DrillValue) => void;
}) {
  const masterLevel = levels?.find((l) => l.id === value.levelId);
  const gradeName =
    value.gradeLevelId === DRILL_ALL ? 'Semua Tingkat'
    : value.gradeLevelId === DRILL_NONE ? 'Lainnya'
    : value.gradeLevelId;
  const levelName =
    value.levelId === DRILL_ALL ? 'Semua Jenjang'
    : value.levelId === 'none' ? 'Tanpa Jenjang'
    : masterLevel?.name
      ?? items.find((i) => i.level?.id === value.levelId)?.level?.name
      ?? 'Jenjang';
  const subjectName =
    value.subjectId === DRILL_ALL ? 'Semua Mapel'
    : value.subjectId === 'none' ? 'Tanpa Mapel'
    : masterLevel?.levelSubjects?.find((ls) => ls.subject?.id === value.subjectId)?.subject?.name
      ?? items.find((i) => i.subject?.id === value.subjectId)?.subject?.name
      ?? 'Mapel';
  const catName = value.category === DRILL_ALL ? 'Semua Tipe' : categoryLabel(value.category === 'none' ? null : value.category, categories);

  const crumbs = [
    { label: levels?.length ? 'Semua Tingkat' : 'Semua Jenjang', onClick: () => onChange({ gradeLevelId: '', levelId: '', subjectId: '', category: '' }) },
    value.gradeLevelId ? { label: gradeName, onClick: () => onChange({ ...value, levelId: '', subjectId: '', category: '' }) } : null,
    value.levelId ? { label: levelName, onClick: () => onChange({ ...value, subjectId: '', category: '' }) } : null,
    value.subjectId ? { label: subjectName, onClick: () => onChange({ ...value, category: '' }) } : null,
    value.category ? { label: catName, onClick: () => {} } : null,
  ].filter(Boolean) as { label: string; onClick: () => void }[];

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-sm">
      {crumbs.map((c, idx) => (
        <span key={idx} className="flex items-center gap-1.5">
          {idx > 0 && <span className="text-muted-foreground">›</span>}
          <button
            type="button"
            onClick={c.onClick}
            className={idx === crumbs.length - 1 ? 'font-medium' : 'font-medium text-primary hover:underline'}
          >
            {idx === 0 && idx !== crumbs.length - 1 ? <ArrowLeft className="mr-1 inline size-3.5" /> : null}
            {c.label}
          </button>
        </span>
      ))}
    </div>
  );
}

/** Drill-down kartu: Jenjang → Mapel → Tipe. Berhenti saat ketiganya
 *  diputuskan; parent lalu menampilkan daftar item terfilter. */
export function ContentDrilldown({
  items,
  levels,
  categories,
  value,
  onChange,
  itemNoun,
  loading,
  onManageCategories,
}: {
  items: TaxonomyItem[];
  /** Master data jenjang (+levelSubjects). Bila kosong/undefined —
   *  mis. role siswa tanpa akses /levels — bucket diturunkan dari item. */
  levels?: HierarchyLevel[];
  /** Kategori dinamis dari /content-categories; fallback ke bawaan. */
  categories?: ContentCategoryItem[];
  value: DrillValue;
  onChange: (v: DrillValue) => void;
  itemNoun: string;
  loading?: boolean;
  /** Bila diisi, langkah tipe menampilkan kartu "Kelola Tipe" (admin/tutor). */
  onManageCategories?: () => void;
}) {
  // Dengan master data: Tingkat → Jenjang → Mapel → Tipe.
  // Tanpa master data (siswa): Jenjang → Mapel → Tipe dari item.
  const hasMaster = !!levels?.length;
  const step: 'grade' | 'level' | 'subject' | 'category' =
    hasMaster && !value.gradeLevelId ? 'grade'
    : !value.levelId ? 'level'
    : !value.subjectId ? 'subject'
    : 'category';
  const pool =
    step === 'grade'
      ? items
      : step === 'level'
        ? applyDrill(items, { gradeLevelId: value.gradeLevelId, levelId: DRILL_ALL, subjectId: DRILL_ALL, category: DRILL_ALL }, levels)
        : step === 'subject'
          ? applyDrill(items, { gradeLevelId: value.gradeLevelId, levelId: value.levelId, subjectId: DRILL_ALL, category: DRILL_ALL }, levels)
          : applyDrill(items, { gradeLevelId: value.gradeLevelId, levelId: value.levelId, subjectId: value.subjectId, category: DRILL_ALL }, levels);
  const countOf = (pred: (i: TaxonomyItem) => boolean) => pool.filter(pred).length;

  // Langkah tingkat/jenjang/mapel didorong master data bila tersedia —
  // semua tingkat, jenjang & mapel tampil meski belum ada konten.
  // Langkah tipe selalu menampilkan kelima kategori tetap.
  const gradeMatch = (l: HierarchyLevel) =>
    value.gradeLevelId === DRILL_ALL ? true
    : value.gradeLevelId === DRILL_NONE ? !tingkatCode(l)
    : tingkatCode(l) === value.gradeLevelId;
  const gradeBuckets = () => {
    const map = new Map<string, { id: string; name: string; sub?: string; count: number; sort: number }>();
    for (const l of levels!) {
      const t = tingkatCode(l);
      const id = t ?? DRILL_NONE;
      const cur = map.get(id) ?? {
        id,
        name: t ?? 'Lainnya',
        sub: undefined,
        count: 0,
        sort: l.gradeLevel?.sortOrder ?? 9999,
      };
      cur.count += countOf((i) => i.level?.id === l.id);
      cur.sort = Math.min(cur.sort, l.gradeLevel?.sortOrder ?? 9999);
      map.set(id, cur);
    }
    // Item tanpa jenjang ikut bucket "Lainnya".
    const unlevel = countOf((i) => !i.level);
    if (unlevel > 0) {
      const cur = map.get(DRILL_NONE) ?? { id: DRILL_NONE, name: 'Lainnya', sub: undefined, count: 0, sort: 9999 };
      cur.count += unlevel;
      map.set(DRILL_NONE, cur);
    }
    return [...map.values()].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  };
  const selectedLevel = levels?.find((l) => l.id === value.levelId);
  const catList = categories ?? [];
  const buckets =
    step === 'grade'
      ? gradeBuckets()
      : step === 'level' && levels?.length
      ? [
          ...levels.filter(gradeMatch).map((l) => ({
            id: l.id,
            name: l.name,
            sub: l.program?.name,
            count: countOf((i) => i.level?.id === l.id),
          })),
          ...(countOf((i) => !i.level) > 0
            ? [{ id: DRILL_NONE, name: 'Tanpa Jenjang', sub: undefined, count: countOf((i) => !i.level) }]
            : []),
        ]
      : step === 'subject' && selectedLevel
        ? [
            ...(selectedLevel.levelSubjects ?? [])
              .map((ls) => ls.subject)
              .filter((s): s is { id: string; name: string } => !!s)
              .map((s) => ({ id: s.id, name: s.name, sub: undefined, count: countOf((i) => i.subject?.id === s.id) })),
            // Mapel terpakai tapi tak terdaftar di master jenjang ini.
            ...drillBuckets(pool, 'subject').filter(
              (b) => b.id !== DRILL_NONE && !(selectedLevel.levelSubjects ?? []).some((ls) => ls.subject?.id === b.id),
            ),
            ...(countOf((i) => !i.subject) > 0
              ? [{ id: DRILL_NONE, name: 'Tanpa Mapel', sub: undefined, count: countOf((i) => !i.subject) }]
              : []),
          ]
        : step === 'category'
          ? [
              // Kategori dinamis dari master data; nilai lama yang sudah
              // dihapus/nonaktif tetap tampil sebagai kartu tersendiri.
              ...catList.map((c) => ({
                id: c.code,
                name: c.name,
                sub: undefined,
                count: countOf((i) => i.category === c.code),
              })),
              ...drillBuckets(pool, 'category', catList).filter(
                (b) => b.id !== DRILL_NONE && !catList.some((c) => c.code === b.id),
              ),
              ...(countOf((i) => !i.category) > 0
                ? [{ id: DRILL_NONE, name: categoryLabel(null), sub: undefined, count: countOf((i) => !i.category) }]
                : []),
            ]
          : drillBuckets(pool, step);

  const stepMeta = {
    grade: {
      icon: GraduationCap,
      title: 'Pilih Tingkat',
      desc: `${itemNoun} dikelompokkan per tingkat sekolah dulu — di dalamnya ada jenjang/kelas, lalu mapel, lalu tipe.`,
      allLabel: 'Semua Tingkat',
      allSub: `Lihat seluruh ${itemNoun.toLowerCase()}`,
    },
    level: {
      icon: Layers,
      title: 'Pilih Jenjang',
      desc: 'Jenjang/kelas dalam tingkat yang dipilih.',
      allLabel: 'Semua Jenjang',
      allSub: `Semua jenjang di tingkat ini`,
    },
    subject: {
      icon: BookOpen,
      title: 'Pilih Mapel',
      desc: 'Mapel dalam jenjang yang dipilih.',
      allLabel: 'Semua Mapel',
      allSub: `Semua mapel di jenjang ini`,
    },
    category: {
      icon: Tag,
      title: 'Pilih Tipe',
      desc: 'Harian, UTS, TO, UAS, atau ujian bab/materi.',
      allLabel: 'Semua Tipe',
      allSub: `Semua tipe di mapel ini`,
    },
  }[step];

  const setStep = (id: string) => {
    if (step === 'grade') onChange({ gradeLevelId: id, levelId: '', subjectId: '', category: '' });
    else if (step === 'level') onChange({ ...value, levelId: id, subjectId: '', category: '' });
    else if (step === 'subject') onChange({ ...value, subjectId: id, category: '' });
    else onChange({ ...value, category: id });
  };

  return (
    <div className="flex flex-col gap-4">
      <DrillBreadcrumb items={items} levels={levels} categories={categories} value={value} onChange={onChange} />
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{stepMeta.title}</h2>
        <p className="text-sm text-muted-foreground">{stepMeta.desc}</p>
      </div>
      {loading ? <Skeleton className="h-40 w-full" /> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {buckets.map((b) => (
          <DrillCard
            key={b.id}
            icon={stepMeta.icon}
            title={b.name}
            sub={[b.sub, `${b.count} ${itemNoun.toLowerCase()}`].filter(Boolean).join(' · ')}
            onClick={() => setStep(b.id)}
          />
        ))}
        <DrillCard
          icon={step === 'category' ? Tag : step === 'subject' ? FileText : step === 'level' ? Layers : GraduationCap}
          title={stepMeta.allLabel}
          sub={stepMeta.allSub}
          dashed
          onClick={() => setStep(DRILL_ALL)}
        />
        {step === 'category' && onManageCategories ? (
          <DrillCard
            icon={Settings2}
            title="Kelola Tipe"
            sub="Tambah/ubah kategori (Bab 1, Bab 2, …)"
            dashed
            onClick={onManageCategories}
          />
        ) : null}
      </div>
      {!loading && buckets.length === 0 && (
        <EmptyState icon={stepMeta.icon} title={`Belum ada ${itemNoun.toLowerCase()}`} description="Belum ada konten untuk pilihan ini." />
      )}
    </div>
  );
}
