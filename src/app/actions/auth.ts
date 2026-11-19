"use server";

import { redirect, RedirectType } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type FormState = { error?: string; success?: string };

function safeDashboardPath(value: string) {
  return value.startsWith("/dashboard") && !value.startsWith("//") && !value.includes("\\")
    ? value
    : "/dashboard";
}

export async function signUpAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const businessName = String(formData.get("businessName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (businessName.length < 1 || businessName.length > 120) return { error: "Enter a business name up to 120 characters." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) return { error: "Enter a valid email address." };
  if (password.length < 8 || password.length > 128) return { error: "Use a password between 8 and 128 characters." };

  const supabase = await createSupabaseServerClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { business_name: businessName, full_name: businessName },
      emailRedirectTo: `${appUrl}/auth/callback?next=/dashboard`,
    },
  });

  if (error) {
    if (error.message.toLowerCase().includes("rate limit")) return { error: "Too many sign-up attempts. Please wait and try again." };
    if (error.message.toLowerCase().includes("already registered")) return { error: "An account with this email already exists. Try signing in." };
    return { error: "We could not create your account. Check your details and try again." };
  }

  if (data.session) redirect("/dashboard", RedirectType.replace);
  return { success: "Account created. Enter the six-digit code sent to your email." };
}

export async function signInAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeDashboardPath(String(formData.get("next") ?? "/dashboard"));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password) return { error: "Enter a valid email and password." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.message.toLowerCase().includes("email not confirmed")) return { error: "Verify your email address before signing in." };
    if (error.message.toLowerCase().includes("rate limit")) return { error: "Too many sign-in attempts. Please wait and try again." };
    return { error: "Email or password is incorrect." };
  }
  redirect(next, RedirectType.replace);
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login", RedirectType.replace);
}
