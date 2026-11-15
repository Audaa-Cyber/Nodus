"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatMoney } from "@/lib/invoices";
import { getWalletNetwork } from "@/lib/wallet/networks";

export type ReceiptInfo = {
  receipt_number?: string | null;
  invoice_number?: string | null;
  business_name?: string | null;
  outcome?: string | null;
  destination_network?: string | null;
  destination_asset_id?: string | null;
  received_amount_base_units?: string | null;
  received_asset_decimals?: number | null;
  destination_tx_hashes?: string[] | unknown;
  issued_at?: string | null;
};

export type LineItem = {
  description: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
};

export type PaymentSuccessCardProps = {
  invoiceNumber: string;
  amountMinor: number;
  currency: string;
  businessName?: string | null;
  logoUrl?: string | null;
  issueDate?: string | null;
  dueDate?: string | null;
  destinationNetwork?: string | null;
  recipientAddress?: string | null;
  receipt?: ReceiptInfo | null;
  receipts?: ReceiptInfo[] | null;
  lineItems?: LineItem[] | null;
  subtotalMinor?: number | null;
  taxRateBps?: number | null;
  discountMinor?: number | null;
  sellerFooter?: string | null;
  sellerDetails?: {
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    website?: string | null;
    taxId?: string | null;
  } | null;
  reviewSlot?: React.ReactNode;
};

function safeFormatMoney(amountMinor: number, currency: string) {
  try {
    return formatMoney(amountMinor, currency);
  } catch {
    return `${(amountMinor / 100).toFixed(2)} ${currency}`;
  }
}

function formatNetworkLabel(networkKey: string | null | undefined): string {
  if (!networkKey) return "Arbitrum Sepolia";
  const known = getWalletNetwork(networkKey);
  if (known) return known.label;
  const lower = networkKey.trim().toLowerCase();
  if (lower.includes("arbitrum")) return "Arbitrum Sepolia";
  if (lower.includes("base")) return "Base Sepolia";
  if (lower.includes("optimism") || lower.includes("op")) return "Optimism Sepolia";
  return networkKey;
}

function shortHash(hash: string): string {
  if (!hash) return "";
  return hash.length > 16 ? `${hash.slice(0, 8)}…${hash.slice(-6)}` : hash;
}

function formatReceiptDate(dateString?: string | null): string {
  if (!dateString) {
    return new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    }) + " UTC";
  }
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    }) + " UTC";
  } catch {
    return dateString;
  }
}

function getExplorerTxUrl(networkKey: string | null | undefined, txHash: string): string | null {
  if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) return null;
  const lower = (networkKey ?? "").toLowerCase();
  if (lower.includes("arbitrum")) return `https://sepolia.arbiscan.io/tx/${txHash}`;
  if (lower.includes("base")) return `https://sepolia.basescan.org/tx/${txHash}`;
  if (lower.includes("optimism") || lower.includes("op")) return `https://sepolia-optimism.etherscan.io/tx/${txHash}`;
  if (lower.includes("sepolia") || lower.includes("eth")) return `https://sepolia.etherscan.io/tx/${txHash}`;
  return null;
}

function extractTxHashes(hashes: unknown): string[] {
  if (Array.isArray(hashes)) {
    return hashes.filter((h): h is string => typeof h === "string" && /^0x[0-9a-fA-F]{64}$/.test(h));
  }
  if (typeof hashes === "string" && /^0x[0-9a-fA-F]{64}$/.test(hashes)) {
    return [hashes];
  }
  return [];
}

