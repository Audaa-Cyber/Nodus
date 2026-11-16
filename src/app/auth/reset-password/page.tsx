import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ResetPasswordForm } from "@/components/reset-password-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ResetPasswordPage() {
  const supabase = await createSupabaseServerClient();
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data?.user ?? null;
  } catch {
    user = null;
  }

  if (!user) {
    redirect("/forgot-password?error=expired");
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <Link href="/" className="brand">
          <span className="brand-mark">n</span>
          <span>nodus<span className="brand-period">.</span></span>
        </Link>
        <p className="eyebrow">ACCOUNT SECURITY</p>
        <h1>Set new password.</h1>
        <p className="auth-intro">Choose a strong password with at least 8 characters for your account.</p>
        <Suspense fallback={<div className="auth-form-skeleton" style={{ minHeight: "220px" }} />}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </main>
  );
}

