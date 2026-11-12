import { NextResponse } from "next/server";
import {
  isCircleWalletsConfigured,
  getCircleAppId,
  getOrCreateCircleUserToken,
  listCircleUserWallets,
} from "@/lib/server/circle-wallets";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isCircleWalletsConfigured()) {
    return NextResponse.json({
      configured: false,
      appId: getCircleAppId(),
      wallets: [],
    });
  }

  let guestUserId: string | undefined;
  try {
    const body = await request.json();
    if (typeof body?.guestUserId === "string" && /^[0-9a-f-]{36}$/i.test(body.guestUserId.trim())) {
      guestUserId = body.guestUserId.trim();
    }
  } catch {
    // Body parsing error
  }

  if (!guestUserId) {
    return NextResponse.json({ error: "Missing or invalid guestUserId." }, { status: 400 });
  }

  try {
    const session = await getOrCreateCircleUserToken(guestUserId);
    const wallets = await listCircleUserWallets(session.userToken);

    return NextResponse.json({
      configured: true,
      appId: getCircleAppId(),
      wallets,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load guest wallets.";
    return NextResponse.json({ error: message, configured: true, wallets: [] }, { status: 500 });
  }
}

export async function GET(request: Request) {
  if (!isCircleWalletsConfigured()) {
    return NextResponse.json({
      configured: false,
      appId: getCircleAppId(),
      wallets: [],
    });
  }

  const { searchParams } = new URL(request.url);
  const guestUserId = searchParams.get("guestUserId")?.trim();

  if (!guestUserId || !/^[0-9a-f-]{36}$/i.test(guestUserId)) {
    return NextResponse.json({ error: "Missing or invalid guestUserId parameter." }, { status: 400 });
  }

  try {
    const session = await getOrCreateCircleUserToken(guestUserId);
    const wallets = await listCircleUserWallets(session.userToken);

    return NextResponse.json({
      configured: true,
      appId: getCircleAppId(),
      wallets,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load guest wallets.";
    return NextResponse.json({ error: message, configured: true, wallets: [] }, { status: 500 });
  }
}

