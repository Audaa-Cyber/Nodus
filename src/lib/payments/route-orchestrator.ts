import { getCircleChain, isCctpRouteSupported } from "../server/circle.ts";
import { getWalletNetwork } from "../wallet/networks.ts";

export interface RouteDiscoveryInput {
  invoiceId: string;
  amountMinor: number;
  currency: string;
  destinationNetwork: string;
  recipientAddress: string;
  sourceAssetId: string;
  sourceNetwork: string;
  sourceSymbol: string;
  sourceDecimals: number;
  sourceContractAddress: string | null;
  senderAddress?: string;
  isTestnet?: boolean;
}

export interface StandardizedRouteQuote {
  id: string;
  provider: "circle_direct" | "circle_cctp" | "simulation";
  providerLabel: string;
  sourceAssetId: string;
  sourceNetwork: string;
  sourceSymbol: string;
  sourceDecimals: number;
  destinationAssetId: string;
  destinationNetwork: string;
  destinationSymbol: string;
  destinationDecimals: number;
  recipientAddress: string;
  depositAddress: string;
  depositMemo: string | null;
  requestedAmount: string; // Source amount in base units
  expectedReceivedAmount: string; // Destination amount in base units
  minReceivedAmount: string; // Guaranteed minimum received in base units
  coversInvoice: boolean;
  quoteExpiresAt: string;
  estimatedDurationSeconds: number;
  fees: {
    protocolFeeUsd: string;
    networkFeeEstimate: string;
  };
  stepTransaction?: {
    to: string;
    data: string;
    value: string;
    chainId: string;
  } | null;
  quoteSnapshot: Record<string, unknown>;
}

export function invoiceMinorToUsdcBaseUnits(amountMinor: number): string {
  // Minor units are 2 decimals (cents). USDC is 6 decimals.
  // 100 minor units ($1.00) = 1,000,000 base units.
  // Formula: (minor * 10^6) / 10^2 = minor * 10^4.
  const units = BigInt(Math.max(0, amountMinor)) * 10000n;
  return units.toString();
}

