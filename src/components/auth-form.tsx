"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { signInAction, signUpAction, type FormState } from "@/app/actions/auth";

export function AuthForm({ mode, next = "/dashboard" }: { mode: "login" | "register"; next?: string }) {
  const actionFn = mode === "login" ? signInAction : signUpAction;
  const [state, action, pending] = useActionState<FormState, FormData>(actionFn, {});

  // Force page revalidation if restored from browser bfcache (Back/Forward Cache)
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
      {mode === "register" && (
        <label>
          Business name
          <input name="businessName" required maxLength={120} autoComplete="organization" placeholder="Your business" />
        </label>
      )}
      <label>
        Email address
        <input name="email" type="email" required maxLength={320} autoComplete="email" placeholder="you@example.com" />
      </label>
      <label>
        <span className="auth-password-header">
          <span>Password</span>
          {mode === "login" && (
            <Link href="/forgot-password" className="auth-forgot-link">
              Forgot password?
            </Link>
          )}
        </span>
        <input
          name="password"
          type="password"
          required
          minLength={mode === "register" ? 8 : 1}
          maxLength={128}
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          placeholder={mode === "register" ? "At least 8 characters" : "Your password"}
        />
      </label>
      {mode === "login" && <input type="hidden" name="next" value={next} />}
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      {state.success && <p className="form-success" role="status">{state.success}</p>}
      <button type="submit" className="button button-dark auth-submit" disabled={pending}>
        {pending && <span className="button-spinner" aria-hidden="true" />}
        {pending ? "Please wait…" : mode === "login" ? "Log in" : "Create business account"}
      </button>
      <p className="auth-switch">
        {mode === "login" ? (
          <>New to Nodus? <Link href="/register">Create an account</Link></>
        ) : (
          <>Already registered? <Link href="/login">Log in</Link></>
        )}
      </p>
    </form>
  );
}
