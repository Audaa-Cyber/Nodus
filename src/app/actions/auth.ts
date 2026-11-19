"use server";

import { redirect, RedirectType } from "next/navigation";
import { signOut } from "@workos-inc/authkit-nextjs";

export type FormState = { error?: string; success?: string };

// Legacy entry points now hand off to AuthKit's hosted authentication screens.
export async function signUpAction(): Promise<FormState> { redirect("/sign-up", RedirectType.replace); }
export async function signInAction(): Promise<FormState> { redirect("/sign-in", RedirectType.replace); }
export async function forgotPasswordAction(_previous: FormState, _formData: FormData): Promise<FormState> { redirect("/sign-in", RedirectType.replace); }
export async function resetPasswordAction(_previous: FormState, _formData: FormData): Promise<FormState> { redirect("/sign-in", RedirectType.replace); }

export async function signOutAction() {
  await signOut({ returnTo: process.env.NEXT_PUBLIC_APP_URL || "/" });
}
