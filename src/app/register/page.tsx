import { Suspense } from "react";
import { ExecutiveLoginCard } from "@/components/executive-login-card";

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="login-executive-page bg-grid" />}>
      <ExecutiveLoginCard initialMode="signup" />
    </Suspense>
  );
}
