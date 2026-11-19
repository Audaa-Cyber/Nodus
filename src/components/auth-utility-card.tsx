"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function AuthUtilityCard({ mode }: { mode: "forgot" }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true); setMessage(""); setError(false);
    const origin = window.location.origin;
    const { error: authError } = await getSupabaseBrowserClient().auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${origin}/auth/callback?next=/auth/reset-password`,
    });
    if (authError) {
      setMessage("We could not send a reset email. Check the address and try again.");
      setError(true);
    } else {
      setMessage("If an account exists for that address, a password reset link is on its way.");
    }
    setBusy(false);
  };

  return (
    <main className="login-executive-page bg-grid min-h-screen flex items-center justify-center px-4 py-10">
      <section className="login-card w-full max-w-[420px] rounded-[26px] p-6 sm:p-8">
        <header className="flex items-center gap-3 mb-7">
          <Image src="/logo.svg" alt="Nodus" width={331} height={213} style={{ height: "35px", width: "auto" }} />
          <div><h1 className="text-lg font-semibold">Reset your password</h1><p className="text-xs mt-1 text-slate-500">We’ll email you a secure reset link.</p></div>
        </header>
        {message && <p role={error ? "alert" : "status"} className={`mb-4 rounded-xl px-3 py-2.5 text-xs ${error ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-700"}`}>{message}</p>}
        <form onSubmit={submit} className="space-y-3">
          <label className="block"><span className="block text-[11px] font-medium mb-1.5 text-slate-600">Email address</span><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className="w-full rounded-xl border border-black/10 bg-white px-3.5 py-3 text-sm outline-none focus:border-black/40" placeholder="you@example.com" /></label>
          <button disabled={busy} className="w-full rounded-xl bg-black text-white py-3.5 text-sm font-semibold disabled:opacity-60">{busy ? "Sending…" : "Send reset link"}</button>
        </form>
        <p className="text-center text-xs mt-6"><Link href="/login" className="text-slate-500 hover:text-black">Back to sign in</Link></p>
      </section>
    </main>
  );
}
