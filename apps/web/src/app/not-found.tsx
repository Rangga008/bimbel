// Halaman 404 — tautan salah / halaman tidak ada.
import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function NotFound() {
	return (
		<div className="mx-auto flex min-h-[60vh] max-w-3xl items-center justify-center p-6">
			<Card className="mx-auto max-w-lg">
				<CardContent className="flex flex-col items-center gap-3 py-10 text-center">
					<span className="rounded-full bg-muted p-3 text-muted-foreground">
						<SearchX className="size-6" />
					</span>
					<div>
						<p className="text-lg font-semibold">Error 404 — Halaman tidak ditemukan</p>
						<p className="mt-1 text-sm text-muted-foreground">
							Alamat yang Anda buka salah ketik, atau halamannya sudah dipindah/dihapus.
						</p>
						<p className="mt-1 text-xs text-muted-foreground">
							Periksa kembali URL, atau kembali ke beranda lalu navigasi lewat menu.
						</p>
					</div>
					<Link href="/">
						<Button size="sm" variant="outline">Ke Beranda</Button>
					</Link>
				</CardContent>
			</Card>
		</div>
	);
}
