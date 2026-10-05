"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, BookOpen, GraduationCap, Layers, Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { apiFetch, ApiError } from '@/lib/api-client';
import type { LevelItem, MasterItem, ProgramItem } from '@/lib/phase1a-types';
import {
  Phase1aFormDialog,
  Phase1aSelectField,
  type Phase1aField,
} from '@/components/phase1a/phase1a-form-dialog';

const PROGRAM_EDIT_FIELDS: Phase1aField[] = [
  { name: 'name', label: 'Nama program' },
  { name: 'registrationFee', label: 'Biaya pendaftaran (Rp)', type: 'number' },
  { name: 'description', label: 'Deskripsi' },
  { name: 'isActive', label: 'Aktif? (true/false)', placeholder: 'true' },
];

const CATEGORY_OPTIONS = [
  { value: 'REGULER', label: 'Kelas Reguler' },
  { value: 'EXTRA', label: 'Kelas Extra' },
  { value: 'PRIVAT', label: 'Kelas Privat' },
];

const PRICE_UNIT_OPTIONS = [
  { value: 'YEAR', label: 'Per tahun ajaran' },
  { value: 'MONTH', label: 'Per bulan' },
  { value: 'SESSION', label: 'Per pertemuan' },
];

/** Field pricelist brosur sesuai satuan harga — nilai dikirim via form Record<string,string>. */
function PricingFields({
  unit,
  values,
  onChange,
}: {
  unit: string;
  values: Record<string, string>;
  onChange: (name: string, v: string) => void;
}) {
  const Num = ({ name, label, ph }: { name: string; label: string; ph?: string }) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={name} className="text-sm font-medium">{label}</label>
      <input
        id={name}
        type="number"
        min={0}
        value={values[name] ?? ''}
        onChange={(e) => onChange(name, e.target.value)}
        placeholder={ph}
        className="h-9 rounded-md border border-input bg-input/30 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
    </div>
  );
  if (unit === 'YEAR') {
    return (
      <div className="flex flex-col gap-3 rounded-md border border-dashed p-3">
        <p className="text-xs font-medium text-muted-foreground">Cara bayar kelas reguler (brosur)</p>
        <div className="grid grid-cols-2 gap-2">
          <Num name="fullPayPrice" label="Lunas di awal (Rp)" ph="2000000" />
          <Num name="installment2x" label="Angsuran 2x — per angsuran (Rp)" ph="1000000" />
          <Num name="monthlyAmount" label="Angsuran bulanan (Rp)" ph="200000" />
          <Num name="monthlyCount" label="Jumlah angsuran bulanan" ph="10" />
        </div>
      </div>
    );
  }
  if (unit === 'SESSION') {
    return (
      <div className="flex flex-col gap-3 rounded-md border border-dashed p-3">
        <p className="text-xs font-medium text-muted-foreground">
          Harga privat per jumlah siswa (Rp/pertemuan) — harga utama di atas = 1 siswa
        </p>
        <div className="grid grid-cols-2 gap-2">
          {[2, 3, 4, 5].map((n) => (
            <Num key={n} name={`sessionPrice${n}`} label={`${n} siswa`} />
          ))}
          <Num name="sessionDurationMin" label="Durasi (menit)" ph="60" />
        </div>
      </div>
    );
  }
  if (unit === 'MONTH') {
    return (
      <div className="flex flex-col gap-3 rounded-md border border-dashed p-3">
        <p className="text-xs font-medium text-muted-foreground">Kelas extra — harga promo bila anak ikut kelas reguler</p>
        <Num name="promoPrice" label="Harga promo per bulan (Rp, opsional)" ph="75000" />
      </div>
    );
  }
  return null;
}

