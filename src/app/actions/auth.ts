"use server";

import { redirect, RedirectType } from "next/navigation";
import { signOut } from "@workos-inc/authkit-nextjs";

export type FormState = { error?: string; success?: string };

// AuthKit owns credential entry and account recovery. These compatibility
// actions redirect legacy entry points to the hosted WorkOS screens.
export async function signUpAction(): Promise<FormState> {
  redirect("/sign-up", RedirectType.replace);
}

export async function signInAction(): Promise<FormState> {
  redirect("/sign-in", RedirectType.replace);
}

export async function forgotPasswordAction(): Promise<FormState> {
  redirect("/sign-in", RedirectType.replace);
}

export async function resetPasswordAction(): Promise<FormState> {
  redirect("/sign-in", RedirectType.replace);
}

export async function signOutAction() {
  await signOut({ returnTo: process.env.NEXT_PUBLIC_APP_URL || "/" });
}
