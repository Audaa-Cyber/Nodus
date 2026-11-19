"use client";

import Link from "next/link";
import Image from "next/image";

export function ExecutiveLoginCard({ initialMode = "signin" }: { initialMode?: "signin" | "signup" } = {}) {
  const signUp = initialMode === "signup";
  return (
    <main className="login-executive-page bg-grid selection:bg-slate-500 selection:text-white">
      <section className="login-card rounded-[24px] p-6 sm:p-8 relative overflow-hidden max-w-md mx-auto">
        <header className="flex items-center gap-3 mb-6">
          <Image src="/logo.svg" alt="Nodus" width={331} height={213} style={{ height: "36px", width: "auto" }} />
          <div>
            <h1 className="text-lg font-bold tracking-tight">{signUp ? "Create your account" : "Welcome back"}</h1>
            <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>Secure sign-in powered by WorkOS</p>
          </div>
        </header>
        <Link href={signUp ? "/sign-up" : "/sign-in"} className="btn-primary w-full py-3 px-4 rounded-xl font-semibold text-sm flex items-center justify-center">
          {signUp ? "Create account" : "Continue to sign in"}
        </Link>
        <p className="text-center text-xs mt-4" style={{ color: "var(--text-secondary)" }}>
          {signUp ? "Already have an account?" : "New to Nodus?"}{" "}
          <Link href={signUp ? "/sign-in" : "/sign-up"} className="font-semibold hover:underline">
            {signUp ? "Sign in" : "Create account"}
          </Link>
        </p>
        <footer className="mt-5 text-center text-xs" style={{ color: "var(--text-muted)" }}>
          <Link href="/" className="hover:underline">Back to Nodus</Link>
        </footer>
      </section>
    </main>
  );
}
