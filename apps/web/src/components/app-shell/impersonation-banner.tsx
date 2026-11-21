"use client";

import { useRouter } from "next/navigation";
import { LogOut, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/auth-store";
import { ROLE_KEY_BY_BACKEND_NAME } from "@/config/role-nav";

/** Banner muncul saat admin sedang "Login sebagai" akun lain —
 *  satu klik mengembalikan ke akun admin semula. */
export function ImpersonationBanner() {
	const router = useRouter();
	const impersonator = useAuthStore((s) => s.impersonator);
	const user = useAuthStore((s) => s.user);
	const stopImpersonating = useAuthStore((s) => s.stopImpersonating);

	if (!impersonator || !user) return null;

	const back = () => {
		const stash = stopImpersonating();
		const roleKey = stash?.user.roles[0]
			? ROLE_KEY_BY_BACKEND_NAME[stash.user.roles[0]]
			: undefined;
		router.replace(roleKey ? `/${roleKey}` : "/");
	};

	return (
		<div className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-center gap-2 border-t bg-amber-500 px-3 py-2 text-amber-950 shadow-lg">
			<UserCog className="size-4 shrink-0" />
			<p className="min-w-0 truncate text-xs font-medium sm:text-sm">
				Anda sedang login sebagai <strong>{user.name}</strong> (
				{impersonator.user.name})
			</p>
			<Button
				size="sm"
				variant="secondary"
				className="h-7 shrink-0 bg-amber-950 text-amber-50 hover:bg-amber-900"
				onClick={back}
			>
				<LogOut className="size-3.5" /> Kembali ke akun saya
			</Button>
		</div>
	);
}
