"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, useSendTransaction, useSwitchChain } from "wagmi";
import { formatMoney } from "@/lib/invoices";
import { getWalletNetwork } from "@/lib/wallet/networks";
import type { WalletAsset } from "@/lib/wallet/types";
import type { StandardizedRouteQuote } from "@/lib/payments/route-orchestrator";

interface LivePaymentFlowProps {
  shareToken: string;
  invoiceNumber: string;
  amountMinor: number;
  currency: string;
  selectedAsset: WalletAsset | null;
  activeAddress: string | null;
  onPaymentSuccess?: () => void;
}

const CHAIN_ID_TO_BLOCKCHAIN: Record<number, string> = {
  1: "Ethereum",
  11155111: "Ethereum_Sepolia",
  8453: "Base",
  84532: "Base_Sepolia",
  42161: "Arbitrum",
  421614: "Arbitrum_Sepolia",
  10: "Optimism",
  11155420: "Optimism_Sepolia",
};

const CHAIN_ID_TO_BRIDGE_CHAIN: Record<number, string> = {
  1: "Ethereum",
  11155111: "Ethereum_Sepolia",
  8453: "Base",
  84532: "Base_Sepolia",
  42161: "Arbitrum",
  421614: "Arbitrum_Sepolia",
  10: "Optimism",
  11155420: "Optimism_Sepolia",
};

function formatUnits(baseUnits: string, decimals: number): string {
  const big = BigInt(baseUnits || "0");
  const divisor = BigInt(10 ** decimals);
  const integerPart = big / divisor;
  const remainder = big % divisor;
  const remainderStr = remainder.toString().padStart(decimals, "0").replace(/0+$/, "");
  return remainderStr ? `${integerPart}.${remainderStr}` : integerPart.toString();
}

function shortHash(hash: string): string {
  return hash.length > 18 ? `${hash.slice(0, 10)}…${hash.slice(-8)}` : hash;
}

