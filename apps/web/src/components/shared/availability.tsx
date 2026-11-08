"use client";

import { useEffect, useRef, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { apiFetch } from "@/lib/api-client";

interface AvailabilityResponse {
  emailTaken?: boolean;
  phoneTaken?: boolean;
}

export interface AvailabilityState {
  emailTaken: boolean;
  phoneTaken: boolean;
  checking: boolean;
}

const EMPTY: AvailabilityState = { emailTaken: false, phoneTaken: false, checking: false };

function emailLooksValid(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function phoneLooksValid(v: string) {
  return v.replace(/\D/g, "").length >= 9;
}

function normalizePhone(v: string) {
  const d = v.replace(/\D/g, "");
  if (d.startsWith("0")) return `62${d.slice(1)}`;
  if (d.startsWith("8")) return `62${d}`;
  return d;
}

export interface AvailabilityOptions {
  /** Form edit: id user yang sedang diedit agar nilai miliknya tidak diwarn. */
  excludeUserId?: string;
  /** Alternatif tanpa userId: email/no HP awal milik record yang diedit. */
  excludeEmail?: string;
  excludePhone?: string;
}

/**
 * Cek email/no HP ke /auth/check-availability secara debounce — dipakai form
 * untuk menampilkan peringatan "sudah dipakai" sebelum submit. Nilai yang
 * belum valid formatnya tidak dicek. Kegagalan jaringan dibungkam (server
 * tetap validasi final saat submit).
 */
export function useAvailability(
  email: string,
  phone: string,
  opts?: AvailabilityOptions,
): AvailabilityState {
  const [state, setState] = useState<AvailabilityState>(EMPTY);
  const seq = useRef(0);

  const exEmail = opts?.excludeEmail?.trim().toLowerCase();
  const exPhone = opts?.excludePhone ? normalizePhone(opts.excludePhone) : "";

  const emailQ =
    emailLooksValid(email) && email.trim().toLowerCase() !== exEmail
      ? email.trim()
      : "";
  const phoneQ =
    phoneLooksValid(phone) && normalizePhone(phone) !== exPhone
      ? phone.trim()
      : "";

  useEffect(() => {
    if (!emailQ && !phoneQ) {
      setState(EMPTY);
      return;
    }
    const mySeq = ++seq.current;
    setState((s) => ({ ...s, checking: true }));
    const t = setTimeout(() => {
      const p = new URLSearchParams();
      if (emailQ) p.set("email", emailQ);
      if (phoneQ) p.set("phone", phoneQ);
      if (opts?.excludeUserId) p.set("excludeUserId", opts.excludeUserId);
      apiFetch<AvailabilityResponse>(`/auth/check-availability?${p}`, {
        auth: false,
      })
        .then((res) => {
          if (seq.current !== mySeq) return;
          setState({
            emailTaken: !!res.emailTaken,
            phoneTaken: !!res.phoneTaken,
            checking: false,
          });
        })
        .catch(() => {
          if (seq.current !== mySeq) return;
          setState(EMPTY);
        });
    }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailQ, phoneQ, opts?.excludeUserId]);

  return state;
}

/** Peringatan kecil di bawah field — muncul hanya bila `show` true. */
export function TakenHint({ show, children }: { show: boolean; children: React.ReactNode }) {
  if (!show) return null;
  return (
    <p className="flex items-center gap-1 text-xs font-medium text-amber-600">
      <TriangleAlert className="size-3.5 shrink-0" />
      {children}
    </p>
  );
}
