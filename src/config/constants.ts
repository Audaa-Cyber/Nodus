/**
 * Centralized Application Constants for NODUS.
 */
export const APP_CONFIG = {
  name: "Nodus",
  tagline: "Cross-chain business payments",
  version: "0.1.0",
  defaultCurrency: "USD",
  supportedCurrencies: ["USDC", "USDT"] as const,
  apiPrefix: "/api",
  routes: {
    home: "/",
    checkoutPreview: "/#checkout",
    howItWorks: "/#how-it-works",
    business: "/#business",
    healthCheck: "/api/health",
  },
} as const;

