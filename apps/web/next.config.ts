import type { NextConfig } from "next";

// Header keamanan dasar untuk respons web — pelengkap helmet di API.
const securityHeaders = [
	// Cegah clickjacking: halaman app tidak perlu di-embed iframe pihak lain.
	{ key: "X-Frame-Options", value: "SAMEORIGIN" },
	{ key: "X-Content-Type-Options", value: "nosniff" },
	{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
	// Batasi akses fitur browser yang tidak dipakai aplikasi.
	{
		key: "Permissions-Policy",
		value: "camera=(), microphone=(), geolocation=(), payment=()",
	},
];

const nextConfig: NextConfig = {
	output: "standalone",
	async headers() {
		return [{ source: "/:path*", headers: securityHeaders }];
	},
};

export default nextConfig;
