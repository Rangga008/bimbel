"use client";

import { Medal, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/shared/user-avatar";
import type { LeaderboardEntry } from "./leaderboard-card";

const PODIUM_STYLE: Record<number, { box: string; avatar: string; order: number; height: string }> = {
	1: { box: "bg-brand-gold-100 border-brand-gold-400", avatar: "size-16", order: 1, height: "min-h-[8.5rem]" },
	2: { box: "bg-muted border-border", avatar: "size-12", order: 0, height: "min-h-[7rem]" },
	3: { box: "bg-warning-50 border-warning-300", avatar: "size-12", order: 2, height: "min-h-[6.5rem]" },
};

function PodiumPlace({ entry, isMe }: { entry?: LeaderboardEntry; isMe?: boolean }) {
	if (!entry) {
		return <div className="min-w-0" />;
	}
	const st = PODIUM_STYLE[entry.rank] ?? PODIUM_STYLE[3];
	return (
		<div
			className={cn(
				"flex min-w-0 flex-col items-center justify-end gap-1 rounded-xl border p-2 pt-4 text-center",
				st.box,
				st.height,
				isMe && "ring-2 ring-primary",
			)}
			style={{ order: st.order }}
		>
			<span
				className={cn(
					"flex items-center justify-center rounded-full font-bold tabular-nums",
					entry.rank === 1
						? "bg-brand-gold-500 text-white size-7 text-sm"
						: entry.rank === 2
							? "bg-neutral-300 text-neutral-800 size-6 text-xs"
							: "bg-warning-400/60 text-warning-900 size-6 text-xs",
				)}
			>
				{entry.rank}
			</span>
			<UserAvatar name={entry.studentName} avatarUrl={entry.avatarUrl} className={st.avatar} />
			<p className="w-full truncate text-xs font-semibold leading-tight sm:text-sm">
				{entry.studentName}
			</p>
			{isMe ? <Badge variant="secondary">Anda</Badge> : null}
			<p className="text-xs font-semibold tabular-nums text-muted-foreground">
				{entry.totalPoints.toLocaleString("id-ID")} poin
			</p>
		</div>
	);
}

/** Satu kolom podium: judul scope + top-3 podium + peringkat 4+ list ringkas. */
export function PodiumColumn({
	title,
	subtitle,
	entries,
	loading,
	highlightStudentId,
	maxList = 10,
}: {
	title: string;
	subtitle?: string;
	entries?: LeaderboardEntry[];
	loading?: boolean;
	highlightStudentId?: string | null;
	maxList?: number;
}) {
	const top3 = entries?.slice(0, 3) ?? [];
	const rest = entries?.slice(3, maxList) ?? [];
	return (
		<div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
			<div className="flex items-center justify-center gap-2">
				<Medal className="size-4 text-brand-gold-500" />
				<p className="text-sm font-semibold uppercase tracking-wide">{title}</p>
			</div>
			{subtitle ? <p className="-mt-2 text-center text-xs text-muted-foreground">{subtitle}</p> : null}
			{loading ? (
				<Skeleton className="h-40 w-full" />
			) : !entries?.length ? (
				<p className="py-8 text-center text-xs text-muted-foreground">Belum ada poin di scope ini.</p>
			) : (
				<>
					<div className="grid grid-cols-3 items-end gap-2">
						<PodiumPlace entry={top3.find((e) => e.rank === 2)} isMe={highlightStudentId === top3.find((e) => e.rank === 2)?.studentId} />
						<PodiumPlace entry={top3.find((e) => e.rank === 1)} isMe={highlightStudentId === top3.find((e) => e.rank === 1)?.studentId} />
						<PodiumPlace entry={top3.find((e) => e.rank === 3)} isMe={highlightStudentId === top3.find((e) => e.rank === 3)?.studentId} />
					</div>
					{rest.length > 0 ? (
						<div className="flex flex-col divide-y rounded-lg border">
							{rest.map((e) => (
								<div
									key={e.studentId}
									className={cn(
										"flex items-center gap-2.5 px-3 py-2 text-xs",
										highlightStudentId === e.studentId && "bg-brand-blue-50",
									)}
								>
									<span className="w-5 text-center font-semibold tabular-nums text-muted-foreground">
										{e.rank}
									</span>
									<UserAvatar name={e.studentName} avatarUrl={e.avatarUrl} className="size-6" />
									<span className="min-w-0 flex-1 truncate font-medium">
										{e.studentName}
										{highlightStudentId === e.studentId ? (
											<Badge variant="secondary" className="ml-1">Anda</Badge>
										) : null}
									</span>
									<span className="font-semibold tabular-nums">{e.totalPoints.toLocaleString("id-ID")}</span>
								</div>
							))}
						</div>
					) : null}
				</>
			)}
		</div>
	);
}

/** Papan podium multi-scope ala leaderboard GO: Kelompok | Gedung | GFS. */
export function PodiumBoard({
	columns,
}: {
	columns: {
		title: string;
		subtitle?: string;
		entries?: LeaderboardEntry[];
		loading?: boolean;
		highlightStudentId?: string | null;
	}[];
}) {
	return (
		<div className="rounded-2xl border bg-gradient-to-b from-brand-gold-50/60 to-background p-4">
			<div className="mb-4 flex items-center justify-center gap-2">
				<Trophy className="size-5 text-brand-gold-500" />
				<h3 className="text-base font-bold tracking-tight">Top Skor Pengerjaan Soal</h3>
			</div>
			<div className="grid gap-4 md:grid-cols-3">
				{columns.map((c) => (
					<PodiumColumn key={c.title} {...c} />
				))}
			</div>
		</div>
	);
}
