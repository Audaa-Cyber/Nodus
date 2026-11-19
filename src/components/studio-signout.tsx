"use client";

import { signOutAction } from "@/app/actions/auth";
import { LogOut } from "lucide-react";

export function StudioSignOut() {
  return <form action={signOutAction}><button type="submit" className="studio-signout" aria-label="Sign out"><LogOut size={15}/></button></form>;
}
