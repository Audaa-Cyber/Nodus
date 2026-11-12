import { NextResponse } from "next/server";
import {
  isCircleWalletsConfigured,
  getCircleAppId,
  getOrCreateCircleUserToken,
  initCircleUserWalletChallenge,
  Blockchain,
} from "@/lib/server/circle-wallets";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isCircleWalletsConfigured()) {
    return NextResponse.json(
      { error: "Circle User-Controlled Wallets are not configured on the server." },
      { status: 503 }
    );
  }

  let guestUserId: string | undefined;
  try {
    const body = await request.json();
    if (typeof body?.guestUserId === "string" && /^[0-9a-f-]{36}$/i.test(body.guestUserId.trim())) {
      guestUserId = body.guestUserId.trim();
    }
  } catch {
    // Body is optional
  }

  if (!guestUserId) {
    guestUserId = crypto.randomUUID();
  }

  try {
    const session = await getOrCreateCircleUserToken(guestUserId);
    const { challengeId } = await initCircleUserWalletChallenge({
      userToken: session.userToken,
      blockchains: [Blockchain.BaseSepolia],
    });

    return NextResponse.json({
      guestUserId,
      challengeId,
      userToken: session.userToken,
      encryptionKey: session.encryptionKey,
      appId: getCircleAppId(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to initialize guest Circle wallet.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

