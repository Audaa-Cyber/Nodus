"use server";

import { revalidatePath } from "next/cache";
import { redirect, RedirectType } from "next/navigation";
import { getBusinessContext, invalidateBusinessProfileCache } from "@/lib/auth/business-context";
import { circleTestnetUsdcNetworks } from "@/lib/wallet/networks";
import type { FormState } from "./auth";

export async function updateBusinessProfileAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const businessName = String(formData.get("businessName") ?? "").trim();
  if (!businessName || businessName.length > 120) return { error: "Enter a business name up to 120 characters." };

  const receivingNetworks = [...new Set(formData.getAll("receivingNetworks").map((value) => String(value).trim().toLowerCase()))];
  const receivingAddress = String(formData.get("receivingAddress") ?? "").trim();
  const supported = new Set(circleTestnetUsdcNetworks.map((network) => network.key));
  if (receivingNetworks.length > 5 || receivingNetworks.some((network) => !supported.has(network))) {
    return { error: "Choose up to five supported networks." };
  }
  if (receivingNetworks.length > 0 && !receivingAddress) return { error: "Paste your wallet address for the selected networks." };
  if (receivingNetworks.length === 0 && receivingAddress) return { error: "Select at least one network for this wallet address." };
  if (receivingAddress && (receivingAddress.length > 256 || !/^0x[a-fA-F0-9]{40}$/.test(receivingAddress))) {
    return { error: "Enter a valid EVM wallet address." };
  }

  const { supabase, user } = await getBusinessContext();
  if (!user) redirect("/login", RedirectType.replace);

  const { data, error } = await supabase.from("business_profiles").update({
    business_name: businessName,
    receiving_networks: receivingNetworks,
    receiving_network: receivingNetworks[0] ?? null,
    receiving_address: receivingAddress || null,
  }).eq("owner_user_id", user.id).select("id").maybeSingle();

  if (error || !data) return { error: "Business profile could not be updated. Try again." };
  invalidateBusinessProfileCache(user.id);
  revalidatePath("/dashboard", "layout");
  revalidatePath("/dashboard/invoices/new");
  return { success: "Business profile updated." };
}
