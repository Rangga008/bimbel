"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
	Banknote,
	Calendar,
	ChartLine,
	MessageSquareText,
	Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { apiFetch, ApiError } from "@/lib/api-client";

type ReminderType =
	| "payment-due"
	| "weekly-schedule"
	| "monthly-performance"
	| "feedback";

interface ReminderResult {
	queued: number;
	recipients: number;
	skippedNoPhone: number;
	skippedPref: number;
}

const REMINDERS: Array<{
	type: ReminderType;
	label: string;
	description: string;
	icon: typeof Send;
}> = [
	{
		type: "payment-due",
		label: "Reminder Bayar",
		description: "Tagihan belum lunas ke ortu anggota",
		icon: Banknote,
	},
	{
		type: "weekly-schedule",
		label: "Reminder Jadwal",
		description: "Jadwal sesi minggu ini",
		icon: Calendar,
	},
	{
		type: "monthly-performance",
		label: "Reminder Performa",
		description: "Rekap kehadiran bulan ini",
		icon: ChartLine,
	},
	{
		type: "feedback",
		label: "Reminder Feedback",
		description: "Ajakan isi feedback mingguan",
		icon: MessageSquareText,
	},
];

/** Panel tombol reminder WA per kelompok — kirim ke ortu anggota via outbox. */
export function GroupReminders({ groupId }: { groupId: string }) {
	const [pending, setPending] = useState<ReminderType | null>(null);
	const sendM = useMutation({
		mutationFn: (type: ReminderType) =>
			apiFetch<ReminderResult>(`/groups/${groupId}/reminders/${type}`, {
				method: "POST",
			}),
		onSuccess: (r) => {
			setPending(null);
			const skip =
				r.skippedNoPhone + r.skippedPref > 0
					? ` (${r.skippedNoPhone} tanpa no. HP, ${r.skippedPref} menonaktifkan WA)`
					: "";
			toast.success(
				r.queued > 0
					? `${r.queued} pesan WA diantrekan ke ${r.recipients} orang tua.${skip}`
					: `Tidak ada pesan terkirim${skip ? ` —${skip}` : " — cek no. HP ortu atau pengiriman sudah pernah dilakukan periode ini."}`,
			);
		},
		onError: (e) => {
			setPending(null);
			toast.error(e instanceof ApiError ? e.message : "Gagal mengirim reminder.");
		},
	});
	const active = REMINDERS.find((r) => r.type === pending);

	return (
		<Card>
			<CardHeader className="pb-2">
				<CardTitle className="flex items-center gap-2 text-base">
					<Send className="size-4" /> Reminder WhatsApp
				</CardTitle>
				<p className="text-xs text-muted-foreground">
					Kirim pengingat ke orang tua anggota kelompok — pesan masuk antrean WA (dedupe per periode).
				</p>
			</CardHeader>
			<CardContent className="flex flex-wrap gap-2">
				{REMINDERS.map((r) => (
					<Button
						key={r.type}
						variant="outline"
						size="sm"
						disabled={sendM.isPending}
						onClick={() => setPending(r.type)}
					>
						<r.icon className="size-4" />
						{r.label}
					</Button>
				))}
				<ConfirmDialog
					open={pending !== null}
					onOpenChange={(o) => !o && setPending(null)}
					tone="primary"
					title={`Kirim ${active?.label ?? "reminder"}?`}
					description={`${active?.description ?? ""}. Pesan WhatsApp akan diantrekan ke semua orang tua anggota kelompok ini.`}
					confirmLabel="Kirim ke WhatsApp"
					pending={sendM.isPending}
					onConfirm={() => pending && sendM.mutate(pending)}
				/>
			</CardContent>
		</Card>
	);
}
