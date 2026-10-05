/** Taksonomi konten: Tingkat → Jenjang → Mapel → Tipe.
 *  Dipakai materi, bank soal, paket latsol, dan ujian. Kategori/tipe kini
 *  dinamis — dikelola via tabel `content_categories` (GET /content-categories);
 *  daftar di bawah hanya fallback bila endpoint belum termuat. */
export interface ContentCategoryItem {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  isActive?: boolean;
}

export const CONTENT_CATEGORIES: { value: string; label: string }[] = [
  { value: 'HARIAN', label: 'Latihan / Ujian Harian' },
  { value: 'UTS', label: 'UTS' },
  { value: 'TO', label: 'Try Out (TO)' },
  { value: 'UAS', label: 'UAS' },
  { value: 'BAB', label: 'Ujian Bab / Materi' },
];

/** Label kategori dari daftar dinamis; fallback ke bawaan lalu kode mentah. */
export function categoryLabel(
  v?: string | null,
  categories?: { code: string; name: string }[],
): string {
  if (!v) return 'Tanpa Kategori';
  return (
    categories?.find((c) => c.code === v)?.name ??
    CONTENT_CATEGORIES.find((c) => c.value === v)?.label ??
    v
  );
}

/** Opsi {value,label} untuk select/combobox — dari kategori dinamis
 *  bila ada, fallback ke bawaan. */
export function categoryOptions(cats?: { code: string; name: string }[]) {
  return cats?.length
    ? cats.map((c) => ({ value: c.code, label: c.name }))
    : CONTENT_CATEGORIES.map((c) => ({ value: c.value, label: c.label }));
}

/** Item list minimal yang dibutuhkan drill-down — semua endpoint
 *  konten sudah menyertakan relasi level/subject/program. */
export interface TaxonomyItem {
  category?: string | null;
  level?: { id: string; name: string } | null;
  subject?: { id: string; name: string } | null;
  program?: { id: string; name: string } | null;
}

/** Nilai drill: '' = langkah belum diputuskan, 'ALL' = pilih "Semua",
 *  'none' = bucket item tanpa nilai. */
export interface DrillValue {
  gradeLevelId: string;
  levelId: string;
  subjectId: string;
  category: string;
}

export const DRILL_ALL = 'ALL';
export const DRILL_NONE = 'none';
export const DRILL_EMPTY: DrillValue = { gradeLevelId: '', levelId: '', subjectId: '', category: '' };

/** Hierarki master data dari GET /levels — tiap jenjang membawa
 *  gradeLevel (tingkat sekolah: SD/SMP/…) dan levelSubjects (mapel
 *  yang diajarkan di jenjang itu). */
export interface HierarchyLevel {
  id: string;
  name: string;
  code?: string | null;
  program?: { id: string; name: string } | null;
  gradeLevel?: { id: string; code?: string; name: string; sortOrder?: number } | null;
  levelSubjects?: { subject?: { id: string; name: string } | null }[];
}

/** Tingkat sekolah = prefix kode gradeLevel ('SD-5' → 'SD'). */
export function tingkatCode(l?: HierarchyLevel | null): string | undefined {
  return l?.gradeLevel?.code?.split('-')[0] || undefined;
}

/** true bila ketiga langkah sudah diputuskan (ALL/none/id asli). */
export function drillDone(d: DrillValue): boolean {
  return !!d.levelId && !!d.subjectId && !!d.category;
}

/** Terapkan pilihan drill ke daftar item (ALL = tak difilter).
 *  `levels` (master data) dipakai untuk memetakan item.level → tingkat
 *  sekolah; tanpa itu langkah tingkat diabaikan. */
export function applyDrill<T extends TaxonomyItem>(
  items: T[],
  d: DrillValue,
  levels?: HierarchyLevel[],
): T[] {
  const gradeOf = (levelId?: string) =>
    levelId ? tingkatCode(levels?.find((l) => l.id === levelId)) : undefined;
  return items.filter((i) => {
    if (d.gradeLevelId === DRILL_NONE && gradeOf(i.level?.id)) return false;
    if (
      d.gradeLevelId !== DRILL_ALL && d.gradeLevelId !== DRILL_NONE &&
      d.gradeLevelId && gradeOf(i.level?.id) !== d.gradeLevelId
    ) return false;
    if (d.levelId === DRILL_NONE && i.level) return false;
    if (d.levelId !== DRILL_ALL && d.levelId !== DRILL_NONE && d.levelId && i.level?.id !== d.levelId) return false;
    if (d.subjectId === DRILL_NONE && i.subject) return false;
    if (d.subjectId !== DRILL_ALL && d.subjectId !== DRILL_NONE && d.subjectId && i.subject?.id !== d.subjectId) return false;
    if (d.category === DRILL_NONE && i.category) return false;
    if (d.category !== DRILL_ALL && d.category !== DRILL_NONE && d.category && i.category !== d.category) return false;
    return true;
  });
}

interface Bucket {
  id: string;
  name: string;
  sub?: string;
  count: number;
}

/** Kelompokkan item jadi kartu langkah berikutnya. */
export function drillBuckets<T extends TaxonomyItem>(
  items: T[],
  step: 'level' | 'subject' | 'category',
  categories?: { code: string; name: string }[],
): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const i of items) {
    let id: string;
    let name: string;
    let sub: string | undefined;
    if (step === 'level') {
      id = i.level?.id ?? DRILL_NONE;
      name = i.level?.name ?? 'Tanpa Jenjang';
      sub = i.program?.name;
    } else if (step === 'subject') {
      id = i.subject?.id ?? DRILL_NONE;
      name = i.subject?.name ?? 'Tanpa Mapel';
    } else {
      id = i.category ?? DRILL_NONE;
      name = categoryLabel(i.category, categories);
    }
    const b = map.get(id);
    if (b) b.count += 1;
    else map.set(id, { id, name, sub, count: 1 });
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
