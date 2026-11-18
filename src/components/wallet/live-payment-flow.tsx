"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAccount, useSendTransaction, useSwitchChain } from "wagmi";
import { formatMoney } from "@/lib/invoices";
import { PayerIcon } from "@/components/payer-design-icons";
import { paymentProgress } from "./payer-progress";
import { lockPayerDialogBackground, trapPayerDialogFocus } from "./payer-dialog";
import { createIdempotencyKey } from "@/lib/idempotency-key";
import { evmWalletChains, getWalletNetwork } from "@/lib/wallet/networks";
import { getCircleChain } from "@/lib/server/circle";
import { isMobileWalletBrowser, setWalletConnectSessionDefaultChain } from "@/lib/wallet/rabby-mobile-handoff";
import { createPublicClient, custom, formatEther, http, parseAbi } from "viem";
import { executeDirectUsdc } from "@/lib/payments/direct-execution";
import { assertFreshCircleExecutionReservation, executeCircleBridgeAfterFreshReservation } from "@/lib/payments/circle-execution-reservation";
import { estimateCircleSourceGas, CIRCLE_TESTNET_TOKEN_MESSENGER_WITH_FEES } from "@/lib/payments/circle-gas-estimation";
import type { WalletAsset } from "@/lib/wallet/types";
import type { StandardizedRouteQuote } from "@/lib/payments/route-orchestrator";
import { buildPaymentRoutesRequest } from "@/lib/payments/route-request";
import { canRetryCircleBridgeResult, sanitizeCircleBridgeStep } from "@/lib/payments/circle-bridge-recovery";
import { createPaymentReferenceWriter } from "@/lib/payments/payment-reference-persistence";
import type { BridgeResult } from "@circle-fin/app-kit";

interface LivePaymentFlowProps {
  dockDetails?: ReactNode;
  onExecutionStateChange?: (locked: boolean) => void;
  shareToken: string;
  invoiceNumber: string;
  amountMinor: number;
  currency: string;
  selectedAsset: WalletAsset | null;
  activeAddress: string | null;
  onPaymentSuccess?: (receipts?: Array<{ receipt_number: string; issued_at: string; [key: string]: unknown }>) => void;
}

const CHAIN_ID_TO_BRIDGE_CHAIN: Record<number, string> = {
  1: "Ethereum",
  11155111: "Ethereum_Sepolia",
  8453: "Base",
  84532: "Base_Sepolia",
  42161: "Arbitrum",
  421614: "Arbitrum_Sepolia",
  10: "Optimism",
  11155420: "Optimism_Sepolia",
  5042002: "Arc_Testnet",
};

function formatUnits(baseUnits: string, decimals: number): string {
  const big = BigInt(baseUnits || "0");
  const divisor = BigInt(10 ** decimals);
  const integerPart = big / divisor;
  const remainder = big % divisor;
  const remainderStr = remainder.toString().padStart(decimals, "0").replace(/0+$/, "");
  return remainderStr ? `${integerPart}.${remainderStr}` : integerPart.toString();
}

