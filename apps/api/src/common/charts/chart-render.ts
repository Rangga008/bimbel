// Renderer chart generik untuk laporan & analitik:
// - pieSvg/barSvg → inline SVG (dipakai dokumen cetak/PDF + bisa dirender web).
// - piePng/barPng → PNG via pngjs murni-JS (dipakai embed gambar di ExcelJS —
//   ExcelJS tidak mendukung chart natif, jadi chart diraster jadi gambar).
// Tanpa dependensi native — aman di Alpine/node:22-alpine.
import { PNG } from 'pngjs';

export interface ChartItem {
  label: string;
  value: number;
  color?: string;
}

/** Palet warna konsisten untuk slice/bar (urut stabil). */
const PALETTE = [
  '#0f4c81', '#e8a020', '#2e8b57', '#b03a48', '#6b5b95',
  '#3a9ab2', '#c9711b', '#5b7f3c', '#8c4a7f', '#777777',
];

function esc(s: string) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Item dengan warna ter-resolve + total (untuk persen). */
function colored(items: ChartItem[]) {
  const list = items
    .filter((i) => Number.isFinite(i.value) && i.value > 0)
    .map((i, idx) => ({ ...i, color: i.color ?? PALETTE[idx % PALETTE.length] }));
  const total = list.reduce((s, i) => s + i.value, 0);
  return { list, total };
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const v = m ? parseInt(m[1], 16) : 0;
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

// ---------------------------------------------------------------------------
// SVG (untuk HTML cetak / render web)
// ---------------------------------------------------------------------------

/** Donut chart + legenda kanan dalam satu SVG. */
export function pieSvg(items: ChartItem[], size = 160): string {
  const { list, total } = colored(items);
  if (!list.length || total <= 0) {
    return `<svg width="${size}" height="80" xmlns="http://www.w3.org/2000/svg"><text x="0" y="40" font-size="12" fill="#777">Tidak ada data</text></svg>`;
  }
  const r = size / 2;
  const cx = r;
  const cy = r;
  const inner = r * 0.55;
  let angle = -Math.PI / 2;
  const paths: string[] = [];
  for (const it of list) {
    const frac = it.value / total;
    const a0 = angle;
    const a1 = angle + frac * Math.PI * 2;
    angle = a1;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const pt = (a: number, rad: number) =>
      `${(cx + rad * Math.cos(a)).toFixed(2)} ${(cy + rad * Math.sin(a)).toFixed(2)}`;
    paths.push(
      `<path d="M ${pt(a0, r)} A ${r} ${r} 0 ${large} 1 ${pt(a1, r)} L ${pt(a1, inner)} A ${inner} ${inner} 0 ${large} 0 ${pt(a0, inner)} Z" fill="${it.color}" stroke="#fff" stroke-width="1"/>`,
    );
  }
  const label = `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" font-size="13" font-weight="bold" fill="#111">${list.length} pos</text>`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">${paths.join('')}${label}</svg>`;
}

/** Legenda HTML (kotak warna + label + nilai + %) — dipakai di dokumen cetak. */
export function pieLegendHtml(
  items: ChartItem[],
  fmt: (n: number) => string = (n) => String(Math.round(n)),
): string {
  const { list, total } = colored(items);
  const rows = list
    .map((it) => {
      const pct = total > 0 ? Math.round((it.value / total) * 1000) / 10 : 0;
      return `<tr><td><span style="display:inline-block;width:10px;height:10px;background:${it.color};margin-right:6px"></span>${esc(it.label)}</td><td style="text-align:right;padding-left:12px">${esc(fmt(it.value))}</td><td style="text-align:right;padding-left:12px;color:#666">${pct}%</td></tr>`;
    })
    .join('');
  return `<table style="border-collapse:collapse;font-size:11px">${rows}</table>`;
}

/**
 * Horizontal bar chart — tiap baris: label | bar terproporsi | nilai.
 * `valueFmt` untuk label nilai (default % bila maxValue=100).
 */
export function barSvg(
  items: ChartItem[],
  opts: {
    width?: number;
    rowH?: number;
    maxValue?: number;
    valueFmt?: (v: number, it: ChartItem) => string;
  } = {},
): string {
  const width = opts.width ?? 640;
  const rowH = opts.rowH ?? 26;
  const list = items.filter((i) => Number.isFinite(i.value));
  if (!list.length) {
    return `<svg width="${width}" height="60" xmlns="http://www.w3.org/2000/svg"><text x="0" y="30" font-size="12" fill="#777">Tidak ada data</text></svg>`;
  }
  const max = opts.maxValue ?? Math.max(...list.map((i) => i.value), 1);
  const labelW = Math.min(
    220,
    Math.max(60, ...list.map((i) => i.label.length)) * 6.5 + 8,
  );
  const valueW = 64;
  const barW = width - labelW - valueW - 8;
  const height = list.length * rowH;
  const parts: string[] = [];
  list.forEach((it, i) => {
    const y = i * rowH;
    const w = Math.max(2, (it.value / max) * barW);
    const color = it.color ?? PALETTE[i % PALETTE.length];
    const val = opts.valueFmt ? opts.valueFmt(it.value, it) : `${Math.round(it.value)}`;
    parts.push(
      `<text x="0" y="${y + rowH * 0.68}" font-size="11" fill="#333">${esc(it.label.length > 34 ? `${it.label.slice(0, 33)}…` : it.label)}</text>` +
        `<rect x="${labelW}" y="${y + 5}" width="${w.toFixed(1)}" height="${rowH - 10}" rx="3" fill="${color}"/>` +
        `<text x="${(labelW + w + 6).toFixed(1)}" y="${y + rowH * 0.68}" font-size="11" fill="#333">${esc(val)}</text>`,
    );
  });
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="max-width:100%">${parts.join('')}</svg>`;
}

// ---------------------------------------------------------------------------
// PNG (untuk embed di workbook Excel — ExcelJS addImage)
// ---------------------------------------------------------------------------

function newPng(width: number, height: number) {
  const png = new PNG({ width, height });
  // Latar putih.
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 255;
    png.data[i + 1] = 255;
    png.data[i + 2] = 255;
    png.data[i + 3] = 255;
  }
  return png;
}

function setPx(png: PNG, x: number, y: number, rgb: [number, number, number]) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const i = (y * png.width + x) << 2;
  png.data[i] = rgb[0];
  png.data[i + 1] = rgb[1];
  png.data[i + 2] = rgb[2];
  png.data[i + 3] = 255;
}

/** Donut PNG — label/persen ditulis di tabel Excel di samping gambar. */
export function piePng(items: ChartItem[], size = 320): Buffer {
  const { list, total } = colored(items);
  const png = newPng(size, size);
  if (!list.length || total <= 0) return PNG.sync.write(png);
  const cx = (size - 1) / 2;
  const cy = cx;
  const r = size / 2 - 2;
  const inner = r * 0.55;
  const slices = list.map((it) => ({
    frac: it.value / total,
    rgb: hexToRgb(it.color!),
  }));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > r || dist < inner) continue;
      // Sudut mulai dari jam-12 searah jarum jam.
      let ang = Math.atan2(dy, dx) + Math.PI / 2;
      if (ang < 0) ang += Math.PI * 2;
      let acc = 0;
      for (const s of slices) {
        acc += s.frac * Math.PI * 2;
        if (ang <= acc) {
          setPx(png, x, y, s.rgb);
          break;
        }
      }
    }
  }
  return PNG.sync.write(png);
}

/** Bar PNG — batang horizontal tanpa teks (label di tabel Excel di samping). */
export function barPng(items: ChartItem[], width = 480, rowH = 26): Buffer {
  const list = items.filter((i) => Number.isFinite(i.value) && i.value > 0);
  const height = Math.max(rowH, list.length * rowH);
  const png = newPng(width, height);
  if (!list.length) return PNG.sync.write(png);
  const max = Math.max(...list.map((i) => i.value));
  list.forEach((it, i) => {
    const w = Math.max(2, Math.round((it.value / max) * (width - 4)));
    const rgb = hexToRgb(it.color ?? PALETTE[i % PALETTE.length]);
    const y0 = i * rowH + 4;
    for (let y = y0; y < y0 + rowH - 8 && y < height; y++) {
      for (let x = 2; x < 2 + w && x < width; x++) setPx(png, x, y, rgb);
    }
  });
  return PNG.sync.write(png);
}
