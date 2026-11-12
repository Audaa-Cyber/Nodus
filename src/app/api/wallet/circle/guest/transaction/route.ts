import { NextResponse } from "next/server";
import {
  isCircleWalletsConfigured,
  getCircleAppId,
  getOrCreateCircleUserToken,
  createCircleTransferChallenge,
  createCircleContractExecutionChallenge,
} from "@/lib/server/circle-wallets";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isCircleWalletsConfigured()) {
    return NextResponse.json(
      { error: "Circle User-Controlled Wallets are not configured on the server." },
      { status: 503 }
    );
  }

  interface TxRequestBody {
    guestUserId?: string;
    walletId?: string;
    to?: string;
    value?: string;
    data?: string;
    tokenAddress?: string;
    amount?: string;
  }

  let body: TxRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { guestUserId, walletId, to, value, data, tokenAddress, amount } = body;

  if (!guestUserId || !/^[0-9a-f-]{36}$/i.test(guestUserId)) {
    return NextResponse.json({ error: "Invalid or missing guestUserId." }, { status: 400 });
  }

  if (!walletId) {
    return NextResponse.json({ error: "Missing walletId." }, { status: 400 });
  }

  const destination = to?.trim();
  if (!destination || !/^0x[a-fA-F0-9]{40}$/.test(destination)) {
    return NextResponse.json({ error: "Invalid destination address." }, { status: 400 });
  }

  try {
    const session = await getOrCreateCircleUserToken(guestUserId);

    let challengeId: string;
    if (data && data !== "0x") {
      // Contract interaction
      const res = await createCircleContractExecutionChallenge({
        userToken: session.userToken,
        walletId,
        contractAddress: destination,
        callData: data,
        amount: value,
      });
      challengeId = res.challengeId;
    } else {
      // Standard native / token transfer
      const res = await createCircleTransferChallenge({
        userToken: session.userToken,
        walletId,
        destinationAddress: destination,
        amount: amount || value || "0",
        tokenAddress,
      });
      challengeId = res.challengeId;
    }

    return NextResponse.json({
      challengeId,
      userToken: session.userToken,
      encryptionKey: session.encryptionKey,
      appId: getCircleAppId(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to initiate Circle transaction challenge.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

