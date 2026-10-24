"use client";

import { useState } from 'react';
import { toast } from 'sonner';
import { FileText } from 'lucide-react';
import { apiFetch, ApiError, resolveAssetUrl } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { rupiah } from '@/components/phase2a/invoices-manager';
import type { CompanyInfo } from '@/components/phase2b/receipt-print';
import {
	STATEMENT_TERMS,
	type ParentStatement,
} from './parent-statement-dialog';

function esc(s: string | null | undefined) {
	return (s ?? '-')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

/**
 * Surat pernyataan resmi (A4) — mengikuti format surat pernyataan orang tua:
 * kop surat, judul, identitas ortu + anak, rincian angsuran + total, ketentuan,
 * dan blok tanda tangan (ortu + pihak bimbel).
 */
export function buildStatementHtml(s: ParentStatement, c: CompanyInfo | null): string {
	const logo = resolveAssetUrl(c?.logoUrl ?? '') || '/logo-gfs.png';
	const inst = s.installments ?? [];
	const dateStr = new Date(s.agreedAt).toLocaleDateString('id-ID', {
		day: 'numeric',
		month: 'long',
		year: 'numeric',
	});
	const city = (() => {
		const parts = (c?.address ?? '').split(',').map((x) => x.trim()).filter(Boolean);
		return parts.length > 1 ? parts[parts.length - 1] : '';
	})();
	const rows = inst
		.map(
			(i, n) => `<tr>
        <td class="ctr">${n + 1}</td>
        <td>${esc(i.label)}</td>
        <td class="r">${rupiah(i.amount)}</td>
      </tr>`,
		)
		.join('');
	const terms = STATEMENT_TERMS.map((t) => `<li>${esc(t)}</li>`).join('');
	return `<!doctype html>
<html><head><meta charset="utf-8"><title>Surat Pernyataan - ${esc(s.studentName)}</title>
<style>
  * { box-sizing:border-box; }
  body { font-family:'Segoe UI', Arial, sans-serif; color:#111; margin:0; padding:28px; }
  .doc { max-width:740px; margin:0 auto; }
  .head { display:flex; align-items:center; gap:12px; border-bottom:3px double #1e3a5f; padding-bottom:10px; }
  .head img { height:52px; width:52px; object-fit:contain; }
  .brand { font-size:20px; font-weight:800; color:#1e3a5f; }
  .addr { font-size:11.5px; color:#555; }
  h1 { text-align:center; font-size:17px; letter-spacing:2px; margin:20px 0 4px; text-decoration:underline; }
  .sub { text-align:center; font-size:12px; color:#555; margin-bottom:18px; }
  p, li { font-size:13.5px; line-height:1.55; text-align:justify; }
  table.meta { width:100%; font-size:13.5px; border-collapse:collapse; margin:8px 0 14px; }
  table.meta td { padding:3px 4px; vertical-align:top; }
  table.meta td.k { width:170px; font-weight:600; }
  table.meta td.k2 { width:200px; font-weight:600; }
  table.pay { width:100%; border-collapse:collapse; margin:6px 0 10px; font-size:13px; }
  table.pay th, table.pay td { border:1px solid #666; padding:5px 8px; }
  table.pay th { background:#eef2f7; text-align:left; }
  .ctr { text-align:center; width:44px; }
  .r { text-align:right; white-space:nowrap; }
  tr.total td { font-weight:800; background:#f6f8fb; }
  ol.terms { margin:6px 0 0; padding-left:20px; }
  .sigs { display:flex; justify-content:space-between; margin-top:26px; font-size:13px; }
  .sig { text-align:center; min-width:230px; }
  .sig .space { height:76px; display:flex; align-items:flex-end; justify-content:center; }
  .sig img { max-height:72px; max-width:200px; object-fit:contain; }
  .sig .name { font-weight:700; border-bottom:1px solid #333; display:inline-block; min-width:190px; padding-bottom:2px; }
  .sig .role { color:#444; font-size:12px; }
  .sig .materai { font-size:11px; color:#777; border:1px dashed #999; border-radius:4px; padding:18px 10px; }
  @media print { body { padding:0; } }
</style></head><body>
<div class="doc">
  <div class="head">
    <img src="${esc(logo)}" alt="logo" onerror="this.style.display='none'">
    <div>
      <div class="brand">${esc(c?.name ?? 'BimbelGFS')}</div>
      <div class="addr">${esc(c?.address)}${c?.phone ? ` · ${esc(c.phone)}` : ''}${c?.email ? ` · ${esc(c.email)}` : ''}</div>
    </div>
  </div>
  <h1>SURAT PERNYATAAN ORANG TUA</h1>
  <div class="sub">Nomor: SP/${esc(s.id.slice(0, 8).toUpperCase())}</div>
  <p>Yang bertanda tangan di bawah ini:</p>
  <table class="meta">
    <tr><td class="k">Nama Orang Tua / Wali</td><td>: <b>${esc(s.parentName)}</b></td></tr>
    <tr><td class="k">Alamat</td><td>: ${esc(s.address)}</td></tr>
    <tr><td class="k">No. HP / WhatsApp</td><td>: ${esc(s.phone)}</td></tr>
  </table>
  <p>Selaku orang tua / wali dari siswa:</p>
  <table class="meta">
    <tr><td class="k">Nama Siswa</td><td>: <b>${esc(s.studentName)}</b></td></tr>
    <tr><td class="k">Kelas / Jenjang</td><td>: ${esc(s.levelName)}</td></tr>
    <tr><td class="k">Asal Sekolah</td><td>: ${esc(s.schoolOrigin)}</td></tr>
    <tr><td class="k">Program yang Dipilih</td><td>: <b>${esc(s.programName)}</b></td></tr>
    <tr><td class="k">Sistem Pembayaran</td><td>: ${esc(s.paymentLabel)}</td></tr>
  </table>
  <p>Dengan ini menyetujui rincian pembayaran sebagai berikut:</p>
  <table class="pay">
    <thead><tr><th class="ctr">Ke</th><th>Keterangan</th><th class="r">Nominal</th></tr></thead>
    <tbody>
      ${rows}
      <tr class="total"><td></td><td>TOTAL</td><td class="r">${rupiah(s.totalAmount)}</td></tr>
    </tbody>
  </table>
  <table class="meta">
    <tr><td class="k2">Tanggal jatuh tempo tiap angsuran</td><td>: Tanggal ${s.dueDay} setiap bulan</td></tr>
  </table>
  <p><b>Ketentuan administrasi:</b></p>
  <ol class="terms">${terms}</ol>
  <p>Demikian surat pernyataan ini saya buat dengan sebenar-benarnya tanpa paksaan dari pihak manapun, untuk dipergunakan sebagaimana mestinya.</p>
  <div class="sigs">
    <div class="sig">
      <div>${esc(city ? `${city}, ` : '')}${dateStr}</div>
      <div class="role">${esc(c?.signerTitle?.trim() || 'Pihak Bimbel')}</div>
      <div class="space">
        ${c?.signatureUrl ? `<img src="${esc(resolveAssetUrl(c.signatureUrl))}" alt="TTD" onerror="this.style.display='none'">` : ''}
      </div>
      <div class="name">${esc(c?.signerName?.trim() || 'Admin')}</div>
    </div>
    <div class="sig">
      <div>&nbsp;</div>
      <div class="role">Orang Tua / Wali</div>
      <div class="space">
        ${s.signatureData
					? `<img src="${s.signatureData}" alt="TTD ortu">`
					: '<span class="materai">Materai<br>Rp10.000</span>'}
      </div>
      <div class="name">${esc(s.parentName)}</div>
    </div>
  </div>
</div>
</body></html>`;
}

/**
 * Tombol "Cetak Surat Pernyataan". `base`: "/me/enrollments" (orang tua) atau
 * "/enrollments" (admin/staff) — keduanya melayani GET /:id/statement.
 */
export function PrintStatementButton({
	enrollmentId,
	base,
}: {
	enrollmentId: string;
	base: '/me/enrollments' | '/enrollments';
}) {
	const [busy, setBusy] = useState(false);

	async function handlePrint() {
		const win = window.open('', '_blank', 'width=820,height=640');
		if (!win) {
			toast.error('Popup diblokir browser — izinkan popup untuk mencetak.');
			return;
		}
		setBusy(true);
		try {
			const [resp, company, branding] = await Promise.all([
				apiFetch<{ statement: ParentStatement | null }>(`${base}/${enrollmentId}/statement`),
				apiFetch<CompanyInfo>('/company-info').catch(() => null),
				apiFetch<{ logoUrl?: string }>('/public/branding', { auth: false }).catch(() => null),
			]);
			if (!resp.statement) {
				win.close();
				toast.error('Surat pernyataan belum ditandatangani orang tua.');
				return;
			}
			const info: CompanyInfo | null = company
				? { ...company, logoUrl: company.logoUrl || branding?.logoUrl || '' }
				: branding?.logoUrl
					? { name: 'BimbelGFS', address: '', phone: '', email: '', logoUrl: branding.logoUrl }
					: null;
			win.document.open();
			win.document.write(buildStatementHtml(resp.statement, info));
			win.document.close();
			win.focus();
			setTimeout(() => win.print(), 300);
		} catch (e) {
			toast.error(e instanceof ApiError ? e.message : 'Gagal memuat surat pernyataan.');
			win.close();
		} finally {
			setBusy(false);
		}
	}

	return (
		<Button variant="outline" size="sm" onClick={handlePrint} disabled={busy}>
			<FileText /> {busy ? 'Menyiapkan...' : 'Cetak Surat'}
		</Button>
	);
}
