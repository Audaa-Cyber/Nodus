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
 * Server-side configuration boundary for future NEAR Intents integration.
 * Privileged fields (such as private keys) MUST remain server-only.
 */
export interface NearServerConfig {
  networkId: NearNetworkId;
  nodeUrl: string;
  contractId: string;
  signerAccountId: string;
  signerPrivateKey: string;
}

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

