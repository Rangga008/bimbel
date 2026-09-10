"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

// `next-themes`' declared props type doesn't resolve `children` correctly under this
// TS/React version combo, so we widen the signature here rather than fight the upstream type.
const ThemeProviderImpl = NextThemesProvider as unknown as (props: {
	attribute?: string;
	defaultTheme?: string;
	enableSystem?: boolean;
	children?: ReactNode;
}) => React.JSX.Element;

export function ThemeProvider({ children }: { children: ReactNode }) {
	return (
		<ThemeProviderImpl
			attribute="class"
			defaultTheme="light"
			enableSystem={false}
		>
			{children}
		</ThemeProviderImpl>
	);
}
