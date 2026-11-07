import { defineChain } from "viem";

export const mainnet = defineChain({
  id: 1,
  name: "Ethereum",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://cloudflare-eth.com"] } },
  blockExplorers: { default: { name: "Etherscan", url: "https://etherscan.io" } },
});
export const arbitrum = defineChain({
  id: 42161,
  name: "Arbitrum One",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://arb1.arbitrum.io/rpc"] } },
  blockExplorers: { default: { name: "Arbiscan", url: "https://arbiscan.io" } },
});
export const base = defineChain({
  id: 8453,
  name: "Base",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://mainnet.base.org"] } },
  blockExplorers: { default: { name: "Basescan", url: "https://basescan.org" } },
});
export const optimism = defineChain({
  id: 10,
  name: "OP Mainnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://mainnet.optimism.io"] } },
  blockExplorers: { default: { name: "Etherscan", url: "https://optimistic.etherscan.io" } },
});
export const polygon = defineChain({
  id: 137,
  name: "Polygon",
  nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
  rpcUrls: { default: { http: ["https://polygon-rpc.com"] } },
  blockExplorers: { default: { name: "PolygonScan", url: "https://polygonscan.com" } },
});
export const bsc = defineChain({
  id: 56,
  name: "BNB Smart Chain",
  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
  rpcUrls: { default: { http: ["https://bsc-dataseed.binance.org"] } },
  blockExplorers: { default: { name: "BscScan", url: "https://bscscan.com" } },
});
export const avalanche = defineChain({
  id: 43114,
  name: "Avalanche C-Chain",
  nativeCurrency: { name: "Avalanche", symbol: "AVAX", decimals: 18 },
  rpcUrls: { default: { http: ["https://api.avax.network/ext/bc/C/rpc"] } },
  blockExplorers: { default: { name: "SnowTrace", url: "https://snowtrace.io" } },
});

export const evmWalletChains = [mainnet, arbitrum, base, optimism, polygon, bsc, avalanche] as const;

export type WalletNetwork = {
  key: string;
  label: string;
  family: "evm" | "solana";
  chainId?: number;
};

const oneClickNetworkMap: Record<string, WalletNetwork> = {
  eth: { key: "ethereum", label: "Ethereum", family: "evm", chainId: mainnet.id },
  ethereum: { key: "ethereum", label: "Ethereum", family: "evm", chainId: mainnet.id },
  arb: { key: "arbitrum", label: "Arbitrum", family: "evm", chainId: arbitrum.id },
  arbitrum: { key: "arbitrum", label: "Arbitrum", family: "evm", chainId: arbitrum.id },
  base: { key: "base", label: "Base", family: "evm", chainId: base.id },
  op: { key: "optimism", label: "Optimism", family: "evm", chainId: optimism.id },
  optimism: { key: "optimism", label: "Optimism", family: "evm", chainId: optimism.id },
  pol: { key: "polygon", label: "Polygon", family: "evm", chainId: polygon.id },
  polygon: { key: "polygon", label: "Polygon", family: "evm", chainId: polygon.id },
  bsc: { key: "bsc", label: "BNB Smart Chain", family: "evm", chainId: bsc.id },
  avax: { key: "avalanche", label: "Avalanche", family: "evm", chainId: avalanche.id },
  avalanche: { key: "avalanche", label: "Avalanche", family: "evm", chainId: avalanche.id },
  sol: { key: "solana", label: "Solana", family: "solana" },
  solana: { key: "solana", label: "Solana", family: "solana" },
};

export function getWalletNetwork(blockchain: string): WalletNetwork | undefined {
  return oneClickNetworkMap[blockchain.trim().toLowerCase()];
}

export function getEvmWalletNetwork(chainId: number | undefined): WalletNetwork | undefined {
  if (chainId === undefined) return undefined;
  return Object.values(oneClickNetworkMap).find(
    (network) => network.family === "evm" && network.chainId === chainId,
  );
}

export const DEFAULT_RECOMMENDED_CHAIN_ID = base.id; // 8453 (Base)
export const DEFAULT_RECOMMENDED_CHAIN_NAME = "Base";

export function isSupportedEvmChain(chainId: number | undefined): boolean {
  if (chainId === undefined) return false;
  return evmWalletChains.some((chain) => chain.id === chainId);
}

export function getRecommendedEvmChain(preferredKey?: string | null): { id: number; name: string } {
  if (preferredKey) {
    const net = getWalletNetwork(preferredKey);
    if (net?.family === "evm" && net.chainId) {
      const match = evmWalletChains.find((c) => c.id === net.chainId);
      if (match) return { id: match.id, name: match.name };
    }
  }
  return { id: base.id, name: "Base" };
}
