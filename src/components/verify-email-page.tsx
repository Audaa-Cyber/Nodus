"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function VerifyEmailPage() {
  const params = useSearchParams();
  const router = useRouter();
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);

  const verify = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setMessage(""); setError(false);
    const { error: authError } = await getSupabaseBrowserClient().auth.verifyOtp({
      email: email.trim().toLowerCase(), token: token.trim(), type: "email",
    });
    if (authError) { setMessage("That code is invalid or expired. Request a new one and try again."); setError(true); setBusy(false); return; }
    router.replace("/dashboard");
    router.refresh();
  };

  const resend = async () => {
    setBusy(true); setMessage(""); setError(false);
    const { error: authError } = await getSupabaseBrowserClient().auth.resend({ type: "signup", email: email.trim().toLowerCase() });
    setMessage(authError ? "We could not resend the code. Wait a moment and try again." : "A new verification code has been sent.");
    setError(Boolean(authError)); setBusy(false);
  };

  return (
    <main className="login-executive-page bg-grid min-h-screen flex items-center justify-center px-4 py-10">
      <section className="login-card w-full max-w-[420px] rounded-[26px] p-6 sm:p-8">
        <header className="flex items-center gap-3 mb-7"><Image src="/logo.svg" alt="Nodus" width={331} height={213} style={{ height: "35px", width: "auto" }} /><div><h1 className="text-lg font-semibold">Check your email</h1><p className="text-xs mt-1 text-slate-500">Enter the six-digit verification code.</p></div></header>
        {message && <p role={error ? "alert" : "status"} className={`mb-4 rounded-xl px-3 py-2.5 text-xs ${error ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-700"}`}>{message}</p>}
        <form onSubmit={verify} className="space-y-3">
          <label className="block"><span className="block text-[11px] font-medium mb-1.5 text-slate-600">Email address</span><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-black/10 bg-white px-3.5 py-3 text-sm outline-none focus:border-black/40" /></label>
          <label className="block"><span className="block text-[11px] font-medium mb-1.5 text-slate-600">Verification code</span><input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={token} onChange={(e) => setToken(e.target.value.replace(/\D/g, "").slice(0, 6))} className="w-full rounded-xl border border-black/10 bg-white px-3.5 py-3 text-center text-xl tracking-[.45em] font-semibold outline-none focus:border-black/40" placeholder="000000" /></label>
          <button disabled={busy} className="w-full rounded-xl bg-black text-white py-3.5 text-sm font-semibold disabled:opacity-60">{busy ? "Verifying…" : "Verify email"}</button>
        </form>
        <button type="button" onClick={resend} disabled={busy || !email.includes("@")} className="w-full mt-3 text-xs font-semibold text-slate-500 hover:text-black disabled:opacity-40">Resend code</button>
        <p className="text-center text-xs mt-6"><Link href="/login" className="text-slate-500 hover:text-black">Back to sign in</Link></p>
      </section>
    </main>
  );
}
