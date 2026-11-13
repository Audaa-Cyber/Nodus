"use server";

import { revalidatePath } from "next/cache";
import { redirect, RedirectType } from "next/navigation";
import { getBusinessContext, invalidateBusinessProfileCache } from "@/lib/auth/business-context";
import { circleTestnetUsdcNetworks } from "@/lib/wallet/networks";
import type { FormState } from "./auth";

export async function updateBusinessProfileAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const businessName = String(formData.get("businessName") ?? "").trim();
  if (!businessName || businessName.length > 120) return { error: "Enter a business name up to 120 characters." };
  const receivingNetwork = String(formData.get("receivingNetwork") ?? "").trim().toLowerCase();
  const receivingAddress = String(formData.get("receivingAddress") ?? "").trim();
  if (Boolean(receivingNetwork) !== Boolean(receivingAddress)) return { error: "Enter both a receiving network and address, or leave both blank." };
  if (receivingNetwork && !/^[a-z0-9:_-]{1,64}$/.test(receivingNetwork)) return { error: "Use a valid network identifier." };
  if (receivingAddress && (receivingAddress.length > 256 || /\s/.test(receivingAddress))) return { error: "Enter a valid receiving address without spaces." };
  const isEvmReceivingNetwork = ["base", "ethereum", "eth"].includes(receivingNetwork)
    || circleTestnetUsdcNetworks.some((network) => network.key === receivingNetwork);
  if (isEvmReceivingNetwork && !/^0x[a-fA-F0-9]{40}$/.test(receivingAddress)) return { error: "Enter a valid EVM address for this network." };
  if (["solana", "sol"].includes(receivingNetwork) && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(receivingAddress)) return { error: "Enter a valid Solana address for this network." };

  const { supabase, user, business } = await getBusinessContext();
  if (!user) redirect("/login", RedirectType.replace);
  const isSupportedCircleTestnet = circleTestnetUsdcNetworks.some((network) => network.key === receivingNetwork);
  const isExistingLegacyNetwork = receivingNetwork !== "" && receivingNetwork === business?.receiving_network;
  if (receivingNetwork && !isSupportedCircleTestnet && !isExistingLegacyNetwork) {
    return { error: "Choose Sepolia, Base Sepolia, Arbitrum Sepolia, or Optimism Sepolia for live testnet checkout." };
  }

  const { data, error } = await supabase.from("business_profiles").update({
    business_name: businessName,
    receiving_network: receivingNetwork || null,
    receiving_address: receivingAddress || null,
  }).eq("owner_user_id", user.id).select("id").maybeSingle();

  if (error || !data) return { error: "Business profile could not be updated. Try again." };
  invalidateBusinessProfileCache(user.id);
  revalidatePath("/dashboard", "layout");
  return { success: "Business profile updated." };
}
