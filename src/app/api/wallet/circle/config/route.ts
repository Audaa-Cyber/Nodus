import { NextResponse } from "next/server";
import { isCircleWalletsConfigured, getCircleAppId } from "@/lib/server/circle-wallets";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    configured: isCircleWalletsConfigured(),
    appId: getCircleAppId(),
  });
}