export function LivePaymentFlow({
  shareToken,
  invoiceNumber,
  amountMinor,
  currency,
  selectedAsset,
  activeAddress,
  onPaymentSuccess,
}: LivePaymentFlowProps) {
  const { chainId: evmChainId, connector } = useAccount();
  const { switchChainAsync, isPending: isSwitchingChain } = useSwitchChain();
  const { sendTransactionAsync, isPending: isSendingTx } = useSendTransaction();

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
  const [depositTxHash, setDepositTxHash] = useState<string | null>(null);
  const [destinationReceipts, setDestinationReceipts] = useState<
    Array<{ receipt_number: string; issued_at: string }>
  >([]);
  const [timeRemainingSeconds, setTimeRemainingSeconds] = useState<number | null>(null);

  const selectedRoute = useMemo(
    () => routes[selectedRouteIndex] ?? null,
    [routes, selectedRouteIndex]
  );

  // 1. Fetch available routes from backend orchestrator
  const fetchRoutes = useCallback(async () => {
    if (!selectedAsset || !activeAddress) return;
    setLoadingRoutes(true);
    setRoutesError("");
    try {
      const response = await fetch(`/api/pay/${encodeURIComponent(shareToken)}/routes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceAssetId: selectedAsset.assetId,
          sourceNetwork: selectedAsset.network.key,
          sourceSymbol: selectedAsset.symbol,
          sourceDecimals: selectedAsset.decimals,
          sourceContractAddress: selectedAsset.contractAddress,
          senderAddress: activeAddress,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success || !Array.isArray(data.routes)) {
        throw new Error(data.error || "No route found for this token.");
      }

      setRoutes(data.routes);
      setSelectedRouteIndex(0);
    } catch (err) {
      setRoutesError(err instanceof Error ? err.message : "Failed to load payment routes.");
      setRoutes([]);
    } finally {
      setLoadingRoutes(false);
    }
  }, [selectedAsset, activeAddress, shareToken]);

  useEffect(() => {
    void fetchRoutes();
  }, [fetchRoutes]);

  // 2. Countdown timer for quote expiration
  useEffect(() => {
    if (!selectedRoute?.quoteExpiresAt) {
      setTimeRemainingSeconds(null);
      return;
    }

    const targetTime = new Date(selectedRoute.quoteExpiresAt).getTime();
    const interval = setInterval(() => {
      const diff = Math.max(0, Math.floor((targetTime - Date.now()) / 1000));
      setTimeRemainingSeconds(diff);
      if (diff === 0 && stage === "idle") {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [selectedRoute, stage]);

  // 3. Execution handler
  async function handleAuthorizePayment() {
    if (!selectedRoute || !selectedAsset || !activeAddress) return;

    // Check expiry
    const expiresAt = new Date(selectedRoute.quoteExpiresAt).getTime();
    if (expiresAt <= Date.now()) {
      setFlowError("Quote has expired. Refreshing payment routes...");
      await fetchRoutes();
      return;
    }

    setFlowError("");
    setStage("authorizing");
    setStatusMessage("Validating route and network parameters…");

    try {
      // Step A: Ensure wallet is on the correct source network
      const sourceNetworkObj = getWalletNetwork(selectedRoute.sourceNetwork);
      const targetChainId = sourceNetworkObj?.chainId;

      if (targetChainId && evmChainId !== targetChainId) {
        setStatusMessage(`Please switch your wallet to ${sourceNetworkObj.label}…`);
        await switchChainAsync({ chainId: targetChainId });
      }

      // Step B: Create committed payment attempt in Supabase
      setStatusMessage("Securing payment attempt…");
      const attemptRes = await fetch(`/api/pay/${encodeURIComponent(shareToken)}/attempt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: crypto.randomUUID(),
          sourceAssetId: selectedRoute.sourceAssetId,
          sourceNetwork: selectedRoute.sourceNetwork,
          destinationAssetId: selectedRoute.destinationAssetId,
          destinationNetwork: selectedRoute.destinationNetwork,
          recipientAddress: selectedRoute.recipientAddress,
          depositAddress: selectedRoute.depositAddress,
          depositMemo: selectedRoute.depositMemo,
          requestedAmount: selectedRoute.requestedAmount,
          expectedReceivedAmount: selectedRoute.expectedReceivedAmount,
          quoteExpiresAt: selectedRoute.quoteExpiresAt,
          quoteSnapshot: selectedRoute.quoteSnapshot,
        }),
      });

      const attemptData = await attemptRes.json();
      if (!attemptRes.ok || !attemptData.attempt?.id) {
        throw new Error(attemptData.error || "Failed to commit payment attempt.");
      }

      const currentAttemptId = attemptData.attempt.id as string;
      setAttemptId(currentAttemptId);

      // Step C: Trigger wallet signature / broadcast according to provider
      setStatusMessage("Please sign the transaction in your connected wallet…");
      let txHash: string | null = null;

      if (selectedRoute.provider === "circle_direct") {
        // Direct USDC transfer
        try {
          if (!connector) throw new Error("Wallet connector unavailable.");
          const provider = (await connector.getProvider()) as { request: (args: unknown) => Promise<unknown> };
          const { createViemAdapterFromProvider } = await import("@circle-fin/adapter-viem-v2");
          const { AppKit } = await import("@circle-fin/app-kit");
          const adapter = await createViemAdapterFromProvider({ provider: provider as never });
          const kit = new AppKit();
          const chainKey = CHAIN_ID_TO_BLOCKCHAIN[targetChainId ?? 8453] ?? "Base";
          const amountFormatted = (
            Number(selectedRoute.requestedAmount) / 10 ** selectedRoute.sourceDecimals
          ).toFixed(selectedRoute.sourceDecimals);

          const step = await kit.send({
            from: { adapter, chain: chainKey as never },
            to: selectedRoute.recipientAddress,
            amount: amountFormatted,
            token: "USDC",
          });
          txHash = step.txHash ?? null;
        } catch (circleErr: unknown) {
          const err = circleErr as Error;
          if (/reject|denied|cancel|user refused/i.test(err?.message ?? "")) {
            throw new Error("Transaction was declined in your wallet.");
          }
          // Direct fallback: standard ERC-20 transfer
          const { encodeFunctionData, parseAbi } = await import("viem");
          const erc20Abi = parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]);
          const tokenAddr = (selectedAsset.contractAddress ?? selectedRoute.depositAddress) as `0x${string}`;
          const transferData = encodeFunctionData({
            abi: erc20Abi,
            functionName: "transfer",
            args: [selectedRoute.recipientAddress as `0x${string}`, BigInt(selectedRoute.requestedAmount)],
          });
          txHash = await sendTransactionAsync({
            to: tokenAddr,
            data: transferData,
            value: 0n,
          });
        }
      } else if (selectedRoute.provider === "circle_cctp") {
        // CCTP Cross-chain bridge
        try {
          if (!connector) throw new Error("Wallet connector unavailable.");
          const provider = (await connector.getProvider()) as { request: (args: unknown) => Promise<unknown> };
          const { createViemAdapterFromProvider } = await import("@circle-fin/adapter-viem-v2");
          const { AppKit } = await import("@circle-fin/app-kit");
          const adapter = await createViemAdapterFromProvider({ provider: provider as never });
          const kit = new AppKit();

          const sourceChainKey = CHAIN_ID_TO_BRIDGE_CHAIN[targetChainId ?? 84532] ?? "Base_Sepolia";
          const destNet = getWalletNetwork(selectedRoute.destinationNetwork);
          const destChainId = destNet?.chainId ?? 84532;
          const destChainKey = CHAIN_ID_TO_BRIDGE_CHAIN[destChainId] ?? "Base_Sepolia";
          const amountFormatted = (
            Number(selectedRoute.requestedAmount) / 10 ** selectedRoute.sourceDecimals
          ).toFixed(selectedRoute.sourceDecimals);

          const bridgeRes = await kit.bridge({
            from: { adapter, chain: sourceChainKey as never },
            to: {
              adapter,
              chain: destChainKey as never,
              recipientAddress: selectedRoute.recipientAddress,
            },
            amount: amountFormatted,
            token: "USDC",
          });

          const stepWithHash = bridgeRes.steps?.find((s: { txHash?: string }) => s.txHash);
          txHash = stepWithHash?.txHash ?? null;
        } catch (cctpErr: unknown) {
          const err = cctpErr as Error;
          if (/reject|denied|cancel|user refused/i.test(err?.message ?? "")) {
            throw new Error("Transaction was declined in your wallet.");
          }
          throw err;
        }
      } else if (selectedRoute.provider === "superbridge") {
        // Superbridge execution
        if (selectedRoute.stepTransaction) {
          txHash = await sendTransactionAsync({
            to: selectedRoute.stepTransaction.to as `0x${string}`,
            data: selectedRoute.stepTransaction.data as `0x${string}`,
            value: BigInt(selectedRoute.stepTransaction.value || "0"),
          });
        } else {
          const { encodeFunctionData, parseAbi } = await import("viem");
          const erc20Abi = parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]);
          const tokenAddr = (selectedAsset.contractAddress ?? selectedRoute.depositAddress) as `0x${string}`;
          const transferData = encodeFunctionData({
            abi: erc20Abi,
            functionName: "transfer",
            args: [selectedRoute.depositAddress as `0x${string}`, BigInt(selectedRoute.requestedAmount)],
          });
          txHash = await sendTransactionAsync({
            to: tokenAddr,
            data: transferData,
            value: 0n,
          });
        }
      } else {
        // Simulation provider
        throw new Error("Simulation route selected. Please toggle simulated demonstration above.");
      }

      if (!txHash) {
        throw new Error("Transaction was broadcast but hash could not be retrieved.");
      }

      setDepositTxHash(txHash);
      setStage("broadcasting");
      setStatusMessage("Transaction submitted! Registering broadcast with NODUS…");

      // Step D: Submit broadcasted hash to backend
      const submitRes = await fetch(
        `/api/pay/${encodeURIComponent(shareToken)}/attempt/${currentAttemptId}/submit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transactionHash: txHash,
            chainUid: selectedRoute.sourceNetwork,
          }),
        }
      );

      if (!submitRes.ok) {
        const submitData = await submitRes.json();
        throw new Error(submitData.error || "Failed to submit transaction reference.");
      }

      setStage("verifying");
      setStatusMessage("Awaiting independent destination settlement verification…");
    } catch (err) {
      setStage("error");
      setFlowError(err instanceof Error ? err.message : "An unexpected execution error occurred.");
    }
  }

  // 4. Polling for independent destination verification and invoice settlement
  useEffect(() => {
    if (stage !== "verifying" || !attemptId) return;

    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/pay/${encodeURIComponent(shareToken)}/attempt/${attemptId}/status`,
          { cache: "no-store" }
        );
        if (!res.ok) return;

        const data = await res.json();
        if (cancelled) return;

        if (data.settled || data.attempt?.status === "SUCCESS") {
          clearInterval(interval);
          setStage("settled");
          setStatusMessage("Payment settled and verified on destination chain!");
          if (Array.isArray(data.receipts) && data.receipts.length > 0) {
            setDestinationReceipts(data.receipts);
          }
          onPaymentSuccess?.();
        } else if (data.attempt?.status === "FAILED") {
          clearInterval(interval);
          setStage("error");
          setFlowError("Payment failed on-chain. Funds were not settled.");
        }
      } catch {
        // Transient network error in polling - retry next interval
      }
    }, 3000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [stage, attemptId, shareToken, onPaymentSuccess]);

  const busy =
    loadingRoutes ||
    isSwitchingChain ||
    isSendingTx ||
    stage === "authorizing" ||
    stage === "broadcasting" ||
    stage === "verifying";

  return (
    <div className="wallet-preparation" aria-live="polite">
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

      <h3>
        {stage === "idle"
          ? "Confirm payment parameters"
          : stage === "authorizing"
            ? "Authorizing payment…"
            : stage === "broadcasting"
              ? "Broadcasting transaction…"
              : stage === "verifying"
                ? "Verifying destination settlement…"
                : stage === "settled"
                  ? "Payment complete & verified"
                  : "Payment incomplete"}
      </h3>

      {loadingRoutes ? (
        <p className="wallet-description">Discovering best execution routes across Superbridge & Circle…</p>
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
                    onClick={() => setSelectedRouteIndex(idx)}
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
                {formatUnits(selectedRoute.requestedAmount, selectedRoute.sourceDecimals)}{" "}
                {selectedRoute.sourceSymbol} on {getWalletNetwork(selectedRoute.sourceNetwork)?.label ?? selectedRoute.sourceNetwork}
              </dd>
            </div>
            <div>
              <dt>Guaranteed minimum received</dt>
              <dd>
                {formatUnits(selectedRoute.minReceivedAmount, selectedRoute.destinationDecimals)}{" "}
                {selectedRoute.destinationSymbol} on {getWalletNetwork(selectedRoute.destinationNetwork)?.label ?? selectedRoute.destinationNetwork}
              </dd>
            </div>
            <div>
              <dt>Network fees</dt>
              <dd>{selectedRoute.fees.networkFeeEstimate}</dd>
            </div>
            <div>
              <dt>Recipient settlement</dt>
              <dd>
                <code style={{ fontSize: "0.8125rem" }}>{shortHash(selectedRoute.recipientAddress)}</code>
              </dd>
            </div>
            {depositTxHash && (
              <div>
                <dt>Source transaction</dt>
                <dd>
                  <code style={{ fontSize: "0.8125rem" }}>{shortHash(depositTxHash)}</code>
                </dd>
              </div>
            )}
          </dl>

          {statusMessage && (
            <p className="wallet-inline-status" style={{ margin: "0.75rem 0", color: "#1e293b" }}>
              {stage === "verifying" ? "● " : ""}
              {statusMessage}
            </p>
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
                className="wallet-primary-button"
                disabled={busy}
                onClick={() => void handleAuthorizePayment()}
              >
                {busy ? "Preparing…" : `Authorize payment (${formatUnits(selectedRoute.requestedAmount, selectedRoute.sourceDecimals)} ${selectedRoute.sourceSymbol})`}
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
  );
}
