// Unit test Fase 1c: overlap helper + validasi DTO waktu.
// Tidak butuh DB — memverifikasi logika murni conflict detection.
import { rangesOverlap } from './conflict.service';

describe('rangesOverlap (Fase 1c)', () => {
  const d = (s: string) => new Date(s);
  it('mendeteksi tumpang waktu', () => {
    expect(
      rangesOverlap(
        { startsAt: d('2026-09-21T16:00:00'), endsAt: d('2026-09-21T17:30:00') },
        { startsAt: d('2026-09-21T17:00:00'), endsAt: d('2026-09-21T18:00:00') },
      ),
    ).toBe(true);
  });
  it('batas sentuh tidak dihitung bentrok', () => {
    expect(
      rangesOverlap(
        { startsAt: d('2026-09-21T16:00:00'), endsAt: d('2026-09-21T17:00:00') },
        { startsAt: d('2026-09-21T17:00:00'), endsAt: d('2026-09-21T18:00:00') },
      ),
    ).toBe(false);
  });
  it('rentang terpisah tidak bentrok', () => {
    expect(
      rangesOverlap(
        { startsAt: d('2026-09-21T16:00:00'), endsAt: d('2026-09-21T17:00:00') },
        { startsAt: d('2026-09-22T16:00:00'), endsAt: d('2026-09-22T17:00:00') },
      ),
    ).toBe(false);
  });
});
