import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Proxy same-origin ke service API. Browser memanggil /api/* di domain web,
// route ini meneruskan ke backend lewat API_INTERNAL_URL (private network
// Railway) atau NEXT_PUBLIC_API_URL sebagai fallback. Dengan begini cookie
// refresh-token menjadi first-party SameSite=Lax — selalu terkirim, tidak
// terblokir aturan third-party-cookie saat web & API beda domain.
// Bila hanya NEXT_PUBLIC_API_URL=/api (relatif) yang diset tanpa
// API_INTERNAL_URL, jangan proxy ke diri sendiri — fallback default.
const rawBase =
	process.env.API_INTERNAL_URL ??
	process.env.NEXT_PUBLIC_API_URL ??
	"";
const API_BASE = (
	rawBase.startsWith("http") ? rawBase : "http://localhost:3000/api"
).replace(/\/+$/, "");

const HOP_BY_HOP = new Set([
	"connection",
	"keep-alive",
	"proxy-authenticate",
	"proxy-authorization",
	"te",
	"trailer",
	"transfer-encoding",
	"upgrade",
	"host",
	"content-length",
]);

async function proxy(
	req: NextRequest,
	ctx: { params: Promise<{ path: string[] }> },
) {
	const { path } = await ctx.params;
	const target = `${API_BASE}/${path.join("/")}${req.nextUrl.search}`;

	const headers = new Headers();
	req.headers.forEach((value, key) => {
		if (!HOP_BY_HOP.has(key.toLowerCase())) headers.set(key, value);
	});

	const hasBody = req.method !== "GET" && req.method !== "HEAD";
	const upstream = await fetch(target, {
		method: req.method,
		headers,
		body: hasBody ? req.body : undefined,
		// Node fetch mewajibkan duplex saat body berupa stream.
		duplex: "half",
		redirect: "manual",
	} as RequestInit);

	const resHeaders = new Headers();
	upstream.headers.forEach((value, key) => {
		const k = key.toLowerCase();
		if (!HOP_BY_HOP.has(k) && k !== "set-cookie") resHeaders.append(key, value);
	});
	// Response.headers menggabungkan multi Set-Cookie — ambil tiap-tiap via getSetCookie.
	const getSetCookie = (
		upstream.headers as Headers & { getSetCookie?: () => string[] }
	).getSetCookie;
	for (const cookie of getSetCookie?.call(upstream.headers) ?? []) {
		resHeaders.append("set-cookie", cookie);
	}

	return new Response(upstream.body, {
		status: upstream.status,
		statusText: upstream.statusText,
		headers: resHeaders,
	});
}

export {
	proxy as GET,
	proxy as POST,
	proxy as PUT,
	proxy as PATCH,
	proxy as DELETE,
	proxy as OPTIONS,
};
