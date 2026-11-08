export interface CircleChainInfo {
  networkKey: string;
  name: string;
  chainId: number;
  cctpDomainId: number;
  usdcAddress: `0x${string}`;
  tokenMessengerAddress: `0x${string}`;
}

export const MAINNET_CIRCLE_CHAINS: Record<string, CircleChainInfo> = {
  ethereum: {
    networkKey: "ethereum",
    name: "Ethereum",
    chainId: 1,
    cctpDomainId: 0,
    usdcAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    tokenMessengerAddress: "0xBd3fa81B58Ba92a82136038B25aDec7066af3155",
  },
  avalanche: {
    networkKey: "avalanche",
    name: "Avalanche",
    chainId: 43114,
    cctpDomainId: 1,
    usdcAddress: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
    tokenMessengerAddress: "0x6B25532e1060CE10cc3B0A99e5683b91BFDe6982",
  },
  optimism: {
    networkKey: "optimism",
    name: "Optimism",
    chainId: 10,
    cctpDomainId: 2,
    usdcAddress: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
    tokenMessengerAddress: "0x2B4069517957735bE00ceE0fadAE88a26365528f",
  },
  arbitrum: {
    networkKey: "arbitrum",
    name: "Arbitrum",
    chainId: 42161,
    cctpDomainId: 3,
    usdcAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    tokenMessengerAddress: "0x19330d52D9F3F7b21255e2d1C80B0F3F7B21255E",
  },
  base: {
    networkKey: "base",
    name: "Base",
    chainId: 8453,
    cctpDomainId: 6,
    usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    tokenMessengerAddress: "0x1682Ae6375C4E4A97e4B583BC394c861A46D8962",
  },
  polygon: {
    networkKey: "polygon",
    name: "Polygon",
    chainId: 137,
    cctpDomainId: 7,
    usdcAddress: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    tokenMessengerAddress: "0x9daF8c91AEFAE50b9c0E69629D3F6Ca40cA3B3FE",
  },
};

export const TESTNET_CIRCLE_CHAINS: Record<string, CircleChainInfo> = {
  ethereum: {
    networkKey: "ethereum",
    name: "Ethereum Sepolia",
    chainId: 11155111,
    cctpDomainId: 0,
    usdcAddress: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    tokenMessengerAddress: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
  },
  avalanche: {
    networkKey: "avalanche",
    name: "Avalanche Fuji",
    chainId: 43113,
    cctpDomainId: 1,
    usdcAddress: "0x5425890298aed601595a70AB815c96711a31Bc65",
    tokenMessengerAddress: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
  },
  optimism: {
    networkKey: "optimism",
    name: "OP Sepolia",
    chainId: 11155420,
    cctpDomainId: 2,
    usdcAddress: "0x5fd84259d66Cd46123540766Be93DFE6D43130D7",
    tokenMessengerAddress: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
  },
  arbitrum: {
    networkKey: "arbitrum",
    name: "Arbitrum Sepolia",
    chainId: 421614,
    cctpDomainId: 3,
    usdcAddress: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    tokenMessengerAddress: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
  },
  base: {
    networkKey: "base",
    name: "Base Sepolia",
    chainId: 84532,
    cctpDomainId: 6,
    usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    tokenMessengerAddress: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
  },
  polygon: {
    networkKey: "polygon",
    name: "Polygon Amoy",
    chainId: 80002,
    cctpDomainId: 7,
    usdcAddress: "0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582",
    tokenMessengerAddress: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
  },
};

export function getCircleChain(networkKey: string, isTestnet = false): CircleChainInfo | null {
  const norm = networkKey.trim().toLowerCase();
  const table = isTestnet ? TESTNET_CIRCLE_CHAINS : MAINNET_CIRCLE_CHAINS;
  if (table[norm]) return table[norm];
  if (isTestnet) {
    if (norm === "sepolia" || norm === "ethereum-sepolia") return table.ethereum ?? null;
    if (norm === "base-sepolia") return table.base ?? null;
    if (norm === "arbitrum-sepolia") return table.arbitrum ?? null;
    if (norm === "optimism-sepolia") return table.optimism ?? null;
    if (norm === "polygon-amoy") return table.polygon ?? null;
  }
  return null;
}

export function isCctpRouteSupported(
  fromNetwork: string,
  toNetwork: string,
  isTestnet = false,
): boolean {
  const from = getCircleChain(fromNetwork, isTestnet);
  const to = getCircleChain(toNetwork, isTestnet);
  return Boolean(from && to && from.cctpDomainId !== to.cctpDomainId);
}

export function isDirectUsdcTransferSupported(
  fromNetwork: string,
  toNetwork: string,
  symbol: string,
  isTestnet = false,
): boolean {
  if (symbol.toUpperCase() !== "USDC") return false;
  const fromNorm = fromNetwork.trim().toLowerCase();
  const toNorm = toNetwork.trim().toLowerCase();
  if (fromNorm !== toNorm) return false;
  return Boolean(getCircleChain(fromNorm, isTestnet));
}