export function PaymentSuccessCard({
  invoiceNumber,
  amountMinor,
  currency,
  businessName,
  destinationNetwork,
  receipt,
  receipts,
  lineItems,
  subtotalMinor,
  taxRateBps,
  discountMinor,
  sellerFooter,
  sellerDetails,
  reviewSlot,
}: PaymentSuccessCardProps) {
  const [showItemized, setShowItemized] = useState(false);
  const [copiedReceipt, setCopiedReceipt] = useState(false);

  // Active receipt item resolution
  const activeReceipt = receipt ?? receipts?.[0] ?? null;
  const receiptNumber = activeReceipt?.receipt_number ?? `RCP-${invoiceNumber.replace(/^NOD-|^INV-/i, "")}`;
  const paymentDate = formatReceiptDate(activeReceipt?.issued_at ?? null);
  const effectiveNetwork = activeReceipt?.destination_network ?? destinationNetwork ?? "Arbitrum Sepolia";
  const networkLabel = formatNetworkLabel(effectiveNetwork);
  const merchantDisplayName = activeReceipt?.business_name || businessName || "Merchant";

  const txHashes = useMemo(() => {
    return extractTxHashes(activeReceipt?.destination_tx_hashes);
  }, [activeReceipt?.destination_tx_hashes]);

  const primaryTxHash = txHashes[0] ?? null;
  const explorerUrl = primaryTxHash ? getExplorerTxUrl(effectiveNetwork, primaryTxHash) : null;

  const handleCopyReceiptNumber = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(receiptNumber);
        setCopiedReceipt(true);
        setTimeout(() => setCopiedReceipt(false), 2000);
      }
    } catch {
      // Ignore clipboard write failures
    }
  };

  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  const thankYouMessage = (sellerFooter && sellerFooter.trim().length > 0)
    ? sellerFooter.trim()
    : "Thank you for your business.";

  return (
    <div className="receipt-card-wrapper" role="region" aria-label="Payment receipt">
      <div className="receipt-card">
        {/* 1. Header with circular success badge */}
        <div className="receipt-badge-container">
          <div className="receipt-success-badge" aria-hidden="true">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div className="receipt-verified-pill">
            <span className="receipt-verified-dot" aria-hidden="true" />
            <span>PAYMENT VERIFIED</span>
          </div>
        </div>

        {/* 2. Handwritten Thank You headline */}
        <h1 className="receipt-thank-you-title invoice-thank-you">
          {thankYouMessage}
        </h1>

        {/* 3. Prominent Amount Paid */}
        <div className="receipt-amount-display">
          <span className="receipt-amount-eyebrow">AMOUNT PAID</span>
          <strong className="receipt-amount-value">
            {safeFormatMoney(amountMinor, currency)}
          </strong>
          <span className="receipt-settled-badge">
            Settled via USDC on {networkLabel}
          </span>
        </div>

        {/* 4. Subtle separator */}
        <hr className="receipt-divider" />

        {/* 5. Key-Value Confirmation Details */}
        <dl className="receipt-details-list">
          <div className="receipt-row">
            <dt>Status</dt>
            <dd className="receipt-status-text">
              <span className="receipt-status-dot" aria-hidden="true" />
              Verified on-chain
            </dd>
          </div>

          <div className="receipt-row">
            <dt>Invoice reference</dt>
            <dd className="receipt-code-value">#{invoiceNumber}</dd>
          </div>

          <div className="receipt-row">
            <dt>Paid to</dt>
            <dd className="receipt-value">{merchantDisplayName}</dd>
          </div>

          <div className="receipt-row">
            <dt>Payment date</dt>
            <dd className="receipt-value">{paymentDate}</dd>
          </div>

          <div className="receipt-row">
            <dt>Receipt number</dt>
            <dd className="receipt-row-action">
              <span className="receipt-code-value">#{receiptNumber}</span>
              <button
                type="button"
                onClick={handleCopyReceiptNumber}
                className="receipt-copy-btn"
                title="Copy receipt number"
                aria-label="Copy receipt number"
              >
                {copiedReceipt ? (
                  <span className="receipt-copied-text">Copied</span>
                ) : (
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                )}
              </button>
            </dd>
          </div>

          <div className="receipt-row">
            <dt>Settlement network</dt>
            <dd className="receipt-value">{networkLabel}</dd>
          </div>

          {primaryTxHash && (
            <div className="receipt-row">
              <dt>Destination tx</dt>
              <dd className="receipt-row-action">
                {explorerUrl ? (
                  <a
                    href={explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="receipt-explorer-link"
                    title={primaryTxHash}
                  >
                    <code>{shortHash(primaryTxHash)}</code>
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </a>
                ) : (
                  <code title={primaryTxHash}>{shortHash(primaryTxHash)}</code>
                )}
              </dd>
            </div>
          )}
        </dl>

        {/* 6. Itemized breakdown toggle */}
        <div className="receipt-breakdown-section">
          <button
            type="button"
            className="receipt-breakdown-toggle"
            onClick={() => setShowItemized((prev) => !prev)}
            aria-expanded={showItemized}
          >
            <span>{showItemized ? "Hide itemized breakdown" : "View itemized invoice"}</span>
            <svg
              className={`receipt-chevron ${showItemized ? "is-rotated" : ""}`}
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {showItemized && (
            <div className="receipt-breakdown-drawer">
              {lineItems && lineItems.length > 0 ? (
                <div className="receipt-items-list">
                  {lineItems.map((item, idx) => (
                    <div key={idx} className="receipt-item-line">
                      <div className="receipt-item-info">
                        <span className="receipt-item-name">{item.description}</span>
                        <span className="receipt-item-meta">
                          {item.quantity} × {safeFormatMoney(item.unitPriceMinor, currency)}
                        </span>
                      </div>
                      <span className="receipt-item-total">
                        {safeFormatMoney(item.lineTotalMinor, currency)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="receipt-subtotals">
                {subtotalMinor !== null && subtotalMinor !== undefined && (
                  <div className="receipt-subtotal-row">
                    <span>Subtotal</span>
                    <span>{safeFormatMoney(subtotalMinor, currency)}</span>
                  </div>
                )}
                {(taxRateBps ?? 0) > 0 && (
                  <div className="receipt-subtotal-row">
                    <span>Tax ({((taxRateBps ?? 0) / 100).toFixed(2)}%)</span>
                    <span>
                      {safeFormatMoney(
                        Math.round(((subtotalMinor ?? amountMinor) * (taxRateBps ?? 0)) / 10000),
                        currency
                      )}
                    </span>
                  </div>
                )}
                {(discountMinor ?? 0) > 0 && (
                  <div className="receipt-subtotal-row">
                    <span>Discount</span>
                    <span>−{safeFormatMoney(discountMinor ?? 0, currency)}</span>
                  </div>
                )}
                <div className="receipt-subtotal-row receipt-total-final">
                  <span>Total</span>
                  <span>{safeFormatMoney(amountMinor, currency)}</span>
                </div>
              </div>

              {sellerDetails && (sellerDetails.address || sellerDetails.phone || sellerDetails.email || sellerDetails.website || sellerDetails.taxId) && (
                <div className="receipt-merchant-details">
                  <p className="receipt-merchant-heading">BUSINESS INFORMATION</p>
                  {sellerDetails.address && <p>{sellerDetails.address}</p>}
                  {sellerDetails.phone && <p>{sellerDetails.phone}</p>}
                  {sellerDetails.email && <p>{sellerDetails.email}</p>}
                  {sellerDetails.website && <p>{sellerDetails.website}</p>}
                  {sellerDetails.taxId && <p>Tax ID: {sellerDetails.taxId}</p>}
                </div>
              )}

              <div className="receipt-action-row">
                <button
                  type="button"
                  onClick={handlePrint}
                  className="receipt-print-btn"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="6 9 6 2 18 2 18 9" />
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                    <rect x="6" y="14" width="12" height="8" />
                  </svg>
                  <span>Print Receipt</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 7. Extensible slot for upcoming 5-star service rating and written feedback */}
        <div className="receipt-review-slot" id="receipt-review-section">
          {reviewSlot}
        </div>

        {/* 8. Subtle NODUS branding footer */}
        <footer className="receipt-footer">
          <Link href="/" className="receipt-brand" aria-label="Nodus home">
            nodus<span className="brand-dot">.</span>
          </Link>
          <p className="receipt-footer-caption">
            Powered by nodus. • Independent On-Chain Verification
          </p>
        </footer>
      </div>
    </div>
  );
}
