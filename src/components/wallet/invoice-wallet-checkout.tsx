"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PaymentSuccessCard, type ReceiptInfo, type LineItem } from "@/components/payment-success-card";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { formatMoney } from "@/lib/invoices";
import { createIdempotencyKey } from "@/lib/idempotency-key";
import { connectWalletConnectWithRequiredChain, isMobileWalletBrowser, prepareRabbyForWalletConnectRequest, setWalletConnectSessionDefaultChain, walletConnectSessionIncludesChain } from "@/lib/wallet/rabby-mobile-handoff";
import { inspectAndRecoverWalletConnectStartupMessages, type WalletConnectStartupDiagnostic } from "@/lib/wallet/walletconnect-startup-diagnostics";
import {
  DEFAULT_RECOMMENDED_CHAIN_ID,
  DEFAULT_RECOMMENDED_CHAIN_NAME,
  circleTestnetUsdcNetworks,
  getCircleTestnetUsdcNetworkForChainId,
  getEvmWalletNetwork,
  getWalletNetwork,
} from "@/lib/wallet/networks";
import type { WalletAsset } from "@/lib/wallet/types";
import { EvmWalletCard } from "./evm-wallet-card";
import { WalletProviders } from "./wallet-providers";
import { LivePaymentFlow } from "./live-payment-flow";

type InvoiceWalletCheckoutProps = {
  shareToken: string;
  invoiceNumber: string;
  amountMinor: number;
  currency: string;
  status: string;
  destinationNetwork?: string | null;
  recipientAddress?: string | null;
  businessName?: string | null;
  logoUrl?: string | null;
  issueDate?: string | null;
  dueDate?: string | null;
  sellerFooter?: string | null;
  lineItems?: LineItem[] | null;
  subtotalMinor?: number | null;
  taxRateBps?: number | null;
  discountMinor?: number | null;
  sellerDetails?: {
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    website?: string | null;
    taxId?: string | null;
  } | null;
};

type AssetResponse = { assets: WalletAsset[] };

type WalletConnectRequestTraceClient = {
  on: (event: "session_request_sent", listener: (event: {
    id: number;
    chainId: string;
    topic: string;
    request: { method: string; params?: unknown };
  }) => void) => void;
  off: (event: "session_request_sent", listener: (event: {
    id: number;
    chainId: string;
    topic: string;
    request: { method: string; params?: unknown };
  }) => void) => void;
  session: { get: (topic: string) => { transportType?: string } };
};

type WalletConnectRequestTraceProvider = {
  signer?: { client?: WalletConnectRequestTraceClient };
};

function shortAddress(address: string) {
  return address.length > 18 ? `${address.slice(0, 10)}…${address.slice(-6)}` : address;
}

function formatNetworkLabel(networkKey: string | null): string {
  if (!networkKey) return "Arbitrum Sepolia";
  const known = getWalletNetwork(networkKey);
  if (known) return known.label;
  const lower = networkKey.trim().toLowerCase();
  if (lower.includes("arbitrum")) return "Arbitrum Sepolia";
  if (lower.includes("base")) return "Base Sepolia";
  return networkKey;
}

const mockTerminalMessages: Record<string, string> = {
  SUCCESS: "Simulation complete: mock success only. No funds moved, and the invoice remains unpaid.",
  FAILED: "Simulation ended as failed. No funds moved, and the invoice remains unpaid.",
  REFUNDED: "Simulation ended as refunded. No funds moved, and the invoice remains unpaid.",
  INCOMPLETE_DEPOSIT: "Simulation ended with an incomplete deposit. No funds moved, and the invoice remains unpaid.",
  QUOTE_EXPIRED: "The simulated quote expired. No funds moved, and the invoice remains unpaid.",
};

const POPULAR_SYMBOLS = ["USDC", "USDT", "ETH"] as const;

