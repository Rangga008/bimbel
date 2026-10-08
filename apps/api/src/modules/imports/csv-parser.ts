// Parser CSV sederhana untuk fitur import — dukung koma ATAU titik-koma
// sebagai pemisah (Excel di Windows Indonesia menyimpan CSV pakai ";"),
// kutip ganda ("a,b", "" escape), newline CRLF/LF, dan BOM.
// Baris kosong dan baris komentar (diawali "#", mis. baris contoh di
// template) di-skip sehingga contoh tidak ikut ter-import.
export function parseCsv(text: string): Array<Record<string, string>> {
  const clean = text.replace(/^﻿/, '');
  // Deteksi delimiter dari baris bermakna pertama: kalau mengandung ";"
  // tanpa koma di luar kutip, file ini CSV gaya Indonesia (Excel id-ID).
  const delim = detectDelimiter(clean);
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (isDataRow(row)) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (isDataRow(row)) rows.push(row);
  if (rows.length === 0) return [];

  // Header dinormalisasi lowercase supaya "Email"/"EMAIL" tetap dikenali.
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((cells) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = (cells[idx] ?? '').trim();
    });
    return obj;
  });
}

/** Baris bermakna: ada sel tak kosong, bukan komentar "#", bukan petunjuk "sep=". */
function isDataRow(row: string[]): boolean {
  if (!row.some((c) => c.trim() !== '')) return false;
  const first = row[0].trim();
  return !first.startsWith('#') && !/^sep=/i.test(first);
}

function detectDelimiter(text: string): ',' | ';' {
  const firstLine =
    text
      .split(/\r?\n/)
      .find(
        (l) =>
          l.trim() !== '' &&
          !l.trim().startsWith('#') &&
          !/^sep=/i.test(l.trim()),
      ) ?? '';
  let inQuotes = false;
  let comma = 0;
  let semi = 0;
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes;
    if (inQuotes) continue;
    if (ch === ',') comma++;
    if (ch === ';') semi++;
  }
  return semi > comma ? ';' : ',';
}
