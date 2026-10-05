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
  | { kind: 'math'; value: string; display: boolean };

function parseMathSegments(text: string): Segment[] {
  const segments: Segment[] = [];
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
  if (!segments.length) segments.push({ kind: 'text', value: text });
  return segments;
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
  const segments = useMemo(() => parseMathSegments(text ?? ''), [text]);
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
        return (
          <span key={idx} className={seg.display ? 'block max-w-full overflow-x-auto py-1' : 'inline-block max-w-full overflow-x-auto align-middle'}>
            <MathSpan tex={seg.value} display={seg.display} />
          </span>
        );
      })}
    </span>
  );
}
