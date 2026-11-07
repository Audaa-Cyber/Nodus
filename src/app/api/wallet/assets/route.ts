import { NextResponse } from "next/server";
import type { TokenResponse } from "@defuse-protocol/one-click-sdk-typescript";
import { getWalletNetwork } from "@/lib/wallet/networks";
import { getOneClickTokens } from "@/lib/server/one-click";

export const revalidate = 300;

const ASSET_ID_PATTERN = /^[A-Za-z0-9:_./-]{1,240}$/;
const ADDRESS_PATTERN = /^[A-Za-z0-9:_./-]{1,160}$/;

function isToken(value: unknown): value is TokenResponse {
  return typeof value === "object" && value !== null;
}

export async function GET() {
  try {
    const rawTokens: unknown = await getOneClickTokens();
    if (!Array.isArray(rawTokens)) {
      return NextResponse.json({ error: "asset_list_unavailable" }, { status: 503 });
    }

    const seen = new Set<string>();
    const assets = rawTokens.flatMap((rawToken) => {
      if (!isToken(rawToken)) return [];
      const { assetId, decimals, blockchain, symbol, contractAddress } = rawToken;
      if (
        typeof assetId !== "string" ||
        !ASSET_ID_PATTERN.test(assetId) ||
        typeof blockchain !== "string" ||
        blockchain.length > 40 ||
        typeof symbol !== "string" ||
        !/^[A-Za-z0-9._-]{1,32}$/.test(symbol) ||
        typeof decimals !== "number" ||
        !Number.isInteger(decimals) ||
        decimals < 0 ||
        decimals > 30
      ) return [];

      const network = getWalletNetwork(blockchain);
      if (!network) return [];
      if (contractAddress !== undefined && contractAddress !== null &&
        (typeof contractAddress !== "string" || !ADDRESS_PATTERN.test(contractAddress))) return [];
      if (seen.has(assetId)) return [];
      seen.add(assetId);

      return [{
        assetId,
        symbol,
        decimals,
        network,
        contractAddress: typeof contractAddress === "string" ? contractAddress : null,
      }];
    });

    return NextResponse.json({ assets, updatedAt: new Date().toISOString() }, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch {
    return NextResponse.json({ error: "asset_list_unavailable" }, { status: 503 });
  }
}
