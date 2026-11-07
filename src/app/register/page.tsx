import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getBusinessContext } from "@/lib/auth/business-context";

export default async function RegisterPage() {
  const { user } = await getBusinessContext();
  if (user) {
    redirect("/dashboard");
  }

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
        <AuthForm mode="register" />
      </div>
    </main>
  );
}
