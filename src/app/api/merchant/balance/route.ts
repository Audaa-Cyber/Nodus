import { NextResponse } from "next/server";
import { createPublicClient, http, isAddress, parseAbi, type Address } from "viem";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWalletNetwork, evmWalletChains } from "@/lib/wallet/networks";

export const dynamic = "force-dynamic";

const ERC20_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
]);

/** Map of network key → USDC contract address (testnets + mainnets) */
const USDC_CONTRACTS: Record<string, string> = {
  // Testnets (priority for NODUS hackathon configuration)
  "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  "arbitrum-sepolia": "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
  "sepolia": "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  "optimism-sepolia": "0x5fd84259d66Cd46123540766Be93DFE6D43130D7",
  // Mainnets
  "base": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "arbitrum": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  "ethereum": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  "optimism": "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
  "polygon": "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
  "avalanche": "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
};

/** Fallback public RPC URLs for balance queries (not settlement — no confirmations needed) */
const FALLBACK_PUBLIC_RPCS: Record<string, string> = {
  "base-sepolia": "https://sepolia.base.org",
  "arbitrum-sepolia": "https://sepolia-rollup.arbitrum.io/rpc",
  "sepolia": "https://rpc.sepolia.org",
  "optimism-sepolia": "https://sepolia.optimism.io",
  "base": "https://mainnet.base.org",
  "arbitrum": "https://arb1.arbitrum.io/rpc",
  "ethereum": "https://cloudflare-eth.com",
  "optimism": "https://mainnet.optimism.io",
  "polygon": "https://polygon-rpc.com",
  "avalanche": "https://api.avax.network/ext/bc/C/rpc",
};

function readRpcOverrides(): Record<string, string> {
  try {
    const raw = process.env["SETTLEMENT_RPC_URLS_JSON"];
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

export async function GET() {
  // 1. Authenticate the merchant
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Load the merchant's business profile
  const { data: business, error: profileError } = await supabase
    .from("business_profiles")
    .select("receiving_address, receiving_network")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (profileError || !business) {
    return NextResponse.json({ error: "Business profile not found." }, { status: 404 });
  }

  const { receiving_address, receiving_network } = business;

  if (!receiving_address || !receiving_network) {
    return NextResponse.json({
      error: null,
      status: "not_configured",
      message: "No receiving wallet configured. Add a wallet address in Business Profile settings.",
    });
  }

  // 3. Validate the wallet address
  if (!isAddress(receiving_address)) {
    return NextResponse.json({
      error: null,
      status: "invalid_address",
      message: "The configured receiving address is not a valid EVM address.",
    });
  }

  // 4. Resolve network
  const networkKey = receiving_network.trim().toLowerCase();
  const network = getWalletNetwork(networkKey);

  if (!network || network.family !== "evm" || !network.chainId) {
    return NextResponse.json({
      error: null,
      status: "unsupported_network",
      message: `Network "${receiving_network}" is not a supported EVM network. Configure a supported network in Business Profile settings.`,
    });
  }

  // 5. Resolve USDC contract
  const contractAddress = USDC_CONTRACTS[networkKey];
  if (!contractAddress) {
    return NextResponse.json({
      error: null,
      status: "unsupported_network",
      message: `USDC is not available on "${receiving_network}". Supported networks: ${Object.keys(USDC_CONTRACTS).join(", ")}.`,
    });
  }

  // 6. Resolve RPC — prefer the server-side settlement override, fall back to public
  const rpcOverrides = readRpcOverrides();
  const rpcUrl = rpcOverrides[networkKey] || FALLBACK_PUBLIC_RPCS[networkKey];

  if (!rpcUrl) {
    return NextResponse.json({
      error: null,
      status: "rpc_unavailable",
      message: `No RPC endpoint configured for "${receiving_network}".`,
    });
  }

  // 7. Find the viem chain definition
  const chain = evmWalletChains.find((c) => c.id === network.chainId);
  if (!chain) {
    return NextResponse.json({
      error: null,
      status: "unsupported_network",
      message: `Chain definition for "${receiving_network}" is missing.`,
    });
  }

  // 8. Query USDC balance via viem — server-side only, RPC URL never reaches the browser
  try {
    const client = createPublicClient({
      chain,
      transport: http(rpcUrl, { timeout: 10_000, retryCount: 1 }),
    });

    const rawBalance = await client.readContract({
      address: contractAddress as Address,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [receiving_address as Address],
    });

    // USDC uses 6 decimals universally
    const decimals = 6;
    const divisor = BigInt(10 ** decimals);
    const whole = rawBalance / divisor;
    const fraction = rawBalance % divisor;
    const fractionStr = fraction.toString().padStart(decimals, "0").replace(/0+$/, "");
    const formatted = fractionStr ? `${whole}.${fractionStr}` : whole.toString();

    return NextResponse.json({
      error: null,
      status: "ok",
      balance: formatted,
      rawBalance: rawBalance.toString(),
      decimals,
      networkKey,
      networkLabel: network.label,
      contractAddress,
      walletAddress: receiving_address,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Distinguish RPC failure from other errors — never show 0 on RPC failure
    const isTimeout = message.includes("timeout") || message.includes("ETIMEDOUT");
    const statusCode = isTimeout ? "rpc_timeout" : "rpc_error";
    return NextResponse.json({
      error: null,
      status: statusCode,
      message: `Could not fetch balance from ${receiving_network} RPC. ${isTimeout ? "Request timed out." : "RPC call failed."} Try refreshing.`,
    }, { status: 502 });
  }
}
