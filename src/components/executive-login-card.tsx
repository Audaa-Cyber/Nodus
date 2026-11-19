"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Eye, EyeOff } from "lucide-react";
import { signInAction, signUpAction } from "@/app/actions/auth";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function ExecutiveLoginCard({ initialMode = "signin" }: { initialMode?: "signin" | "signup" } = {}) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";
  const [mode, setMode] = useState<"signin" | "signup">(params.get("mode") === "signup" ? "signup" : initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [busy, startTransition] = useTransition();
  const [googleBusy, setGoogleBusy] = useState(false);

  useEffect(() => {
    if (params.get("error") === "auth_failed") {
      setMessage("Google sign-in could not be completed. Please try again.");
      setError(true);
    }
  }, [params]);

  useEffect(() => {
    if (message && !error && mode === "signup") {
      router.replace(`/verify-email?email=${encodeURIComponent(email.trim().toLowerCase())}`);
    }
  }, [message, error, mode, email, router]);

  const googleSignIn = async () => {
    setGoogleBusy(true);
    setMessage("");
    try {
      const { data, error: authError } = await getSupabaseBrowserClient().auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
          queryParams: { prompt: "select_account" },
        },
      });
      if (authError || !data.url) throw authError ?? new Error("Could not start Google sign-in.");
      window.location.assign(data.url);
    } catch {
      setMessage("Google sign-in could not be started. Please try again.");
      setError(true);
      setGoogleBusy(false);
    }
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    setError(false);
    const form = new FormData();
    form.set("email", email.trim().toLowerCase());
    form.set("password", password);
    form.set("next", next);
    form.set("businessName", businessName.trim());
    startTransition(async () => {
      const result = mode === "signup" ? await signUpAction({}, form) : await signInAction({}, form);
      if (result?.error) {
        setMessage(result.error);
        setError(true);
      } else if (result?.success) {
        setMessage(result.success);
        setError(false);
      }
    });
  };

  return (
    <main className="login-executive-page bg-grid min-h-screen flex items-center justify-center px-4 py-10 selection:bg-slate-500 selection:text-white">
      <section className="login-card relative overflow-hidden w-full max-w-[420px] rounded-[26px] p-6 sm:p-8">
        <div className="absolute inset-x-0 top-0 h-px bg-white/80" />
        <header className="flex items-center gap-3 mb-7">
          <Image src="/logo.svg" alt="Nodus" width={331} height={213} style={{ height: "35px", width: "auto" }} priority />
          <div>
            <h1 className="text-lg font-semibold tracking-tight">{mode === "signup" ? "Create your account" : "Welcome back"}</h1>
            <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>{mode === "signup" ? "Set up your Nodus workspace" : "Sign in to your Nodus workspace"}</p>
          </div>
        </header>

        <div className="grid grid-cols-2 rounded-xl p-1 mb-5" style={{ background: "var(--surface-muted, rgba(0,0,0,.045))" }}>
          <button type="button" onClick={() => { setMode("signin"); setMessage(""); }} className={`rounded-lg py-2 text-xs font-semibold transition ${mode === "signin" ? "bg-white shadow-sm text-black" : "text-slate-500"}`}>Sign in</button>
          <button type="button" onClick={() => { setMode("signup"); setMessage(""); }} className={`rounded-lg py-2 text-xs font-semibold transition ${mode === "signup" ? "bg-white shadow-sm text-black" : "text-slate-500"}`}>Create account</button>
        </div>

        <button type="button" onClick={googleSignIn} disabled={googleBusy || busy} className="w-full rounded-xl border border-black/10 bg-white py-3 text-sm font-semibold text-black flex items-center justify-center gap-3 hover:bg-slate-50 disabled:opacity-60 transition">
          <svg viewBox="0 0 48 48" aria-hidden="true" className="w-[17px] h-[17px]"><path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11c-.5 2.5-1.9 4.6-4 6v5h6.5c3.8-3.5 6.1-8.6 6.1-14.7Z"/><path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.8l-6.5-5c-1.8 1.2-4.1 2-7 2-5.4 0-10-3.7-11.6-8.7H5.7v5.2A20 20 0 0 0 24 44Z"/><path fill="#FBBC05" d="M12.4 27.5a12 12 0 0 1 0-7v-5.2H5.7a20 20 0 0 0 0 17.4l6.7-5.2Z"/><path fill="#EA4335" d="M24 11.8c3 0 5.7 1 7.8 3.1l5.8-5.8C34.1 5.8 29.5 4 24 4A20 20 0 0 0 5.7 15.3l6.7 5.2c1.6-5 6.2-8.7 11.6-8.7Z"/></svg>
          {googleBusy ? "Connecting…" : "Continue with Google"}
        </button>

        <div className="flex items-center gap-3 my-5">
          <div className="h-px flex-1 bg-black/10" />
          <span className="text-[10px] uppercase tracking-[.16em] text-slate-400">or with email</span>
          <div className="h-px flex-1 bg-black/10" />
        </div>

        {message && <p role={error ? "alert" : "status"} className={`mb-4 rounded-xl px-3 py-2.5 text-xs ${error ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-700"}`}>{message}</p>}

        <form onSubmit={submit} className="space-y-3">
          {mode === "signup" && <label className="block">
            <span className="block text-[11px] font-medium mb-1.5 text-slate-600">Business name</span>
            <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} required maxLength={120} autoComplete="organization" className="w-full rounded-xl border border-black/10 bg-white px-3.5 py-3 text-sm outline-none focus:border-black/40" placeholder="Your business name" />
          </label>}
          <label className="block">
            <span className="block text-[11px] font-medium mb-1.5 text-slate-600">Email address</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" className="w-full rounded-xl border border-black/10 bg-white px-3.5 py-3 text-sm outline-none focus:border-black/40" placeholder="you@example.com" />
          </label>
          <label className="block">
            <span className="block text-[11px] font-medium mb-1.5 text-slate-600">Password</span>
            <span className="relative block">
              <input type={visible ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} maxLength={128} autoComplete={mode === "signup" ? "new-password" : "current-password"} className="w-full rounded-xl border border-black/10 bg-white px-3.5 py-3 pr-11 text-sm outline-none focus:border-black/40" placeholder="At least 8 characters" />
              <button type="button" onClick={() => setVisible((v) => !v)} aria-label={visible ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button>
            </span>
          </label>
          {mode === "signin" && <div className="text-right"><Link href="/forgot-password" className="text-xs font-medium text-slate-500 hover:text-black">Forgot password?</Link></div>}
          <button type="submit" disabled={busy || googleBusy} className="w-full rounded-xl bg-black text-white py-3.5 text-sm font-semibold hover:bg-slate-800 disabled:opacity-60 transition">
            {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
          </button>
        </form>
        <p className="text-center text-[11px] mt-6 text-slate-400"><Link href="/" className="hover:text-black">Back to Nodus</Link></p>
      </section>
    </main>
  );
}
