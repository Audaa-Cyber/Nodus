"use server";

import { redirect, RedirectType } from "next/navigation";
import { signOut } from "@workos-inc/authkit-nextjs";

// Legacy form entry points hand off to AuthKit's hosted screens.
export async function signUpAction(): Promise<never> {
  redirect("/sign-up", RedirectType.replace);
}

export async function signInAction(): Promise<never> {
  redirect("/sign-in", RedirectType.replace);
}

export async function signOutAction() {
  await signOut({ returnTo: process.env.NEXT_PUBLIC_APP_URL || "/" });
}
