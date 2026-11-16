/**
 * NEAR protocol network identifiers.
 */
export type NearNetworkId = "mainnet" | "testnet";

/**
 * Supported stablecoin symbols for cross-chain settlement.
 */
export type SupportedCurrency = "USDC" | "USDT";

/**
 * Supported underlying blockchain networks for settlement.
 */
export type SupportedChain = "near" | "ethereum" | "solana" | "arbitrum" | "polygon";

/**
 * Public client-safe representation of supported payment settlement routes.
 */
export interface PaymentRouteOption {
  id: string;
  displayName: string;
  currency: SupportedCurrency;
  chain: SupportedChain;
  active: boolean;
}

