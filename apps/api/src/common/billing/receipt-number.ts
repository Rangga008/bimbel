import type { Prisma } from '@prisma/client';

/**
 * Nomor kwitansi KWT-YYYYMM-#### — dipakai bersama oleh PaymentsService
 * (alokasi pembayaran) dan EnrollmentsService (backfill angsuran lunas)
 * supaya format & urutan identik.
 */
export async function nextReceiptNumber(
  tx: Prisma.TransactionClient,
): Promise<string> {
  const d = new Date();
  const prefix = `KWT-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}-`;
  for (let i = 0; i < 20; i += 1) {
    const last = await tx.receipt.findFirst({
      where: { number: { startsWith: prefix } },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    const seq = last ? (Number(last.number.slice(prefix.length)) || 0) + 1 : 1;
    const candidate = `${prefix}${String(seq).padStart(4, '0')}`;
    const clash = await tx.receipt.findUnique({ where: { number: candidate } });
    if (!clash) return candidate;
  }
  return `${prefix}${String(Date.now()).slice(-4)}`;
}
