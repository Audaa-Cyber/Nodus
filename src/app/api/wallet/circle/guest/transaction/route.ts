import { NextResponse } from "next/server";
import {
  isCircleWalletsConfigured,
  getCircleAppId,
  getOrCreateCircleUserToken,
  createCircleTransferChallenge,
  createCircleContractExecutionChallenge,
} from "@/lib/server/circle-wallets";

export const dynamic = "force-dynamic";

function toCircleNativeAmount(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error("Invalid native transaction value.");

  const normalized = value.trim();
  if (!normalized) throw new Error("Invalid native transaction value.");

  let wei: bigint;
  if (/^0x[0-9a-f]+$/i.test(normalized)) {
    wei = BigInt(normalized);
  } else if (/^\d+$/.test(normalized)) {
    wei = BigInt(normalized);
  } else {
    throw new Error("Invalid native transaction value.");
  }

  if (wei === 0n) return undefined;

  const weiPerEther = 1_000_000_000_000_000_000n;
  const whole = wei / weiPerEther;
  const fractionalWei = wei % weiPerEther;
  if (fractionalWei === 0n) return whole.toString();

  const fraction = fractionalWei.toString().padStart(18, "0").replace(/0+$/, "");
  return `${whole}.${fraction}`;
}

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

  let nativeAmount: string | undefined;
  try {
    nativeAmount = toCircleNativeAmount(value);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid native transaction value." },
      { status: 400 },
    );
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
        amount: nativeAmount,
      });
      challengeId = res.challengeId;
    } else {
      // Standard native / token transfer
      const res = await createCircleTransferChallenge({
        userToken: session.userToken,
        walletId,
        destinationAddress: destination,
        amount: amount || nativeAmount || "0",
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

