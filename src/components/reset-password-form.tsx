"use client";

import Link from "next/link";
import { useActionState } from "react";
import { resetPasswordAction, type FormState } from "@/app/actions/auth";

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(resetPasswordAction, {});

  return (
    <form action={action} className="business-form auth-form">
      <label>
        New password
        <input
          name="password"
          type="password"
          required
          minLength={8}
          maxLength={128}
          autoComplete="new-password"
          placeholder="At least 8 characters"
        />
      </label>
      <label>
        Confirm new password
        <input
          name="confirmPassword"
          type="password"
          required
          minLength={8}
          maxLength={128}
          autoComplete="new-password"
          placeholder="Repeat your password"
        />
      </label>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      {state.success && <p className="form-success" role="status">{state.success}</p>}
      <button type="submit" className="button button-dark auth-submit" disabled={pending}>
        {pending && <span className="button-spinner" aria-hidden="true" />}
        {pending ? "Updating password…" : "Update password"}
      </button>
      <p className="auth-switch">
        Back to <Link href="/login">Log in</Link>
      </p>
    </form>
  );
}

