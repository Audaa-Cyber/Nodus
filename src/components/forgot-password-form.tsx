"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { forgotPasswordAction, type FormState } from "@/app/actions/auth";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(forgotPasswordAction, {});

  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        window.location.reload();
      }
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  return (
    <form action={action} className="business-form auth-form">
      <label>
        Email address
        <input
          name="email"
          type="email"
          required
          maxLength={320}
          autoComplete="email"
          placeholder="you@example.com"
        />
      </label>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      {state.success && <p className="form-success" role="status">{state.success}</p>}
      <button type="submit" className="button button-dark auth-submit" disabled={pending}>
        {pending && <span className="button-spinner" aria-hidden="true" />}
        {pending ? "Sending link…" : "Send reset link"}
      </button>
      <p className="auth-switch">
        Remember your password? <Link href="/login">Log in</Link>
      </p>
    </form>
  );
}

