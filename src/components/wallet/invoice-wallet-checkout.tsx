"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { formatMoney } from "@/lib/invoices";
import {
  DEFAULT_RECOMMENDED_CHAIN_ID,
  DEFAULT_RECOMMENDED_CHAIN_NAME,
  evmWalletChains,
  getEvmWalletNetwork,
  getWalletNetwork,
} from "@/lib/wallet/networks";
import type { WalletAsset, WalletConnectionSnapshot } from "@/lib/wallet/types";
import { EvmWalletCard } from "./evm-wallet-card";
import { SolanaWalletCard } from "./solana-wallet-card";
import { WalletProviders } from "./wallet-providers";

type InvoiceWalletCheckoutProps = {
  shareToken: string;
  invoiceNumber: string;
  amountMinor: number;
  currency: string;
  status: string;
};

type AssetResponse = { assets: WalletAsset[] };

function shortAddress(address: string) {
  return address.length > 18 ? `${address.slice(0, 10)}…${address.slice(-6)}` : address;
}

const mockTerminalMessages: Record<string, string> = {
  SUCCESS: "Simulation complete: mock success only. No funds moved, and the invoice remains unpaid.",
  FAILED: "Simulation ended as failed. No funds moved, and the invoice remains unpaid.",
  REFUNDED: "Simulation ended as refunded. No funds moved, and the invoice remains unpaid.",
  INCOMPLETE_DEPOSIT: "Simulation ended with an incomplete deposit. No funds moved, and the invoice remains unpaid.",
  QUOTE_EXPIRED: "The simulated quote expired. No funds moved, and the invoice remains unpaid.",
};

const POPULAR_SYMBOLS = ["USDC", "USDT", "ETH", "SOL"] as const;

