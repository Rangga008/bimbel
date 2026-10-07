export interface ApiUserBrief {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  avatarUrl?: string | null;
}

export interface StudentItem {
  id: string;
  userId: string;
  dateOfBirth: string | null;
  address: string | null;
  schoolOrigin?: string | null;
  nis?: string | null;
  majorChoice1?: string | null;
  majorChoice2?: string | null;
  gender: 'M' | 'F' | 'OTHER' | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  user: ApiUserBrief;
  parentStudents: Array<{
    parent: { id: string; user: ApiUserBrief };
  }>;
  groupMembers?: Array<{
    groupId: string;
    group: {
      id: string;
      name: string;
      code: string | null;
      isActive: boolean;
      program: { id: string; name: string; code: string; subject?: { code: string; name: string } | null };
      level: { id: string; name: string } | null;
      _count?: { members: number; tutors: number };
    };
  }>;
}

export interface InvoiceItemRow {
  id: string;
  invoiceId: string;
  description: string;
  quantity: number;
  unitPrice: string | number;
  amount: string | number;
}

export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PAID' | 'OVERDUE' | 'VOID';

export interface InvoiceListItem {
  id: string;
  number: string;
  studentId: string;
  packageId: string | null;
  status: InvoiceStatus;
  /** Status turunan backend — ISSUED lunas = PAID, lewat tempo = OVERDUE. */
  displayStatus?: InvoiceStatus;
  totalAmount: string | number;
  amountPaid: string | number;
  dueDate: string | null;
  createdAt: string;
  student: {
    id: string;
    user: ApiUserBrief;
    gradeLevel?: { name: string } | null;
    parentStudents?: Array<{ parent: { user: { name: string } } }>;
  };
  package: { id: string; name: string; code: string | null; price: string | number | null } | null;
  enrollmentLink?: {
    program: { id: string; name: string } | null;
    level: { name: string } | null;
    group: { name: string } | null;
  } | null;
  /** Relasi balik dari pendaftaran (invoice utama) — fallback enrollmentLink. */
  enrollment?: {
    program: { id: string; name: string } | null;
    level: { name: string } | null;
    group: { name: string } | null;
  } | null;
  _count: { items: number };
}

export interface InvoiceDetail extends Omit<InvoiceListItem, '_count'> {
  notes: string | null;
  issuedAt: string | null;
  voidedAt: string | null;
  items: InvoiceItemRow[];
}

export interface ParentItem {
  id: string;
  userId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  user: ApiUserBrief;
  parentStudents: Array<{
    student: { id: string; user: ApiUserBrief };
  }>;
}

export interface TutorItem {
  id: string;
  userId: string;
  specialization: string | null;
  bio: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  user: ApiUserBrief;
  groupTutors?: Array<{
    groupId: string;
    isLead: boolean;
    group: { id: string; name: string; code: string | null; isActive: boolean };
  }>;
}

export interface PackageItem {
  id: string;
  levelId: string;
  name: string;
  code: string | null;
  totalSessions: number;
  durationWeeks: number | null;
  price: string | number | null;
  description: string | null;
  isActive: boolean;
  level?: {
    id: string;
    name: string;
    program?: { id: string; name: string; code: string };
  };
}

/** Master data: mapel & level kelas (dropdown Program/Level). */
export interface MasterItem {
  id: string;
  code: string;
  name: string;
  sortOrder?: number;
  isActive: boolean;
}

export interface LevelItem {
  id: string;
  programId: string;
  name: string;
  code: string | null;
  sortOrder: number;
  isActive: boolean;
  gradeLevelId?: string | null;
  subjectId?: string | null;
  price?: string | number | null;
  priceUnit?: 'YEAR' | 'MONTH' | 'SESSION' | 'PACKAGE' | null;
  /** Pricelist cara bayar reguler. */
  fullPayPrice?: string | number | null;
  installment2x?: string | number | null;
  monthlyAmount?: string | number | null;
  monthlyCount?: number | null;
  /** Extra: harga promo bila ikut kelas reguler. */
  promoPrice?: string | number | null;
  /** Privat: harga per pertemuan per jumlah siswa {"2":75000,...}. */
  sessionPrices?: Record<string, number> | null;
  sessionDurationMin?: number | null;
  /** Override biaya pendaftaran jenjang — kosong = ikut program. */
  registrationFee?: string | number | null;
  gradeLevel?: MasterItem | null;
  subject?: MasterItem | null;
  levelSubjects?: { subjectId: string; subject?: MasterItem | null }[];
  program?: { id: string; name: string; code: string; subject?: MasterItem | null };
  packages?: PackageItem[];
  _count?: { packages: number };
}

export interface ProgramItem {
  id: string;
  name: string;
  code: string;
  description: string | null;
  isActive: boolean;
  category?: 'REGULER' | 'EXTRA' | 'PRIVAT';
  registrationFee?: string | number | null;
  subjectId?: string | null;
  subject?: MasterItem | null;
  _count?: { levels: number };
  levels?: LevelItem[];
}