/** Konversi field pricelist form → body API (mode create). */
function pricingBody(f: Record<string, string>) {
  const num = (k: string) => (f[k] === '' || f[k] === undefined ? undefined : Number(f[k]));
  const sessionPrices: Record<string, number> = {};
  for (const n of [2, 3, 4, 5]) {
    const v = f[`sessionPrice${n}`];
    if (v !== undefined && v !== '') sessionPrices[String(n)] = Number(v);
  }
  return {
    fullPayPrice: num('fullPayPrice'),
    installment2x: num('installment2x'),
    monthlyAmount: num('monthlyAmount'),
    monthlyCount: num('monthlyCount'),
    promoPrice: num('promoPrice'),
    sessionDurationMin: num('sessionDurationMin'),
    registrationFee: num('registrationFee'),
    sessionPrices: Object.keys(sessionPrices).length ? sessionPrices : undefined,
  };
}

/** Mode edit: '' → null (hapus nilai), undefined → tak diubah. */
function pricingBodyEdit(f: Record<string, string>) {
  const num = (k: string) =>
    f[k] === undefined ? undefined : f[k] === '' ? null : Number(f[k]);
  const sessionPrices: Record<string, number> = {};
  let sessionTouched = false;
  for (const n of [2, 3, 4, 5]) {
    const v = f[`sessionPrice${n}`];
    if (v !== undefined) {
      sessionTouched = true;
      if (v !== '') sessionPrices[String(n)] = Number(v);
    }
  }
  return {
    fullPayPrice: num('fullPayPrice'),
    installment2x: num('installment2x'),
    monthlyAmount: num('monthlyAmount'),
    monthlyCount: num('monthlyCount'),
    promoPrice: num('promoPrice'),
    sessionDurationMin: num('sessionDurationMin'),
    registrationFee: num('registrationFee'),
    sessionPrices: sessionTouched
      ? Object.keys(sessionPrices).length
        ? sessionPrices
        : null
      : undefined,
  };
}

const LEVEL_FIELDS: Phase1aField[] = [
  { name: 'name', label: 'Nama level', placeholder: 'Otomatis dari Level Kelas bila dipilih' },
  { name: 'price', label: 'Harga (Rp)', type: 'number', placeholder: '450000' },
];

const LEVEL_EDIT_FIELDS: Phase1aField[] = [
  { name: 'name', label: 'Nama level' },
  { name: 'price', label: 'Harga (Rp) — kosongkan untuk hapus', type: 'number' },
  { name: 'isActive', label: 'Aktif? (true/false)', placeholder: 'true' },
];

function parseIsActive(value: string | undefined): boolean | undefined {
  if (value === undefined || value === '') return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function err(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}

/** Checklist mapel untuk jenjang (kelas reguler multi-mapel). Disimpan sebagai CSV di form state. */
function SubjectMultiPicker({
  idPrefix,
  value,
  onChange,
  options,
}: {
  idPrefix: string;
  value: string;
  onChange: (csv: string) => void;
  options: { value: string; label: string }[];
}) {
  const selected = new Set(value ? value.split(',').filter(Boolean) : []);
  const toggle = (id: string) => {
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    onChange([...selected].join(','));
  };
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm font-medium">Mapel dalam jenjang (opsional)</p>
      <p className="text-xs text-muted-foreground">Untuk kelas reguler yang berisi beberapa mapel — dicentang semua yang diajarkan.</p>
      <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto rounded-md border p-2">
        {options.length === 0 ? <span className="text-xs text-muted-foreground">Belum ada mapel di master data.</span> : null}
        {options.map((o) => (
          <label key={o.value} htmlFor={`${idPrefix}-${o.value}`} className="flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs has-checked:bg-accent">
            <input id={`${idPrefix}-${o.value}`} type="checkbox" checked={selected.has(o.value)} onChange={() => toggle(o.value)} className="size-3.5" />
            {o.label}
          </label>
        ))}
      </div>
    </div>
  );
}

