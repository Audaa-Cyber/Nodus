"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { formatMoney } from "@/lib/invoices";
import {
  DEFAULT_RECOMMENDED_CHAIN_ID,
  DEFAULT_RECOMMENDED_CHAIN_NAME,
  circleTestnetUsdcNetworks,
  getCircleTestnetUsdcNetworkForChainId,
  getEvmWalletNetwork,
  getWalletNetwork,
} from "@/lib/wallet/networks";
import type { WalletAsset, WalletConnectionSnapshot } from "@/lib/wallet/types";
import { EvmWalletCard } from "./evm-wallet-card";
import { CircleGuestWalletCard } from "./circle-guest-wallet-card";
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
};

type AssetResponse = { assets: WalletAsset[] };

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
}: InvoiceWalletCheckoutProps) {
  const { chainId: evmChainId, isConnected: isEvmConnected } = useAccount();
  const { switchChainAsync, isPending: isSwitchingChain } = useSwitchChain();

  const [attempt, setAttempt] = useState<{ id: string; status: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [flowError, setFlowError] = useState("");
  const [assets, setAssets] = useState<WalletAsset[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState("USDC");
  const [selectedSourceNetworkKey, setSelectedSourceNetworkKey] = useState<string>("base-sepolia");
  const [sourceNetworkManuallySelected, setSourceNetworkManuallySelected] = useState(false);
  const [showAdvancedNetworks, setShowAdvancedNetworks] = useState(false);
  const [switchError, setSwitchError] = useState("");
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [assetError, setAssetError] = useState(false);
  const [liveQuotesEnabled, setLiveQuotesEnabled] = useState(false);
  const [activeMode, setActiveMode] = useState<"live" | "mock">("live");

  const [storedAttemptId, setStoredAttemptId] = useState<string | null>(null);
  const [storedAttemptSettled, setStoredAttemptSettled] = useState(false);
  const [storedReceipts, setStoredReceipts] = useState<Array<{ receipt_number: string; issued_at: string }>>([]);

  const [walletMethod, setWalletMethod] = useState<"external" | "circle">("external");
  const [evmConnection, setEvmConnection] = useState<WalletConnectionSnapshot>({ address: null, network: null });

  const payable = status === "open" || status === "overdue";
  const updateEvmConnection = useCallback((connection: WalletConnectionSnapshot) => setEvmConnection(connection), []);

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
    const connectedChainId = walletMethod === "circle"
      ? evmConnection.network?.chainId
      : isEvmConnected ? evmChainId : undefined;
    const suggestedNetwork = getCircleTestnetUsdcNetworkForChainId(connectedChainId);
    if (suggestedNetwork) setSelectedSourceNetworkKey(suggestedNetwork.key);
  }, [evmChainId, evmConnection.network?.chainId, isEvmConnected, sourceNetworkManuallySelected, walletMethod]);

  const selectedSourceNetwork = useMemo(
    () => circleTestnetUsdcNetworks.find((network) => network.key === selectedSourceNetworkKey) ?? circleTestnetUsdcNetworks[1],
    [selectedSourceNetworkKey],
  );
  const selectedSourceWalletNetwork = getWalletNetwork(selectedSourceNetwork.key) ?? null;
  const isWrongChainForRoute = Boolean(isEvmConnected && evmChainId !== selectedSourceNetwork.chainId);
  const isUnsupportedEvmNetwork = Boolean(isEvmConnected && (!detectedEvmNetwork || isWrongChainForRoute));

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
  const activeConnection = useMemo(() => {
    if (evmConnection.address) return evmConnection;
    return { address: null, network: null };
  }, [evmConnection]);

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
    try {
      await switchChainAsync({ chainId: targetChainId });
    } catch (err) {
      const isUserRejection = err instanceof Error && /reject|denied|user refused|cancel/i.test(err.message);
      if (isUserRejection) {
        setSwitchError("Network switch was declined in your wallet. Please click to try again, or switch directly inside your wallet extension.");
      } else {
        setSwitchError("Could not switch networks automatically. Please switch to this network manually inside your wallet.");
      }
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
          idempotencyKey: crypto.randomUUID(),
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
                disabled={isSwitchingChain}
                onClick={() => void handleSwitchToNetwork(selectedSourceNetwork.chainId)}
              >
                {isSwitchingChain ? "Approve switch in wallet…" : `Switch to ${selectedSourceNetwork.label}`}
              </button>
              {switchError && <p className="wallet-error" role="alert">{switchError}</p>}
            </div>
          )}

          {/* 3. WALLET METHOD SELECTION & EVM CONNECTION */}
          <div className="wallet-method-selector" style={{ marginBottom: "1rem" }}>
            <div className="asset-selection-header" style={{ marginBottom: "0.5rem" }}>
              <label>Wallet method</label>
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                type="button"
                className={`asset-choice-pill ${walletMethod === "external" ? "is-selected" : ""}`}
                onClick={() => setWalletMethod("external")}
              >
                <span>Browser / External Wallet</span>
                <span className="asset-tag" style={{ marginLeft: "0.5rem" }}>POPULAR</span>
              </button>
              <button
                type="button"
                className={`asset-choice-pill ${walletMethod === "circle" ? "is-selected" : ""}`}
                onClick={() => setWalletMethod("circle")}
              >
                <span>Circle Wallet</span>
                <span style={{ fontSize: "0.65rem", padding: "1px 6px", borderRadius: "4px", background: "rgba(0,0,0,0.06)", marginLeft: "0.5rem" }}>OPTIONAL</span>
              </button>
            </div>
          </div>

          <div className="wallet-card-grid" style={{ gridTemplateColumns: "1fr" }}>
            {walletMethod === "external" ? (
              <EvmWalletCard
                selectedChainId={selectedAsset?.network.chainId ?? DEFAULT_RECOMMENDED_CHAIN_ID}
                onConnectionChange={updateEvmConnection}
              />
            ) : (
              <CircleGuestWalletCard
                selectedChainId={selectedAsset?.network.chainId ?? DEFAULT_RECOMMENDED_CHAIN_ID}
                onConnectionChange={updateEvmConnection}
              />
            )}
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
              onPaymentSuccess={() => {
                setStoredAttemptSettled(true);
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
