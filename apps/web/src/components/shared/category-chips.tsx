'use client';

/** Chips kategori ala halaman /tryout — Semua + tiap tipe dengan jumlah.
 *  Opsi diturunkan dari konten yang benar-benar ada, jadi tipe yang belum
 *  ada isinya tidak tampil. */
export function CategoryChips({
  options,
  value,
  onChange,
  allLabel = 'Semua',
  total,
}: {
  options: { value: string; label: string; count: number }[];
  value: string;
  onChange: (v: string) => void;
  allLabel?: string;
  total: number;
}) {
  const chip = (active: boolean) =>
    `shrink-0 rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
      active
        ? 'border-primary bg-primary text-primary-foreground'
        : 'bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground'
    }`;
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className={chip(!value)} onClick={() => onChange('')}>
        {allLabel} <span className="ml-1 text-xs opacity-70">{total}</span>
      </button>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={chip(value === o.value)}
          onClick={() => onChange(value === o.value ? '' : o.value)}
        >
          {o.label} <span className="ml-1 text-xs opacity-70">{o.count}</span>
        </button>
      ))}
    </div>
  );
}
