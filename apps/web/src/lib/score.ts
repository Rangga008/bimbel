/**
 * Skor tampilan selalu dinormalisasi ke skala 0–100 ("akumulasi dari 100").
 * Data mentah (score/maxScore per soal) tetap disimpan apa adanya —
 * helper ini hanya untuk tampilan.
 */
export function score100(
  score: number | null | undefined,
  maxScore: number | null | undefined,
): number {
  if (score == null || !maxScore || maxScore <= 0) return 0;
  return Math.round((score / maxScore) * 100);
}

/** Label ringkas "85/100" — fallback "-" bila skor belum ada. */
export function scoreLabel100(
  score: number | null | undefined,
  maxScore: number | null | undefined,
): string {
  if (score == null || !maxScore || maxScore <= 0) return '—';
  return `${score100(score, maxScore)}/100`;
}
