"use server";

import { redirect, RedirectType } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type FormState = { error?: string; success?: string };

export async function signUpAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const businessName = String(formData.get("businessName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (businessName.length < 1 || businessName.length > 120) return { error: "Enter a business name (up to 120 characters)." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) return { error: "Enter a valid email address." };
  if (password.length < 8 || password.length > 128) return { error: "Use a password between 8 and 128 characters." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { business_name: businessName }, emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/auth/callback?next=/dashboard` },
  });
  if (error) return { error: error.message.includes("already registered") ? "An account with this email already exists. Try logging in." : "We could not create your account. Check your details and try again." };
  if (!data.session) return { success: "Check your email for a confirmation link. Your business profile will be ready when you verify your address." };
  redirect("/dashboard", RedirectType.replace);
}

export async function signInAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/dashboard");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length === 0) return { error: "Enter a valid email and password." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Email or password is incorrect." };
  redirect(next.startsWith("/dashboard") ? next : "/dashboard", RedirectType.replace);
}

export async function forgotPasswordAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
    return { error: "Enter a valid email address." };
  }

  const supabase = await createSupabaseServerClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl}/auth/callback?next=/auth/reset-password`,
  });

  if (error && error.message.includes("rate limit")) {
    return { error: "Too many password reset requests. Please wait a moment and try again." };
  }

  return {
    success: "If an account exists with this email, a reset link has been sent. Check your inbox.",
  };
}

export async function resetPasswordAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (password.length < 8 || password.length > 128) {
    return { error: "Use a password between 8 and 128 characters." };
  }
  if (password !== confirmPassword) {
    return { error: "Passwords do not match." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: error.message || "We could not update your password. Please try again." };
  }

  redirect("/dashboard", RedirectType.replace);
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login", RedirectType.replace);
}
