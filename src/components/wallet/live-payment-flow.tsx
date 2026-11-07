"use client";

import { useState } from "react";
import { encodeFunctionData, formatUnits, isAddress } from "viem";
import { useSendTransaction } from "wagmi";
import type { WalletAsset } from "@/lib/wallet/types";
import { formatMoney } from "@/lib/invoices";

type PreviewQuote = {
  source: { assetId: string; symbol: string; blockchain: string; decimals: number };
  quote: {
    quote: {
      amountIn: string; amountInFormatted: string; amountInUsd: string; amountOutFormatted: string; amountOutUsd: string;
      minAmountOut: string; timeEstimate: number; deadline?: string; refundFee?: string; withdrawFee?: string;
      depositAddress?: string; depositMemo?: string;
    };
  };
  invoice: { number: string; amountMinor: number; currency: string };
  destination: { assetId: string; symbol: string; blockchain: string; decimals: number; recipient: string };
};
type PaymentAttempt = { id: string; status: string; deposit_address: string; deposit_memo: string | null; quote_expires_at: string; transaction_hash: string | null };

const ERC20_TRANSFER = [{ type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "value", type: "uint256" }], outputs: [{ type: "bool" }] }] as const;

export function LivePaymentFlow({ token, invoiceNumber, amountMinor, currency, asset, walletAddress, walletNetwork }: {
  token: string;
  invoiceNumber: string;
  amountMinor: number;
  currency: string;
  asset: WalletAsset | null;
  walletAddress: string | null;
  walletNetwork: string | null;
}) {
  const { sendTransactionAsync, isPending } = useSendTransaction();
  const [preview, setPreview] = useState<PreviewQuote | null>(null);
  const [attempt, setAttempt] = useState<PaymentAttempt | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [previewRefundAddress, setPreviewRefundAddress] = useState("");
  const [statusText, setStatusText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [authorizationUncertain, setAuthorizationUncertain] = useState(false);

  async function requestPreview() {
    if (!asset || asset.network.family !== "evm" || !asset.network.chainId || !walletAddress || walletNetwork !== asset.network.key) return;
    setBusy(true); setError(""); setStatusText(""); setAttempt(null);
    try {
      const response = await fetch(`/api/pay/${encodeURIComponent(token)}/quote`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceAssetId: asset.assetId, refundAddress: walletAddress, commit: false }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "A quote could not be retrieved.");
      setPreview(result as PreviewQuote);
      setIdempotencyKey(crypto.randomUUID());
      setPreviewRefundAddress(walletAddress);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Quote unavailable."); }
    finally { setBusy(false); }
  }

  async function createCommittedQuote() {
    if (!asset || !walletAddress || walletAddress !== previewRefundAddress || walletNetwork !== asset.network.key || !idempotencyKey || !preview) {
      setError("Wallet or network changed. Request and review a new quote."); return;
    }
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/pay/${encodeURIComponent(token)}/quote`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceAssetId: asset.assetId, refundAddress: previewRefundAddress, idempotencyKey, commit: true }),
      });
      const result = await response.json();
      if (!response.ok || !result.attempt) throw new Error(result.error ?? "Executable quote unavailable.");
      setAttempt(result.attempt as PaymentAttempt);
      setPreview(result as PreviewQuote);
      setStatusText("Committed quote created. Review the final amounts, fee fields, expiry, and recipient before authorizing the wallet transaction.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Committed quote unavailable."); }
    finally { setBusy(false); }
  }

  async function authorizeDeposit() {
    if (!asset || asset.network.family !== "evm" || !asset.network.chainId || !walletAddress || !attempt || !preview) return;
    if (walletAddress !== previewRefundAddress) { setError("Connected wallet changed. Do not authorize this quote; request a new one."); return; }
    if (walletNetwork !== asset.network.key) { setError("Switch to the selected source network and review the quote again."); return; }
    if (attempt.deposit_memo) { setError("This deposit requires a memo. This wallet flow does not support memo deposits."); return; }
    if (Date.parse(attempt.quote_expires_at) <= Date.now()) { setError("This committed quote has expired. Request a new quote and review it again."); setAttempt(null); return; }
    setBusy(true); setError("");
    try {
      if (preview.source.assetId !== asset.assetId) { setError("The selected source asset changed. Request and review a new quote."); return; }
      const amount = BigInt(preview.quote.quote.amountIn);
      if (asset.contractAddress) {
        if (!isAddress(asset.contractAddress)) { setError("The listed source token contract is not a valid EVM address."); return; }
        const data = encodeFunctionData({ abi: ERC20_TRANSFER, functionName: "transfer", args: [attempt.deposit_address as `0x${string}`, amount] });
        const hash = await sendTransactionAsync({ chainId: asset.network.chainId, to: asset.contractAddress as `0x${string}`, data, value: 0n });
        await reportDeposit(hash);
      } else {
        const hash = await sendTransactionAsync({ chainId: asset.network.chainId, to: attempt.deposit_address as `0x${string}`, value: amount });
        await reportDeposit(hash);
      }
    } catch (cause) {
      const rejected = cause instanceof Error && /reject|denied|user refused/i.test(cause.message);
      if (rejected) {
        try {
          await closeAttempt("FAILED");
          setError("Wallet transaction was rejected. No deposit was submitted; the attempt is preserved as failed.");
        } catch {
          setError("Wallet transaction was rejected and no deposit was submitted, but NODUS could not update the attempt. The quote remains active until expiry.");
        }
      } else {
        setAuthorizationUncertain(true);
        setError("Wallet response was unclear. Do not retry this transaction. Check 1Click status or wait for the quote to expire.");
      }
    } finally { setBusy(false); }
  }

  async function reportDeposit(hash: string) {
    setAttempt({ ...attempt!, transaction_hash: hash });
    const response = await fetch(`/api/pay/${encodeURIComponent(token)}/attempt/${attempt!.id}/deposit`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ txHash: hash }),
    });
    if (!response.ok) { setError("Wallet returned a transaction hash, but 1Click notification failed. Do not resend funds; check execution status."); return; }
    setStatusText("Deposit transaction submitted to 1Click. This is not confirmation of settlement.");
  }

  async function refreshStatus() {
    if (!attempt) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/pay/${encodeURIComponent(token)}/attempt/${attempt.id}/status`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Execution status unavailable.");
      setAttempt(result.attempt as PaymentAttempt);
      const outcome = result.settlement?.outcome as string | undefined;
      if (outcome === "VERIFIED") setStatusText(`Settlement independently verified. Receipt ${result.settlement.receiptNumber ?? "issued"}; invoice status: ${result.settlement.invoiceStatus}.`);
      else if (outcome === "PARTIAL") setStatusText("Settlement independently verified as a partial payment. The invoice remains open; no receipt represents a full payment.");
      else if (outcome === "OVERPAID") setStatusText("Settlement independently verified, but the received amount exceeds the invoice. Business review is required; the invoice was not marked paid.");
      else if (outcome === "REVIEW_REQUIRED") setStatusText(`Destination transfer verified, but invoice reconciliation needs business review. The invoice remains ${result.settlement.invoiceStatus ?? "unchanged"}.`);
      else if (outcome === "REFUNDED" || outcome === "FAILED" || outcome === "INCOMPLETE_DEPOSIT" || outcome === "EXPIRED") setStatusText(`Payment attempt ended: ${outcome.toLowerCase().replaceAll("_", " ")}. The invoice was not marked paid.`);
      else setStatusText(`1Click execution status: ${result.execution.status}. This status alone does not mean the invoice has been paid.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Execution status unavailable."); }
    finally { setBusy(false); }
  }

  async function closeAttempt(status: "FAILED" | "QUOTE_EXPIRED") {
    if (!attempt) return false;
    const response = await fetch(`/api/pay/${encodeURIComponent(token)}/attempt/${attempt.id}/status`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }),
    });
    const result = await response.json();
    if (!response.ok || !result.attempt) throw new Error("The attempt could not be closed safely.");
    setAttempt(result.attempt as PaymentAttempt);
    return true;
  }

  async function replaceExpiredQuote() {
    setBusy(true); setError("");
    try {
      await closeAttempt("QUOTE_EXPIRED");
      setAttempt(null); setPreview(null); setIdempotencyKey(""); setAuthorizationUncertain(false);
      setStatusText("Previous quote expired. Request and review a new quote before proceeding.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The expired quote could not be closed."); }
    finally { setBusy(false); }
  }

  const apiQuote = preview?.quote.quote;
  const canUseEvmWallet = Boolean(asset?.network.family === "evm" && walletAddress && walletNetwork === asset.network.key);
  const quoteExpired = Boolean(attempt && Date.parse(attempt.quote_expires_at) <= Date.now());
  return <section className="wallet-preparation" aria-labelledby="live-payment-title">
    <p className="wallet-eyebrow">LIVE 1CLICK PAYMENT</p>
    <h3 id="live-payment-title">Live mode is guarded</h3>
    <p className="wallet-notice">This path appears only when server credentials and an exact verified destination asset are configured. A quote is not a payment. Wallet authorization is a separate action. Your wallet may show a separate network transaction fee before signing.</p>
    {asset?.network.family === "solana" && <p className="wallet-blocked" role="status">Solana source deposits are unavailable until the transaction signing path is implemented and reviewed.</p>}
    {!preview && <button type="button" className="wallet-primary-button" disabled={!canUseEvmWallet || busy || isPending} onClick={() => void requestPreview()}>{busy ? "Requesting quote…" : "Request live dry-run quote"}</button>}
    {preview && apiQuote && <dl>
      <div><dt>Invoice</dt><dd>{invoiceNumber} · {formatMoney(amountMinor, currency)}</dd></div>
      <div><dt>Source</dt><dd>{preview.source.symbol} on {preview.source.blockchain}</dd></div>
      <div><dt>Amount to send</dt><dd>{apiQuote.amountInFormatted} ({preview.source.symbol})</dd></div>
      <div><dt>Destination</dt><dd>{preview.destination.symbol} on {preview.destination.blockchain}</dd></div>
      <div><dt>Recipient</dt><dd className="wallet-address">{preview.destination.recipient}</dd></div>
      <div><dt>Expected received</dt><dd>{apiQuote.amountOutFormatted}</dd></div>
      <div><dt>Minimum received</dt><dd>{formatUnits(BigInt(apiQuote.minAmountOut), preview.destination.decimals)} {preview.destination.symbol}</dd></div>
      <div><dt>Source value</dt><dd>${apiQuote.amountInUsd}</dd></div>
      <div><dt>Destination value</dt><dd>${apiQuote.amountOutUsd}</dd></div>
      <div><dt>Refund fee</dt><dd>{apiQuote.refundFee ?? "Not separately itemized"}</dd></div>
      <div><dt>Withdrawal fee</dt><dd>{apiQuote.withdrawFee ?? "Not separately itemized (may be included in received amount)"}</dd></div>
      <div><dt>Slippage limit</dt><dd>1% (100 bps)</dd></div>
      <div><dt>Quote expiry</dt><dd>{attempt ? new Date(attempt.quote_expires_at).toLocaleString() : "Dry-run quotes do not create a deposit deadline"}</dd></div>
      <div><dt>Exchange rate</dt><dd>Not returned as a separate field by 1Click</dd></div>
    </dl>}
    {preview && !attempt && <button type="button" className="wallet-primary-button" disabled={busy} onClick={() => void createCommittedQuote()}>Confirm quote and request deposit address</button>}
    {attempt && <div>
      <p className="wallet-notice">Review the committed quote above. No funds move until you explicitly authorize the wallet transaction.</p>
      <p><strong>Deposit address:</strong> <span className="wallet-address">{attempt.deposit_address}</span></p>
      {attempt.deposit_memo && <p><strong>Required memo:</strong> {attempt.deposit_memo}</p>}
      {!attempt.transaction_hash && !quoteExpired && attempt.status === "PENDING_DEPOSIT" && <button type="button" className="wallet-primary-button" disabled={busy || isPending || !canUseEvmWallet || authorizationUncertain} onClick={() => void authorizeDeposit()}>{isPending ? "Waiting for wallet approval…" : "Authorize deposit in wallet"}</button>}
      <button type="button" className="wallet-secondary-button" disabled={busy} onClick={() => void refreshStatus()}>Check 1Click execution status</button>
      {!attempt.transaction_hash && !quoteExpired && attempt.status === "PENDING_DEPOSIT" && <button type="button" className="wallet-secondary-button" disabled={busy} onClick={() => void closeAttempt("FAILED").then(() => setStatusText("Quote cancelled. No wallet transaction was authorized; the attempt remains recorded." )).catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to cancel the quote."))}>Cancel quote</button>}
      {quoteExpired && !attempt.transaction_hash && <button type="button" className="wallet-primary-button" disabled={busy} onClick={() => void replaceExpiredQuote()}>Request a new quote</button>}
      {["FAILED", "QUOTE_EXPIRED", "REFUNDED", "INCOMPLETE_DEPOSIT"].includes(attempt.status) && <button type="button" className="wallet-primary-button" disabled={busy} onClick={() => { setAttempt(null); setPreview(null); setIdempotencyKey(""); setAuthorizationUncertain(false); }}>Start a new payment attempt</button>}
    </div>}
    {statusText && <p role="status" className="wallet-description">{statusText}</p>}
    {error && <p role="alert" className="wallet-error">{error}</p>}
  </section>;
}
