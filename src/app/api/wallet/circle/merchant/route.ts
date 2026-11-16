import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  isCircleWalletsConfigured,
  getCircleAppId,
  getOrCreateCircleUserToken,
  listCircleUserWallets,
} from "@/lib/server/circle-wallets";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isCircleWalletsConfigured()) {
    return NextResponse.json({
      configured: false,
      appId: getCircleAppId(),
      wallets: [],
    });
  }

  try {
    const session = await getOrCreateCircleUserToken(user.id);
    const wallets = await listCircleUserWallets(session.userToken);

    return NextResponse.json({
      configured: true,
      appId: getCircleAppId(),
      wallets,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load Circle merchant wallets.";
    return NextResponse.json({ error: message, configured: true, wallets: [] }, { status: 500 });
  }
}

