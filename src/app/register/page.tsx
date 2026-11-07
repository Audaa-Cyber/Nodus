import Link from "next/link";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
import { PageLoader } from "@/components/page-loader";

export default function RegisterPage() {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <Link href="/" className="brand">
          <span className="brand-mark">n</span>
          <span>nodus<span className="brand-period">.</span></span>
        </Link>
        <p className="eyebrow">GET STARTED</p>
        <h1>Your business,<br />in clear view.</h1>
        <p className="auth-intro">Create an account to prepare and manage invoices.</p>
        <Suspense fallback={<PageLoader variant="inline" label="Loading form" />}>
          <AuthForm mode="register" />
        </Suspense>
      </div>
    </main>
  );
}
