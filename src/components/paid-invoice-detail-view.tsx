"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import InvoicePrintButton from "@/components/invoice-print-button";
import { formatMoney, formatUtcDate } from "@/lib/invoices";
import { getWalletNetwork } from "@/lib/wallet/networks";

export type LineItem = {
  description?: string;
  quantity?: number;
  unitPriceMinor?: number;
  lineTotalMinor?: number;
};

export type PaidInvoiceProps = {
  invoice: {
    id: string;
    invoice_number: string;
    amount_minor: number;
    currency: string;
    issue_date: string;
    due_date?: string | null;
    created_at: string;
    updated_at: string;
    customer_name?: string | null;
    customer_email?: string | null;
    description?: string | null;
    line_items?: unknown;
    subtotal_minor?: number | null;
    tax_rate_bps?: number | null;
    discount_minor?: number | null;
    seller_snapshot?: unknown;
    invoice_footer?: string | null;
    near_registration_status?: string | null;
    near_registration_transaction_hash?: string | null;
    near_registration_failure_reason?: string | null;
  };
  seller: {
    business_name: string;
    logo_url?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    website?: string | null;
    tax_id?: string | null;
    invoice_footer?: string | null;
    receiving_address?: string | null;
  };
  primaryReceipt?: {
    id: string;
    receipt_number: string;
    issued_at: string;
    payment_attempt_id?: string | null;
    payment_settlement_id?: string | null;
  } | null;
  primarySettlement?: {
    id: string;
    payment_attempt_id: string;
    outcome: string;
    destination_asset_id: string | null;
    destination_network: string | null;
    recipient_address: string | null;
    received_amount_base_units: string | null;
    received_asset_decimals: number | null;
    destination_tx_hashes: unknown;
    evidence: unknown;
    created_at: string;
  } | null;
  primaryAttempt?: {
    id: string;
    source_asset_id: string;
    source_network: string;
    destination_asset_id: string;
    destination_network: string;
    transaction_hash: string | null;
    requested_amount: string | null;
    expected_received_amount: string | null;
    deposit_address: string | null;
    mode: "mock" | "live";
    status: string;
    quote_snapshot?: unknown;
    created_at: string;
    updated_at: string;
  } | null;
  primaryNearEntry?: {
    id: string;
    status: "pending" | "processing" | "retrying" | "submitted" | "blocked";
    near_transaction_hash: string | null;
    last_error_code: string | null;
    submitted_at: string | null;
    created_at: string;
    attempt_count: number;
  } | null;
  nearSettlementEligibility?: "eligible" | "not_applicable" | "unsupported" | "unknown";
  nearOutboxError?: boolean;
  nearInvoiceRegistration?: {
    id: string;
    status: string;
    attempt_count: number;
    near_transaction_hash?: string | null;
    failure_reason?: string | null;
    registered_at?: string | null;
  } | null;
  receipts?: Array<{
    id: string;
    receipt_number: string;
    issued_at: string;
    payment_attempt_id: string;
    payment_settlement_id: string;
  }> | null;
  settlements?: Array<{
    id: string;
    payment_attempt_id: string;
    outcome: string;
    destination_asset_id: string | null;
    destination_network: string | null;
    received_amount_base_units: string | null;
    received_asset_decimals: number | null;
    destination_tx_hashes: unknown;
  }> | null;
};

function formatUtcDateTime(dateString?: string | null): string {
  if (!dateString) return "Unavailable";
  try {
    return (
      new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }).format(new Date(dateString)) + " UTC"
    );
  } catch {
    return dateString;
  }
}

