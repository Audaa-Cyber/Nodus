"use client";

import { useTransition } from "react";
import { signOutAction } from "@/app/actions/auth";

export function LogoutButton() {
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={() => {
        startTransition(async () => {
          await signOutAction();
        });
      }}
    >
      <button type="submit" disabled={isPending}>
        {isPending ? "Logging out…" : "Log out"}
      </button>
    </form>
  );
}

