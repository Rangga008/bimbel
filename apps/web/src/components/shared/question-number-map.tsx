'use client';

import { cn } from '@/lib/utils';

export type NumberMapState = 'idle' | 'answered' | 'correct' | 'wrong';

const STATE_STYLE: Record<NumberMapState, string> = {
  idle: 'bg-muted text-muted-foreground hover:bg-muted/70',
  answered: 'bg-brand-blue-600 text-white hover:bg-brand-blue-500',
  correct: 'bg-emerald-600 text-white hover:bg-emerald-500',
  wrong: 'bg-amber-500 text-white hover:bg-amber-400',
};

/**
 * Peta nomor soal ala TKA/UTBK — grid tombol nomor untuk lompat antar soal.
 * Dipakai di exam-taker (desktop sidebar + mobile sheet) dan latsol-player.
 */
export function QuestionNumberMap({
  count,
  current,
  states,
  onJump,
  columns = 5,
}: {
  count: number;
  current: number;
  states: NumberMapState[];
  onJump: (index: number) => void;
  columns?: number;
}) {
  return (
    <div
      className="grid gap-1.5"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onJump(i)}
          aria-label={`Ke soal ${i + 1}`}
          aria-current={i === current ? 'true' : undefined}
          className={cn(
            'flex aspect-square items-center justify-center rounded-md text-sm font-semibold tabular-nums transition-colors',
            STATE_STYLE[states[i] ?? 'idle'],
            i === current && 'ring-2 ring-foreground ring-offset-1 ring-offset-background',
          )}
        >
          {i + 1}
        </button>
      ))}
    </div>
  );
}

/** Legenda warna peta nomor — diletakkan di bawah grid. */
export function NumberMapLegend({
  items,
}: {
  items: { state: NumberMapState; label: string }[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {items.map((it) => (
        <span key={it.state + it.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={cn('size-3 rounded-sm', STATE_STYLE[it.state].split(' ')[0])} />
          {it.label}
        </span>
      ))}
    </div>
  );
}
