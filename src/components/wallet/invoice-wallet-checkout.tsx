"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatMoney } from "@/lib/invoices";
import type { WalletAsset, WalletConnectionSnapshot } from "@/lib/wallet/types";
import { EvmWalletCard } from "./evm-wallet-card";
import { SolanaWalletCard } from "./solana-wallet-card";
import { WalletProviders } from "./wallet-providers";
import { LivePaymentFlow } from "./live-payment-flow";

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

function AssetLabel({ asset }: { asset: WalletAsset }) {
  const contract = asset.contractAddress
    ? ` · ${asset.contractAddress.length > 16 ? `${asset.contractAddress.slice(0, 7)}…${asset.contractAddress.slice(-5)}` : asset.contractAddress}`
    : "";
  return <>{asset.symbol} · {asset.network.label}{contract}</>;
}

function assetOptionLabel(asset: WalletAsset) {
  const contract = asset.contractAddress
    ? ` · ${asset.contractAddress.length > 16 ? `${asset.contractAddress.slice(0, 7)}…${asset.contractAddress.slice(-5)}` : asset.contractAddress}`
    : " · native asset";
  return `${asset.symbol} · ${asset.network.label}${contract}`;
}

function InvoiceWalletCheckoutContent({ shareToken, invoiceNumber, amountMinor, currency, status }: InvoiceWalletCheckoutProps) {
  const [attempt, setAttempt] = useState<{ id: string; status: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [flowError, setFlowError] = useState("");
  const [assets, setAssets] = useState<WalletAsset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [assetError, setAssetError] = useState(false);
  const [liveQuotesEnabled, setLiveQuotesEnabled] = useState(false);
  const [evmConnection, setEvmConnection] = useState<WalletConnectionSnapshot>({ address: null, network: null });
  const [solanaConnection, setSolanaConnection] = useState<WalletConnectionSnapshot>({ address: null, network: null });
  const payable = status === "open" || status === "overdue";
  const updateEvmConnection = useCallback((connection: WalletConnectionSnapshot) => setEvmConnection(connection), []);
  const updateSolanaConnection = useCallback((connection: WalletConnectionSnapshot) => setSolanaConnection(connection), []);

  const loadAssets = useCallback(async (signal?: AbortSignal) => {
    setLoadingAssets(true);
    setAssetError(false);
    try {
      const response = await fetch("/api/wallet/assets", { signal, cache: "no-store" });
      if (!response.ok) throw new Error("Asset inventory unavailable");
      const payload = await response.json() as AssetResponse;
      if (!Array.isArray(payload.assets)) throw new Error("Invalid asset inventory");
      const orderedAssets = [...payload.assets].sort((left, right) =>
        left.network.label.localeCompare(right.network.label) || left.symbol.localeCompare(right.symbol),
      );
      setAssets(orderedAssets);
      setSelectedAssetId((current) => orderedAssets.some((asset) => asset.assetId === current) ? current : "");
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

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/pay/${encodeURIComponent(shareToken)}/capabilities`, { cache: "no-store", signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => setLiveQuotesEnabled(payload?.liveQuotesEnabled === true && payload?.liveExecutionEnabled === true))
      .catch(() => setLiveQuotesEnabled(false));
    return () => controller.abort();
  }, [shareToken]);

  const selectedAsset = assets.find((asset) => asset.assetId === selectedAssetId) ?? null;
  const selectedConnection = selectedAsset?.network.family === "solana" ? solanaConnection : evmConnection;
  const selectedWalletMatches = Boolean(
    selectedAsset && selectedConnection.address && selectedConnection.network?.key === selectedAsset.network.key,
  );

  const preparation = useMemo(() => {
    if (!payable || !selectedAsset || !selectedWalletMatches || !selectedConnection.address) return null;
    return {
      invoiceReference: invoiceNumber,
      walletAddress: selectedConnection.address,
      sourceNetwork: selectedAsset.network.key,
      sourceAsset: selectedAsset.assetId,
      requestedAmountMinor: amountMinor,
      requestedCurrency: currency,
    };
  }, [amountMinor, currency, invoiceNumber, payable, selectedAsset, selectedConnection.address, selectedWalletMatches]);

  async function createMockQuote() {
    if (!selectedAsset) return;
    setBusy(true); setFlowError("");
    try {
      const response = await fetch(`/api/pay/${encodeURIComponent(shareToken)}/mock-attempt`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), sourceAssetId: selectedAsset.assetId, sourceNetwork: selectedAsset.network.key }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.attempt) throw new Error("A simulated attempt could not be created.");
      setAttempt(payload.attempt);
    } catch (error) { setFlowError(error instanceof Error ? error.message : "The simulation is unavailable."); }
    finally { setBusy(false); }
  }

  async function advanceMock(status: string) {
    if (!attempt) return;
    setBusy(true); setFlowError("");
    try {
      const response = await fetch(`/api/pay/${encodeURIComponent(shareToken)}/mock-attempt/${attempt.id}`, {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.attempt) throw new Error("The simulated status transition was rejected.");
      setAttempt(payload.attempt);
    } catch (error) { setFlowError(error instanceof Error ? error.message : "The simulation is unavailable."); }
    finally { setBusy(false); }
  }

  const mockStage = attempt?.status ?? "idle";

  return (
    <section className="invoice-wallet-checkout" aria-labelledby="invoice-wallet-title">
      <div className="wallet-section-heading">
        <div><p className="wallet-eyebrow">WALLET PREVIEW</p><h2 id="invoice-wallet-title">Choose a wallet and asset</h2></div>
        <span className="wallet-phase-label">No funds move</span>
      </div>
      {!payable ? (
        <p className="wallet-blocked" role="status">
          {status === "paid" ? "This invoice is already paid." : status === "cancelled" ? "This invoice was cancelled and cannot enter payment setup." : "This invoice is not available for payment setup."}
        </p>
      ) : (
        <>
          <div className="wallet-asset-control">
            <label htmlFor="wallet-asset">Listed source asset and network</label>
            <p className="wallet-description">A token listing does not confirm that a payment route is available.</p>
            {loadingAssets ? <p className="wallet-description" role="status">Loading current 1Click assets…</p> : assetError ? (
              <div className="wallet-asset-error" role="alert">
                <p>Supported assets are temporarily unavailable.</p>
                <button type="button" className="wallet-text-button" onClick={() => void loadAssets()}>Try again</button>
              </div>
            ) : assets.length ? (
              <select id="wallet-asset" value={selectedAssetId} disabled={Boolean(attempt)} onChange={(event) => setSelectedAssetId(event.target.value)}>
                <option value="" disabled>Select an asset</option>
                {assets.map((asset) => <option key={asset.assetId} value={asset.assetId}>{assetOptionLabel(asset)}</option>)}
              </select>
            ) : <p className="wallet-description">No listed assets are currently available for the wallet networks configured here.</p>}
            {selectedAsset && <p className="wallet-asset-detail"><AssetLabel asset={selectedAsset} /> · {selectedAsset.decimals} decimal places</p>}
          </div>

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

          <div className="wallet-preparation" aria-live="polite">
            <p className="wallet-eyebrow">MOCK PAYMENT DEMONSTRATION</p>
            <h3>{mockStage === "idle" ? (preparation ? "Wallet details ready" : "Connect a wallet to continue") : mockStage === "MOCK_QUOTE_READY" ? "Simulated quote ready" : mockStage === "PENDING_DEPOSIT" ? "Simulated customer confirmation" : mockStage === "KNOWN_DEPOSIT_TX" ? "Simulated deposit submitted" : mockStage === "PROCESSING" ? "Simulated payment processing" : `Simulated ${mockStage.toLowerCase().replaceAll("_", " ")}`}</h3>
            <dl>
              <div><dt>Invoice reference</dt><dd>{invoiceNumber}</dd></div>
              <div><dt>Invoice amount</dt><dd>{formatMoney(amountMinor, currency)}</dd></div>
              <div><dt>Selected source</dt><dd>{selectedAsset ? <AssetLabel asset={selectedAsset} /> : "Choose a supported asset"}</dd></div>
              <div><dt>Wallet address</dt><dd>{preparation ? <span title={preparation.walletAddress}>{shortAddress(preparation.walletAddress)}</span> : "Not connected to the selected network"}</dd></div>
              <div><dt>Mock destination</dt><dd>USDC · Base (provisional demonstration)</dd></div>
            </dl>
            <p className="wallet-notice">
              Simulation only. The Base USDC route, quote, amount received, fees, exchange rate, recipient compatibility, and wallet execution have not been verified. This demonstration does not call 1Click, request a transaction signature, move funds, or mark the invoice paid.
            </p>
            {mockStage === "idle" && <button type="button" className="wallet-primary-button" disabled={!selectedAsset || busy} onClick={() => void createMockQuote()}>{busy ? "Creating simulation…" : "Generate simulated quote"}</button>}
            {mockStage === "MOCK_QUOTE_READY" && <div><p className="wallet-description">Mock quote has no estimated receive amount, fees, rate, expiry, or executable deposit address.</p><button type="button" className="wallet-primary-button" disabled={busy} onClick={() => void advanceMock("PENDING_DEPOSIT")}>Confirm simulated quote</button><button type="button" className="wallet-secondary-button" disabled={busy} onClick={() => void advanceMock("QUOTE_EXPIRED")}>Simulate quote expiry</button></div>}
            {mockStage === "PENDING_DEPOSIT" && <div><p className="wallet-description">Simulated customer confirmation recorded. No wallet authorization occurred.</p><button type="button" className="wallet-primary-button" disabled={busy} onClick={() => void advanceMock("KNOWN_DEPOSIT_TX")}>Simulate deposit submitted</button><button type="button" className="wallet-secondary-button" disabled={busy} onClick={() => void advanceMock("FAILED")}>Simulate failure</button></div>}
            {mockStage === "KNOWN_DEPOSIT_TX" && <div><p className="wallet-description" role="status">Simulated execution only. This is not a blockchain payment or settlement.</p><button type="button" className="wallet-primary-button" disabled={busy} onClick={() => void advanceMock("PROCESSING")}>Simulate processing</button><button type="button" className="wallet-secondary-button" disabled={busy} onClick={() => void advanceMock("INCOMPLETE_DEPOSIT")}>Simulate incomplete deposit</button></div>}
            {mockStage === "PROCESSING" && <div><p className="wallet-description" role="status">Simulated execution only. This is not a blockchain payment or settlement.</p><button type="button" className="wallet-primary-button" disabled={busy} onClick={() => void advanceMock("SUCCESS")}>Simulate success</button><button type="button" className="wallet-secondary-button" disabled={busy} onClick={() => void advanceMock("REFUNDED")}>Simulate refund</button></div>}
            {["SUCCESS", "FAILED", "REFUNDED", "INCOMPLETE_DEPOSIT", "QUOTE_EXPIRED"].includes(mockStage) && <p className="wallet-error" role="status">Simulated terminal state recorded. Invoice status is unchanged; this is not verified settlement.</p>}
            {flowError && <p className="wallet-error" role="alert">{flowError}</p>}
          </div>
          {liveQuotesEnabled && <LivePaymentFlow token={shareToken} invoiceNumber={invoiceNumber} amountMinor={amountMinor} currency={currency} asset={selectedAsset} walletAddress={selectedConnection.address} walletNetwork={selectedConnection.network?.key ?? null} />}
        </>
      )}
    </section>
  );
}

export function InvoiceWalletCheckout(props: InvoiceWalletCheckoutProps) {
  return <WalletProviders><InvoiceWalletCheckoutContent {...props} /></WalletProviders>;
}
