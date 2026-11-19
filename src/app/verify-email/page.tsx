import { Suspense } from "react";
import VerifyEmailPage from "@/components/verify-email-page";
export default function Page() { return <Suspense fallback={<main className="login-executive-page min-h-screen" />}><VerifyEmailPage /></Suspense>; }
