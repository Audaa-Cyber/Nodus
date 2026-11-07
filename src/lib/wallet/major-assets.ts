const MAJOR_ASSETS_BY_NETWORK: Record<string, ReadonlySet<string>> = {
  ethereum: new Set(["eth", "usdc", "usdt", "dai", "wbtc", "link"]),
  arbitrum: new Set(["eth", "usdc", "usdt", "arb"]),
  base: new Set(["eth", "usdc", "cbbtc"]),
  optimism: new Set(["eth", "usdc", "usdt", "op"]),
  polygon: new Set(["pol", "usdc", "usdt"]),
  bsc: new Set(["bnb", "usdc", "usdt"]),
  avalanche: new Set(["avax", "usdc", "usdt"]),
  solana: new Set(["sol", "usdc", "usdt"]),
};

/** Keep the customer picker focused on established assets for wallet-supported networks. */
export function isMajorWalletAsset(networkKey: string, symbol: string): boolean {
  return MAJOR_ASSETS_BY_NETWORK[networkKey.trim().toLowerCase()]?.has(symbol.trim().toLowerCase()) ?? false;
}
