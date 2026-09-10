"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { ROLE_KEY_BY_BACKEND_NAME } from "@/config/role-nav";

export default function Home() {
	const router = useRouter();
	const user = useAuthStore((state) => state.user);

	useEffect(() => {
		if (!user) {
			router.replace("/login");
			return;
		}
		const roleKey = ROLE_KEY_BY_BACKEND_NAME[user.roles[0]];
		router.replace(roleKey ? `/${roleKey}` : "/login");
	}, [user, router]);

	return null;
}
