import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

/** Tipe data GET /public/landing — dipakai landing + halaman /program. */

export interface LandingPackage {
  id: string;
  name: string;
  totalSessions: number;
  durationWeeks: number | null;
  price: string | null;
  description: string | null;
  /** Jumlah siswa aktif di kelompok yang memakai paket ini. */
  studentCount: number;
}

export interface LandingLevelSubject {
  subject?: { id: string; name: string } | null;
}

export interface LandingLevel {
  id: string;
  name: string;
  price: string | null;
  priceUnit: string | null;
  fullPayPrice: string | null;
  installment2x: string | null;
  monthlyAmount: string | null;
  monthlyCount: number | null;
  promoPrice: string | null;
  sessionPrices: unknown;
  sessionDurationMin: number | null;
  registrationFee: string | null;
  gradeLevel?: { id: string; code?: string; name: string; sortOrder?: number } | null;
  levelSubjects?: LandingLevelSubject[];
  packages: LandingPackage[];
}

export interface LandingProgram {
  id: string;
  name: string;
  code: string;
  description: string | null;
  category?: string | null;
  registrationFee?: string | null;
  levels: LandingLevel[];
}

export interface LandingFacility {
  id: string;
  name: string;
  capacity: number | null;
  photoUrl: string | null;
  buildingName: string | null;
}

export interface LandingLocation {
  name: string;
  address: string | null;
}

/** Satu slide foto hero — gambar + link klik opsional. */
export interface LandingHeroImage {
  url: string;
  link: string;
}

/** Testimoni landing yang diatur admin di pengaturan. */
export interface LandingTestimonial {
  name: string;
  school: string;
  quote: string;
}

/** Lokasi footer/fasilitas yang diatur admin — kosong = pakai data gedung. */
export interface LandingLocationSetting {
  name: string;
  address: string;
}

export interface LandingDisplay {
  /** Foto-foto hero (slider) — diatur di Pengaturan > Tampilan Landing.
   *  Setting lama bisa berupa string URL — normalisasi lewat
   *  `landingHeroImages()`. */
  heroImages: Array<LandingHeroImage | string>;
  /** Link formulir info/pendaftaran (buku tamu Google Form). */
  registrationUrl: string;
  heroBadge?: string;
  heroTitle?: string;
  heroHighlight?: string;
  heroSubtitle?: string;
  aboutParagraph1?: string;
  aboutParagraph2?: string;
  officeAddress?: string;
  officeHours?: string;
  ctaTitle?: string;
  ctaSubtitle?: string;
  testimonials?: LandingTestimonial[];
  locations?: LandingLocationSetting[];
}

/** Normalisasi heroImages — setting lama tersimpan sebagai array string. */
export function landingHeroImages(
  display: LandingDisplay | undefined | null,
): LandingHeroImage[] {
  return (display?.heroImages ?? []).map((h) =>
    typeof h === 'string' ? { url: h, link: '' } : h,
  );
}

export interface LandingData {
  stats: {
    students: number;
    tutors: number;
    programs: number;
    packages: number;
  };
  catalog: LandingProgram[];
  facilities: LandingFacility[];
  locations: LandingLocation[];
  display?: LandingDisplay;
}

/** Fallback link formulir bila pengaturan belum diisi. */
export const DEFAULT_REGISTRATION_URL = 'https://s.id/info-daftarGFS2627';

export function useLanding() {
  return useQuery({
    queryKey: ['public-landing'],
    queryFn: () => apiFetch<LandingData>('/public/landing', { auth: false }),
    staleTime: 60_000,
  });
}

export const fmtIDR = (v: string | number | null | undefined) =>
  v != null && v !== ''
    ? new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
      }).format(Number(v))
    : 'Hubungi admin';

/** Slug URL program dari kode DB (REG → /program/reg). */
export const programSlug = (code: string) => code.toLowerCase();

/** Try out publik — ujian yang ditandai admin "tampil di /tryout". */
export interface PublicTryoutSubtes {
  name: string;
  durationMinutes: number;
  questionCount: number;
}

export interface PublicTryout {
  id: string;
  title: string;
  description: string | null;
  category: string;
  accessCode: string | null;
  scheduledStartAt: string;
  scheduledEndAt: string;
  durationMinutes: number | null;
  status: 'PUBLISHED' | 'LOCKED' | string;
  showResultImmediately: boolean;
  subjectName: string | null;
  questionCount: number;
  subtes: PublicTryoutSubtes[];
}

export interface TryoutsResponse {
  tryouts: PublicTryout[];
}

export function useTryouts() {
  return useQuery({
    queryKey: ['public-tryouts'],
    queryFn: () => apiFetch<TryoutsResponse>('/public/tryouts', { auth: false }),
    staleTime: 30_000,
  });
}
