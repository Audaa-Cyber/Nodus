import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getBusinessContext } from "@/lib/auth/business-context";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { user } = await getBusinessContext();
  if (user) {
    redirect("/dashboard");
  }

  const params = await searchParams;
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
        {params.error === "confirmation" && (
          <p className="form-error" role="alert">
            We couldn’t confirm that email link. Request a fresh one or log in.
          </p>
        )}
        <AuthForm mode="login" next={params.next} />
      </div>
    </main>
  );
}
