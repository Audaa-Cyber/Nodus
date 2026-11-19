import { Suspense } from "react";
import { AuthUtilityCard } from "@/components/auth-utility-card";

export default function ForgotPasswordPage() {
  return <Suspense fallback={<main className="login-executive-page bg-grid min-h-screen" />}><AuthUtilityCard mode="forgot" /></Suspense>;
}