/** Halaman detail program — kelola jenjang (level) di dalamnya. */
export function ProgramDetailPage({ programId, basePath, canManage }: { programId: string; basePath: string; canManage: boolean }) {
  const qc = useQueryClient();
  const router = useRouter();
  const [deleteProgramOpen, setDeleteProgramOpen] = useState(false);
  const [levelForm, setLevelForm] = useState<Record<string, string>>({});
  const [levelOpen, setLevelOpen] = useState(false);
  const [editProgramOpen, setEditProgramOpen] = useState(false);
  const [editProgramForm, setEditProgramForm] = useState<Record<string, string>>({});
  const [editLevel, setEditLevel] = useState<LevelItem | null>(null);
  const [editLevelForm, setEditLevelForm] = useState<Record<string, string>>({});

  const programsQ = useQuery({ queryKey: ['programs'], queryFn: () => apiFetch<ProgramItem[]>('/programs') });
  const levelsQ = useQuery({
    queryKey: ['levels', programId],
    queryFn: () => apiFetch<LevelItem[]>(`/levels?programId=${programId}`),
  });
  const subjectsQ = useQuery({ queryKey: ['master-subjects'], queryFn: () => apiFetch<MasterItem[]>('/master/subjects') });
  const gradeLevelsQ = useQuery({ queryKey: ['master-grade-levels'], queryFn: () => apiFetch<MasterItem[]>('/master/grade-levels') });

  const program = programsQ.data?.find((p) => p.id === programId);
  const levels = levelsQ.data ?? [];

  function refreshAll() {
    qc.invalidateQueries({ queryKey: ['programs'] });
    qc.invalidateQueries({ queryKey: ['levels'] });
  }

  const createLevel = useMutation({
    mutationFn: () =>
      apiFetch('/levels', {
        method: 'POST',
        body: {
          programId,
          gradeLevelId: levelForm.gradeLevelId || undefined,
          subjectId: levelForm.subjectId || undefined,
          name: levelForm.name || undefined,
          price: levelForm.price === '' || levelForm.price === undefined ? undefined : Number(levelForm.price),
          priceUnit: levelForm.priceUnit || undefined,
          ...pricingBody(levelForm),
          subjectIds: levelForm.subjectIds ? levelForm.subjectIds.split(',').filter(Boolean) : undefined,
        },
      }),
    onSuccess: () => {
      toast.success('Level dibuat.');
      setLevelOpen(false);
      setLevelForm({});
      refreshAll();
    },
    onError: (e) => toast.error(err(e, 'Gagal membuat level.')),
  });

  const editProgramM = useMutation({
    mutationFn: () =>
      apiFetch(`/programs/${programId}`, {
        method: 'PATCH',
        body: {
          name: editProgramForm.name || undefined,
          category: editProgramForm.category || undefined,
          registrationFee:
            editProgramForm.registrationFee === '' || editProgramForm.registrationFee === undefined
              ? undefined
              : Number(editProgramForm.registrationFee),
          subjectId: editProgramForm.subjectId === '__none__' ? null : editProgramForm.subjectId || undefined,
          description: editProgramForm.description || undefined,
          isActive: parseIsActive(editProgramForm.isActive),
        },
      }),
    onSuccess: () => {
      toast.success('Program diperbarui.');
      setEditProgramOpen(false);
      refreshAll();
    },
    onError: (e) => toast.error(err(e, 'Gagal memperbarui program.')),
  });

  const editLevelM = useMutation({
    mutationFn: () =>
      apiFetch(`/levels/${editLevel?.id}`, {
        method: 'PATCH',
        body: {
          name: editLevelForm.name || undefined,
          gradeLevelId: editLevelForm.gradeLevelId === '__none__' ? null : editLevelForm.gradeLevelId || undefined,
          subjectId: editLevelForm.subjectId === '__none__' ? null : editLevelForm.subjectId || undefined,
          price: editLevelForm.price === undefined ? undefined : editLevelForm.price === '' ? null : Number(editLevelForm.price),
          priceUnit: editLevelForm.priceUnit === '__none__' ? null : editLevelForm.priceUnit || undefined,
          ...pricingBodyEdit(editLevelForm),
          subjectIds: editLevelForm.subjectIds === undefined ? undefined : editLevelForm.subjectIds.split(',').filter(Boolean),
          isActive: parseIsActive(editLevelForm.isActive),
        },
      }),
    onSuccess: () => {
      toast.success('Level diperbarui.');
      setEditLevel(null);
      refreshAll();
    },
    onError: (e) => toast.error(err(e, 'Gagal memperbarui level.')),
  });

  const deleteProgramM = useMutation({
    mutationFn: () => apiFetch(`/programs/${programId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Program dihapus.');
      qc.invalidateQueries({ queryKey: ['programs'] });
      router.push(`${basePath}/program`);
    },
    onError: (e) => {
      setDeleteProgramOpen(false);
      toast.error(err(e, 'Gagal menghapus program.'));
    },
  });

  const levelOptions = (gradeLevelsQ.data ?? []).map((g) => ({ value: g.id, label: `${g.code} — ${g.name}` }));
  const subjectOptions = (subjectsQ.data ?? []).map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Link href={`${basePath}/program`} aria-label="Kembali ke daftar program">
            <Button variant="outline" size="icon"><ArrowLeft className="size-4" /></Button>
          </Link>
          <div className="min-w-0">
            {program ? (
              <>
                <h1 className="truncate text-2xl font-semibold tracking-tight">
                  {program.name} <span className="text-base font-normal text-muted-foreground">{program.code}</span>
                </h1>
                <p className="flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                  <BookOpen className="size-3.5 shrink-0" />
                  {program.subject ? `${program.subject.code} — ${program.subject.name}` : 'Tanpa mapel'}
                </p>
              </>
            ) : (
              <h1 className="text-2xl font-semibold tracking-tight">Detail Program</h1>
            )}
          </div>
        </div>
        {program ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={program.isActive ? 'secondary' : 'outline'}>{program.isActive ? 'Aktif' : 'Nonaktif'}</Badge>
            {canManage ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditProgramForm({
                    name: program.name,
                    category: program.category ?? 'REGULER',
                    registrationFee: program.registrationFee === null || program.registrationFee === undefined ? '' : String(program.registrationFee),
                    subjectId: program.subjectId ?? '__none__',
                    description: program.description ?? '',
                    isActive: String(program.isActive),
                  });
                  setEditProgramOpen(true);
                }}
              >
                <Pencil /> Edit Program
              </Button>
            ) : null}
            {canManage ? (
              <Button variant="outline" size="sm" className="text-destructive hover:text-destructive"
                onClick={() => setDeleteProgramOpen(true)}>
                <Trash2 /> Hapus
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {programsQ.isLoading || levelsQ.isLoading ? <Skeleton className="h-40 w-full" /> : null}
      {!programsQ.isLoading && !program ? (
        <EmptyState
          icon={GraduationCap}
          title="Program tidak ditemukan"
          description="Program ini tidak ada atau Anda tidak memiliki akses."
          action={<Link href={`${basePath}/program`}><Button size="sm" variant="outline">Kembali</Button></Link>}
        />
      ) : null}

      {program ? (
        <>
          {program.description ? <p className="text-sm text-muted-foreground">{program.description}</p> : null}
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Jenjang ({levels.length})</h2>
            {canManage ? (
              <Button size="sm" onClick={() => { setLevelForm({ subjectId: program.subjectId ?? '' }); setLevelOpen(true); }}>
                <Plus /> Tambah Level
              </Button>
            ) : null}
          </div>
          {levels.length === 0 ? (
            <EmptyState icon={Layers} title="Belum ada level" description="Tambahkan level pertama untuk program ini." />
          ) : null}
          <div className="grid gap-3 md:grid-cols-2">
            {levels.map((level) => {
              return (
                <Card key={level.id}>
                  <CardContent className="flex flex-col gap-2 py-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">
                        {level.name}
                        {level.gradeLevel ? (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">({level.gradeLevel.code} — {level.gradeLevel.name})</span>
                        ) : null}
                        <Badge variant={level.isActive ? 'secondary' : 'outline'} className="ml-2">{level.isActive ? 'Aktif' : 'Nonaktif'}</Badge>
                      </p>
                      {canManage ? (
                        <div className="flex gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditLevel(level);
                              setEditLevelForm({
                                name: level.name,
                                gradeLevelId: level.gradeLevelId ?? '__none__',
                                subjectId: level.subjectId ?? '__none__',
                                price: level.price === null || level.price === undefined ? '' : String(level.price),
                                priceUnit: level.priceUnit ?? 'MONTH',
                                fullPayPrice: level.fullPayPrice == null ? '' : String(level.fullPayPrice),
                                installment2x: level.installment2x == null ? '' : String(level.installment2x),
                                monthlyAmount: level.monthlyAmount == null ? '' : String(level.monthlyAmount),
                                monthlyCount: level.monthlyCount == null ? '' : String(level.monthlyCount),
                                promoPrice: level.promoPrice == null ? '' : String(level.promoPrice),
                                sessionPrice2: level.sessionPrices?.['2'] == null ? '' : String(level.sessionPrices['2']),
                                sessionPrice3: level.sessionPrices?.['3'] == null ? '' : String(level.sessionPrices['3']),
                                sessionPrice4: level.sessionPrices?.['4'] == null ? '' : String(level.sessionPrices['4']),
                                sessionPrice5: level.sessionPrices?.['5'] == null ? '' : String(level.sessionPrices['5']),
                                sessionDurationMin: level.sessionDurationMin == null ? '' : String(level.sessionDurationMin),
                                registrationFee: level.registrationFee == null ? '' : String(level.registrationFee),
                                subjectIds: (level.levelSubjects ?? []).map((ls) => ls.subjectId).join(','),
                                isActive: String(level.isActive),
                              });
                            }}
                          >
                            Edit
                          </Button>
                        </div>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Mapel: {level.subject ? `${level.subject.code} — ${level.subject.name}` : level.program?.subject ? `${level.program.subject.code} — ${level.program.subject.name} (ikuti program)` : '—'}
                    </p>
                    {(level.levelSubjects ?? []).length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {(level.levelSubjects ?? []).map((ls) => (
                          <Badge key={ls.subjectId} variant="outline" className="text-[11px]">{ls.subject?.name ?? ls.subjectId}</Badge>
                        ))}
                      </div>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      Harga: {level.price !== null && level.price !== undefined ? `Rp ${Number(level.price).toLocaleString('id-ID')}` : '—'}
                      {level.priceUnit ? ` / ${PRICE_UNIT_OPTIONS.find((u) => u.value === level.priceUnit)?.label.toLowerCase() ?? level.priceUnit}` : ''}
                    </p>
                    {[
                      level.fullPayPrice ? `Lunas awal Rp ${Number(level.fullPayPrice).toLocaleString('id-ID')}` : null,
                      level.installment2x ? `2x Rp ${Number(level.installment2x).toLocaleString('id-ID')}` : null,
                      level.monthlyAmount ? `${level.monthlyCount ?? ''}x Rp ${Number(level.monthlyAmount).toLocaleString('id-ID')}` : null,
                      level.promoPrice ? `Promo Rp ${Number(level.promoPrice).toLocaleString('id-ID')}` : null,
                      level.sessionPrices ? Object.entries(level.sessionPrices).sort(([a], [b]) => Number(a) - Number(b)).map(([n, p]) => `${n}s Rp ${Number(p).toLocaleString('id-ID')}`).join(' · ') : null,
                      level.sessionDurationMin ? `${level.sessionDurationMin} menit` : null,
                    ].filter(Boolean).length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {[
                          level.fullPayPrice ? `Lunas awal Rp ${Number(level.fullPayPrice).toLocaleString('id-ID')}` : null,
                          level.installment2x ? `2x Rp ${Number(level.installment2x).toLocaleString('id-ID')}` : null,
                          level.monthlyAmount ? `${level.monthlyCount ?? ''}x Rp ${Number(level.monthlyAmount).toLocaleString('id-ID')}` : null,
                          level.promoPrice ? `Promo Rp ${Number(level.promoPrice).toLocaleString('id-ID')}` : null,
                          level.sessionPrices ? Object.entries(level.sessionPrices).sort(([a], [b]) => Number(a) - Number(b)).map(([n, p]) => `${n}s Rp ${Number(p).toLocaleString('id-ID')}`).join(' · ') : null,
                          level.sessionDurationMin ? `${level.sessionDurationMin} menit` : null,
                        ].filter(Boolean).map((t) => (
                          <Badge key={t as string} variant="secondary" className="text-[11px]">{t}</Badge>
                        ))}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      ) : null}

      <Phase1aFormDialog
        open={levelOpen}
        onOpenChange={setLevelOpen}
        title={`Tambah Level — ${program?.name ?? ''}`}
        fields={LEVEL_FIELDS}
        values={levelForm}
        onChange={(n, v) => setLevelForm((p) => ({ ...p, [n]: v }))}
        onSubmit={() => createLevel.mutate()}
        isSubmitting={createLevel.isPending}
        submitLabel="Buat Level"
        extra={
          <>
            <Phase1aSelectField
              id="level-grade"
              label="Level Kelas (master data)"
              value={levelForm.gradeLevelId ?? ''}
              onChange={(v) => {
                const gl = gradeLevelsQ.data?.find((g) => g.id === v);
                setLevelForm((p) => ({ ...p, gradeLevelId: v, ...(v ? { name: p.name || gl?.name || '' } : {}) }));
              }}
              options={levelOptions}
              placeholder="Pilih level kelas (opsional)"
              emptyText="Belum ada level kelas — tambah di Master Data."
              hint="Nama & urutan terisi otomatis bila dipilih."
            />
            {program?.category === 'REGULER' ? null : (
              <Phase1aSelectField
                id="level-subject"
                label="Mata Pelajaran"
                value={levelForm.subjectId ?? ''}
                onChange={(v) => setLevelForm((p) => ({ ...p, subjectId: v }))}
                options={subjectOptions}
                placeholder="Ikuti mapel program / pilih lain"
                emptyText="Belum ada mapel — tambah di Master Data."
              />
            )}
            <Phase1aSelectField
              id="level-price-unit"
              label="Satuan Harga"
              value={levelForm.priceUnit ?? (program?.category === 'REGULER' ? 'YEAR' : program?.category === 'PRIVAT' ? 'SESSION' : 'MONTH')}
              onChange={(v) => setLevelForm((p) => ({ ...p, priceUnit: v }))}
              options={PRICE_UNIT_OPTIONS}
              hint="Per tahun untuk reguler, per bulan untuk extra, per pertemuan untuk privat."
            />
            <PricingFields
              unit={levelForm.priceUnit ?? (program?.category === 'REGULER' ? 'YEAR' : program?.category === 'PRIVAT' ? 'SESSION' : 'MONTH')}
              values={levelForm}
              onChange={(n, v) => setLevelForm((p) => ({ ...p, [n]: v }))}
            />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="level-regfee" className="text-sm font-medium">Biaya pendaftaran (Rp) — kosong = ikut program</label>
              <input
                id="level-regfee"
                type="number"
                min={0}
                value={levelForm.registrationFee ?? ''}
                onChange={(e) => setLevelForm((p) => ({ ...p, registrationFee: e.target.value }))}
                className="h-9 rounded-md border border-input bg-input/30 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>
            <SubjectMultiPicker
              idPrefix="level-subjects"
              value={levelForm.subjectIds ?? ''}
              onChange={(csv) => setLevelForm((p) => ({ ...p, subjectIds: csv }))}
              options={subjectOptions}
            />
          </>
        }
      />
      <Phase1aFormDialog
        open={editProgramOpen}
        onOpenChange={setEditProgramOpen}
        title={`Edit Program — ${program?.name ?? ''}`}
        fields={PROGRAM_EDIT_FIELDS}
        values={editProgramForm}
        onChange={(n, v) => setEditProgramForm((p) => ({ ...p, [n]: v }))}
        onSubmit={() => editProgramM.mutate()}
        isSubmitting={editProgramM.isPending}
        submitLabel="Simpan Perubahan"
        extra={
          <>
          <Phase1aSelectField
            id="edit-program-category"
            label="Kategori Kelas"
            value={editProgramForm.category ?? 'REGULER'}
            onChange={(v) => setEditProgramForm((p) => ({ ...p, category: v }))}
            options={CATEGORY_OPTIONS}
          />
          {editProgramForm.category === 'REGULER' ? null : (
            <Phase1aSelectField
              id="edit-program-subject"
              label="Mata Pelajaran"
              value={editProgramForm.subjectId ?? '__none__'}
              onChange={(v) => setEditProgramForm((p) => ({ ...p, subjectId: v }))}
              options={[{ value: '__none__', label: '— Tanpa mapel —' }, ...subjectOptions]}
              placeholder="Pilih mapel"
              hint="Kelas reguler memakai mapel per jenjang — bukan mapel tunggal."
            />
          )}
          </>
        }
      />
      <Phase1aFormDialog
        open={editLevel !== null}
        onOpenChange={(o) => { if (!o) setEditLevel(null); }}
        title={`Edit Level — ${editLevel?.name ?? ''}`}
        fields={LEVEL_EDIT_FIELDS}
        values={editLevelForm}
        onChange={(n, v) => setEditLevelForm((p) => ({ ...p, [n]: v }))}
        onSubmit={() => editLevelM.mutate()}
        isSubmitting={editLevelM.isPending}
        submitLabel="Simpan Perubahan"
        extra={
          <>
            <Phase1aSelectField
              id="edit-level-grade"
              label="Level Kelas (master data)"
              value={editLevelForm.gradeLevelId ?? '__none__'}
              onChange={(v) => setEditLevelForm((p) => ({ ...p, gradeLevelId: v }))}
              options={[{ value: '__none__', label: '— Tanpa level kelas —' }, ...levelOptions]}
              placeholder="Pilih level kelas"
            />
            {program?.category === 'REGULER' ? null : (
              <Phase1aSelectField
                id="edit-level-subject"
                label="Mata Pelajaran"
                value={editLevelForm.subjectId ?? '__none__'}
                onChange={(v) => setEditLevelForm((p) => ({ ...p, subjectId: v }))}
                options={[{ value: '__none__', label: '— Ikuti program —' }, ...subjectOptions]}
                placeholder="Pilih mapel"
              />
            )}
            <Phase1aSelectField
              id="edit-level-price-unit"
              label="Satuan Harga"
              value={editLevelForm.priceUnit ?? 'MONTH'}
              onChange={(v) => setEditLevelForm((p) => ({ ...p, priceUnit: v }))}
              options={[{ value: '__none__', label: '— Tanpa satuan —' }, ...PRICE_UNIT_OPTIONS]}
            />
            <PricingFields
              unit={editLevelForm.priceUnit ?? 'MONTH'}
              values={editLevelForm}
              onChange={(n, v) => setEditLevelForm((p) => ({ ...p, [n]: v }))}
            />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="edit-level-regfee" className="text-sm font-medium">Biaya pendaftaran (Rp) — kosong = ikut program</label>
              <input
                id="edit-level-regfee"
                type="number"
                min={0}
                value={editLevelForm.registrationFee ?? ''}
                onChange={(e) => setEditLevelForm((p) => ({ ...p, registrationFee: e.target.value }))}
                className="h-9 rounded-md border border-input bg-input/30 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>
            <SubjectMultiPicker
              idPrefix="edit-level-subjects"
              value={editLevelForm.subjectIds ?? ''}
              onChange={(csv) => setEditLevelForm((p) => ({ ...p, subjectIds: csv }))}
              options={subjectOptions}
            />
          </>
        }
      />
      <ConfirmDialog
        open={deleteProgramOpen}
        onOpenChange={setDeleteProgramOpen}
        title={`Hapus program "${program?.name ?? ''}"?`}
        description="Semua jenjang di dalamnya ikut terhapus. Program yang masih punya kelompok tidak bisa dihapus — nonaktifkan saja."
        confirmLabel="Ya, hapus"
        pending={deleteProgramM.isPending}
        onConfirm={() => deleteProgramM.mutate()}
      />
    </div>
  );
}