function usdcToBaseUnits(value: string): string {
  const [whole, fraction = ""] = value.split(".");
  if (!/^\d+$/.test(whole) || !/^\d{0,6}$/.test(fraction)) throw new Error("Invalid Circle USDC amount.");
  return (BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"))).toString();
}

function shortHash(hash: string): string {
  return hash.length > 18 ? `${hash.slice(0, 10)}…${hash.slice(-8)}` : hash;
}

function getRouteDiscoveryErrorMessage(code: unknown): string {
  if (code === "unsupported_circle_testnet_destination_network") {
    return "This invoice's receiving network is not enabled for testnet checkout. The merchant must choose Sepolia, Base Sepolia, Arbitrum Sepolia, Optimism Sepolia, or Arc Testnet in their business profile.";
  }
  if (code === "unsupported_circle_testnet_source_asset") {
    return "The selected token is not a supported Circle testnet USDC asset. Choose USDC on one of the supported testnet networks.";
  }
  if (code === "circle_route_unsupported") {
    return "Circle does not support this source and destination route.";
  }
  if (code === "circle_liquidity_or_fee_unavailable") {
    return "Circle cannot provide the required fee or liquidity for this route right now. Retry quote discovery later.";
  }
  return typeof code === "string" && code ? code : "No route found for this token.";
}

function isWalletUserRejection(error: unknown, seen = new Set<object>()): boolean {
  if (!error || typeof error !== "object" || seen.has(error)) return false;
  seen.add(error);
  const value = error as { code?: unknown; name?: unknown; message?: unknown; cause?: unknown };
  const code = String(value.code ?? "").toLowerCase();
  const name = String(value.name ?? "").toLowerCase();
  const message = String(value.message ?? "");
  if (code === "4001" || code === "action_rejected" || name === "userrejectedrequesterror") return true;
  if (/user (?:rejected|denied|cancelled|canceled)|request rejected by user/i.test(message)) return true;
  return isWalletUserRejection(value.cause, seen);
}

export function LivePaymentFlow({
  shareToken,
  invoiceNumber,
  amountMinor,
  currency,
  selectedAsset,
  activeAddress,
  onPaymentSuccess,
  dockDetails,
  onExecutionStateChange,
}: LivePaymentFlowProps) {
  const { chainId: evmChainId, connector } = useAccount();
  const { switchChainAsync, isPending: isSwitchingChain } = useSwitchChain();
  const { sendTransactionAsync, isPending: isSendingTx } = useSendTransaction();

  const [showDetails, setShowDetails] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [routes, setRoutes] = useState<StandardizedRouteQuote[]>([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [routesError, setRoutesError] = useState("");

  const [stage, setStage] = useState<
    "idle" | "authorizing" | "broadcasting" | "verifying" | "settled" | "error"
  >("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [flowError, setFlowError] = useState("");
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [recoveryRequired, setRecoveryRequired] = useState(false);
  const [sourceTransactionReferenceMissing, setSourceTransactionReferenceMissing] = useState(false);
  const [walletRejected, setWalletRejected] = useState(false);
  const [depositTxHash, setDepositTxHash] = useState<string | null>(null);
  const [approvalTxHash, setApprovalTxHash] = useState<string | null>(null);
  const [destinationReceipts, setDestinationReceipts] = useState<
    Array<{ receipt_number: string; issued_at: string }>
  >([]);
  const [timeRemainingSeconds, setTimeRemainingSeconds] = useState<number | null>(null);
  const [circleQuote, setCircleQuote] = useState<{
    quote: string;
    amountReceived: string;
    feeTotal: string;
    totalDebit: string;
    feeItems: Array<{ type: string; amount: string }>;
    expiresAt: string;
    quoteExpiryMode: "TIMESTAMP" | "BLOCK_NUMBER";
    quoteExpiresAtBlock?: number;
    gasWei: string;
  } | null>(null);
  const executionLock = useRef(false);
  const routeRequest = useRef(0);
  const lastExpiredRouteRefresh = useRef<string | null>(null);
  const referenceWriter = useMemo(() => createPaymentReferenceWriter(shareToken), [shareToken]);

  const selectedRoute = useMemo(
    () => routes[selectedRouteIndex] ?? null,
    [routes, selectedRouteIndex]
  );
  // 1. Fetch available routes from backend orchestrator
  const fetchRoutes = useCallback(async () => {
    if (!selectedAsset || !activeAddress || attemptId) return;
    if (executionLock.current) return;
    const requestId = ++routeRequest.current;
    setCircleQuote(null);
    setLoadingRoutes(true);
    setRoutesError("");
    try {
      const response = await fetch(`/api/pay/${encodeURIComponent(shareToken)}/routes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPaymentRoutesRequest(selectedAsset, activeAddress)),
      });

      const data = await response.json();
      if (requestId !== routeRequest.current || executionLock.current) return;
      if (!response.ok || !data.success || !Array.isArray(data.routes)) {
        const message = getRouteDiscoveryErrorMessage(data.error);
        const providerReason = typeof data.providerReason === "string" ? data.providerReason : "";
        throw new Error(providerReason ? `${message} Circle: ${providerReason}` : message);
      }

      setRoutes(data.routes);
      setSelectedRouteIndex(0);
    } catch (err) {
      if (requestId !== routeRequest.current || executionLock.current) return;
      setRoutesError(err instanceof Error ? err.message : "Failed to load payment routes.");
      setRoutes([]);
    } finally {
      if (requestId === routeRequest.current) setLoadingRoutes(false);
    }
  }, [selectedAsset, activeAddress, shareToken, attemptId]);

  useEffect(() => {
    void fetchRoutes();
  }, [fetchRoutes]);

  useEffect(() => {
    try {
      const savedAttemptId = window.localStorage.getItem(`nodus:live-attempt:${shareToken}`);
      if (!attemptId && savedAttemptId && /^[0-9a-f-]{36}$/i.test(savedAttemptId)) {
        // Migrate the previous browser backup into an attempt-scoped journal.
        const savedTxHash = window.localStorage.getItem(`nodus:live-tx:${shareToken}`);
        if (savedTxHash && /^0x[0-9a-f]{64}$/i.test(savedTxHash)) {
          referenceWriter.record(savedAttemptId, { transactionHash: savedTxHash });
        }
        const references = referenceWriter.read(savedAttemptId);
        if (references.transactionHash) setDepositTxHash(references.transactionHash);
        if (references.approvalTransactionHash) setApprovalTxHash(references.approvalTransactionHash);
        setAttemptId(savedAttemptId);
        setStage("verifying");
        setStatusMessage("Resuming verification for the payment attempt saved in this browser.");
      }
    } catch { /* New execution requires a browser backup before requesting wallet signatures. */ }
  }, [attemptId, shareToken, referenceWriter]);

  // 2. Countdown timer for quote expiration
  useEffect(() => {
    const quoteExpiresAt = circleQuote?.expiresAt ?? selectedRoute?.quoteExpiresAt;
    if (!quoteExpiresAt) {
      setTimeRemainingSeconds(null);
      return;
    }

    const targetTime = new Date(quoteExpiresAt).getTime();
    const interval = setInterval(() => {
      const diff = Math.max(0, Math.floor((targetTime - Date.now()) / 1000));
      setTimeRemainingSeconds(diff);
      if (diff === 0 && stage === "idle") {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [selectedRoute, circleQuote?.expiresAt, stage]);

  // 3. Execution handler
  async function handleAuthorizePayment() {
    if (!selectedRoute || !selectedAsset || !activeAddress || executionLock.current || attemptId) return;

    if (selectedRoute.provider === "circle_cctp" && !circleQuote) {
      setStage("authorizing");
      setStatusMessage("Checking the server verified Circle quote and source-chain balances…");
      try {
        if (!connector) throw new Error("Wallet connector unavailable.");
        const sourceNetwork = getWalletNetwork(selectedRoute.sourceNetwork);
        const sourceChain = sourceNetwork?.chainId
          ? evmWalletChains.find((chain) => chain.id === sourceNetwork.chainId)
          : undefined;
        if (!sourceNetwork || !sourceChain || !selectedAsset.contractAddress) {
          throw new Error("The selected source network is not configured for Circle USDC bridging.");
        }
        const sourceChainKey = CHAIN_ID_TO_BRIDGE_CHAIN[sourceChain.id];
        if (!sourceChainKey) throw new Error("The selected source network has no Circle Bridge Kit chain mapping.");
        const { AppKit } = await import("@circle-fin/app-kit");
        const sourceFeeChains = new AppKit().getSupportedChains("bridge", { sourceFeeSupported: true });
        if (!sourceFeeChains.some((chain) => chain.chain === sourceChainKey)) {
          throw new Error(
            `Circle App Kit ${sourceNetwork.label} source-fee support is not loaded. Restart the NODUS server to apply its Arc compatibility patch, then request a fresh quote. No payment attempt was reserved.`,
          );
        }
        const walletConnectChainAligned = connector.id === "walletConnect" && isMobileWalletBrowser()
          ? await setWalletConnectSessionDefaultChain(connector, sourceChain.id, activeAddress)
          : false;
        if (evmChainId !== sourceChain.id && !walletConnectChainAligned) {
          setStatusMessage(`Switch to ${sourceNetwork.label} to check the source wallet balance.`);
          await switchChainAsync({ chainId: sourceChain.id });
        }
        const quoteSnapshot = selectedRoute.quoteSnapshot;
        const signedQuote = quoteSnapshot.quote;
        const amountReceived = quoteSnapshot.amountReceived;
        const feeTotal = quoteSnapshot.feeTotal;
        const totalDebit = quoteSnapshot.totalDebit;
        const quoteExpiresAt = quoteSnapshot.quoteExpiresAt;
        const quoteExpiryMode = quoteSnapshot.quoteExpiryMode;
        const quoteExpiresAtBlock = quoteSnapshot.quoteExpiresAtBlock;
        const feeItems = quoteSnapshot.feeItems;
        if (typeof signedQuote !== "string" || !/^0x(?:[0-9a-fA-F]{2})+$/.test(signedQuote)
          || typeof amountReceived !== "string" || typeof feeTotal !== "string"
          || typeof totalDebit !== "string" || typeof quoteExpiresAt !== "string"
          || (quoteExpiryMode !== "TIMESTAMP" && quoteExpiryMode !== "BLOCK_NUMBER")
          || (quoteExpiryMode === "BLOCK_NUMBER" && (typeof quoteExpiresAtBlock !== "number"
            || !Number.isSafeInteger(quoteExpiresAtBlock) || quoteExpiresAtBlock < 0))
          || !Array.isArray(feeItems) || !/^\d+$/.test(selectedRoute.requestedAmount)
          || usdcToBaseUnits(totalDebit) !== selectedRoute.requestedAmount
          || usdcToBaseUnits(amountReceived) !== selectedRoute.expectedReceivedAmount) {
          throw new Error("The server did not return a complete Circle quote for this route. Retry route discovery.");
        }
        const normalizedFeeItems = feeItems.map((item) => {
          if (!item || typeof item !== "object"
            || typeof (item as Record<string, unknown>).type !== "string"
            || typeof (item as Record<string, unknown>).amount !== "string") {
            throw new Error("Circle returned invalid itemized fee terms.");
          }
          return { type: (item as Record<string, string>).type, amount: (item as Record<string, string>).amount };
        });
        const expiresAtMs = Date.parse(quoteExpiresAt);
        if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now() + 30_000) {
          throw new Error("The Circle quote is close to expiry. Retry route discovery for a fresh quote.");
        }

        const provider = (await connector.getProvider()) as { request: (args: unknown) => Promise<unknown> };
        const requiredUsdc = usdcToBaseUnits(totalDebit);
        const requiredUsdcBaseUnits = BigInt(requiredUsdc);
        const publicClient = createPublicClient({ chain: sourceChain, transport: custom(provider as never) });
        const sourceCircle = getCircleChain(sourceNetwork.key, true);
        const tokenMessengerSpender = sourceCircle?.tokenMessengerWithFees ?? sourceCircle?.tokenMessengerAddress ?? CIRCLE_TESTNET_TOKEN_MESSENGER_WITH_FEES;
        const gasEstimate = await estimateCircleSourceGas({
          payerAddress: activeAddress as `0x${string}`,
          amountBaseUnits: requiredUsdcBaseUnits,
          publicClient,
          fallbackChain: sourceChain,
          fallbackRpcUrl: sourceChain.rpcUrls.default.http[0],
          usdcAddress: selectedAsset.contractAddress as `0x${string}`,
          tokenMessengerWithFeesAddress: tokenMessengerSpender,
        });
        const estimatedGasWei = gasEstimate.estimatedGasWei;
        let usdcBalance: bigint;
        let nativeBalance: bigint;
        try {
          [usdcBalance, nativeBalance] = await Promise.all([
            publicClient.readContract({
              address: selectedAsset.contractAddress as `0x${string}`,
              abi: parseAbi(["function balanceOf(address) view returns (uint256)"]),
              functionName: "balanceOf",
              args: [activeAddress as `0x${string}`],
            }),
            publicClient.getBalance({ address: activeAddress as `0x${string}` }),
          ]);
        } catch {
          const fallbackClient = createPublicClient({ chain: sourceChain, transport: http(sourceChain.rpcUrls.default.http[0]) });
          [usdcBalance, nativeBalance] = await Promise.all([
            fallbackClient.readContract({
              address: selectedAsset.contractAddress as `0x${string}`,
              abi: parseAbi(["function balanceOf(address) view returns (uint256)"]),
              functionName: "balanceOf",
              args: [activeAddress as `0x${string}`],
            }),
            fallbackClient.getBalance({ address: activeAddress as `0x${string}` }),
          ]);
        }
        if (sourceChain.id === 5042002) {
          // Arc Testnet uses native USDC (18 decimals) for execution gas, drawn from the same account balance as ERC-20 USDC (6 decimals).
          // Convert estimated gas wei to 6-decimal units with ceiling division to prevent double counting or underestimating.
          const gasInUsdc6Decimals = (estimatedGasWei + 10n ** 12n - 1n) / (10n ** 12n);
          if (usdcBalance < requiredUsdcBaseUnits + gasInUsdc6Decimals) {
            throw new Error(`Insufficient ${sourceNetwork.label} USDC to cover payment amount and transaction gas.`);
          }
        } else {
          if (usdcBalance < requiredUsdcBaseUnits) throw new Error(`Insufficient ${sourceNetwork.label} USDC for the Circle quote.`);
          if (nativeBalance < estimatedGasWei) throw new Error(`Insufficient ${sourceNetwork.label} ${sourceChain.nativeCurrency.symbol} for estimated bridge gas.`);
        }
        setCircleQuote({
          quote: signedQuote,
          amountReceived,
          feeTotal,
          totalDebit,
          feeItems: normalizedFeeItems,
          expiresAt: quoteExpiresAt,
          quoteExpiryMode,
          ...(quoteExpiryMode === "BLOCK_NUMBER" ? { quoteExpiresAtBlock: quoteExpiresAtBlock as number } : {}),
          gasWei: estimatedGasWei.toString(),
        });
        setStage("idle");
        setFlowError("");
        setStatusMessage("Quote ready. Review the amount and Circle fees, then authorize the payment.");
        return;
      } catch (err) {
        setStage("error");
        setFlowError(err instanceof Error ? err.message : "Circle quote request failed.");
        return;
      }
    }

    // Check expiry
    const expiresAt = circleQuote ? Date.parse(circleQuote.expiresAt) : new Date(selectedRoute.quoteExpiresAt).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      const expiredRouteKey = `${selectedRoute.id}:${selectedRoute.quoteExpiresAt}`;
      setCircleQuote(null);
      setWalletRejected(false);
      setStatusMessage("");
      setFlowError("This quote expired before execution. Refreshing route information; no payment was started.");
      if (lastExpiredRouteRefresh.current === expiredRouteKey) {
        setFlowError("The refreshed route is still expired. Use Retry discovery before requesting another quote.");
        return;
      }
      lastExpiredRouteRefresh.current = expiredRouteKey;
      await fetchRoutes();
      setFlowError("");
      setStatusMessage("Route information refreshed. Request a fresh Circle quote to continue.");
      return;
    }

    setFlowError("");
    setWalletRejected(false);
    setStage("authorizing");
    setStatusMessage("Validating route and network parameters…");
    executionLock.current = true;
    ++routeRequest.current;
    let directExecutionStarted = false;
    let circleExecutionStarted = false;
    let circleStartResponse: { ok: boolean; data: unknown } | null = null;
    let broadcastTxHash: string | null = null;
    let currentAttemptIdForRecovery: string | null = null;

    try {
      // Step A: Ensure wallet is on the correct source network
      const sourceNetworkObj = getWalletNetwork(selectedRoute.sourceNetwork);
      const targetChainId = sourceNetworkObj?.chainId;

      if (selectedRoute.provider === "circle_direct") {
        // Direct authorization is bound to the reviewed wallet and network.
        if (!connector || await connector.getChainId() !== targetChainId
          || (await connector.getAccounts())[0]?.toLowerCase() !== activeAddress.toLowerCase()) {
          throw new Error("Wallet account or network changed. Refresh the payment route before authorizing.");
        }
      } else if (targetChainId && evmChainId !== targetChainId) {
        const walletConnectChainAligned = connector?.id === "walletConnect" && isMobileWalletBrowser()
          ? await setWalletConnectSessionDefaultChain(connector, targetChainId, activeAddress)
          : false;
        if (!walletConnectChainAligned) {
          setStatusMessage(`Please switch your wallet to ${sourceNetworkObj.label}…`);
          await switchChainAsync({ chainId: targetChainId, ...(connector ? { connector } : {}) });
        }
      }

      // Step B: Create committed payment attempt in Supabase
      setStatusMessage("Securing payment attempt…");
      const attemptRes = await fetch(`/api/pay/${encodeURIComponent(shareToken)}/attempt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: createIdempotencyKey(),
          sourceAssetId: selectedRoute.sourceAssetId,
          sourceNetwork: selectedRoute.sourceNetwork,
          destinationAssetId: selectedRoute.destinationAssetId,
          destinationNetwork: selectedRoute.destinationNetwork,
          recipientAddress: selectedRoute.recipientAddress,
          depositAddress: selectedRoute.depositAddress,
          depositMemo: selectedRoute.depositMemo,
          requestedAmount: circleQuote && selectedRoute.provider === "circle_cctp"
            ? usdcToBaseUnits(circleQuote.totalDebit)
            : selectedRoute.requestedAmount,
          expectedReceivedAmount: selectedRoute.expectedReceivedAmount,
          quoteExpiresAt: circleQuote?.expiresAt ?? selectedRoute.quoteExpiresAt,
          quoteSnapshot: circleQuote && selectedRoute.provider === "circle_cctp" ? {
            type: "circle_cctp", quote: circleQuote.quote,
            amountReceived: circleQuote.amountReceived, feeTotal: circleQuote.feeTotal,
            feeItems: circleQuote.feeItems, totalDebit: circleQuote.totalDebit,
            quoteExpiryMode: circleQuote.quoteExpiryMode,
            ...(circleQuote.quoteExpiryMode === "BLOCK_NUMBER"
              ? { quoteExpiresAtBlock: circleQuote.quoteExpiresAtBlock } : {}),
          } : selectedRoute.quoteSnapshot,
          senderAddress: activeAddress,
        }),
      });

      const attemptData = await attemptRes.json();
      if (!attemptRes.ok || !attemptData.attempt?.id) {
        const reason = process.env.NODE_ENV === "development" && typeof attemptData.reason === "string"
          ? ` (${attemptData.reason})` : "";
        throw new Error(`${attemptData.error || "Failed to commit payment attempt."}${reason}`);
      }

      const currentAttemptId = attemptData.attempt.id as string;
      currentAttemptIdForRecovery = currentAttemptId;
      window.localStorage.removeItem(`nodus:live-tx:${shareToken}`);
      window.localStorage.setItem(`nodus:live-attempt:${shareToken}`, currentAttemptId);
      setAttemptId(currentAttemptId);

      if (selectedRoute.provider === "circle_cctp" || selectedRoute.provider === "circle_direct") {
        directExecutionStarted = selectedRoute.provider === "circle_direct";
        circleExecutionStarted = selectedRoute.provider === "circle_cctp";
        const startRes = await fetch(
          `/api/pay/${encodeURIComponent(shareToken)}/attempt/${currentAttemptId}/start`,
          {
            method: "POST",
            cache: "no-store",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ expectedPayer: activeAddress, ...(selectedRoute.provider === "circle_direct" ? { routeType: "same_chain" } : {}) }),
          }
        );
        const startData = await startRes.json();
        circleStartResponse = { ok: startRes.ok, data: startData };
        if (selectedRoute.provider === "circle_direct") {
          assertFreshCircleExecutionReservation(startRes.ok, startData);
        }
        if (!startRes.ok) {
          throw new Error(startData.error || "Could not reserve this payment attempt for execution.");
        }
      }

      // Step C: Trigger wallet signature / broadcast according to provider
      setStatusMessage("Please sign the transaction in your connected wallet…");
      let txHash: string | null = null;
      let approvalTxHash: string | null = null;

      if (selectedRoute.provider === "circle_direct") {
        if (!connector || !targetChainId) throw new Error("Wallet disconnected or network unavailable.");
        const chain = evmWalletChains.find((candidate) => candidate.id === targetChainId);
        const token = getCircleChain(selectedRoute.sourceNetwork, true)?.usdcAddress;
        if (!chain || !token || targetChainId !== getWalletNetwork(selectedRoute.destinationNetwork)?.chainId) {
          throw new Error("Invalid direct payment route.");
        }
        const provider = await connector.getProvider();
        const client = createPublicClient({ chain, transport: custom(provider as never) });
        const amount = BigInt(selectedRoute.requestedAmount);
        const payer = activeAddress as `0x${string}`;
        const recipient = selectedRoute.recipientAddress as `0x${string}`;
        txHash = await executeDirectUsdc({
          chainId: chain.id, payer, token, recipient, amount,
          assertWallet: async () => {
            const [chainId, accounts] = await Promise.all([connector.getChainId(), connector.getAccounts()]);
            if (chainId !== chain.id || accounts[0]?.toLowerCase() !== payer.toLowerCase()) {
              throw new Error("Wallet account or network changed. Payment blocked; reconnect to the reviewed network.");
            }
          },
          balance: async () => {
            const abi = parseAbi(["function balanceOf(address) view returns (uint256)", "function transfer(address,uint256) returns (bool)"]);
            const [usdc, native, gasUnits, gasPrice] = await Promise.all([
              client.readContract({ address: token, abi, functionName: "balanceOf", args: [payer] }),
              client.getBalance({ address: payer }),
              client.estimateContractGas({ address: token, abi, functionName: "transfer", args: [recipient, amount], account: payer }),
              client.getGasPrice(),
            ]);
            return { usdc, native, gas: gasUnits * gasPrice * 120n / 100n, gasUsesUsdc: chain.nativeCurrency.symbol === "USDC" };
          },
          send: (request) => sendTransactionAsync({ ...request, connector }),
        });
      } else if (selectedRoute.provider === "circle_cctp") {
        // CCTP Cross-chain bridge with Circle Orbit Forwarder
        if (!circleStartResponse) {
          throw new Error("Circle execution has not been reserved for this attempt.");
        }
        if (!connector) throw new Error("Wallet connector unavailable.");
        const provider = (await connector.getProvider()) as { request: (args: unknown) => Promise<unknown> };
        const { createViemAdapterFromProvider } = await import("@circle-fin/adapter-viem-v2");
        const { AppKit } = await import("@circle-fin/app-kit");
        const { isRetryableError } = await import("@circle-fin/app-kit");
        const adapter = await createViemAdapterFromProvider({ provider: provider as never });
        const kit = new AppKit();

        const sourceChainKey = CHAIN_ID_TO_BRIDGE_CHAIN[targetChainId ?? 84532] ?? "Base_Sepolia";
        const destNet = getWalletNetwork(selectedRoute.destinationNetwork);
        const destChainId = destNet?.chainId ?? 84532;
        const destChainKey = CHAIN_ID_TO_BRIDGE_CHAIN[destChainId] ?? "Base_Sepolia";
        let progressQueue: Promise<void> = Promise.resolve();
        const persistCircleProgress = (resultState: "pending" | "success" | "error", rawStep?: unknown) => {
          const step = rawStep === undefined ? undefined : sanitizeCircleBridgeStep(rawStep);
          if (rawStep !== undefined && !step) return progressQueue;
          // Journal result-only hashes before awaiting telemetry requests as well.
          if (step?.txHash && /approv/i.test(step.name)) {
            void referenceWriter.persist(currentAttemptId, { approvalTransactionHash: step.txHash });
          }
          if (step?.txHash && /burn|depositforburn/i.test(step.name)) {
            sourceBurnHashObserved = true;
            broadcastTxHash = step.txHash;
            void referenceWriter.persist(currentAttemptId, { transactionHash: step.txHash });
          }
          progressQueue = progressQueue.then(async () => {
            try {
              const response = await fetch(`/api/pay/${encodeURIComponent(shareToken)}/attempt/${currentAttemptId}/progress`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                keepalive: true,
                signal: AbortSignal.timeout(8000),
                body: JSON.stringify({ resultState, ...(step ? { step } : {}) }),
              });
              if (response.ok) {
                const persisted = await response.json();
                if (persisted.sourceBurnRecorded === true) sourceBurnHashObserved = true;
              }
            } catch { /* polling and source-chain verification remain the recovery path */ }
          });
          return progressQueue;
        };
        let sourceBurnHashObserved = false;
        let eventApprovalHash: string | null = null;
        let eventBurnHash: string | null = null;

        const actionNames = ["bridge.approve", "bridge.burn", "bridge.fetchAttestation", "bridge.mint", "bridge.reAttest"] as const;
        const actionHandlers = actionNames.map((action) => {
          const handler = (payload: unknown) => {
            if (!payload || typeof payload !== "object") return;
            const p = payload as Record<string, unknown>;
            const raw = p.values !== undefined ? p.values : p;
            const progressValues = Array.isArray(raw) ? raw : [raw];
            for (const value of progressValues) {
              const step = sanitizeCircleBridgeStep(value);
              if (step) {
                if (/approv/i.test(step.name) && step.txHash) {
                  eventApprovalHash = step.txHash;
                  setApprovalTxHash(step.txHash);
                }
                if (/burn|depositforburn/i.test(step.name) && step.txHash) {
                  sourceBurnHashObserved = true;
                  eventBurnHash = step.txHash;
                  broadcastTxHash = step.txHash;
                  setDepositTxHash(step.txHash);
                }
                void persistCircleProgress("pending", step);
              }
            }
          };
          kit.on(action, handler as never);
          return { action, handler };
        });

        let bridgeRes: BridgeResult | null = null;
        let executionError: unknown = null;
        try {
          bridgeRes = await executeCircleBridgeAfterFreshReservation(
            circleStartResponse.ok,
            circleStartResponse.data,
            () => kit.bridge({
              from: { adapter, chain: sourceChainKey as never },
              to: {
                chain: destChainKey as never,
                recipientAddress: selectedRoute.recipientAddress,
                useForwarder: true,
              },
              amount: (amountMinor / 100).toFixed(2),
              token: "USDC",
              quote: circleQuote?.quote,
              config: {
                feePayment: "source",
                ...(getCircleChain(selectedRoute.sourceNetwork, true)?.supportsFastTransfer === false
                  ? { transferSpeed: "SLOW" as const }
                  : {}),
              },
            }),
          );
          for (const step of bridgeRes.steps ?? []) void persistCircleProgress(bridgeRes.state, step);
          await persistCircleProgress(bridgeRes.state);
          const hasRecordedBurn = sourceBurnHashObserved || (bridgeRes.steps?.some((step) =>
            /burn|depositforburn/i.test(step.name) && Boolean(step.txHash)) ?? false);
          if (canRetryCircleBridgeResult(bridgeRes, hasRecordedBurn, isRetryableError)) {
            const retried = await kit.retryBridge(bridgeRes, { from: adapter });
            bridgeRes = retried;
            for (const step of retried.steps ?? []) void persistCircleProgress(retried.state, step);
            await persistCircleProgress(retried.state);
          }
        } catch (err) {
          executionError = err;
        } finally {
          for (const { action, handler } of actionHandlers) kit.off(action, handler as never);
        }

        const burnStep = bridgeRes?.steps?.find(
          (s: { name?: string; txHash?: string }) =>
            (s.name?.toLowerCase().includes("burn") || s.name?.toLowerCase().includes("depositforburn")) && s.txHash
        );
        const approvalStep = bridgeRes?.steps?.find(
          (s: { name?: string; txHash?: string }) => s.name?.toLowerCase().includes("approv") && s.txHash
        );

        approvalTxHash = eventApprovalHash ?? approvalStep?.txHash ?? null;
        txHash = eventBurnHash ?? burnStep?.txHash ?? null;

        if (approvalTxHash || txHash) {
          // Some SDK versions expose hashes only in the final result, without events.
          referenceWriter.record(currentAttemptId, { transactionHash: txHash, approvalTransactionHash: approvalTxHash });
        }

        if (txHash) {
          broadcastTxHash = txHash;
          setDepositTxHash(txHash);
          setStage("verifying");
          setStatusMessage("Transaction submitted! Registering broadcast with NODUS…");
          if (!await referenceWriter.persist(currentAttemptId)) {
            setRecoveryRequired(true);
            setStatusMessage("NODUS is retrying the transaction-reference save. Keep this page open and do not authorize another payment.");
            return;
          }
          setStatusMessage("Awaiting independent destination settlement verification…");
          return;
        }

        if (approvalTxHash) {
          setApprovalTxHash(approvalTxHash);
          await referenceWriter.persist(currentAttemptId);
          if (isWalletUserRejection(executionError)) {
            setStage("verifying");
            setRecoveryRequired(true);
            setSourceTransactionReferenceMissing(true);
            setWalletRejected(true);
            setStatusMessage("Transfer authorization was declined in your wallet. An approval reference was received, but this reserved attempt still requires review before another payment can be authorized.");
            return;
          }
        }

        if (executionError) {
          throw executionError;
        }
      } else {
        // Simulation provider
        throw new Error("Simulation route selected. Please toggle simulated demonstration above.");
      }

      if (!txHash) {
        throw new Error("Transaction was broadcast but hash could not be retrieved.");
      }

      broadcastTxHash = txHash;
      referenceWriter.record(currentAttemptId, { transactionHash: txHash, approvalTransactionHash: approvalTxHash });
      setDepositTxHash(txHash);
      setStage("broadcasting");
      setStatusMessage("Transaction submitted! Registering broadcast with NODUS…");

      // Step D: Submit broadcasted hash to backend
      if (!await referenceWriter.persist(currentAttemptId)) {
        throw new Error("Failed to save transaction reference. The browser backup will be retried.");
      }

      setStage("verifying");
      setStatusMessage("Awaiting independent destination settlement verification…");
    } catch (err) {
      if (circleExecutionStarted) {
        setStage("verifying");
        setRecoveryRequired(true);
        const wasRejected = isWalletUserRejection(err);
        setWalletRejected(wasRejected);
        setStatusMessage(wasRejected
          ? "Your wallet rejected a request. The server execution reservation remains active while NODUS checks for a source burn. Do not retry or start another payment."
          : "Circle execution status is uncertain after reservation. A source burn may have broadcast; do not retry or start another payment while NODUS checks the source chain.");
      } else if (directExecutionStarted && !broadcastTxHash) {
        setStage("verifying");
        setRecoveryRequired(true);
        setWalletRejected(isWalletUserRejection(err));
        setStatusMessage(isWalletUserRejection(err)
          ? "Transaction declined. Invoice remains unpaid. The reserved attempt prevents duplicate submissions."
          : `Direct payment requires review: ${err instanceof Error ? err.message : "wallet status uncertain"}. Do not submit again.`);
      } else if (broadcastTxHash) {
        if (currentAttemptIdForRecovery) setAttemptId(currentAttemptIdForRecovery);
        setStage("verifying");
        setRecoveryRequired(true);
        setDepositTxHash(broadcastTxHash);
        setStatusMessage("Your transaction may already be on-chain. NODUS is retrying its reference save; do not authorize another payment.");
        setWalletRejected(false);
      } else {
        setStage("error");
        setWalletRejected(isWalletUserRejection(err));
        setFlowError(err instanceof Error ? err.message : "An unexpected execution error occurred.");
      }
    } finally {
      executionLock.current = false;
    }
  }

  // 4. Polling for independent destination verification and invoice settlement
  useEffect(() => {
    if (stage !== "verifying" || !attemptId) return;

    let cancelled = false;
    let checking = false;
    const clearBrowserAttempt = () => {
      referenceWriter.clear(attemptId);
      try {
        window.localStorage.removeItem(`nodus:live-attempt:${shareToken}`);
        window.localStorage.removeItem(`nodus:live-tx:${shareToken}`);
      } catch { /* Server terminal state remains authoritative. */ }
    };
    const interval = setInterval(async () => {
      if (checking) return;
      checking = true;
      try {
        const res = await fetch(
          `/api/pay/${encodeURIComponent(shareToken)}/attempt/${attemptId}/status`,
          { cache: "no-store", signal: AbortSignal.timeout(10000) }
        );
        if (!res.ok) return;

        const data = await res.json();
        if (cancelled) return;

        const references = referenceWriter.read(attemptId);
        const sourceUnsaved = references.transactionHash
          && references.transactionHash.toLowerCase() !== data.attempt?.transaction_hash?.toLowerCase();
        const approvalUnsaved = references.approvalTransactionHash
          && references.approvalTransactionHash.toLowerCase() !== data.attempt?.circle_approval_tx_hash?.toLowerCase();
        if (!data.settled && !data.expired && !["SUCCESS", "FAILED", "REFUNDED", "INCOMPLETE_DEPOSIT"].includes(data.attempt?.status)
          && (sourceUnsaved || approvalUnsaved)) {
          if (references.transactionHash) setDepositTxHash(references.transactionHash);
          if (references.approvalTransactionHash) setApprovalTxHash(references.approvalTransactionHash);
          const saved = await referenceWriter.persist(attemptId);
          if (cancelled) return;
          setRecoveryRequired(!saved);
          setSourceTransactionReferenceMissing(!saved);
          setStatusMessage(saved
            ? "Transaction references saved. NODUS is checking settlement; do not authorize another payment."
            : "NODUS could not save the transaction references yet. The browser backup will be retried; keep this page open and do not authorize another payment.");
          return;
        }

        if (data.settled || data.attempt?.status === "SUCCESS") {
          clearInterval(interval);
          setSourceTransactionReferenceMissing(false);
          setRecoveryRequired(false);
          clearBrowserAttempt();
          setStage("settled");
          setWalletRejected(false);
          setStatusMessage("Payment settled and verified on destination chain!");
          if (Array.isArray(data.receipts) && data.receipts.length > 0) {
            setDestinationReceipts(data.receipts);
          }
          onPaymentSuccess?.(data.receipts);
        } else if (data.attempt?.status === "FAILED") {
          clearInterval(interval);
          setSourceTransactionReferenceMissing(false);
          setRecoveryRequired(false);
          clearBrowserAttempt();
          setStage("error");
          setWalletRejected(false);
          setFlowError("Payment failed on-chain. Funds were not settled.");
        } else if (data.expired) {
          clearInterval(interval);
          setSourceTransactionReferenceMissing(false);
          setRecoveryRequired(false);
          clearBrowserAttempt();
          setStage("error");
          setWalletRejected(false);
          setFlowError("The payment quote expired before a source transaction was recorded. Request a fresh quote to continue.");
        } else if (typeof data.attempt?.transaction_hash === "string") {
          setSourceTransactionReferenceMissing(false);
          setDepositTxHash(data.attempt.transaction_hash);
          if (data.attempt?.circle_approval_tx_hash) {
            setApprovalTxHash(data.attempt.circle_approval_tx_hash);
          }
          setRecoveryRequired(Boolean(data.recoveryRequired));
          setStatusMessage("NODUS saved the transaction and is independently verifying destination settlement. No action is needed.");
        } else if (data.attempt?.circle_approval_tx_hash) {
          setSourceTransactionReferenceMissing(true);
          setRecoveryRequired(true);
          setApprovalTxHash(data.attempt.circle_approval_tx_hash);
          setStatusMessage("The approval reference is saved, but the source transfer reference is missing. This reserved attempt requires review; do not authorize another payment.");
        } else if (data.sourceTransactionReferenceMissing) {
          setSourceTransactionReferenceMissing(true);
          if (typeof data.recoveryRequired === "boolean") setRecoveryRequired(data.recoveryRequired);
          setStatusMessage(
            "No payment transaction hash is saved to this reserved attempt. NODUS cannot safely restart it until its status is reviewed. Do not start another payment; reference the Attempt ID below.",
          );
        } else if (data.recoveryRequired) {
          setSourceTransactionReferenceMissing(false);
          setRecoveryRequired(true);
          setStatusMessage(data.providerProgress?.message || "Payment verification requires operator assistance. Please reference the Attempt ID below.");
        } else if (typeof data.recoveryRequired === "boolean") {
          setRecoveryRequired(data.recoveryRequired);
        }
      } catch {
        // Transient network error in polling - retry next interval
      } finally {
        checking = false;
      }
    }, 3000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [stage, attemptId, shareToken, onPaymentSuccess, referenceWriter]);

  const busy =
    loadingRoutes ||
    isSwitchingChain ||
    isSendingTx ||
    stage === "authorizing" ||
    stage === "broadcasting" ||
    stage === "verifying";

  const processing = stage === "authorizing" || stage === "broadcasting" || stage === "verifying" || stage === "settled";
  const showModal = showDetails || processing;
  const progress = paymentProgress({ stage, depositTxHash, approvalTxHash, direct: selectedRoute?.provider === "circle_direct" });
  const executionLocked = busy || Boolean(attemptId && stage !== "settled");
  useEffect(() => { onExecutionStateChange?.(executionLocked); }, [executionLocked, onExecutionStateChange]);
  useEffect(() => {
    if (!showModal) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const unlock = lockPayerDialogBackground(dialog);
    dialog.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !processing) setShowDetails(false);
      trapPayerDialogFocus(event, dialog);
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      unlock();
      if (previous && !previous.closest("[inert]")) previous.focus();
    };
  }, [showModal, processing]);
  const amountLabel = formatMoney(amountMinor, currency);
  const actionLabel = circleQuote ? `Authorize payment (${circleQuote.totalDebit} USDC)` : "Get Circle quote";
  const destinationLabel = getWalletNetwork(selectedRoute?.destinationNetwork ?? "")?.label ?? "destination network";

  return <>
    <section className="dock" aria-label="Payment console">
      {dockDetails}
      <button className="cta" type="button" disabled={executionLocked || !selectedRoute || Boolean(routesError)} onClick={() => { setShowDetails(true); void handleAuthorizePayment(); }}>
        <PayerIcon name="lock" /><span>{loadingRoutes ? "Checking payment routes…" : stage === "verifying" ? "Verifying settlement…" : stage === "authorizing" || stage === "broadcasting" ? "Authorizing payment…" : `Approve & Pay ${amountLabel} USDC (Escrow)`}</span>
      </button>
    </section>
    {routesError && !showModal && <p role="alert" className="wallet-error">{routesError} <button type="button" className="tg" onClick={() => void fetchRoutes()}>Retry discovery</button></p>}
    {!loadingRoutes && !routesError && !selectedRoute && !showModal && <p role="status">No supported route found for the selected asset and network.</p>}
    <div className="ov" hidden={!showModal}>
      <div className="md" role="dialog" aria-modal="true" aria-labelledby="payer-payment-modal-title" tabIndex={-1} ref={dialogRef}>
        {processing ? <>
          <h2 id="payer-payment-modal-title">{stage === "settled" ? "Payment complete & verified" : `Settling invoice ${invoiceNumber}`}</h2>
          <p>Keep this window open while the transactions confirm.</p>
          <ol className="st">{[
            { title: "Approving USDC ERC-20 allowance", detail: progress.allowanceRequired ? approvalTxHash ? `Approval ${shortHash(approvalTxHash)}` : "Authorizing USDC for the selected payment route" : "Allowance is not required for a direct USDC transfer" },
            { title: "Depositing funds into Nodus Escrow Contract", detail: depositTxHash ? `Tx ${shortHash(depositTxHash)}` : selectedRoute?.provider === "circle_direct" ? "Awaiting direct USDC payment authorization" : "Awaiting Circle CCTP burn authorization" },
            { title: "Verifying on-chain settlement and destination receipt", detail: `Waiting for block confirmations on ${destinationLabel}` },
          ].map((step, index) => <li className={index < progress.current ? "ok" : index === progress.current ? "act" : ""} key={step.title}><span className="mk"><PayerIcon name="check" /></span><div><b>{step.title}</b><span>{step.detail}</span></div></li>)}</ol>
          <div className="bar"><i style={{ width: Math.min(100, progress.current / 3 * 100) + "%" }} /></div>
          {statusMessage && <p className="wallet-inline-status" role="status">{statusMessage}</p>}
          {(recoveryRequired || sourceTransactionReferenceMissing) && attemptId && <div className="wallet-recovery-panel" role="alert"><strong>{sourceTransactionReferenceMissing ? "Transaction Reference Not Saved" : "Operator Verification Required"}</strong><p>{statusMessage}</p><p>Do not authorize another payment while verification is pending.</p><p>Support Reference (Attempt ID): {attemptId}</p>{depositTxHash && <p>Submitted source transaction: {depositTxHash}</p>}</div>}
          {flowError && <p role="alert" className="wallet-error">{flowError}</p>}
        </> : <>
          <button className="tg" type="button" onClick={() => setShowDetails(false)} aria-label="Close payment details">Close</button>
          <div className="payer-route-review" aria-live="polite">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
        <p className="wallet-eyebrow" style={{ margin: 0 }}>LIVE ROUTE EXECUTION</p>
        {timeRemainingSeconds !== null && (
          <span
            style={{
              fontSize: "0.8125rem",
              fontFamily: "monospace",
              color: timeRemainingSeconds < 30 ? "#b91c1c" : "#64748b",
            }}
          >
            Quote expires in: {Math.floor(timeRemainingSeconds / 60)}:
            {(timeRemainingSeconds % 60).toString().padStart(2, "0")}
          </span>
        )}
      </div>

      <h3 id="payer-payment-modal-title">
        {stage === "idle" ? "Confirm payment parameters" : "Payment incomplete"}
      </h3>

      {loadingRoutes ? (
        <p className="wallet-description">Checking USDC payment routes…</p>
      ) : routesError ? (
        <div className="wallet-asset-error" role="alert">
          <p>{routesError}</p>
          <button type="button" className="wallet-text-button" onClick={() => void fetchRoutes()}>
            Retry discovery
          </button>
        </div>
      ) : routes.length > 0 && selectedRoute ? (
        <>
          {routes.length > 1 && stage === "idle" && (
            <div style={{ marginBottom: "1rem" }}>
              <label style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "#64748b", display: "block", marginBottom: "0.25rem" }}>
                Select routing path
              </label>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                {routes.map((r, idx) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      if (idx !== selectedRouteIndex) setCircleQuote(null);
                      setFlowError("");
                      setSelectedRouteIndex(idx);
                    }}
                    style={{
                      padding: "0.375rem 0.75rem",
                      fontSize: "0.8125rem",
                      borderRadius: "6px",
                      border: idx === selectedRouteIndex ? "1px solid #0f172a" : "1px solid #cbd5e1",
                      backgroundColor: idx === selectedRouteIndex ? "#0f172a" : "#ffffff",
                      color: idx === selectedRouteIndex ? "#ffffff" : "#334155",
                      cursor: "pointer",
                    }}
                  >
                    {r.providerLabel}
                  </button>
                ))}
              </div>
            </div>
          )}

          <dl>
            <div>
              <dt>Invoice reference</dt>
              <dd>{invoiceNumber}</dd>
            </div>
            <div>
              <dt>Invoice amount</dt>
              <dd>{formatMoney(amountMinor, currency)}</dd>
            </div>
            <div>
              <dt>Routing engine</dt>
              <dd>
                <strong>{selectedRoute.providerLabel}</strong>
              </dd>
            </div>
            <div>
              <dt>You pay (source)</dt>
              <dd>
                {circleQuote ? circleQuote.totalDebit : formatUnits(selectedRoute.requestedAmount, selectedRoute.sourceDecimals)}{" "}
                {selectedRoute.sourceSymbol} on {getWalletNetwork(selectedRoute.sourceNetwork)?.label ?? selectedRoute.sourceNetwork}
              </dd>
            </div>
            {circleQuote && <>
              {circleQuote.feeItems.length > 0 ? circleQuote.feeItems.map((fee, index) => (
                <div key={`${fee.type}-${index}`}><dt>Circle fee · {fee.type}</dt><dd>{fee.amount} USDC</dd></div>
              )) : (
                <div><dt>Circle fees total</dt><dd>{circleQuote.feeTotal} USDC</dd></div>
              )}
              <div><dt>Quote expires</dt><dd>{new Date(circleQuote.expiresAt).toLocaleString()}</dd></div>
              <div><dt>Estimated {getWalletNetwork(selectedRoute.sourceNetwork)?.label ?? selectedRoute.sourceNetwork} gas</dt><dd>{formatEther(BigInt(circleQuote.gasWei))} {evmWalletChains.find((chain) => chain.id === getWalletNetwork(selectedRoute.sourceNetwork)?.chainId)?.nativeCurrency.symbol ?? "native token"}</dd></div>
            </>}
            {circleQuote ? <>
              <div>
                <dt>Expected received</dt>
                <dd>{circleQuote.amountReceived} {selectedRoute.destinationSymbol} on {getWalletNetwork(selectedRoute.destinationNetwork)?.label ?? selectedRoute.destinationNetwork}</dd>
              </div>
              <div>
                <dt>Minimum received</dt>
                <dd>{formatUnits(selectedRoute.minReceivedAmount, selectedRoute.destinationDecimals)} {selectedRoute.destinationSymbol} on {getWalletNetwork(selectedRoute.destinationNetwork)?.label ?? selectedRoute.destinationNetwork}</dd>
              </div>
            </> : (
              <div>
                <dt>Minimum received</dt>
                <dd>{formatUnits(selectedRoute.minReceivedAmount, selectedRoute.destinationDecimals)} {selectedRoute.destinationSymbol} on {getWalletNetwork(selectedRoute.destinationNetwork)?.label ?? selectedRoute.destinationNetwork}</dd>
              </div>
            )}
            {!circleQuote && <div><dt>Network fees</dt><dd>{selectedRoute.fees.networkFeeEstimate}</dd></div>}
            <div>
              <dt>Recipient settlement</dt>
              <dd>
                <code style={{ fontSize: "0.8125rem", overflowWrap: "anywhere" }}>{selectedRoute.recipientAddress}</code>
              </dd>
            </div>
            {approvalTxHash && (
              <div>
                <dt>USDC approval</dt>
                <dd>
                  <code style={{ fontSize: "0.8125rem" }}>{shortHash(approvalTxHash)}</code>
                </dd>
              </div>
            )}
            {depositTxHash && (
              <div>
                <dt>{selectedRoute.provider === "circle_direct" ? "Payment transaction" : "Source burn"}</dt>
                <dd>
                  <code style={{ fontSize: "0.8125rem" }}>{shortHash(depositTxHash)}</code>
                </dd>
              </div>
            )}
          </dl>

          {selectedRoute.provider === "circle_direct" && (
            <p className="wallet-description">Direct payment. Same network — no bridge required. Bridge: Not required. Network gas is paid separately and shown by your wallet before signing.</p>
          )}
          {selectedRoute.provider === "circle_cctp" && (
            <div className="wallet-execution-steps" aria-label="Circle payment authorization steps">
              <p><strong>Step 1: USDC approval.</strong> Your wallet may ask you to approve USDC for Circle to use.</p>
              <p><strong>Step 2: CCTP burn authorization.</strong> Review the Circle cross-chain burn request in your wallet before signing.</p>
              <p>A broadcast CCTP burn cannot simply be cancelled. NODUS checks the source burn and destination settlement before marking this invoice paid.</p>
            </div>
          )}

          {statusMessage && (
            <p className="wallet-inline-status" style={{ margin: "0.75rem 0", color: "#1e293b" }}>
              {statusMessage}
            </p>
          )}

          {(recoveryRequired || sourceTransactionReferenceMissing) && attemptId && (
            <div className="wallet-recovery-panel" role="alert" style={{ background: "#fef2f2", border: "1px solid #fecaca", padding: "1rem", borderRadius: "8px", margin: "1rem 0" }}>
              <p style={{ fontWeight: 600, color: "#991b1b", margin: "0 0 0.5rem 0", fontSize: "0.9375rem" }}>
                {sourceTransactionReferenceMissing ? "Transaction Reference Not Saved" : "Operator Verification Required"}
              </p>
              <p className="wallet-recovery-copy" style={{ color: "#7f1d1d", margin: "0 0 0.75rem 0", fontSize: "0.8125rem" }}>
                {sourceTransactionReferenceMissing
                  ? statusMessage
                  : selectedRoute.provider === "circle_direct"
                  ? "NODUS is checking the direct payment transaction. Do not authorize another payment while verification is pending."
                  : walletRejected
                  ? "Your wallet rejected a request. NODUS is checking whether Circle submitted a source burn. No action is needed; do not start another payment."
                  : "Execution status is uncertain. NODUS is checking the saved Circle attempt and will resume verification automatically. No action is needed; do not start another payment."}
              </p>
              {!sourceTransactionReferenceMissing && selectedRoute.provider === "circle_cctp" && <p className="wallet-recovery-copy">If Circle submitted a source burn, NODUS will verify it and continue destination settlement automatically.</p>}
              <div style={{ padding: "0.625rem", background: "#ffffff", borderRadius: "6px", border: "1px solid #e2e8f0", fontSize: "0.8125rem", fontFamily: "monospace", color: "#334155", margin: "0.5rem 0" }}>
                <div><strong>Support Reference (Attempt ID):</strong> {attemptId}</div>
                <div><strong>Invoice Reference:</strong> {invoiceNumber}</div>
                {depositTxHash && <div><strong>{selectedRoute.provider === "circle_direct" ? "Payment transaction:" : "Source burn:"}</strong> {depositTxHash}</div>}
              </div>
              {activeAddress && (
                <a className="wallet-explorer-link" href={`${evmWalletChains.find((chain) => chain.id === getWalletNetwork(selectedRoute?.sourceNetwork ?? "")?.chainId)?.blockExplorers?.default.url ?? "#"}/address/${encodeURIComponent(activeAddress)}`} target="_blank" rel="noreferrer">
                  View payer address on {getWalletNetwork(selectedRoute?.sourceNetwork ?? "")?.label ?? "source chain"} explorer
                </a>
              )}
              {depositTxHash && (
                <a className="wallet-explorer-link" href={`${evmWalletChains.find((chain) => chain.id === getWalletNetwork(selectedRoute.sourceNetwork)?.chainId)?.blockExplorers?.default.url}/tx/${encodeURIComponent(depositTxHash)}`} target="_blank" rel="noreferrer">
                  View submitted source transaction
                </a>
              )}
            </div>
          )}

          {destinationReceipts.length > 0 && (
            <div style={{ marginTop: "1rem", padding: "0.75rem", background: "#f0fdf4", borderRadius: "6px", border: "1px solid #bbf7d0" }}>
              <p style={{ margin: 0, fontWeight: 600, color: "#166534", fontSize: "0.875rem" }}>
                ✓ Official Receipt Issued: #{destinationReceipts[0]?.receipt_number}
              </p>
              <p style={{ margin: "0.25rem 0 0 0", color: "#15803d", fontSize: "0.75rem" }}>
                Settlement independently verified on-chain at {new Date(destinationReceipts[0]?.issued_at ?? "").toLocaleTimeString()}
              </p>
            </div>
          )}

          {stage === "idle" && (
            <div style={{ marginTop: "1rem" }}>
              <button
                type="button"
                className="cta"
                disabled={busy}
                onClick={() => void handleAuthorizePayment()}
              >
                {busy ? "Preparing…" : selectedRoute.provider === "circle_direct" ? "Authorize direct USDC payment" : actionLabel}
              </button>
            </div>
          )}

          {stage === "error" && (
            <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
              <button
                type="button"
                className="wallet-primary-button"
                onClick={() => {
                  setStage("idle");
                  void fetchRoutes();
                }}
              >
                Try again
              </button>
            </div>
          )}
        </>
      ) : (
        <p className="wallet-description">No supported route found for the selected asset and network.</p>
      )}

      {flowError && (
        <p className="wallet-error" role="alert" style={{ marginTop: "0.75rem" }}>
          {flowError}
        </p>
      )}
          </div>
        </>}
      </div>
    </div>
  </>;
}
