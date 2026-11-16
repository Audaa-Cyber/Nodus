import { Suspense } from "react";
import { ExecutiveLoginCard } from "@/components/executive-login-card";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="login-executive-page bg-grid" />}>
      <ExecutiveLoginCard />
    </Suspense>
  );
}
