import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { invalidateBusinessProfileCache } from "@/lib/auth/business-context";
import {
  isCircleWalletsConfigured,
  getOrCreateCircleUserToken,
  listCircleUserWallets,
} from "@/lib/server/circle-wallets";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { walletAddress?: string; networkKey?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const walletAddress = body.walletAddress?.trim();
  const networkKey = body.networkKey?.trim() || "base-sepolia";

  if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
    return NextResponse.json({ error: "Invalid EVM wallet address." }, { status: 400 });
  }

  // If Circle is configured, verify that the address actually belongs to the merchant's Circle wallets
  if (isCircleWalletsConfigured()) {
    try {
      const session = await getOrCreateCircleUserToken(user.id);
      const wallets = await listCircleUserWallets(session.userToken);
      const isVerified = wallets.some(
        (w) => w.address?.toLowerCase() === walletAddress.toLowerCase()
      );
      if (!isVerified) {
        return NextResponse.json(
          { error: "Wallet address is not an authorized Circle wallet for this merchant." },
          { status: 403 }
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Verification failed";
      return NextResponse.json({ error: `Could not verify Circle wallet: ${msg}` }, { status: 500 });
    }
  }

  // Update business profile
  const { error: updateError } = await supabase
    .from("business_profiles")
    .update({
      receiving_address: walletAddress,
      receiving_network: networkKey,
      updated_at: new Date().toISOString(),
    })
    .eq("owner_user_id", user.id);

  if (updateError) {
    return NextResponse.json(
      { error: `Database update failed: ${updateError.message}` },
      { status: 500 }
    );
  }

  invalidateBusinessProfileCache(user.id);

  return NextResponse.json({
    success: true,
    receiving_address: walletAddress,
    receiving_network: networkKey,
  });
}

