"use client";

import { useState } from 'react';
import { toast } from 'sonner';
import { apiFetch, ApiError, resolveAssetUrl } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { rupiah } from '@/components/phase2a/invoices-manager';

interface ReceiptItemRow {
	description: string;
	quantity: number;
	unitPrice: string | number;
	amount: string | number;
}

export interface ReceiptDetail {
	id: string;
	number: string;
	amount: string | number;
	method: string;
	status: string;
	issuedAt: string;
	payment?: { method: string; channel: string; provider: string | null; paidAt?: string | null } | null;
	invoice?: {
		number: string;
		totalAmount?: string | number;
		amountPaid?: string | number;
		dueDate?: string | null;
		student?: {
			user?: { name?: string };
			parentStudents?: Array<{ parent: { user: { name: string } } }>;
		} | null;
		package?: { name?: string; code?: string | null } | null;
		enrollmentLink?: {
			program?: { name?: string } | null;
			level?: { name?: string } | null;
			group?: { name?: string } | null;
		} | null;
		enrollment?: {
			program?: { name?: string } | null;
			level?: { name?: string } | null;
			group?: { name?: string } | null;
		} | null;
		items?: ReceiptItemRow[];
	} | null;
	student?: { user?: { name?: string; email?: string } } | null;
	verifier?: { name?: string } | null;
	/** Urutan invoice pendaftaran yang sama — 1 = pendaftaran, >1 = angsuran ke-N. */
	installmentNo?: number | null;
	/** Sisa tagihan invoice setelah pembayaran ini. */
	remaining?: number | null;
}

export interface CompanyInfo {
	name: string;
	address: string;
	phone: string;
	email: string;
	logoUrl?: string;
	/** Penandatangan kwitansi — dari Pengaturan > Keuangan. */
	signerName?: string;
	signerTitle?: string;
	/** Gambar tanda tangan (URL media). */
	signatureUrl?: string;
}

/** Terbilang sederhana Bahasa Indonesia untuk nominal kwitansi. */
function terbilang(n: number): string {
	const satuan = [
		'', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima',
		'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas',
	];
	const t = (x: number): string => {
		if (x < 12) return satuan[x];
		if (x < 20) return `${satuan[x - 10]} Belas`;
		if (x < 100) return `${satuan[Math.floor(x / 10)]} Puluh ${t(x % 10)}`.trim();
		if (x < 200) return `Seratus ${t(x - 100)}`.trim();
		if (x < 1000) return `${satuan[Math.floor(x / 100)]} Ratus ${t(x % 100)}`.trim();
		if (x < 2000) return `Seribu ${t(x - 1000)}`.trim();
		if (x < 1_000_000) return `${t(Math.floor(x / 1000))} Ribu ${t(x % 1000)}`.trim();
		if (x < 1_000_000_000) return `${t(Math.floor(x / 1_000_000))} Juta ${t(x % 1_000_000)}`.trim();
		return `${t(Math.floor(x / 1_000_000_000))} Miliar ${t(x % 1_000_000_000)}`.trim();
	};
	return n === 0 ? 'Nol' : t(Math.round(n));
}