export async function discoverPaymentRoutes(
  input: RouteDiscoveryInput,
): Promise<{ routes: StandardizedRouteQuote[]; error?: string }> {
  const {
    invoiceId,
    amountMinor,
    currency,
    destinationNetwork,
    recipientAddress,
    sourceAssetId,
    sourceNetwork,
    sourceSymbol,
    sourceDecimals,
    isTestnet = false,
  } = input;

  const normalizedCurrency = currency.toUpperCase();
  if (normalizedCurrency !== "USD" && normalizedCurrency !== "USDC") {
    return { routes: [], error: "unsupported_invoice_currency" };
  }

  const requiredBaseUnits = invoiceMinorToUsdcBaseUnits(amountMinor);
  const ttlMs = 5 * 60 * 1000; // 5 minute TTL
  const quoteExpiresAt = new Date(Date.now() + ttlMs).toISOString();

  const candidateRoutes: StandardizedRouteQuote[] = [];

  const destNet = getWalletNetwork(destinationNetwork);

  if (!destNet || destNet.family !== "evm") {
    return { routes: [], error: "destination_network_must_be_evm" };
  }

  const destCircleInfo = getCircleChain(destinationNetwork, isTestnet);

  // =========================================================================
  // 1. PATH 1: Same-Chain Direct USDC Transfer
  // =========================================================================
  const isSameChain = sourceNetwork.trim().toLowerCase() === destinationNetwork.trim().toLowerCase();
  const isSourceUsdc = sourceSymbol.toUpperCase() === "USDC";

  if (isSameChain && isSourceUsdc) {
    const directQuote: StandardizedRouteQuote = {
      id: `nodus-direct-${invoiceId}-${Date.now()}`,
      provider: "circle_direct",
      providerLabel: "Direct Same-Chain USDC Transfer",
      sourceAssetId,
      sourceNetwork,
      sourceSymbol: "USDC",
      sourceDecimals: 6,
      destinationAssetId: `${destinationNetwork}:usdc`,
      destinationNetwork,
      destinationSymbol: "USDC",
      destinationDecimals: 6,
      recipientAddress,
      depositAddress: recipientAddress,
      depositMemo: null,
      requestedAmount: requiredBaseUnits,
      expectedReceivedAmount: requiredBaseUnits,
      minReceivedAmount: requiredBaseUnits,
      coversInvoice: true,
      quoteExpiresAt,
      estimatedDurationSeconds: 12,
      fees: {
        protocolFeeUsd: "0.00",
        networkFeeEstimate: "Source chain gas only",
      },
      quoteSnapshot: {
        type: "circle_direct",
        invoiceId,
        amountMinor,
        requiredBaseUnits,
        sourceNetwork,
        destinationNetwork,
        recipientAddress,
      },
    };
    candidateRoutes.push(directQuote);
  }

  // The currently enabled multichain corridor is native USDC over Circle CCTP
  // between distinct EVM testnets represented in Circle's supported chain map.
  // =========================================================================
  if (!isSameChain && isSourceUsdc && isTestnet
    && isCctpRouteSupported(sourceNetwork, destinationNetwork, isTestnet)) {
    const sourceCircle = getCircleChain(sourceNetwork, isTestnet);
    const depositMessenger = sourceCircle?.tokenMessengerAddress ?? recipientAddress;

    const cctpQuote: StandardizedRouteQuote = {
      id: `nodus-cctp-${invoiceId}-${Date.now()}`,
      provider: "circle_cctp",
      providerLabel: "Circle CCTP Native USDC Bridge",
      sourceAssetId,
      sourceNetwork,
      sourceSymbol: "USDC",
      sourceDecimals: 6,
      destinationAssetId: `${destinationNetwork}:usdc`,
      destinationNetwork,
      destinationSymbol: "USDC",
      destinationDecimals: 6,
      recipientAddress,
      depositAddress: depositMessenger,
      depositMemo: null,
      requestedAmount: requiredBaseUnits,
      expectedReceivedAmount: requiredBaseUnits,
      minReceivedAmount: requiredBaseUnits,
      coversInvoice: true,
      quoteExpiresAt,
      estimatedDurationSeconds: 120, // Typical CCTP cross-chain finality
      fees: {
        protocolFeeUsd: "Circle estimate required before authorization",
        networkFeeEstimate: "Read from connected wallet before authorization",
      },
      quoteSnapshot: {
        type: "circle_cctp",
        invoiceId,
        amountMinor,
        requiredBaseUnits,
        sourceNetwork,
        destinationNetwork,
        sourceCctpDomain: sourceCircle?.cctpDomainId,
        destinationCctpDomain: destCircleInfo?.cctpDomainId,
        tokenMessenger: depositMessenger,
        recipientAddress,
      },
    };
    candidateRoutes.push(cctpQuote);
  }

  // =========================================================================
  // 4. MOCK / SIMULATION FALLBACK (when in mock mode or for verification)
  // =========================================================================
  if (candidateRoutes.length === 0 && process.env.PAYMENT_MODE === "mock") {
    candidateRoutes.push({
      id: `nodus-sim-${invoiceId}-${Date.now()}`,
      provider: "simulation",
      providerLabel: "Simulated Demonstration Route",
      sourceAssetId,
      sourceNetwork,
      sourceSymbol,
      sourceDecimals,
      destinationAssetId: `${destinationNetwork}:usdc`,
      destinationNetwork,
      destinationSymbol: "USDC",
      destinationDecimals: 6,
      recipientAddress,
      depositAddress: recipientAddress,
      depositMemo: null,
      requestedAmount: requiredBaseUnits,
      expectedReceivedAmount: requiredBaseUnits,
      minReceivedAmount: requiredBaseUnits,
      coversInvoice: true,
      quoteExpiresAt,
      estimatedDurationSeconds: 10,
      fees: {
        protocolFeeUsd: "0.00",
        networkFeeEstimate: "Simulated gas",
      },
      quoteSnapshot: {
        type: "simulation",
        requiredBaseUnits,
      },
    });
  }

  return { routes: candidateRoutes };
}
