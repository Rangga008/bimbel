import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Card, CardContent } from "@/components/ui/card";
import type { RoleKey } from "@/config/role-nav";
import { ROLE_LABELS } from "@/config/role-nav";

interface SkeletonPageProps {
	role: RoleKey;
	title: string;
}

/** Halaman placeholder Fase 0: judul + breadcrumb saja, data nyata menyusul di fase modul terkait. */
export function SkeletonPage({ role, title }: SkeletonPageProps) {
	return (
		<div className="flex flex-col gap-4">
			<Breadcrumb>
				<BreadcrumbList>
					<BreadcrumbItem>
						<BreadcrumbLink href={`/${role}`}>
							{ROLE_LABELS[role]}
						</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbPage>{title}</BreadcrumbPage>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>

			<h1 className="text-2xl font-semibold tracking-tight">{title}</h1>

			<Card>
				<CardContent className="py-10 text-center text-sm text-muted-foreground">
					Halaman "{title}" belum memiliki data — modul ini akan dibangun di
					fase berikutnya.
				</CardContent>
			</Card>
		</div>
	);
}
