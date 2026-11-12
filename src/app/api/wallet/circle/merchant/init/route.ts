import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  isCircleWalletsConfigured,
  getCircleAppId,
  getOrCreateCircleUserToken,
  initCircleUserWalletChallenge,
  Blockchain,
} from "@/lib/server/circle-wallets";

export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isCircleWalletsConfigured()) {
    return NextResponse.json(
      { error: "Circle User-Controlled Wallets are not configured on the server." },
      { status: 503 }
    );
  }

  try {
    const session = await getOrCreateCircleUserToken(user.id);
    const { challengeId } = await initCircleUserWalletChallenge({
      userToken: session.userToken,
      blockchains: [Blockchain.BaseSepolia, Blockchain.ArbSepolia],
    });

    return NextResponse.json({
      challengeId,
      userToken: session.userToken,
      encryptionKey: session.encryptionKey,
      appId: getCircleAppId(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to initialize Circle merchant wallet.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

