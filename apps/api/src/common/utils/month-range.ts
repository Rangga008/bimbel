/**
 * Helper rentang bulan untuk query finance Fase 2d.
 * Memperbaiki pola lama `new Date(`${period}-31`)` yang INVALID untuk
 * Februari & bulan 30 hari (menghasilkan overflow ke bulan berikutnya).
 */
export function monthRange(period: string): { start: Date; end: Date } {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    throw new Error(
      `Format periode harus YYYY-MM dengan bulan 01-12 (dapat: ${period}).`,
    );
  }
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7)); // 1-12
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  // Hari 0 di bulan berikutnya = hari terakhir bulan berjalan.
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  return { start, end };
}

export function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
