import { Suspense } from "react";
import { ExecutiveLoginCard } from "@/components/executive-login-card";

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="login-executive-page bg-grid min-h-screen" />}>
      <ExecutiveLoginCard />
    </Suspense>
  );
}