function esc(s: string | null | undefined) {
	return (s ?? '-')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

function methodLabel(r: ReceiptDetail) {
	if (r.payment?.channel === 'GATEWAY') {
		return `Online${r.payment.provider ? ` (${r.payment.provider})` : ''}`;
	}
	if (r.method === 'CASH' || r.payment?.method === 'CASH') return 'Tunai (Cash)';
	return 'Transfer';
}

/**
 * Dokumen kwitansi — format slip kecil (bukan A4 penuh), mengikuti kwitansi
 * bimbel pada umumnya: no invoice, diterima dari, keterangan angsuran,
 * nominal + sisa, jenis transaksi, tempat/tanggal, TTD admin, logo.
 */
export function buildReceiptHtml(r: ReceiptDetail, c: CompanyInfo | null): string {
	const parents = (r.invoice?.student?.parentStudents ?? [])
		.map((p) => p.parent.user.name)
		.filter(Boolean);
	const paidTo = parents.join(' & ') || r.student?.user?.name || r.invoice?.student?.user?.name || '-';
	const enr = r.invoice?.enrollmentLink ?? r.invoice?.enrollment;
	const programLabel = enr
		? [enr.program?.name, enr.level?.name].filter(Boolean).join(' — ')
		: (r.invoice?.package?.name ?? '');
	const no = r.installmentNo ?? null;
	const keperluan =
		(no && no > 1 ? `Angsuran ke-${no}` : 'Pendaftaran / Pembayaran awal') +
		(programLabel ? ` ${programLabel}` : '') +
		(r.invoice?.number ? ` (Invoice ${r.invoice.number})` : '');
	const payDate = r.payment?.paidAt ?? r.issuedAt;
	const dateStr = new Date(payDate).toLocaleDateString('id-ID', {
		day: 'numeric',
		month: 'long',
		year: 'numeric',
	});
	// Tempat diambil dari alamat perusahaan (kota = segmen terakhir alamat).
	const city = (() => {
		const parts = (c?.address ?? '').split(',').map((s) => s.trim()).filter(Boolean);
		return parts.length > 1 ? parts[parts.length - 1] : '';
	})();
	const remaining =
		r.remaining ??
		(r.invoice?.totalAmount !== undefined && r.invoice?.amountPaid !== undefined
			? Number(r.invoice.totalAmount) - Number(r.invoice.amountPaid)
			: null);
	const logo = resolveAssetUrl(c?.logoUrl ?? '') || '/logo-gfs.png';
	// Tanda tangan dari Pengaturan > Keuangan; fallback nama verifikator.
	const signerName = c?.signerName?.trim() || r.verifier?.name || 'Admin';
	const signerTitle = c?.signerTitle?.trim() || 'Admin Finance';
	const sigImg = resolveAssetUrl(c?.signatureUrl ?? '');
	return `<!doctype html>
<html><head><meta charset="utf-8"><title>Kwitansi ${esc(r.number)}</title>
<style>
  * { box-sizing:border-box; }
  body { font-family:'Segoe UI', Arial, sans-serif; color:#111; margin:0; padding:24px; }
  .slip { max-width:720px; margin:0 auto; border:2px solid #1e3a5f; border-radius:10px; padding:18px 22px; }
  .head { display:flex; justify-content:space-between; align-items:center; border-bottom:3px double #1e3a5f; padding-bottom:10px; }
  .brandwrap { display:flex; align-items:center; gap:10px; }
  .brandwrap img { height:44px; width:44px; object-fit:contain; }
  .brand { font-size:19px; font-weight:800; color:#1e3a5f; }
  .addr { font-size:11px; color:#555; }
  .title { font-size:22px; letter-spacing:5px; font-weight:800; text-align:right; color:#1e3a5f; }
  .no { font-size:12px; text-align:right; color:#444; }
  table.meta { width:100%; margin-top:14px; font-size:13.5px; border-collapse:collapse; }
  table.meta td { padding:5px 4px; vertical-align:top; }
  table.meta td.k { width:165px; font-weight:600; }
  .terbilang { margin-top:12px; font-style:italic; background:#f2f5f9; border:1px dashed #8aa0bd; border-radius:6px; padding:8px 10px; font-size:13px; }
  .foot { display:flex; justify-content:space-between; align-items:flex-end; margin-top:22px; font-size:13px; }
  .amountbox { border:2px solid #1e3a5f; border-radius:6px; padding:10px 18px; font-size:20px; font-weight:800; color:#1e3a5f; }
  .sig { text-align:center; min-width:200px; }
  .sig .role { font-size:12px; color:#444; }
  .sig .sigimg { display:block; height:56px; margin:6px auto -4px; object-fit:contain; }
  .sig .name { margin-top:56px; font-weight:700; border-bottom:1px solid #333; display:inline-block; min-width:170px; }
  .sig .sigimg + .name { margin-top:6px; }
  @media print { body { padding:0; } .slip { border-radius:0; } }
</style></head><body>
<div class="slip">
  <div class="head">
    <div class="brandwrap">
      <img src="${esc(logo)}" alt="logo" onerror="this.style.display='none'">
      <div>
        <div class="brand">${esc(c?.name ?? 'BimbelGFS')}</div>
        <div class="addr">${esc(c?.address)}${c?.phone ? ` · ${esc(c.phone)}` : ''}${c?.email ? ` · ${esc(c.email)}` : ''}</div>
      </div>
    </div>
    <div>
      <div class="title">KWITANSI</div>
      <div class="no">No: ${esc(r.number)}</div>
      ${r.invoice?.number ? `<div class="no">Invoice: ${esc(r.invoice.number)}</div>` : ''}
    </div>
  </div>
  <table class="meta">
    <tr><td class="k">Telah diterima dari</td><td>: <b>${esc(paidTo)}</b></td></tr>
    <tr><td class="k">Untuk pembayaran</td><td>: ${esc(keperluan)}</td></tr>
    <tr><td class="k">Total pembayaran</td><td>: <b>${rupiah(r.amount)}</b>${remaining !== null ? ` &nbsp;·&nbsp; Sisa angsuran: <b>${rupiah(remaining)}</b>` : ''}</td></tr>
    <tr><td class="k">Jenis transaksi</td><td>: ${esc(methodLabel(r))}</td></tr>
  </table>
  <div class="terbilang">Terbilang: <b>${terbilang(Number(r.amount))} Rupiah</b></div>
  <div class="foot">
    <div class="amountbox">${rupiah(r.amount)}</div>
    <div class="sig">
      <div>${esc(city ? `${city}, ` : '')}${dateStr}</div>
      <div class="role">${esc(signerTitle)}</div>
      ${sigImg ? `<img class="sigimg" src="${esc(sigImg)}" alt="Tanda tangan" onerror="this.style.display='none'">` : ''}
      <div class="name">${esc(signerName)}</div>
    </div>
  </div>
</div>
</body></html>`;
}

/**
 * Tombol "Cetak" kwitansi — membuka dokumen cetak (jendela terpisah) yang hanya
 * berisi kwitansi, bukan screenshot layar. `detailBase` disesuaikan role:
 * orang tua = "/me/receipts", admin finance/owner = "/receipts".
 */
export function PrintReceiptButton({
	receiptId,
	detailBase,
}: {
	receiptId: string;
	detailBase: '/me/receipts' | '/receipts';
}) {
	const [busy, setBusy] = useState(false);

	async function handlePrint() {
		// window.open dipanggil sinkron dari click handler — kalau ditunda setelah
		// await fetch, browser memblokirnya sebagai popup.
		const win = window.open('', '_blank', 'width=820,height=560');
		if (!win) {
			toast.error('Popup diblokir browser — izinkan popup untuk mencetak.');
			return;
		}
		setBusy(true);
		try {
			const [receipt, company, branding] = await Promise.all([
				apiFetch<ReceiptDetail>(`${detailBase}/${receiptId}`),
				apiFetch<CompanyInfo>('/company-info').catch(() => null),
				apiFetch<{ logoUrl?: string }>('/public/branding', { auth: false }).catch(() => null),
			]);
			const info: CompanyInfo | null = company
				? { ...company, logoUrl: company.logoUrl || branding?.logoUrl || '' }
				: branding?.logoUrl
					? { name: 'BimbelGFS', address: '', phone: '', email: '', logoUrl: branding.logoUrl }
					: null;
			win.document.open();
			win.document.write(buildReceiptHtml(receipt, info));
			win.document.close();
			win.focus();
			setTimeout(() => win.print(), 300);
		} catch (e) {
			toast.error(e instanceof ApiError ? e.message : 'Gagal memuat kwitansi.');
			win.close();
		} finally {
			setBusy(false);
		}
	}

	return (
		<Button variant="outline" size="sm" onClick={handlePrint} disabled={busy}>
			{busy ? 'Menyiapkan...' : 'Cetak'}
		</Button>
	);
}
