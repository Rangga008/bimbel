'use client';

import { Fragment, useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

/**
 * Parse teks yang bisa berisi campuran teks biasa + KaTeX:
 * - `$$...$$` untuk block/display math
 * - `$...$` untuk inline math
 * Dipakai bersama di soal (bank soal), opsi jawaban, dan solusi/pembahasan
 * di seluruh modul Fase 3 (Latsol, Exam, Pembahasan) supaya konsisten.
 */
type Segment =
  | { kind: 'text'; value: string }
  | { kind: 'math'; value: string; display: boolean }
  | { kind: 'table'; rows: string[][] };

/**
 * Blok tabel sederhana dalam teks polos (dipakai import soal dari Word):
 *   [TABEL]
 *   Header A | Header B
 *   sel 1 | sel 2
 *   [/TABEL]
 * Baris pertama = header. Tetap teks polos — aman di-renderer lama
 * (marker tampil sebagai teks biasa bila komponen belum dukung).
 */
const TABLE_BLOCK_RE = /\[TABEL\]\s*\n([\s\S]*?)\n?\s*\[\/TABEL\]/g;

/**
 * Pratinjau teks polos untuk judul/daftar: blok [TABEL]…[/TABEL] diringkas
 * jadi penanda "▦ [tabel]" (tidak terpotong di tengah blok), spasi diratakan.
 */
export function plainPreview(text: string | null | undefined, max = 100): string {
  const t = String(text ?? '')
    .replace(TABLE_BLOCK_RE, ' ▦ [tabel] ')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function parseSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  let tm: RegExpExecArray | null;
  TABLE_BLOCK_RE.lastIndex = 0;
  while ((tm = TABLE_BLOCK_RE.exec(text)) !== null) {
    if (tm.index > last) pushMathSegments(segments, text.slice(last, tm.index));
    const rows = tm[1]
      .split('\n')
      .map((l) => l.split('|').map((c) => c.trim()))
      .filter((r) => r.some((c) => c !== ''));
    if (rows.length) segments.push({ kind: 'table', rows });
    else segments.push({ kind: 'text', value: tm[0] });
    last = tm.index + tm[0].length;
  }
  if (last < text.length) pushMathSegments(segments, text.slice(last));
  if (!segments.length) segments.push({ kind: 'text', value: text });
  return segments;
}

function pushMathSegments(segments: Segment[], text: string) {
  // $$...$$ (display) harus dicek lebih dulu supaya tidak ketabrak $...$ biasa.
  const re = /\$\$([^$]+?)\$\$|\$([^$\n]+?)\$/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segments.push({ kind: 'text', value: text.slice(last, m.index) });
    if (m[1] !== undefined) {
      segments.push({ kind: 'math', value: m[1], display: true });
    } else {
      segments.push({ kind: 'math', value: m[2], display: false });
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) segments.push({ kind: 'text', value: text.slice(last) });
}

function MathSpan({ tex, display }: { tex: string; display: boolean }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(tex, {
        throwOnError: false,
        displayMode: display,
      });
    } catch {
      return null;
    }
  }, [tex, display]);

  if (html === null) {
    // Gagal parse KaTeX: tampilkan raw supaya tidak menyembunyikan konten soal.
    return <span className="text-destructive">{display ? `$$${tex}$$` : `$${tex}$`}</span>;
  }
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

/**
 * Render teks (soal/opsi/solusi) yang boleh mengandung KaTeX `$...$` / `$$...$$`
 * dan baris baru biasa. Aman untuk overflow di layar kecil (mobile) karena
 * setiap span math dibungkus dengan `overflow-x-auto` saat display mode.
 */
export function MathContent({ text, className }: { text: string | null | undefined; className?: string }) {
  const segments = useMemo(() => parseSegments(text ?? ''), [text]);
  if (!text) return null;

  return (
    <span className={className}>
      {segments.map((seg, idx) => {
        if (seg.kind === 'text') {
          return (
            <Fragment key={idx}>
              {seg.value.split('\n').map((line, i, arr) => (
                <Fragment key={i}>
                  {line}
                  {i < arr.length - 1 && <br />}
                </Fragment>
              ))}
            </Fragment>
          );
        }
        if (seg.kind === 'table') {
          const [head, ...body] = seg.rows;
          return (
            <span key={idx} className="my-1 block max-w-full overflow-x-auto">
              <table className="border-collapse text-[0.95em]">
                <thead>
                  <tr>
                    {head.map((c, i) => (
                      <th key={i} className="border border-slate-400 bg-muted/60 px-2 py-1 text-left font-semibold">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {body.map((r, i) => (
                    <tr key={i}>
                      {r.map((c, j) => (
                        <td key={j} className="border border-slate-400 px-2 py-1 align-top">
                          {c}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </span>
          );
        }
        return (
          <span key={idx} className={seg.display ? 'block max-w-full overflow-x-auto py-1' : 'inline-block max-w-full overflow-x-auto align-middle'}>
            <MathSpan tex={seg.value} display={seg.display} />
          </span>
        );
      })}
    </span>
  );
}
