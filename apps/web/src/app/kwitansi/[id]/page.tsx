"use client";

import { Printer } from "lucide-react";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import {
	buildReceiptHtml,
	type CompanyInfo,
	type ReceiptDetail,
} from "@/components/phase2b/receipt-print";
import { Button } from "@/components/ui/button";
import { useBranding } from "@/lib/use-branding";

type PublicReceipt = ReceiptDetail & { company: CompanyInfo };

export default function KwitansiPage() {
	const { id } = useParams<{ id: string }>();
	const branding = useBranding();

	const receiptQ = useQuery<PublicReceipt>({
		queryKey: ["public-receipt", id],
		queryFn: () =>
			apiFetch<PublicReceipt>(`/public/receipt/${id}`, { auth: false }),
		retry: false,
	});

	// buildReceiptHtml menghasilkan dokumen HTML lengkap — render via iframe.
	const srcDoc = useMemo(
		() =>
			receiptQ.data
				? buildReceiptHtml(receiptQ.data, receiptQ.data.company)
				: "",
		[receiptQ.data],
	);

	return (
		<div className="min-h-dvh bg-muted/40">
			<header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-white/10 bg-brand-blue-900 px-4 text-white">
				<div>
					<h1 className="text-sm font-semibold">{branding.appName}</h1>
					<p className="text-xs text-brand-blue-200">
						Kwitansi {receiptQ.data?.number ?? ""}
					</p>
				</div>
				<Button
					size="sm"
					disabled={!srcDoc}
					className="bg-brand-gold-400 font-semibold text-brand-blue-900 hover:bg-brand-gold-300"
					onClick={() => {
						const frame = document.getElementById(
							"receipt-frame",
						) as HTMLIFrameElement | null;
						frame?.contentWindow?.print();
					}}
				>
					<Printer className="mr-2 h-4 w-4" /> Cetak / Unduh PDF
				</Button>
			</header>
			<main className="mx-auto max-w-4xl p-4">
				{receiptQ.isLoading ? (
					<div className="flex h-96 items-center justify-center text-sm text-muted-foreground">
						Memuat kwitansi…
					</div>
				) : receiptQ.isError ? (
					<div className="flex h-96 items-center justify-center text-sm text-muted-foreground">
						Kwitansi tidak ditemukan atau tautan tidak valid.
					</div>
				) : (
					<iframe
						id="receipt-frame"
						title="Kwitansi Pembayaran"
						srcDoc={srcDoc}
						className="h-[85vh] w-full rounded-xl border bg-white"
					/>
				)}
			</main>
		</div>
	);
}
