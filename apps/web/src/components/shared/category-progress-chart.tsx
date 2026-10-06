"use client";

import { useId } from "react";

export interface CategoryProgressPoint {
	attemptId: string;
	examTitle: string;
	date: string | Date | null;
	perCategory: Record<
		string,
		{ correct: number; total: number; score: number; maxScore: number; percent: number }
	>;
}

export interface CategoryProgressData {
	categories: string[];
	points: CategoryProgressPoint[];
}

const PALETTE = [
	"#2563eb",
	"#16a34a",
	"#d97706",
	"#dc2626",
	"#7c3aed",
	"#0891b2",
	"#db2777",
	"#65a30d",
];

function fmtShort(d: string | Date | null) {
	if (!d) return "";
	const dt = d instanceof Date ? d : new Date(d);
	if (Number.isNaN(dt.getTime())) return "";
	return `${dt.getDate()}/${dt.getMonth() + 1}`;
}

/**
 * Grafik garis perkembangan nilai per bab (kategori soal) antar ujian.
 * Sumbu Y = persen skor (0-100), sumbu X = attempt kronologis.
 * SVG murni — tanpa dependency chart.
 */
export function CategoryProgressChart({ data }: { data: CategoryProgressData }) {
	const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
	const W = 640;
	const H = 260;
	const pad = { l: 40, r: 12, t: 14, b: 46 };
	const iw = W - pad.l - pad.r;
	const ih = H - pad.t - pad.b;
	const n = data.points.length;
	const x = (i: number) => pad.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
	const y = (pct: number) => pad.t + ih - (Math.max(0, Math.min(100, pct)) / 100) * ih;

	return (
		<div className="w-full overflow-x-auto">
			<svg
				viewBox={`0 0 ${W} ${H}`}
				className="h-64 min-w-[480px] w-full"
				role="img"
				aria-label="Grafik perkembangan nilai per bab"
			>
				{/* grid + label sumbu Y */}
				{[0, 25, 50, 75, 100].map((v) => (
					<g key={v}>
						<line
							x1={pad.l}
							x2={W - pad.r}
							y1={y(v)}
							y2={y(v)}
							className="stroke-muted"
							strokeDasharray={v === 0 ? undefined : "3 4"}
						/>
						<text
							x={pad.l - 6}
							y={y(v) + 4}
							textAnchor="end"
							className="fill-muted-foreground text-[10px]"
						>
							{v}
						</text>
					</g>
				))}
				{/* label sumbu X — judul ujian pendek + tanggal */}
				{data.points.map((p, i) => (
					<text
						key={p.attemptId}
						x={x(i)}
						y={H - 28}
						textAnchor="end"
						transform={`rotate(-35 ${x(i)} ${H - 28})`}
						className="fill-muted-foreground text-[9px]"
					>
						{p.examTitle.length > 22 ? `${p.examTitle.slice(0, 21)}…` : p.examTitle}
						{` (${fmtShort(p.date)})`}
					</text>
				))}
				{/* garis per bab */}
				{data.categories.map((cat, ci) => {
					const color = PALETTE[ci % PALETTE.length];
					const pts = data.points
						.map((p, i) => ({ i, v: p.perCategory[cat]?.percent }))
						.filter((p): p is { i: number; v: number } => p.v !== undefined);
					if (!pts.length) return null;
					const d = pts
						.map((p, k) => `${k === 0 ? "M" : "L"}${x(p.i)},${y(p.v)}`)
						.join(" ");
					return (
						<g key={cat}>
							<path d={d} fill="none" stroke={color} strokeWidth={2} />
							{pts.map((p) => (
								<circle
									key={`${cat}-${p.i}`}
									cx={x(p.i)}
									cy={y(p.v)}
									r={3.5}
									fill={color}
								>
									<title>
										{cat}: {p.v}% — {data.points[p.i].examTitle}
									</title>
								</circle>
							))}
						</g>
					);
				})}
				<g id={uid} />
			</svg>
			{/* legenda */}
			<div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
				{data.categories.map((cat, ci) => (
					<span key={cat} className="flex items-center gap-1.5 text-xs text-muted-foreground">
						<span
							className="inline-block size-2.5 rounded-full"
							style={{ backgroundColor: PALETTE[ci % PALETTE.length] }}
						/>
						{cat}
					</span>
				))}
			</div>
		</div>
	);
}
