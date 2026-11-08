import { NextResponse } from "next/server";
import { getWalletNetwork } from "@/lib/wallet/networks";
import type { WalletAsset } from "@/lib/wallet/types";

export const revalidate = 300;

const SUPPORTED_ASSETS: WalletAsset[] = [
  // Base
  { assetId: "base:usdc", symbol: "USDC", decimals: 6, network: getWalletNetwork("base")!, contractAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
  { assetId: "base:eth", symbol: "ETH", decimals: 18, network: getWalletNetwork("base")!, contractAddress: null },
  { assetId: "base:cbbtc", symbol: "cbBTC", decimals: 8, network: getWalletNetwork("base")!, contractAddress: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf" },

  // Ethereum
  { assetId: "ethereum:usdc", symbol: "USDC", decimals: 6, network: getWalletNetwork("ethereum")!, contractAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" },
  { assetId: "ethereum:usdt", symbol: "USDT", decimals: 6, network: getWalletNetwork("ethereum")!, contractAddress: "0xdAC17F958D2ee523a2206206994597C13D831ec7" },
  { assetId: "ethereum:eth", symbol: "ETH", decimals: 18, network: getWalletNetwork("ethereum")!, contractAddress: null },

  // Arbitrum
  { assetId: "arbitrum:usdc", symbol: "USDC", decimals: 6, network: getWalletNetwork("arbitrum")!, contractAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" },
  { assetId: "arbitrum:usdt", symbol: "USDT", decimals: 6, network: getWalletNetwork("arbitrum")!, contractAddress: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9" },
  { assetId: "arbitrum:eth", symbol: "ETH", decimals: 18, network: getWalletNetwork("arbitrum")!, contractAddress: null },

  // Optimism
  { assetId: "optimism:usdc", symbol: "USDC", decimals: 6, network: getWalletNetwork("optimism")!, contractAddress: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85" },
  { assetId: "optimism:usdt", symbol: "USDT", decimals: 6, network: getWalletNetwork("optimism")!, contractAddress: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58" },
  { assetId: "optimism:eth", symbol: "ETH", decimals: 18, network: getWalletNetwork("optimism")!, contractAddress: null },

  // Polygon
  { assetId: "polygon:usdc", symbol: "USDC", decimals: 6, network: getWalletNetwork("polygon")!, contractAddress: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" },
  { assetId: "polygon:usdt", symbol: "USDT", decimals: 6, network: getWalletNetwork("polygon")!, contractAddress: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F" },
  { assetId: "polygon:pol", symbol: "POL", decimals: 18, network: getWalletNetwork("polygon")!, contractAddress: null },

  // BNB Smart Chain
  { assetId: "bsc:usdc", symbol: "USDC", decimals: 18, network: getWalletNetwork("bsc")!, contractAddress: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d" },
  { assetId: "bsc:usdt", symbol: "USDT", decimals: 18, network: getWalletNetwork("bsc")!, contractAddress: "0x55d398326f99059fF775485246999027B3197955" },
  { assetId: "bsc:bnb", symbol: "BNB", decimals: 18, network: getWalletNetwork("bsc")!, contractAddress: null },

  // Avalanche
  { assetId: "avalanche:usdc", symbol: "USDC", decimals: 6, network: getWalletNetwork("avalanche")!, contractAddress: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E" },
  { assetId: "avalanche:usdt", symbol: "USDT", decimals: 6, network: getWalletNetwork("avalanche")!, contractAddress: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7" },
  { assetId: "avalanche:avax", symbol: "AVAX", decimals: 18, network: getWalletNetwork("avalanche")!, contractAddress: null },

  // Solana
  { assetId: "solana:usdc", symbol: "USDC", decimals: 6, network: getWalletNetwork("solana")!, contractAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" },
  { assetId: "solana:usdt", symbol: "USDT", decimals: 6, network: getWalletNetwork("solana")!, contractAddress: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB" },
  { assetId: "solana:sol", symbol: "SOL", decimals: 9, network: getWalletNetwork("solana")!, contractAddress: null },

  // Testnets (Sepolia & L2s)
  { assetId: "base-sepolia:usdc", symbol: "USDC", decimals: 6, network: getWalletNetwork("base-sepolia")!, contractAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" },
  { assetId: "sepolia:usdc", symbol: "USDC", decimals: 6, network: getWalletNetwork("sepolia")!, contractAddress: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" },
  { assetId: "arbitrum-sepolia:usdc", symbol: "USDC", decimals: 6, network: getWalletNetwork("arbitrum-sepolia")!, contractAddress: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d" },
  { assetId: "optimism-sepolia:usdc", symbol: "USDC", decimals: 6, network: getWalletNetwork("optimism-sepolia")!, contractAddress: "0x5fd84259d66Cd46123540766Be93DFE6D43130D7" },
];

export async function GET() {
  return NextResponse.json(
    { assets: SUPPORTED_ASSETS, updatedAt: new Date().toISOString() },
    {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    }
  );
}
