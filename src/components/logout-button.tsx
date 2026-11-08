"use client";

import { useTransition } from "react";
import { signOutAction } from "@/app/actions/auth";
import { useDashboardLoader } from "./dashboard-shell-effects";

export function LogoutButton() {
  const [isPending, startTransition] = useTransition();
  const { triggerLoader } = useDashboardLoader();

  return (
    <form
      action={() => {
        triggerLoader(800);
        startTransition(async () => {
          await signOutAction();
        });
      }}
      className="inline-block"
    >
      <button
        id="logoutBtn"
        type="submit"
        disabled={isPending}
        className="text-xs font-medium hover:text-slate-900 transition-colors cursor-pointer disabled:opacity-60"
        style={{ color: "var(--text-secondary)" }}
      >
        {isPending ? "Signing out…" : "Log out"}
      </button>
    </form>
  );
}
