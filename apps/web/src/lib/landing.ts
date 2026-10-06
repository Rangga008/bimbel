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
}

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
