import Link from "next/link";
import { Suspense } from "react";
import { ForgotPasswordForm } from "@/components/forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <Link href="/" className="brand">
          <span className="brand-mark">n</span>
          <span>nodus<span className="brand-period">.</span></span>
        </Link>
        <p className="eyebrow">ACCOUNT RECOVERY</p>
        <h1>Reset your password.</h1>
        <p className="auth-intro">Enter your business email address and we’ll send you a link to reset your password.</p>
        <Suspense fallback={<div className="auth-form-skeleton" style={{ minHeight: "220px" }} />}>
          <ForgotPasswordForm />
        </Suspense>
      </div>
    </main>
  );
}
