"use client";
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch, ApiError } from '@/lib/api-client';
import type { MasterItem, ProgramItem } from '@/lib/phase1a-types';
import type { GroupListItem } from '@/lib/phase1b-types';
import type { SubjectItem } from '@/lib/phase3a-types';
import type { RoomItem } from '@/lib/phase1c-types';
import { DAY_NAMES, clockToMin } from '@/lib/phase1c-types';
import { Phase1aSelectField } from '@/components/phase1a/phase1a-form-dialog';

function err(e: unknown, fb: string) {
  return e instanceof ApiError ? e.message : fb;
}

const INPUT_CLS =
  'h-9 rounded-lg border border-input bg-input/30 px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

/** Halaman buat kelompok baru — kategori program → jenjang, tutor lead, dan jadwal mingguan awal opsional. */
export function GroupCreatePage({ basePath }: { basePath: string }) {
  const qc = useQueryClient();
  const router = useRouter();
  const [form, setForm] = useState({ name: '', code: '', capacity: '' });
  const [programId, setProgramId] = useState('');
  const [levelId, setLevelId] = useState('');
  const [tutorId, setTutorId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [withSchedule, setWithSchedule] = useState(false);
  const [sched, setSched] = useState({ dayOfWeek: '1', start: '16:00', end: '17:30', validFrom: '', validTo: '' });

  const programsQ = useQuery({
    queryKey: ['programs', 'options'],
    queryFn: () => apiFetch<ProgramItem[]>('/programs/options'),
  });
  const tutorsQ = useQuery({
    queryKey: ['tutors'],
    queryFn: () => apiFetch<Array<{ id: string; user: { name: string; avatarUrl?: string | null } }>>('/tutors'),
  });
  const roomsQ = useQuery({ queryKey: ['rooms'], queryFn: () => apiFetch<RoomItem[]>('/rooms') });
  const subjectsQ = useQuery({
    queryKey: ['subjects'],
    queryFn: () => apiFetch<SubjectItem[]>('/master/subjects'),
  });

  const selProgram = programsQ.data?.find((p) => p.id === programId);
  const selLevel = selProgram?.levels?.find((l) => l.id === levelId);
  const programLevels = selProgram?.levels ?? [];
  const levelRequired = programLevels.length > 0;
  const levelSubjects = (selLevel?.levelSubjects ?? [])
    .map((ls) => ls.subject)
    .filter((s): s is MasterItem => Boolean(s));
  // Mapel jadwal: dibatasi mapel jenjang bila jenjang punya daftar mapel.
  const subjectOptions =
    levelSubjects.length > 0 ? levelSubjects : (subjectsQ.data ?? []);
  const CATEGORY_LABEL: Record<string, string> = {
    REGULER: 'Reguler',
    EXTRA: 'Extra',
    PRIVAT: 'Privat',
  };

  const createM = useMutation({
    mutationFn: () => {
      if (!form.name.trim()) throw new Error('Isi nama kelompok.');
      if (!programId) throw new Error('Pilih program dulu.');
      if (levelRequired && !levelId) throw new Error('Pilih jenjang program dulu.');
      const startMin = sched.start ? clockToMin(sched.start) : null;
      const endMin = sched.end ? clockToMin(sched.end) : null;
      if (withSchedule && (startMin === null || endMin === null)) {
        throw new Error('Format jam jadwal harus HH:MM.');
      }
      if (withSchedule && sched.validTo && sched.validFrom && sched.validTo < sched.validFrom) {
        throw new Error('Berlaku sampai harus setelah berlaku dari.');
      }
      return apiFetch<GroupListItem>('/groups', {
        method: 'POST',
        body: {
          name: form.name,
          code: form.code || undefined,
          programId,
          levelId: levelId || undefined,
          capacity: form.capacity ? Number(form.capacity) : undefined,
          tutorId: tutorId || undefined,
          roomId: roomId || undefined,
          ...(withSchedule ? {
            dayOfWeek: Number(sched.dayOfWeek),
            startMin: startMin!,
            endMin: endMin!,
            validFrom: sched.validFrom || undefined,
            validTo: sched.validTo || undefined,
            subjectId: subjectId || undefined,
          } : {}),
        },
      });
    },
    onSuccess: (g) => {
      toast.success('Kelompok dibuat.');
      qc.invalidateQueries({ queryKey: ['groups'] });
      qc.invalidateQueries({ queryKey: ['schedules'] });
      router.push(`${basePath}/kelompok/${g.id}`);
    },
    onError: (e) => toast.error(err(e, 'Gagal membuat kelompok.')),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Link href={`${basePath}/kelompok`} aria-label="Kembali ke daftar kelompok">
          <Button variant="outline" size="icon"><ArrowLeft className="size-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tambah Kelompok</h1>
          <p className="text-sm text-muted-foreground">Kelompok belajar per program &amp; jenjang — langsung dijadwalkan per mapel.</p>
        </div>
      </div>

      {programsQ.isLoading ? <Skeleton className="h-60 w-full" /> : null}

      <Card>
        <CardContent className="grid gap-4 py-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="grp-name">Nama kelompok <span className="text-destructive">*</span></Label>
            <Input id="grp-name" placeholder="Matematika SMP - Kelas A" value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="grp-code">Kode (opsional)</Label>
            <Input id="grp-code" placeholder="MAT-SMP-A" value={form.code}
              onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="grp-capacity">Kapasitas (opsional)</Label>
            <Input id="grp-capacity" type="number" min={1} value={form.capacity}
              onChange={(e) => setForm((p) => ({ ...p, capacity: e.target.value }))} />
          </div>
          <Phase1aSelectField
            id="grp-program" label="Program" required
            value={programId}
            onChange={(v) => { setProgramId(v); setLevelId(''); setSubjectId(''); }}
            options={(programsQ.data ?? []).map((p) => ({
              value: p.id,
              label: `${p.name} (${p.code})${p.category ? ` · ${CATEGORY_LABEL[p.category] ?? p.category}` : ''}`,
            }))}
            placeholder="- Pilih program -"
          />
          <Phase1aSelectField
            id="grp-level" label="Jenjang" required={levelRequired}
            value={levelId}
            onChange={(v) => { setLevelId(v); setSubjectId(''); }}
            options={programLevels.map((l) => ({ value: l.id, label: l.name }))}
            placeholder={levelRequired ? '- Pilih jenjang -' : '- Tanpa jenjang -'}
            hint={!programId ? 'Pilih program dulu.' : undefined}
          />
          {levelSubjects.length > 0 ? (
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label>Mapel dalam jenjang ini</Label>
              <div className="flex flex-wrap gap-1">
                {levelSubjects.map((s) => (
                  <span key={s.id} className="rounded-md border px-2 py-0.5 text-xs text-muted-foreground">{s.name}</span>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Kelompok multi-mapel — buat satu jadwal per mapel dari halaman Jadwal setelah kelompok dibuat.
              </p>
            </div>
          ) : null}
          <Phase1aSelectField
            id="grp-tutor" label="Tutor"
            value={tutorId}
            onChange={setTutorId}
            options={(tutorsQ.data ?? []).map((t) => ({ value: t.id, label: t.user.name, imageUrl: t.user.avatarUrl }))}
            placeholder="- Pilih tutor -"
            hint="Otomatis jadi tutor lead kelompok dan tutor jadwal awal."
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 py-4">
          <div className="flex items-center gap-2">
            <Checkbox id="grp-schedule" checked={withSchedule} onCheckedChange={(v) => setWithSchedule(v === true)} />
            <Label htmlFor="grp-schedule" className="cursor-pointer font-normal">
              Buat jadwal mingguan sekarang (sesi digenerate nanti dari halaman Jadwal &amp; Sesi)
            </Label>
          </div>
          {withSchedule ? (
            <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>Hari</Label>
                <select className={INPUT_CLS} value={sched.dayOfWeek}
                  onChange={(e) => setSched((p) => ({ ...p, dayOfWeek: e.target.value }))}>
                  {DAY_NAMES.map((d, i) => <option key={d} value={i}>{d}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1.5">
                  <Label>Mulai</Label>
                  <Input type="time" value={sched.start} onChange={(e) => setSched((p) => ({ ...p, start: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Selesai</Label>
                  <Input type="time" value={sched.end} onChange={(e) => setSched((p) => ({ ...p, end: e.target.value }))} />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Berlaku dari</Label>
                <Input type="date" value={sched.validFrom} onChange={(e) => setSched((p) => ({ ...p, validFrom: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Berlaku sampai (opsional)</Label>
                <Input type="date" value={sched.validTo} onChange={(e) => setSched((p) => ({ ...p, validTo: e.target.value }))} />
              </div>
              <Phase1aSelectField
                id="grp-subject" label="Mapel jadwal ini (opsional)"
                value={subjectId}
                onChange={setSubjectId}
                options={subjectOptions.map((s) => ({ value: s.id, label: s.name }))}
                placeholder="- Ikut mapel jenjang -"
                hint={levelSubjects.length > 0 ? 'Dibatasi mapel jenjang yang dipilih.' : undefined}
              />
              <div className="sm:col-span-2">
                <Phase1aSelectField
                  id="grp-room" label="Ruangan"
                  value={roomId}
                  onChange={setRoomId}
                  options={(roomsQ.data ?? []).map((r) => ({ value: r.id, label: r.name }))}
                  placeholder="- Menyusul -"
                />
              </div>

            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button disabled={createM.isPending} onClick={() => createM.mutate()}>
          <Save /> Buat Kelompok
        </Button>
        <Link href={`${basePath}/kelompok`}>
          <Button variant="outline">Batal</Button>
        </Link>
      </div>
    </div>
  );
}
