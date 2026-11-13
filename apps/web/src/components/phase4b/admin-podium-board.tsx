"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { ComboboxField } from "@/components/shared/combobox-field";
import { PodiumBoard } from "./podium-board";
import type { LeaderboardEntry } from "./leaderboard-card";

interface LeaderboardResponse {
	period: string;
	leaderboard: LeaderboardEntry[];
	me: { studentId: string; rank: number; totalPoints: number } | null;
}

interface NamedOption {
	id: string;
	name: string;
	isActive?: boolean;
}

function currentPeriod() {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Papan podium untuk admin/owner — 3 scope sekaligus ala leaderboard GO:
 * Kelompok | Gedung | Seluruh GFS. Periode & scope bisa dipilih.
 */
export function AdminPodiumBoard() {
	const [period, setPeriod] = useState(currentPeriod());
	const [allTime, setAllTime] = useState(true);
	const [groupId, setGroupId] = useState("");
	const [buildingId, setBuildingId] = useState("");

	const groupsQ = useQuery({
		queryKey: ["options-groups"],
		queryFn: () => apiFetch<NamedOption[]>("/groups"),
	});
	const buildingsQ = useQuery({
		queryKey: ["options-buildings"],
		queryFn: () => apiFetch<NamedOption[]>("/buildings"),
	});

	// Otomatis pilih kelompok/gedung pertama SEKALI saat data pertama masuk —
	// setelah itu user bebas mengosongkan filter (tombol × di combobox).
	const groupAutoPicked = useRef(false);
	const buildingAutoPicked = useRef(false);
	useEffect(() => {
		if (!groupAutoPicked.current && groupsQ.data?.length) {
			groupAutoPicked.current = true;
			const first = groupsQ.data.find((g) => g.isActive !== false) ?? groupsQ.data[0];
			setGroupId(first.id);
		}
	}, [groupsQ.data]);
	useEffect(() => {
		if (!buildingAutoPicked.current && buildingsQ.data?.length) {
			buildingAutoPicked.current = true;
			const first = buildingsQ.data.find((b) => b.isActive !== false) ?? buildingsQ.data[0];
			setBuildingId(first.id);
		}
	}, [buildingsQ.data]);

	const base = allTime ? "" : `period=${period}&`;
	const groupQ = useQuery({
		queryKey: ["leaderboard", "podium-group", groupId, base],
		queryFn: () =>
			apiFetch<LeaderboardResponse>(`/point-transactions/leaderboard?${base}groupId=${groupId}`),
		enabled: !!groupId,
	});
	const buildingQ = useQuery({
		queryKey: ["leaderboard", "podium-building", buildingId, base],
		queryFn: () =>
			apiFetch<LeaderboardResponse>(
				`/point-transactions/leaderboard?${base}buildingId=${buildingId}`,
			),
		enabled: !!buildingId,
	});
	const globalQ = useQuery({
		queryKey: ["leaderboard", "podium-gfs", base],
		queryFn: () => apiFetch<LeaderboardResponse>(`/point-transactions/leaderboard?${base}`),
	});

	const groupName = groupsQ.data?.find((g) => g.id === groupId)?.name;
	const buildingName = buildingsQ.data?.find((b) => b.id === buildingId)?.name;

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-wrap items-center gap-2">
				<input
					type="month"
					value={period}
					disabled={allTime}
					onChange={(e) => setPeriod(e.target.value)}
					className="h-9 rounded-md border border-input bg-background px-3"
				/>
				<label className="flex items-center gap-2 text-sm">
					<input type="checkbox" checked={allTime} onChange={(e) => setAllTime(e.target.checked)} />
					Semua waktu
				</label>
				<div className="w-full sm:w-56">
					<ComboboxField
						id="podium-group"
						value={groupId}
						onChange={setGroupId}
						options={(groupsQ.data ?? []).map((g) => ({ value: g.id, label: g.name }))}
						placeholder="Pilih kelompok"
					/>
				</div>
				{/* Kolom gedung hanya untuk role yang boleh lihat daftar gedung
					(tutor tidak punya building.view → /buildings 403, kolom disembunyikan). */}
				{!buildingsQ.isError ? (
					<div className="w-full sm:w-56">
						<ComboboxField
							id="podium-building"
							value={buildingId}
							onChange={setBuildingId}
							options={(buildingsQ.data ?? []).map((b) => ({ value: b.id, label: b.name }))}
							placeholder="Pilih gedung"
						/>
					</div>
				) : null}
			</div>
			<PodiumBoard
				columns={[
					{
						title: "Kelompok",
						subtitle: groupName,
						entries: groupQ.data?.leaderboard,
						loading: groupQ.isLoading,
					},
					...(buildingsQ.isError
						? []
						: [
							{
								title: "Gedung",
								subtitle: buildingName,
								entries: buildingQ.data?.leaderboard,
								loading: buildingQ.isLoading,
							},
						]),
					{
						title: "GFS",
						subtitle: "seluruh Bimbel GFS",
						entries: globalQ.data?.leaderboard,
						loading: globalQ.isLoading,
					},
				]}
			/>
		</div>
	);
}