function InvoiceWalletCheckoutContent({
  shareToken,
  invoiceNumber,
  amountMinor,
  currency,
  status,
}: InvoiceWalletCheckoutProps) {
  const { chainId: evmChainId, isConnected: isEvmConnected } = useAccount();
  const { switchChainAsync, isPending: isSwitchingChain } = useSwitchChain();

  const [attempt, setAttempt] = useState<{ id: string; status: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [flowError, setFlowError] = useState("");
  const [assets, setAssets] = useState<WalletAsset[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState("USDC");
  const [manualNetworkKey, setManualNetworkKey] = useState<string | null>(null);
  const [showAdvancedNetworks, setShowAdvancedNetworks] = useState(false);
  const [switchError, setSwitchError] = useState("");
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [assetError, setAssetError] = useState(false);
  const [liveQuotesEnabled, setLiveQuotesEnabled] = useState(false);

  const [evmConnection, setEvmConnection] = useState<WalletConnectionSnapshot>({ address: null, network: null });
  const [solanaConnection, setSolanaConnection] = useState<WalletConnectionSnapshot>({ address: null, network: null });

  const payable = status === "open" || status === "overdue";
  const updateEvmConnection = useCallback((connection: WalletConnectionSnapshot) => setEvmConnection(connection), []);
  const updateSolanaConnection = useCallback((connection: WalletConnectionSnapshot) => setSolanaConnection(connection), []);

  // Detect active network reactively
  const detectedEvmNetwork = useMemo(() => {
    if (!isEvmConnected) return null;
    return getEvmWalletNetwork(evmChainId) ?? null;
  }, [isEvmConnected, evmChainId]);

  const isUnsupportedEvmNetwork = Boolean(isEvmConnected && evmChainId !== undefined && !detectedEvmNetwork);

  // Load available assets inventory
  const loadAssets = useCallback(async (signal?: AbortSignal) => {
    setLoadingAssets(true);
    setAssetError(false);
    try {
      const response = await fetch("/api/wallet/assets", { signal, cache: "no-store" });
      if (!response.ok) throw new Error("Asset inventory unavailable");
      const payload = (await response.json()) as AssetResponse;
      if (!Array.isArray(payload.assets)) throw new Error("Invalid asset inventory");
      const orderedAssets = [...payload.assets].sort(
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

  // Active wallet connection selection
  const activeConnection = useMemo(() => {
    if (selectedSymbol === "SOL" || manualNetworkKey === "solana") {
      if (solanaConnection.address) return solanaConnection;
    }
    if (evmConnection.address) return evmConnection;
    if (solanaConnection.address) return solanaConnection;
    return { address: null, network: null };
  }, [evmConnection, solanaConnection, selectedSymbol, manualNetworkKey]);

  // The effectively resolved network: detected wallet network takes precedence over manual selection
  const effectiveNetwork = useMemo(() => {
    if (manualNetworkKey) {
      const manual = getWalletNetwork(manualNetworkKey);
      if (manual) return manual;
    }
    if (activeConnection.network) return activeConnection.network;
    return null;
  }, [manualNetworkKey, activeConnection.network]);

  // Filter assets matching the effective network and selected symbol
  const availableAssetsOnNetwork = useMemo(() => {
    if (!effectiveNetwork) return assets;
    return assets.filter((asset) => asset.network.key === effectiveNetwork.key);
  }, [assets, effectiveNetwork]);

  // Distinct symbols available on the detected network (or globally if not connected)
  const distinctSymbols = useMemo(() => {
    const sourceList = effectiveNetwork ? availableAssetsOnNetwork : assets;
    const symbols = Array.from(new Set(sourceList.map((a) => a.symbol.toUpperCase())));
    // Order by popular symbols first
    return symbols.sort((a, b) => {
      const aIdx = POPULAR_SYMBOLS.indexOf(a as (typeof POPULAR_SYMBOLS)[number]);
      const bIdx = POPULAR_SYMBOLS.indexOf(b as (typeof POPULAR_SYMBOLS)[number]);
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [availableAssetsOnNetwork, assets, effectiveNetwork]);

  // Resolved selected asset
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
      setManualNetworkKey(null);
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

  // Mock simulation methods
  async function createMockQuote() {
    if (!selectedAsset) return;
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

  async function advanceMock(status: string) {
    if (!attempt) return;
    setBusy(true);
    setFlowError("");
    try {
      const response = await fetch(`/api/pay/${encodeURIComponent(shareToken)}/mock-attempt/${attempt.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
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
          {liveQuotesEnabled ? "Guarded live route" : "Simulated demonstration"}
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

          {/* 2. GUIDED UNSUPPORTED NETWORK SWITCH BANNER */}
          {isUnsupportedEvmNetwork && (
            <div className="wallet-switch-alert" role="alert">
              <div>
                <p className="wallet-eyebrow" style={{ color: "#8c2f22" }}>UNSUPPORTED NETWORK DETECTED</p>
                <p className="wallet-inline-status" style={{ color: "#54211b" }}>
                  Your wallet is connected to an unsupported chain (ID: <code>{evmChainId ?? "unknown"}</code>). Please switch to a supported network to pay this invoice.
                </p>
              </div>
              <button
                type="button"
                className="wallet-primary-button"
                disabled={isSwitchingChain}
                onClick={() => void handleSwitchToNetwork(DEFAULT_RECOMMENDED_CHAIN_ID)}
              >
                {isSwitchingChain ? "Approve switch in wallet…" : `Switch to ${DEFAULT_RECOMMENDED_CHAIN_NAME} (Recommended)`}
              </button>
              {switchError && <p className="wallet-error" role="alert">{switchError}</p>}
            </div>
          )}

          {/* 3. WALLET CONNECTION CARDS */}
          <div className="wallet-card-grid">
            <EvmWalletCard
              selectedChainId={selectedAsset?.network.family === "evm" ? selectedAsset.network.chainId : undefined}
              onConnectionChange={updateEvmConnection}
            />
            <SolanaWalletCard
              selected={selectedAsset?.network.family === "solana"}
              onConnectionChange={updateSolanaConnection}
            />
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
                    Choose another network where you hold funds. Your wallet will prompt you to approve the network switch.
                  </p>
                  <div className="network-switch-pills">
                    {evmWalletChains.map((chain) => {
                      const isCurrent = detectedEvmNetwork.chainId === chain.id;
                      return (
                        <button
                          key={chain.id}
                          type="button"
                          className={`network-switch-pill ${isCurrent ? "is-active" : ""}`}
                          disabled={isCurrent || isSwitchingChain}
                          onClick={() => void handleSwitchToNetwork(chain.id)}
                        >
                          <span>{chain.name}</span>
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

          {/* 5. PAYMENT EXECUTION / PREPARATION FLOW */}
          <div className="wallet-preparation" aria-live="polite">
              <p className="wallet-eyebrow">SIMULATED DEMONSTRATION</p>
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
                  <dd>USDC · Base</dd>
                </div>
              </dl>
              <p className="wallet-notice">
                Simulation mode only. This demonstration does not request transaction signatures, move funds, or mark the invoice paid.
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