function formatBaseUnits(amount: string | null | undefined, decimals: number | null | undefined): string {
  if (
    !amount ||
    !/^\d+$/.test(amount) ||
    !Number.isInteger(decimals) ||
    decimals === null ||
    decimals === undefined ||
    decimals < 0 ||
    decimals > 30
  ) {
    return "";
  }
  if (decimals === 0) return amount;
  const padded = amount.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

function formatNetworkLabel(networkKey: string | null | undefined): string {
  if (!networkKey) return "Arbitrum Sepolia";
  const known = getWalletNetwork(networkKey);
  if (known) return known.label;
  const lower = networkKey.trim().toLowerCase();
  if (lower.includes("arbitrum")) return "Arbitrum Sepolia";
  if (lower.includes("base")) return "Base Sepolia";
  if (lower.includes("optimism") || lower.includes("op")) return "Optimism Sepolia";
  if (lower.includes("arc")) return "Arc Testnet";
  if (lower.includes("ethereum") || lower.includes("sepolia")) return "Ethereum Sepolia";
  return networkKey;
}

function explorerTxUrl(networkKey: string | null | undefined, txHash: string): string | null {
  if (!networkKey || !txHash) return null;
  const explorers: Record<string, string> = {
    "base-sepolia": "https://sepolia.basescan.org/tx/",
    "arbitrum-sepolia": "https://sepolia.arbiscan.io/tx/",
    "sepolia": "https://sepolia.etherscan.io/tx/",
    "optimism-sepolia": "https://sepolia-optimism.etherscan.io/tx/",
    "arc-testnet": "https://testnet.arcscan.app/tx/",
    "base": "https://basescan.org/tx/",
    "arbitrum": "https://arbiscan.io/tx/",
    "ethereum": "https://etherscan.io/tx/",
    "optimism": "https://optimistic.etherscan.io/tx/",
    "polygon": "https://polygonscan.com/tx/",
    "avalanche": "https://snowtrace.io/tx/",
    "bsc": "https://bscscan.com/tx/",
  };
  const base = explorers[networkKey.toLowerCase()];
  return base ? `${base}${txHash}` : null;
}

function shortHash(hash: string): string {
  if (!hash) return "";
  return hash.length > 18 ? `${hash.slice(0, 10)}…${hash.slice(-8)}` : hash;
}

export function PaidInvoiceDetailView({
  invoice,
  seller,
  primaryReceipt,
  primarySettlement,
  primaryAttempt,
  primaryNearEntry,
  nearSettlementEligibility = "unknown",
  nearOutboxError,
  nearInvoiceRegistration,
  receipts,
  settlements,
}: PaidInvoiceProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyToClipboard = async (text: string, key: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 2000);
      }
    } catch {
      // fallback
    }
  };

  // 1. Resolve amounts
  const destinationAsset = primarySettlement?.destination_asset_id ?? "USDC";
  const destinationNetwork = primarySettlement?.destination_network ?? primaryAttempt?.destination_network ?? "arbitrum-sepolia";
  const destinationNetworkLabel = formatNetworkLabel(destinationNetwork);

  const baseUnitsFormatted = formatBaseUnits(
    primarySettlement?.received_amount_base_units,
    primarySettlement?.received_asset_decimals
  );

  const receivedDisplayAmount = baseUnitsFormatted
    ? `${baseUnitsFormatted} ${destinationAsset}`
    : formatMoney(invoice.amount_minor, invoice.currency);

  const receiptNumber =
    primaryReceipt?.receipt_number ?? `RCP-${invoice.invoice_number.replace(/^NOD-|^INV-/i, "")}`;

  const paymentDate =
    primaryReceipt?.issued_at ?? primarySettlement?.created_at ?? invoice.updated_at;

  const paymentMode =
    primaryAttempt?.mode === "mock" ? "Mock / Demo" : primaryAttempt?.mode === "live" ? "Live" : "Live";

  // Validate transaction hashes
  const destinationHashes = useMemo(() => {
    if (Array.isArray(primarySettlement?.destination_tx_hashes)) {
      return primarySettlement.destination_tx_hashes.filter(
        (h): h is string => typeof h === "string" && /^0x[0-9a-fA-F]{64}$/.test(h)
      );
    }
    return [];
  }, [primarySettlement?.destination_tx_hashes]);

  const sourceTxHash =
    primaryAttempt?.transaction_hash && /^0x[0-9a-fA-F]{64}$/.test(primaryAttempt.transaction_hash)
      ? primaryAttempt.transaction_hash
      : null;

  // Calculate Circle fees: requested - expected
  const circleFee = useMemo(() => {
    if (primaryAttempt?.requested_amount && primaryAttempt?.expected_received_amount) {
      try {
        const req = parseFloat(primaryAttempt.requested_amount);
        const exp = parseFloat(primaryAttempt.expected_received_amount);
        const diff = req - exp;
        return diff >= 0 ? diff.toFixed(6) : "0";
      } catch {
        return null;
      }
    }
    return null;
  }, [primaryAttempt?.requested_amount, primaryAttempt?.expected_received_amount]);

  const thankYouMessage = (seller.invoice_footer && seller.invoice_footer.trim().length > 0)
    ? seller.invoice_footer.trim()
    : (invoice.invoice_footer || "Thank you for your business.");

  return (
    <div className="paid-invoice-view-wrapper narrow-content">
      {/* ─────────────────────────────────────────────────────────────
          1. MAIN PAID INVOICE VIEW (TOP HERO)
          ───────────────────────────────────────────────────────────── */}
      <div className="paid-invoice-hero-card">
        <div className="paid-invoice-hero-top">
          <div className="paid-invoice-header-meta">
            <Link className="back-link paid-invoice-back" href="/dashboard/invoices">
              ← Back to invoices
            </Link>
            <div className="paid-invoice-title-row">
              <span className="eyebrow">PAID INVOICE</span>
              <h1 className="paid-invoice-number">#{invoice.invoice_number}</h1>
            </div>
          </div>
          <div className="paid-invoice-hero-actions">
            <span className="status status-paid paid-badge-prominent">
              <span className="paid-badge-dot" aria-hidden="true" />
              Paid
            </span>
            <InvoicePrintButton />
          </div>
        </div>

        {/* Prominent Received Amount with visual hierarchy */}
        <div className="paid-invoice-amount-box">
          <span className="paid-amount-label">AMOUNT RECEIVED</span>
          <div className="paid-amount-figure">{receivedDisplayAmount}</div>
          <div className="paid-amount-badge">
            Settled via {destinationAsset} on {destinationNetworkLabel}
          </div>
        </div>

        {/* Short Payment Verification Confirmation */}
        <div className="paid-verification-banner" role="status">
          <div className="paid-verification-icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div className="paid-verification-text">
            <strong>Payment Verified On-Chain</strong>
            <span>
              Destination settlement independently confirmed on {destinationNetworkLabel}. Funds verified in merchant recipient wallet.
            </span>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          2. INVOICE DETAILS
          ───────────────────────────────────────────────────────────── */}
      <section className="paid-invoice-card" aria-labelledby="invoice-details-title">
        <div className="paid-card-header">
          <div>
            <p className="eyebrow">INVOICE DETAILS</p>
            <h2 id="invoice-details-title" className="paid-card-title">Invoice summary &amp; items</h2>
          </div>
          <span className="paid-invoice-code">#{invoice.invoice_number}</span>
        </div>

        {/* Customer & Business Info */}
        <div className="paid-party-grid">
          <div className="paid-party-col">
            <span className="paid-meta-heading">BILLED BY</span>
            <strong className="paid-party-name">{seller.business_name}</strong>
            {seller.address && <p className="paid-party-sub">{seller.address}</p>}
            {seller.phone && <p className="paid-party-sub">{seller.phone}</p>}
            {seller.email && <p className="paid-party-sub">{seller.email}</p>}
            {seller.website && <p className="paid-party-sub">{seller.website}</p>}
            {seller.tax_id && <p className="paid-party-sub">Tax ID: {seller.tax_id}</p>}
          </div>

          <div className="paid-party-col">
            <span className="paid-meta-heading">BILLED TO</span>
            <strong className="paid-party-name">
              {invoice.customer_name || "Customer"}
            </strong>
            <p className="paid-party-sub">
              {invoice.customer_email || "Direct checkout payer"}
            </p>
            <div className="paid-dates-block">
              <div>
                <span className="paid-date-label">Issue date</span>
                <span className="paid-date-val">{formatUtcDate(invoice.issue_date)}</span>
              </div>
              <div>
                <span className="paid-date-label">Due date</span>
                <span className="paid-date-val">{invoice.due_date ? formatUtcDate(invoice.due_date) : "Not set"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Purchased Items & Quantities */}
        <div className="paid-items-section">
          <span className="paid-meta-heading">PURCHASED ITEMS</span>
          {Array.isArray(invoice.line_items) && invoice.line_items.length > 0 ? (
            <div className="paid-items-table">
              <div className="paid-table-head">
                <span>Description</span>
                <span style={{ textAlign: "center" }}>Qty &amp; Price</span>
                <span style={{ textAlign: "right" }}>Total</span>
              </div>
              {(invoice.line_items as LineItem[]).map((item, idx) => (
                <div key={idx} className="paid-table-row">
                  <span className="paid-item-name">{item.description}</span>
                  <span className="paid-item-qty">
                    {item.quantity} × {formatMoney(item.unitPriceMinor ?? 0, invoice.currency)}
                  </span>
                  <span className="paid-item-total">
                    {formatMoney(item.lineTotalMinor ?? 0, invoice.currency)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="paid-description-box">
              <p>{invoice.description || "Invoice items"}</p>
            </div>
          )}
        </div>

        {/* Financial Subtotals & Final Amount */}
        <div className="paid-financials-card">
          <div className="paid-fin-row">
            <span>Subtotal</span>
            <span>{formatMoney(invoice.subtotal_minor ?? invoice.amount_minor, invoice.currency)}</span>
          </div>
          {(invoice.tax_rate_bps ?? 0) > 0 && (
            <div className="paid-fin-row">
              <span>Tax ({((invoice.tax_rate_bps ?? 0) / 100).toFixed(2)}%)</span>
              <span>
                {formatMoney(
                  Math.round(((invoice.subtotal_minor ?? invoice.amount_minor) * (invoice.tax_rate_bps ?? 0)) / 10000),
                  invoice.currency
                )}
              </span>
            </div>
          )}
          {(invoice.discount_minor ?? 0) > 0 && (
            <div className="paid-fin-row paid-discount-row">
              <span>Discount</span>
              <span>−{formatMoney(invoice.discount_minor ?? 0, invoice.currency)}</span>
            </div>
          )}
          <div className="paid-fin-row paid-fin-total">
            <span>Final invoice amount</span>
            <strong className="paid-total-value">{formatMoney(invoice.amount_minor, invoice.currency)}</strong>
          </div>
        </div>

        {/* Cursive Thank You Footer */}
        <footer className="paid-invoice-footer">
          <p className="invoice-thank-you paid-thank-you-script">{thankYouMessage}</p>
          <span className="paid-powered-caption">Powered by nodus.</span>
        </footer>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          3. PAYMENT SUMMARY (Clean, Separate Section)
          ───────────────────────────────────────────────────────────── */}
      <section className="paid-invoice-card" aria-labelledby="payment-summary-title">
        <div className="paid-card-header">
          <div>
            <p className="eyebrow">CONFIRMED SETTLEMENT</p>
            <h2 id="payment-summary-title" className="paid-card-title">Payment summary</h2>
          </div>
          <span className="status status-paid" style={{ fontSize: 11, padding: "5px 11px" }}>
            ✓ Verified / Paid
          </span>
        </div>

        <div className="paid-summary-grid">
          <div className="paid-summary-item">
            <span className="paid-summary-label">Receipt number</span>
            <div className="paid-summary-value-row">
              <code className="paid-mono-value">#{receiptNumber}</code>
              <button
                type="button"
                className="paid-copy-icon-btn"
                onClick={() => copyToClipboard(receiptNumber, "receipt")}
                title="Copy receipt number"
                aria-label="Copy receipt number"
              >
                {copiedKey === "receipt" ? (
                  <span className="paid-copied-badge">Copied</span>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div className="paid-summary-item">
            <span className="paid-summary-label">Amount paid</span>
            <strong className="paid-summary-bold">{formatMoney(invoice.amount_minor, invoice.currency)}</strong>
          </div>

          <div className="paid-summary-item">
            <span className="paid-summary-label">Merchant received amount</span>
            <strong className="paid-summary-bold" style={{ color: "#2d5a35" }}>
              {receivedDisplayAmount}
            </strong>
          </div>

          <div className="paid-summary-item">
            <span className="paid-summary-label">Destination asset &amp; network</span>
            <span className="paid-summary-regular">
              {destinationAsset} on {destinationNetworkLabel}
            </span>
          </div>

          <div className="paid-summary-item">
            <span className="paid-summary-label">Payment date/time</span>
            <span className="paid-summary-regular">{formatUtcDateTime(paymentDate)}</span>
          </div>

          <div className="paid-summary-item">
            <span className="paid-summary-label">Payment mode</span>
            <div className="paid-mode-container">
              <span className={`paid-mode-pill ${paymentMode === "Live" ? "is-live" : "is-mock"}`}>
                {paymentMode}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────
          4. NEAR RECONCILIATION (Separate Distinct Section)
          ───────────────────────────────────────────────────────────── */}
      <section className="paid-invoice-card" aria-labelledby="near-reconciliation-title">
        <div className="paid-card-header">
          <div>
            <p className="eyebrow" style={{ color: "#475569" }}>AUDIT TRAIL</p>
            <h2 id="near-reconciliation-title" className="paid-card-title">NEAR reconciliation</h2>
          </div>
          <span className="paid-reconciliation-badge">NEAR Protocol</span>
        </div>

        <p className="paid-reconciliation-disclaimer">
          Decentralized audit trail recorded on NEAR Protocol. Settlement on EVM destination chain is verified independently.
        </p>

        <div className="paid-near-status-box">
          {nearOutboxError ? (
            <div className="near-status-pill is-error">
              <span>NEAR reconciliation status is temporarily unavailable.</span>
            </div>
          ) : !primaryNearEntry ? (
            <div className="near-status-pill is-pending">
              <span className="near-dot is-neutral" />
              <span>
                {nearSettlementEligibility === "not_applicable"
                  ? "NEAR settlement recording is not applicable to this direct or same-chain payment."
                  : nearSettlementEligibility === "eligible"
                    ? "NEAR reconciliation outbox job is missing for this eligible payment. The EVM payment remains verified."
                    : nearSettlementEligibility === "unsupported"
                      ? "NEAR reconciliation is not configured for this payment route. The EVM payment is verified."
                      : "NEAR reconciliation status is not available for this payment. The EVM payment is verified."}
              </span>
            </div>
          ) : primaryNearEntry.status === "submitted" && primaryNearEntry.near_transaction_hash ? (
            <div className="near-status-pill is-success">
              <div className="near-status-header">
                <span className="near-dot is-active" />
                <strong>Reconciliation confirmed on NEAR</strong>
              </div>
              <div className="near-status-details">
                <span className="near-detail-label">NEAR Transaction:</span>
                <a
                  href={`https://nearblocks.io/txns/${primaryNearEntry.near_transaction_hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="near-tx-link font-mono-code"
                >
                  {shortHash(primaryNearEntry.near_transaction_hash)} ↗
                </a>
                {primaryNearEntry.submitted_at && (
                  <span className="near-timestamp">
                    · {formatUtcDateTime(primaryNearEntry.submitted_at)}
                  </span>
                )}
              </div>
            </div>
          ) : primaryNearEntry.status === "blocked" ? (
            <div className="near-status-pill is-error">
              <div className="near-status-header">
                <span className="near-dot is-blocked" />
                <strong>NEAR reconciliation blocked</strong>
              </div>
              <p className="near-error-text">
                Error: {primaryNearEntry.last_error_code ?? "Unknown error"}
              </p>
            </div>
          ) : primaryNearEntry.near_transaction_hash ? (
            <div className="near-status-pill is-processing">
              <div className="near-status-header">
                <span className="near-dot is-pulsing" />
                <strong>Submitted to NEAR; awaiting contract confirmation</strong>
              </div>
              <p className="near-processing-sub">
                Transaction: {shortHash(primaryNearEntry.near_transaction_hash)}. The outbox will retry contract readback without resubmitting this transaction.
              </p>
            </div>
          ) : primaryNearEntry.status === "submitted" ? (
            <div className="near-status-pill is-error">
              <div className="near-status-header">
                <span className="near-dot is-blocked" />
                <strong>NEAR confirmation evidence is incomplete</strong>
              </div>
              <p className="near-error-text">The outbox is marked submitted but has no transaction hash to verify.</p>
            </div>
          ) : (
            <div className="near-status-pill is-processing">
              <div className="near-status-header">
                <span className="near-dot is-pulsing" />
                <strong>
                  NEAR reconciliation {primaryNearEntry.status === "processing"
                    ? "in progress"
                    : primaryNearEntry.status === "retrying"
                      ? "retrying"
                      : "pending"}
                </strong>
              </div>
              <p className="near-processing-sub">
                Attempt {primaryNearEntry.attempt_count ?? 0}. EVM settlement verification is already complete and unaffected.
              </p>
            </div>
          )}
        </div>

        {/* NEAR Invoice Registration Outbox Link (if present) */}
        {nearInvoiceRegistration && invoice.near_registration_status === "registered" && invoice.near_registration_transaction_hash && (
          <div className="near-registration-subline">
            <span className="paid-summary-label">Invoice registration:</span>
            <a
              href={`https://nearblocks.io/txns/${invoice.near_registration_transaction_hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="near-tx-link font-mono-code"
            >
              Registered on NEAR ({shortHash(invoice.near_registration_transaction_hash)}) ↗
            </a>
          </div>
        )}
      </section>

      {/* ─────────────────────────────────────────────────────────────
          5. EXPANDABLE TECHNICAL DETAILS (Collapsed by Default)
          ───────────────────────────────────────────────────────────── */}
      <details className="paid-tech-details-accordion">
        <summary className="paid-tech-details-summary">
          <div className="paid-tech-summary-text">
            <span className="paid-tech-title">Technical payment details</span>
            <span className="paid-tech-subtitle">
              Source &amp; destination hashes, wallet addresses, Circle CCTP fees, and settlement evidence
            </span>
          </div>
          <span className="paid-tech-chevron" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        </summary>

        <div className="paid-tech-details-content">
          <dl className="paid-tech-grid">
            {/* Source Network & Asset */}
            <div className="paid-tech-row">
              <dt>Source asset</dt>
              <dd>
                <code className="paid-mono-value">
                  {primaryAttempt?.source_asset_id ?? "Unavailable"}
                </code>
              </dd>
            </div>

            <div className="paid-tech-row">
              <dt>Source network</dt>
              <dd>{formatNetworkLabel(primaryAttempt?.source_network) || "Unavailable"}</dd>
            </div>

            {/* Destination Network & Asset */}
            <div className="paid-tech-row">
              <dt>Destination asset</dt>
              <dd>
                <code className="paid-mono-value">
                  {primarySettlement?.destination_asset_id ?? "Unavailable"}
                </code>
              </dd>
            </div>

            <div className="paid-tech-row">
              <dt>Destination network</dt>
              <dd>{destinationNetworkLabel || "Unavailable"}</dd>
            </div>

            {/* Payer Debit */}
            <div className="paid-tech-row">
              <dt>Payer debit</dt>
              <dd>
                {primaryAttempt?.requested_amount ? (
                  <code className="paid-mono-value">
                    {primaryAttempt.requested_amount} ({primaryAttempt.source_asset_id ?? "asset"})
                  </code>
                ) : (
                  <span className="text-muted">Unavailable</span>
                )}
              </dd>
            </div>

            {/* Circle Fees */}
            <div className="paid-tech-row">
              <dt>Circle fees</dt>
              <dd>
                {circleFee !== null ? (
                  <code className="paid-mono-value">
                    {circleFee} ({primaryAttempt?.source_asset_id ?? "asset"})
                  </code>
                ) : (
                  <span className="text-muted">Unavailable</span>
                )}
              </dd>
            </div>

            {/* Payer Wallet Address */}
            <div className="paid-tech-row">
              <dt>Payer wallet address</dt>
              <dd>
                {primaryAttempt?.deposit_address ? (
                  <div className="paid-tech-address-cell">
                    <code className="paid-mono-value break-all">
                      {primaryAttempt.deposit_address}
                    </code>
                    <button
                      type="button"
                      className="paid-copy-icon-btn"
                      onClick={() => copyToClipboard(primaryAttempt!.deposit_address!, "payerAddr")}
                      title="Copy payer wallet address"
                      aria-label="Copy payer wallet address"
                    >
                      {copiedKey === "payerAddr" ? (
                        <span className="paid-copied-badge">Copied</span>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                      )}
                    </button>
                  </div>
                ) : (
                  <span className="text-muted">Unavailable</span>
                )}
              </dd>
            </div>

            {/* Merchant Wallet Address */}
            <div className="paid-tech-row">
              <dt>Merchant wallet address</dt>
              <dd>
                {primarySettlement?.recipient_address ?? seller.receiving_address ? (
                  <div className="paid-tech-address-cell">
                    <code className="paid-mono-value break-all">
                      {primarySettlement?.recipient_address ?? seller.receiving_address}
                    </code>
                    <button
                      type="button"
                      className="paid-copy-icon-btn"
                      onClick={() => copyToClipboard(primarySettlement?.recipient_address ?? seller.receiving_address!, "merchantAddr")}
                      title="Copy merchant wallet address"
                      aria-label="Copy merchant wallet address"
                    >
                      {copiedKey === "merchantAddr" ? (
                        <span className="paid-copied-badge">Copied</span>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                      )}
                    </button>
                  </div>
                ) : (
                  <span className="text-muted">Unavailable</span>
                )}
              </dd>
            </div>

            {/* Source Transaction Hash */}
            <div className="paid-tech-row">
              <dt>Source transaction</dt>
              <dd>
                {sourceTxHash ? (
                  (() => {
                    const url = explorerTxUrl(primaryAttempt?.source_network, sourceTxHash);
                    return url ? (
                      <a href={url} target="_blank" rel="noopener noreferrer" className="near-tx-link font-mono-code">
                        {shortHash(sourceTxHash)} ↗ Explorer
                      </a>
                    ) : (
                      <code className="paid-mono-value">{shortHash(sourceTxHash)}</code>
                    );
                  })()
                ) : (
                  <span className="text-muted">Unavailable</span>
                )}
              </dd>
            </div>

            {/* Destination Transaction Hash(es) */}
            <div className="paid-tech-row">
              <dt>Destination transaction</dt>
              <dd>
                {destinationHashes.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {destinationHashes.map((hash) => {
                      const url = explorerTxUrl(primarySettlement?.destination_network, hash);
                      return url ? (
                        <a key={hash} href={url} target="_blank" rel="noopener noreferrer" className="near-tx-link font-mono-code">
                          {shortHash(hash)} ↗ Explorer
                        </a>
                      ) : (
                        <code key={hash} className="paid-mono-value">{shortHash(hash)}</code>
                      );
                    })}
                  </div>
                ) : (
                  <span className="text-muted">Unavailable</span>
                )}
              </dd>
            </div>

            {/* Settlement Timestamp */}
            <div className="paid-tech-row">
              <dt>Settlement timestamp</dt>
              <dd>{formatUtcDateTime(primaryReceipt?.issued_at ?? primarySettlement?.created_at)}</dd>
            </div>

            {/* Settlement Outcome */}
            <div className="paid-tech-row">
              <dt>Settlement outcome</dt>
              <dd>
                <span style={{ textTransform: "capitalize" }}>
                  {primarySettlement?.outcome?.replaceAll("_", " ").toLowerCase() ?? "Confirmed"}
                </span>
              </dd>
            </div>

            {/* Attempt ID */}
            {primaryAttempt?.id && (
              <div className="paid-tech-row">
                <dt>Payment attempt ID</dt>
                <dd><code className="paid-mono-value">{primaryAttempt.id}</code></dd>
              </div>
            )}

            {/* Settlement ID */}
            {primarySettlement?.id && (
              <div className="paid-tech-row">
                <dt>Settlement record ID</dt>
                <dd><code className="paid-mono-value">{primarySettlement.id}</code></dd>
              </div>
            )}
          </dl>
        </div>
      </details>

      {/* ─────────────────────────────────────────────────────────────
          HISTORICAL RECEIPTS (If multiple receipts exist)
          ───────────────────────────────────────────────────────────── */}
      {receipts && receipts.length > 1 && (
        <section className="paid-invoice-card" style={{ marginTop: 20 }}>
          <h3 className="paid-card-title" style={{ fontSize: 16, marginBottom: 12 }}>
            All payment receipts ({receipts.length})
          </h3>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
            {receipts.map((rcpt) => {
              const settlement = settlements?.find((s) => s.payment_attempt_id === rcpt.payment_attempt_id);
              const hashes = Array.isArray(settlement?.destination_tx_hashes)
                ? settlement.destination_tx_hashes.filter((h): h is string => typeof h === "string" && /^0x[0-9a-fA-F]{64}$/.test(h))
                : [];
              return (
                <li key={rcpt.id} className="paid-receipt-history-item">
                  <strong>#{rcpt.receipt_number}</strong> · {formatUtcDateTime(rcpt.issued_at)}
                  {settlement && (
                    <p style={{ margin: "4px 0 0", color: "#666", fontSize: 12 }}>
                      {settlement.outcome.replaceAll("_", " ")}: {formatBaseUnits(settlement.received_amount_base_units, settlement.received_asset_decimals)} {settlement.destination_asset_id ?? "USDC"} on {formatNetworkLabel(settlement.destination_network)}
                      {hashes.map((hash) => (
                        <span key={hash} style={{ marginLeft: 8 }}>
                          tx: <code className="paid-mono-value">{shortHash(hash)}</code>
                        </span>
                      ))}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