function InvoiceWalletCheckoutContent({
  shareToken,
  invoiceNumber,
  amountMinor,
  currency,
  status,
  destinationNetwork,
  recipientAddress,
  businessName,
  logoUrl,
  issueDate,
  dueDate,
  sellerFooter,
  lineItems,
  subtotalMinor,
  taxRateBps,
  discountMinor,
  sellerDetails,
}: InvoiceWalletCheckoutProps) {
  const { address: evmAddress, chainId: evmChainId, isConnected: isEvmConnected, connector: evmConnector } = useAccount();
  const { connectors, connectAsync } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const { switchChainAsync, isPending: isSwitchingChain } = useSwitchChain();
  const router = useRouter();
  const walletConnectConnector = connectors.find((candidate) => candidate.id === "walletConnect");

  const [attempt, setAttempt] = useState<{ id: string; status: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [flowError, setFlowError] = useState("");
  const [assets, setAssets] = useState<WalletAsset[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState("USDC");
  const [selectedSourceNetworkKey, setSelectedSourceNetworkKey] = useState<string>("base-sepolia");
  const [sourceNetworkManuallySelected, setSourceNetworkManuallySelected] = useState(false);
  const [showAdvancedNetworks, setShowAdvancedNetworks] = useState(false);
  const [switchError, setSwitchError] = useState("");
  const [switchRequestPending, setSwitchRequestPending] = useState(false);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [assetError, setAssetError] = useState(false);
  const [liveQuotesEnabled, setLiveQuotesEnabled] = useState(false);
  const [activeMode, setActiveMode] = useState<"live" | "mock">("live");

  const [storedAttemptId, setStoredAttemptId] = useState<string | null>(null);
  const [storedAttemptSettled, setStoredAttemptSettled] = useState(false);
  const [storedReceipts, setStoredReceipts] = useState<ReceiptInfo[]>([]);
  const [walletConnectDiagnostics, setWalletConnectDiagnostics] = useState<WalletConnectStartupDiagnostic | null>(null);
  const [walletConnectDiagnosticsLoading, setWalletConnectDiagnosticsLoading] = useState(false);
  const [walletSwitchDiagnostics, setWalletSwitchDiagnostics] = useState("No network switch request has been attempted in this page session.");

  const refreshWalletConnectDiagnostics = useCallback(async () => {
    setWalletConnectDiagnosticsLoading(true);
    const diagnostic = await inspectAndRecoverWalletConnectStartupMessages(walletConnectConnector);
    setWalletConnectDiagnostics(diagnostic);
    setWalletConnectDiagnosticsLoading(false);
  }, [walletConnectConnector]);

  useEffect(() => {
    void refreshWalletConnectDiagnostics();
  }, [refreshWalletConnectDiagnostics]);

  const payable = status === "open" || status === "overdue";

  // Safe internal feature gate: only allow simulation in non-production when explicitly enabled
  const allowSimulation = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_ENABLE_PAYMENT_SIMULATION === "true";

  // Authoritative page refresh recovery check
  useEffect(() => {
    let active = true;
    try {
      const saved = typeof window !== "undefined"
        ? window.localStorage.getItem(`nodus:live-attempt:${shareToken}`)
        : null;
      if (saved && /^[0-9a-f-]{36}$/i.test(saved)) {
        setStoredAttemptId(saved);
        void fetch(`/api/pay/${encodeURIComponent(shareToken)}/attempt/${encodeURIComponent(saved)}/status`, {
          cache: "no-store",
        })
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (!active || !data) return;
            if (data.settled || data.attempt?.status === "SUCCESS") {
              setStoredAttemptSettled(true);
              if (Array.isArray(data.receipts)) {
                setStoredReceipts(data.receipts);
              }
              window.localStorage.removeItem(`nodus:live-attempt:${shareToken}`);
            } else if (data.attempt?.status === "FAILED" || data.expired) {
              window.localStorage.removeItem(`nodus:live-attempt:${shareToken}`);
              setStoredAttemptId(null);
            }
          })
          .catch(() => {
            // Keep storedAttemptId to let LivePaymentFlow continue polling
          });
      }
    } catch {
      // Ignore local storage read errors
    }
    return () => {
      active = false;
    };
  }, [shareToken]);

  // Detect active network reactively
  const detectedEvmNetwork = useMemo(() => {
    if (!isEvmConnected) return null;
    return getEvmWalletNetwork(evmChainId) ?? null;
  }, [isEvmConnected, evmChainId]);

  useEffect(() => {
    if (sourceNetworkManuallySelected) return;
    const suggestedNetwork = getCircleTestnetUsdcNetworkForChainId(isEvmConnected ? evmChainId : undefined);
    if (suggestedNetwork) setSelectedSourceNetworkKey(suggestedNetwork.key);
  }, [evmChainId, isEvmConnected, sourceNetworkManuallySelected]);

  const selectedSourceNetwork = useMemo(
    () => circleTestnetUsdcNetworks.find((network) => network.key === selectedSourceNetworkKey) ?? circleTestnetUsdcNetworks[1],
    [selectedSourceNetworkKey],
  );
  const selectedSourceWalletNetwork = getWalletNetwork(selectedSourceNetwork.key) ?? null;
  const isWrongChainForRoute = Boolean(isEvmConnected && evmChainId !== selectedSourceNetwork.chainId);
  const isUnsupportedEvmNetwork = Boolean(isEvmConnected && (!detectedEvmNetwork || isWrongChainForRoute));

  const refreshEvmNetwork = useCallback(async () => {
    if (!evmConnector) return;
    const actualChainId = await evmConnector.getChainId();
    evmConnector.emitter.emit("change", { chainId: actualChainId });
  }, [evmConnector]);

  async function reconnectWalletConnectWithRequiredChain(targetChainId: number) {
    if (!evmConnector || evmConnector.id !== "walletConnect" || !walletConnectConnector) {
      throw new Error("WalletConnect is not available for this connection.");
    }

    await disconnectAsync({ connector: evmConnector });
    const onMessage = (event: { type: string; data?: unknown }) => {
      if (event.type === "display_uri" && typeof event.data === "string") {
        setWalletSwitchDiagnostics("Opening Rabby to approve a WalletConnect session that requires the selected payment network.");
        window.location.assign(`rabby://wc?uri=${encodeURIComponent(event.data)}`);
      }
    };
    walletConnectConnector.emitter.on("message", onMessage);
    try {
      const result = await connectWalletConnectWithRequiredChain(
        walletConnectConnector,
        targetChainId,
        () => connectAsync({ connector: walletConnectConnector }),
      );
      const aligned = await setWalletConnectSessionDefaultChain(
        walletConnectConnector,
        targetChainId,
        result.accounts[0],
      );
      if (!aligned) {
        throw new Error(`Rabby did not approve eip155:${targetChainId} for the connected account.`);
      }
    } finally {
      walletConnectConnector.emitter.off("message", onMessage);
    }
  }

  useEffect(() => {
    if (!isMobileWalletBrowser() || evmConnector?.id !== "walletConnect" || !isEvmConnected || !evmAddress) return;
    let cancelled = false;
    void setWalletConnectSessionDefaultChain(evmConnector, selectedSourceNetwork.chainId, evmAddress)
      .then((synced) => {
        if (!cancelled && synced) {
          setWalletSwitchDiagnostics(`WalletConnect request context set to eip155:${selectedSourceNetwork.chainId} using the connected account's approved session chain.`);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [evmAddress, evmConnector, isEvmConnected, selectedSourceNetwork.chainId]);

  useEffect(() => {
    if (!isEvmConnected || !evmConnector) return;
    let syncing = false;
    const syncOnReturn = () => {
      if (document.visibilityState !== "visible" || syncing) return;
      syncing = true;
      void refreshEvmNetwork().catch(() => {}).finally(() => { syncing = false; });
    };
    document.addEventListener("visibilitychange", syncOnReturn);
    window.addEventListener("focus", syncOnReturn);
    return () => {
      document.removeEventListener("visibilitychange", syncOnReturn);
      window.removeEventListener("focus", syncOnReturn);
    };
  }, [evmConnector, isEvmConnected, refreshEvmNetwork]);

  // Load available assets inventory (EVM only for Circle route)
  const loadAssets = useCallback(async (signal?: AbortSignal) => {
    setLoadingAssets(true);
    setAssetError(false);
    try {
      const response = await fetch("/api/wallet/assets", { signal, cache: "no-store" });
      if (!response.ok) throw new Error("Asset inventory unavailable");
      const payload = (await response.json()) as AssetResponse;
      if (!Array.isArray(payload.assets)) throw new Error("Invalid asset inventory");
      const evmOnly = payload.assets.filter((a) => a.network.family === "evm");
      const orderedAssets = [...evmOnly].sort(
        (left, right) => left.network.label.localeCompare(right.network.label) || left.symbol.localeCompare(right.symbol),
      );
      setAssets(orderedAssets);
    } catch {
      if (!signal?.aborted) setAssetError(true);
    } finally {
      if (!signal?.aborted) setLoadingAssets(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadAssets(controller.signal);
    return () => controller.abort();
  }, [loadAssets]);

  // Check live payment capabilities
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/pay/${encodeURIComponent(shareToken)}/capabilities`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => setLiveQuotesEnabled(payload?.liveQuotesEnabled === true && payload?.liveExecutionEnabled === true))
      .catch(() => setLiveQuotesEnabled(false));
    return () => controller.abort();
  }, [shareToken]);

  // Active wallet connection selection (EVM only)
  const activeConnection = useMemo(() => ({
    address: isEvmConnected && evmAddress ? evmAddress : null,
    network: isEvmConnected ? getEvmWalletNetwork(evmChainId) ?? null : null,
  }), [evmAddress, evmChainId, isEvmConnected]);

  // The payer chooses the source network. Wallet network detection only reports
  // whether the connected wallet is ready to use that choice.
  const effectiveNetwork = selectedSourceWalletNetwork;

  // Filter assets matching the effective network and selected symbol
  const availableAssetsOnNetwork = useMemo(
    () => assets.filter((asset) => asset.network.key === selectedSourceNetwork.key),
    [assets, selectedSourceNetwork.key],
  );

  // Only show assets actually listed on the payer-selected testnet.
  const distinctSymbols = useMemo(() => {
    const symbols = Array.from(new Set(availableAssetsOnNetwork.map((a) => a.symbol.toUpperCase())));
    return symbols.sort((a, b) => {
      const aIdx = POPULAR_SYMBOLS.indexOf(a as (typeof POPULAR_SYMBOLS)[number]);
      const bIdx = POPULAR_SYMBOLS.indexOf(b as (typeof POPULAR_SYMBOLS)[number]);
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [availableAssetsOnNetwork]);

  // Resolve the token on the payer-selected network, independently of the wallet's current chain.
  const selectedAsset = useMemo(() => {
    if (availableAssetsOnNetwork.length === 0) return null;
    const match = availableAssetsOnNetwork.find((a) => a.symbol.toUpperCase() === selectedSymbol.toUpperCase());
    return match ?? availableAssetsOnNetwork[0] ?? null;
  }, [availableAssetsOnNetwork, selectedSymbol]);

  // Handle guided network switch
  async function handleSwitchToNetwork(targetChainId: number) {
    setSwitchError("");
    if (!evmConnector) {
      setSwitchError("No connected wallet is available to switch networks.");
      return;
    }
    if (evmConnector.id === "walletConnect" && isMobileWalletBrowser()) {
      try {
        const targetApproved = await walletConnectSessionIncludesChain(evmConnector, targetChainId, evmAddress);
        if (!targetApproved) {
          setSwitchRequestPending(true);
          setWalletSwitchDiagnostics(`Current WalletConnect session lacks eip155:${targetChainId} for this account; replacing it with a session proposal that requires the target chain.`);
          await reconnectWalletConnectWithRequiredChain(targetChainId);
          setSwitchError("");
          setWalletSwitchDiagnostics(`WalletConnect reconnected and aligned to eip155:${targetChainId}.`);
          return;
        }
        const synced = await setWalletConnectSessionDefaultChain(evmConnector, targetChainId, evmAddress);
        if (synced) {
          setSwitchError("");
          setWalletSwitchDiagnostics(`WalletConnect request context set to eip155:${targetChainId} from the connected account's approved session; no wallet network switch was needed.`);
          return;
        }
      } catch {
        setSwitchError("Rabby did not approve the selected network in the new WalletConnect session. Reconnect and approve that network to continue.");
        return;
      } finally {
        setSwitchRequestPending(false);
      }
    }
    let walletConnectChainApproved = true;
    if (evmConnector.id === "walletConnect" && isMobileWalletBrowser()) {
      try {
        walletConnectChainApproved = await walletConnectSessionIncludesChain(evmConnector, targetChainId, evmAddress);
      } catch {
        // If the session cannot be inspected, still try its normal switch request.
      }
    }
    setWalletSwitchDiagnostics(
      `Preparing eip155:${targetChainId}; current WalletConnect session ${walletConnectChainApproved ? "includes" : "does not include"} the target chain.`,
    );
    let timeoutId: number | undefined;
    const timeoutError = new Error("The wallet did not confirm the network change in time.");
    setSwitchRequestPending(true);
    let removeRequestTrace = () => {};
    try {
      prepareRabbyForWalletConnectRequest(evmConnector.id);
      if (evmConnector.id === "walletConnect") {
        try {
          const walletProvider = await evmConnector.getProvider() as WalletConnectRequestTraceProvider;
          const client = walletProvider.signer?.client;
          if (client) {
            const onRequestSent = (event: Parameters<WalletConnectRequestTraceClient["on"]>[1] extends (event: infer T) => void ? T : never) => {
              const session = client.session.get(event.topic);
              const methodParams = Array.isArray(event.request.params) ? event.request.params[0] : undefined;
              const requestedChain = methodParams && typeof methodParams === "object" && "chainId" in methodParams
                ? String((methodParams as { chainId: unknown }).chainId)
                : "unknown";
              setWalletSwitchDiagnostics(
                `WalletConnect published ${event.request.method} (request ${event.id}) on ${event.chainId}; target ${requestedChain}; target approved in session: ${walletConnectChainApproved}; app chain before request: ${evmChainId ?? "unknown"}; transport ${session.transportType ?? "unknown"}; Rabby route base configured.`,
              );
            };
            client.on("session_request_sent", onRequestSent);
            removeRequestTrace = () => client.off("session_request_sent", onRequestSent);
          }
        } catch {
          setWalletSwitchDiagnostics((current) => `${current} Request event tracing could not attach.`);
        }
      }
      const switchRequest = switchChainAsync({ chainId: targetChainId, connector: evmConnector });
      await Promise.race([
        switchRequest,
        new Promise<never>((_resolve, reject) => {
          timeoutId = window.setTimeout(() => reject(timeoutError), 15_000);
        }),
      ]);
      setWalletSwitchDiagnostics((current) => `${current} WalletConnect switch promise resolved.`);
    } catch (err) {
      setWalletSwitchDiagnostics((current) => `${current} Switch result: ${err === timeoutError ? "timed out waiting for wallet confirmation" : err instanceof Error ? err.message.slice(0, 120) : "request failed"}.`);
      if (err === timeoutError) {
        setSwitchError(evmConnector.id === "walletConnect" && !walletConnectChainApproved
          ? "Base Sepolia is not approved for this account in the current WalletConnect session. Reconnect Rabby from this browser and approve Base Sepolia for the session."
          : evmConnector.id === "walletConnect"
          ? "The WalletConnect session did not confirm the network change. Reconnect Rabby from this browser and approve the requested network."
          : "The wallet did not confirm a network change in time. Switch in your wallet, then refresh the wallet network.");
      } else if (err instanceof Error && /reject|denied|user refused|cancel/i.test(err.message)) {
        setSwitchError("The network change was declined in your wallet. Try again, or switch networks in the wallet and retry.");
      } else {
        setSwitchError("The wallet could not change networks. Approve the network request in your wallet, or switch there and retry.");
      }
    } finally {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      removeRequestTrace();
      setSwitchRequestPending(false);
    }
  }

  const selectedWalletMatches = Boolean(
    selectedAsset && activeConnection.address && activeConnection.network?.key === selectedAsset.network.key,
  );

  const preparation = useMemo(() => {
    if (!payable || !selectedAsset || !selectedWalletMatches || !activeConnection.address) return null;
    return {
      invoiceReference: invoiceNumber,
      walletAddress: activeConnection.address,
      sourceNetwork: selectedAsset.network.key,
      sourceAsset: selectedAsset.assetId,
      requestedAmountMinor: amountMinor,
      requestedCurrency: currency,
    };
  }, [amountMinor, currency, invoiceNumber, payable, selectedAsset, activeConnection.address, selectedWalletMatches]);

  // Mock simulation methods (preserved only under internal feature gate)
  async function createMockQuote() {
    if (!selectedAsset || !allowSimulation) return;
    setBusy(true);
    setFlowError("");
    try {
      const response = await fetch(`/api/pay/${encodeURIComponent(shareToken)}/mock-attempt`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: createIdempotencyKey(),
          sourceAssetId: selectedAsset.assetId,
          sourceNetwork: selectedAsset.network.key,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.attempt) throw new Error("A simulated attempt could not be created.");
      setAttempt(payload.attempt);
    } catch (error) {
      setFlowError(error instanceof Error ? error.message : "The simulation is unavailable.");
    } finally {
      setBusy(false);
    }
  }

  async function advanceMock(mockStatus: string) {
    if (!attempt || !allowSimulation) return;
    setBusy(true);
    setFlowError("");
    try {
      const response = await fetch(`/api/pay/${encodeURIComponent(shareToken)}/mock-attempt/${attempt.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: mockStatus }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.attempt) throw new Error("The simulated status transition was rejected.");
      setAttempt(payload.attempt);
    } catch (error) {
      setFlowError(error instanceof Error ? error.message : "The simulation is unavailable.");
    } finally {
      setBusy(false);
    }
  }

  if (storedAttemptSettled) {
    return (
      <PaymentSuccessCard
        invoiceNumber={invoiceNumber}
        amountMinor={amountMinor}
        currency={currency}
        businessName={businessName}
        logoUrl={logoUrl}
        issueDate={issueDate}
        dueDate={dueDate}
        destinationNetwork={destinationNetwork}
        recipientAddress={recipientAddress}
        receipt={storedReceipts[0] ?? null}
        receipts={storedReceipts}
        lineItems={lineItems}
        subtotalMinor={subtotalMinor}
        taxRateBps={taxRateBps}
        discountMinor={discountMinor}
        sellerFooter={sellerFooter}
        sellerDetails={sellerDetails}
      />
    );
  }

  const mockStage = attempt?.status ?? "idle";

  return (
    <section className="invoice-wallet-checkout" aria-labelledby="invoice-wallet-title">
      <div className="wallet-section-heading">
        <div>
          <p className="wallet-eyebrow">CHECKOUT</p>
          <h2 id="invoice-wallet-title">Pay with crypto</h2>
        </div>
        <span className="wallet-phase-label">
          {liveQuotesEnabled ? "Guarded live route" : "Checkout"}
        </span>
      </div>

      {process.env.NODE_ENV !== "production" && (
        <details className="wallet-debug-diagnostics" open>
          <summary>WalletConnect startup diagnostics</summary>
          {walletConnectDiagnosticsLoading ? (
            <p role="status">Inspecting saved WalletConnect relay messages…</p>
          ) : walletConnectDiagnostics ? (
            <>
              <p>{walletConnectDiagnostics.status}</p>
              <p>Active sessions: {walletConnectDiagnostics.sessionCount}; unacknowledged relay messages: {walletConnectDiagnostics.pendingMessageCount}.</p>
              <p>Latest switch trace: {walletSwitchDiagnostics}</p>
              {walletConnectDiagnostics.messages.map((message) => (
                <p key={message.index}>
                  Message {message.index}: {message.decodedAs}; response history: {message.responseHistory}; listeners: {message.responseListeners}.
                  {message.error && <> Decode error: {message.error}</>}
                </p>
              ))}
            </>
          ) : (
            <p>Diagnostic data is not available yet.</p>
          )}
          <button type="button" className="wallet-text-button" onClick={() => void refreshWalletConnectDiagnostics()} disabled={walletConnectDiagnosticsLoading}>
            Refresh diagnostics
          </button>
        </details>
      )}

      {!payable ? (
        <p className="wallet-blocked" role="status">
          {status === "paid"
            ? "This invoice is already paid."
            : status === "cancelled"
              ? "This invoice was cancelled and cannot enter payment setup."
              : "This invoice is not available for payment setup."}
        </p>
      ) : (
        <>
          {/* 1. ASSET-FIRST SELECTION BAR */}
          <div className="wallet-asset-control">
            <div className="asset-selection-header">
              <label htmlFor="payerSourceNetwork">Pay from network</label>
              {effectiveNetwork && <span className="network-pill">{effectiveNetwork.label}</span>}
            </div>
            <select
              id="payerSourceNetwork"
              value={selectedSourceNetwork.key}
              onChange={(event) => {
                setSourceNetworkManuallySelected(true);
                setSelectedSourceNetworkKey(event.target.value);
                setAttempt(null);
                setFlowError("");
              }}
              className="nodus-input font-medium"
              aria-label="Choose the network to pay from"
            >
              {circleTestnetUsdcNetworks.map((network) => (
                <option key={network.key} value={network.key}>{network.label}</option>
              ))}
            </select>
            <p className="wallet-description">
              Choose the network holding your USDC. A direct route is available when it matches the merchant network; cross-network availability depends on the supported Circle route.
            </p>

            <div className="asset-selection-header">
              <label>Select payment token</label>
              {effectiveNetwork && (
                <span className="network-pill" title={`Detected network: ${effectiveNetwork.label}`}>
                  ● {effectiveNetwork.label}
                </span>
              )}
            </div>

            {loadingAssets ? (
              <p className="wallet-description" role="status">
                Loading supported payment tokens…
              </p>
            ) : assetError ? (
              <div className="wallet-asset-error" role="alert">
                <p>Supported assets are temporarily unavailable.</p>
                <button type="button" className="wallet-text-button" onClick={() => void loadAssets()}>
                  Try again
                </button>
              </div>
            ) : distinctSymbols.length > 0 ? (
              <div className="asset-choice-group" role="radiogroup" aria-label="Choose token">
                {distinctSymbols.map((symbol) => {
                  const isSelected = selectedSymbol.toUpperCase() === symbol;
                  return (
                    <button
                      key={symbol}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      className={`asset-choice-pill ${isSelected ? "is-selected" : ""}`}
                      onClick={() => {
                        setSelectedSymbol(symbol);
                        setAttempt(null);
                      }}
                    >
                      <span className="asset-symbol">{symbol}</span>
                      {symbol === "USDC" && <span className="asset-tag">RECOMMENDED</span>}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="wallet-description">No compatible payment tokens are currently listed for this route.</p>
            )}

            {selectedAsset && (
              <p className="wallet-asset-detail">
                Paying with <strong>{selectedAsset.symbol}</strong> via <strong>{selectedAsset.network.label}</strong> ({selectedAsset.decimals} decimals)
              </p>
            )}
          </div>

          {/* The payer can choose a supported testnet and switch the wallet to match. */}
          {isUnsupportedEvmNetwork && (
            <div className="wallet-switch-alert" role="alert">
              <div>
                <p className="wallet-eyebrow" style={{ color: "#8c2f22" }}>
                  {detectedEvmNetwork ? "SWITCH TO SELECTED NETWORK" : "UNSUPPORTED NETWORK DETECTED"}
                </p>
                <p className="wallet-inline-status" style={{ color: "#54211b" }}>
                  You selected {selectedSourceNetwork.label}. Switch your wallet to that network to continue, or choose another network above.
                </p>
              </div>
              <button
                type="button"
                className="wallet-primary-button"
                disabled={switchRequestPending}
                onClick={() => void handleSwitchToNetwork(selectedSourceNetwork.chainId)}
              >
                {switchRequestPending ? "Requesting network change…" : `Switch to ${selectedSourceNetwork.label}`}
              </button>
              <button
                type="button"
                className="wallet-text-button"
                onClick={() => void refreshEvmNetwork().catch(() => setSwitchError("Could not refresh the wallet network. Reconnect your wallet and try again."))}
              >
                Refresh wallet network
              </button>
              {switchError && <p className="wallet-error" role="alert">{switchError}</p>}
            </div>
          )}

          {/* 3. CONNECT AN EXISTING EVM WALLET */}
          <div className="wallet-card-grid" style={{ gridTemplateColumns: "1fr" }}>
            <EvmWalletCard selectedChainId={selectedAsset?.network.chainId ?? DEFAULT_RECOMMENDED_CHAIN_ID} />
          </div>

          {/* 4. PROGRESSIVE DISCLOSURE: MANUAL NETWORK SWITCHING / ADVANCED */}
          {isEvmConnected && detectedEvmNetwork && (
            <div className="network-disclosure-wrap">
              <button
                type="button"
                className="network-disclosure-toggle"
                aria-expanded={showAdvancedNetworks}
                onClick={() => setShowAdvancedNetworks((open) => !open)}
              >
                <span>{showAdvancedNetworks ? "▾" : "▸"} Want to pay from a different network?</span>
              </button>

              {showAdvancedNetworks && (
                <div className="network-disclosure-panel">
                  <p className="wallet-description">
                    Choose a payer network above, then switch the connected wallet to match it.
                  </p>
                  <div className="network-switch-pills">
                    {circleTestnetUsdcNetworks.map((network) => {
                      const isCurrent = detectedEvmNetwork.chainId === network.chainId;
                      return (
                        <button
                          key={network.key}
                          type="button"
                          className={`network-switch-pill ${network.key === selectedSourceNetwork.key ? "is-active" : ""}`}
                          disabled={isSwitchingChain}
                          onClick={() => {
                            setSourceNetworkManuallySelected(true);
                            setSelectedSourceNetworkKey(network.key);
                            setAttempt(null);
                            void handleSwitchToNetwork(network.chainId);
                          }}
                        >
                          <span>{network.label}</span>
                          {isCurrent && <span className="current-badge">ACTIVE</span>}
                        </button>
                      );
                    })}
                  </div>
                  {switchError && <p className="wallet-error" role="alert">{switchError}</p>}
                </div>
              )}
            </div>
          )}

          {/* 5. INTERNAL SIMULATION TOGGLE (ONLY WHEN PERMITTED BY DEV FEATURE GATE) */}
          {allowSimulation && liveQuotesEnabled && (
            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
              <button
                type="button"
                className={`asset-choice-pill ${activeMode === "live" ? "is-selected" : ""}`}
                onClick={() => setActiveMode("live")}
              >
                Live Route Execution
              </button>
              <button
                type="button"
                className={`asset-choice-pill ${activeMode === "mock" ? "is-selected" : ""}`}
                onClick={() => setActiveMode("mock")}
              >
                Simulated Demonstration (Dev Only)
              </button>
            </div>
          )}

          {/* 6. SETTLED STATE FROM AUTHORITATIVE SERVER STATUS */}
          {storedAttemptSettled && (
            <div className="wallet-preparation" aria-live="polite">
              <p className="wallet-eyebrow">PAYMENT SETTLED</p>
              <h3 style={{ color: "#166534" }}>Payment complete &amp; verified</h3>
              <div style={{ marginTop: "0.75rem", padding: "0.75rem", background: "#f0fdf4", borderRadius: "6px", border: "1px solid #bbf7d0" }}>
                <p style={{ margin: 0, fontWeight: 600, color: "#166534", fontSize: "0.875rem" }}>
                  ✓ Official Receipt Issued: #{storedReceipts[0]?.receipt_number ?? "Confirmed"}
                </p>
                <p style={{ margin: "0.25rem 0 0 0", color: "#15803d", fontSize: "0.75rem" }}>
                  Settlement independently verified on destination chain.
                </p>
              </div>
              <p className="wallet-description" style={{ marginTop: "0.75rem" }}>
                This invoice has been verified as settled. No further payment action is needed.
              </p>
            </div>
          )}

          {/* 7. LIVE ROUTE EXECUTION OR VERIFICATION RESTORATION (NO MOCK DEMO ON REFRESH) */}
          {!storedAttemptSettled && (storedAttemptId || (liveQuotesEnabled && activeMode === "live" && activeConnection.address)) ? (
            <LivePaymentFlow
              shareToken={shareToken}
              invoiceNumber={invoiceNumber}
              amountMinor={amountMinor}
              currency={currency}
              selectedAsset={selectedAsset}
              activeAddress={activeConnection.address}
              onPaymentSuccess={(receipts) => {
                if (Array.isArray(receipts) && receipts.length > 0) {
                  setStoredReceipts(receipts as ReceiptInfo[]);
                }
                setStoredAttemptSettled(true);
                router.refresh();
              }}
            />
          ) : !storedAttemptSettled && allowSimulation && activeMode === "mock" ? (
            /* DEV-ONLY SIMULATED DEMONSTRATION */
            <div className="wallet-preparation" aria-live="polite">
              <p className="wallet-eyebrow">INTERNAL SIMULATION (DEV ONLY)</p>
              <h3>
                {mockStage === "idle"
                  ? preparation
                    ? "Payment details ready"
                    : "Connect your wallet to continue"
                  : mockStage === "MOCK_QUOTE_READY"
                    ? "Simulated quote ready"
                    : mockStage === "PENDING_DEPOSIT"
                      ? "Simulated customer confirmation"
                      : mockStage === "KNOWN_DEPOSIT_TX"
                        ? "Simulated deposit submitted"
                        : mockStage === "PROCESSING"
                          ? "Simulated payment processing"
                          : `Simulated ${mockStage.toLowerCase().replaceAll("_", " ")}`}
              </h3>
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
                  <dt>Selected token</dt>
                  <dd>{selectedAsset ? `${selectedAsset.symbol} on ${selectedAsset.network.label}` : "Choose a supported asset"}</dd>
                </div>
                <div>
                  <dt>Wallet address</dt>
                  <dd>
                    {activeConnection.address ? (
                      <span title={activeConnection.address}>{shortAddress(activeConnection.address)}</span>
                    ) : (
                      "Not connected"
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Destination</dt>
                  <dd>USDC on {formatNetworkLabel(destinationNetwork ?? null)}</dd>
                </div>
                {recipientAddress && (
                  <div>
                    <dt>Merchant recipient</dt>
                    <dd>
                      <span title={recipientAddress}>{shortAddress(recipientAddress)}</span>
                    </dd>
                  </div>
                )}
              </dl>
              <p className="wallet-notice">
                Internal test simulation only. This demonstration does not request transaction signatures, move funds, or mark the invoice paid.
              </p>
              {mockStage === "idle" && (
                <button
                  type="button"
                  className="wallet-primary-button"
                  disabled={!selectedAsset || busy || !activeConnection.address}
                  onClick={() => void createMockQuote()}
                >
                  {busy ? "Creating simulation…" : "Generate simulated quote"}
                </button>
              )}
              {mockStage === "MOCK_QUOTE_READY" && (
                <div>
                  <button type="button" className="wallet-primary-button" disabled={busy} onClick={() => void advanceMock("PENDING_DEPOSIT")}>
                    Confirm simulated quote
                  </button>
                  <button type="button" className="wallet-secondary-button" disabled={busy} onClick={() => void advanceMock("QUOTE_EXPIRED")}>
                    Simulate quote expiry
                  </button>
                </div>
              )}
              {mockStage === "PENDING_DEPOSIT" && (
                <div>
                  <button type="button" className="wallet-primary-button" disabled={busy} onClick={() => void advanceMock("KNOWN_DEPOSIT_TX")}>
                    Simulate deposit submitted
                  </button>
                  <button type="button" className="wallet-secondary-button" disabled={busy} onClick={() => void advanceMock("FAILED")}>
                    Simulate failure
                  </button>
                </div>
              )}
              {mockStage === "KNOWN_DEPOSIT_TX" && (
                <div>
                  <button type="button" className="wallet-primary-button" disabled={busy} onClick={() => void advanceMock("PROCESSING")}>
                    Simulate processing
                  </button>
                  <button type="button" className="wallet-secondary-button" disabled={busy} onClick={() => void advanceMock("INCOMPLETE_DEPOSIT")}>
                    Simulate incomplete deposit
                  </button>
                </div>
              )}
              {mockStage === "PROCESSING" && (
                <div>
                  <button type="button" className="wallet-primary-button" disabled={busy} onClick={() => void advanceMock("SUCCESS")}>
                    Simulate success
                  </button>
                  <button type="button" className="wallet-secondary-button" disabled={busy} onClick={() => void advanceMock("REFUNDED")}>
                    Simulate refund
                  </button>
                </div>
              )}
              {mockTerminalMessages[mockStage] && (
                <p className="wallet-description" role="status">
                  {mockTerminalMessages[mockStage]}
                </p>
              )}
              {flowError && (
                <p className="wallet-error" role="alert">
                  {flowError}
                </p>
              )}
            </div>
          ) : !storedAttemptSettled && (
            /* DEFAULT CUSTOMER CHECKOUT PREPARATION (NO WALLET YET) */
            <div className="wallet-preparation" aria-live="polite">
              <p className="wallet-eyebrow">CHECKOUT PREPARATION</p>
              <h3>Connect your wallet to pay</h3>
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
                  <dt>Payment token</dt>
                  <dd>{selectedAsset ? `${selectedAsset.symbol} on ${selectedAsset.network.label}` : `USDC on ${DEFAULT_RECOMMENDED_CHAIN_NAME}`}</dd>
                </div>
                <div>
                  <dt>Destination network</dt>
                  <dd>{formatNetworkLabel(destinationNetwork ?? null)}</dd>
                </div>
                {recipientAddress && (
                  <div>
                    <dt>Merchant recipient</dt>
                    <dd>
                      <span title={recipientAddress}>{shortAddress(recipientAddress)}</span>
                    </dd>
                  </div>
                )}
              </dl>
              <p className="wallet-description" style={{ marginTop: "1rem" }}>
                Connect an Ethereum-compatible wallet above to review real-time Circle CCTP quote parameters and authorize payment.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export function InvoiceWalletCheckout(props: InvoiceWalletCheckoutProps) {
  return (
    <WalletProviders>
      <InvoiceWalletCheckoutContent {...props} />
    </WalletProviders>
  );
}
