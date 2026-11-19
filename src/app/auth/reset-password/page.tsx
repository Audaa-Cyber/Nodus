"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password.length < 8 || password !== confirm) { setMessage(password !== confirm ? "Passwords do not match." : "Use at least 8 characters."); setError(true); return; }
    setBusy(true); setMessage(""); setError(false);
    const { error: authError } = await getSupabaseBrowserClient().auth.updateUser({ password });
    if (authError) { setMessage("Your reset session may have expired. Request another reset link."); setError(true); setBusy(false); return; }
    setMessage("Password updated. Redirecting to your dashboard…");
    setBusy(false);
    setTimeout(() => router.replace("/dashboard"), 900);
  };

  return (
    <main className="login-executive-page bg-grid min-h-screen flex items-center justify-center px-4 py-10">
      <section className="login-card w-full max-w-[420px] rounded-[26px] p-6 sm:p-8">
        <header className="flex items-center gap-3 mb-7"><Image src="/logo.svg" alt="Nodus" width={331} height={213} style={{ height: "35px", width: "auto" }} /><div><h1 className="text-lg font-semibold">Choose a new password</h1><p className="text-xs mt-1 text-slate-500">Make it at least eight characters.</p></div></header>
        {message && <p role={error ? "alert" : "status"} className={`mb-4 rounded-xl px-3 py-2.5 text-xs ${error ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-700"}`}>{message}</p>}
        <form onSubmit={submit} className="space-y-3">
          <label className="block"><span className="block text-[11px] font-medium mb-1.5 text-slate-600">New password</span><input type="password" required minLength={8} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl border border-black/10 bg-white px-3.5 py-3 text-sm outline-none focus:border-black/40" /></label>
          <label className="block"><span className="block text-[11px] font-medium mb-1.5 text-slate-600">Confirm password</span><input type="password" required minLength={8} maxLength={128} value={confirm} onChange={(e) => setConfirm(e.target.value)} className="w-full rounded-xl border border-black/10 bg-white px-3.5 py-3 text-sm outline-none focus:border-black/40" /></label>
          <button disabled={busy} className="w-full rounded-xl bg-black text-white py-3.5 text-sm font-semibold disabled:opacity-60">{busy ? "Updating…" : "Update password"}</button>
        </form>
        <p className="text-center text-xs mt-6"><Link href="/login" className="text-slate-500 hover:text-black">Back to sign in</Link></p>
      </section>
    </main>
  );
}
