"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BookOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, resolveAssetUrl } from "@/lib/api-client";
import type { MaterialRow } from "@/lib/phase3a-types";

function isImage(type: string | null) {
	if (!type) return false;
	const t = type.toLowerCase();
	return t.startsWith("image/");
}

function isPdf(type: string | null) {
	if (!type) return false;
	const t = type.toLowerCase();
	return t === "application/pdf" || t === "pdf";
}

export default function MaterialViewPage() {
	const params = useParams();
	const router = useRouter();
	const id = typeof params.id === "string" ? params.id : "";

	const q = useQuery({
		queryKey: ["material", id],
		queryFn: () => apiFetch<MaterialRow>(`/materials/${id}`),
		enabled: !!id,
	});

	const m = q.data;

	return (
		<div className="min-h-screen bg-background">
			<header className="sticky top-0 z-30 flex items-center gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur">
				<Button variant="ghost" size="sm" onClick={() => router.back()}>
					<ArrowLeft className="mr-1.5 size-4" />
					Kembali
				</Button>
				{m ? (
					<div className="min-w-0">
						<p className="truncate text-sm font-semibold">{m.title}</p>
						<p className="truncate text-xs text-muted-foreground">
							{m.subject?.name ?? "-"} · {m.level?.name ?? "-"}
						</p>
					</div>
				) : null}
			</header>

			<main className="mx-auto w-full max-w-4xl p-4 sm:p-6">
				{q.isLoading ? (
					<Skeleton className="h-64 w-full" />
				) : q.isError ? (
					<p className="text-sm text-destructive">Gagal memuat materi.</p>
				) : m ? (
					<div className="flex flex-col gap-4">
						<div className="flex items-start gap-3">
							<div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-blue-50 text-primary">
								<BookOpen className="size-5" />
							</div>
							<div className="min-w-0 flex-1">
								<h1 className="text-xl font-semibold tracking-tight">{m.title}</h1>
								<p className="text-sm text-muted-foreground">{m.description || "Tidak ada deskripsi"}</p>
								<div className="mt-2 flex flex-wrap gap-1.5">
									{m.category && <Badge>{m.category}</Badge>}
									{m.subject && <Badge variant="secondary">{m.subject.name}</Badge>}
									{m.level && <Badge variant="outline">{m.level.name}</Badge>}
									{m.program && <Badge variant="outline">{m.program.name}</Badge>}
								</div>
							</div>
						</div>

						{m.content ? (
							<div
								className="prose max-w-none rounded-md border bg-white p-4"
								dangerouslySetInnerHTML={{ __html: m.content }}
							/>
						) : null}

						{m.fileUrl ? (
							<div className="rounded-md border bg-white p-2">
								{isImage(m.fileType) ? (
									<img
										src={resolveAssetUrl(m.fileUrl)}
										alt={m.title}
										className="mx-auto max-h-[80vh] w-auto object-contain"
									/>
								) : isPdf(m.fileType) ? (
									<iframe
										src={resolveAssetUrl(m.fileUrl)}
										title={m.title}
										className="h-[80vh] w-full"
									/>
								) : (
									<a
										href={resolveAssetUrl(m.fileUrl)}
										target="_blank"
										rel="noopener noreferrer"
										className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
									>
										Buka file
									</a>
								)}
							</div>
						) : null}
					</div>
				) : null}
			</main>
		</div>
	);
}
