import Link from "next/link";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";

export default function LoginPage() {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <Link href="/" className="brand">
          <span className="brand-mark">n</span>
          <span>nodus<span className="brand-period">.</span></span>
        </Link>
        <p className="eyebrow">BUSINESS ACCOUNT</p>
        <h1>Welcome back.</h1>
        <p className="auth-intro">Log in to manage your business invoices.</p>
        <Suspense fallback={<div className="form-skeleton" style={{ minHeight: "220px" }} />}>
          <AuthForm mode="login" />
        </Suspense>
      </div>
    </main>
  );
}
