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
    return (
      new Date().toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
      }) + " UTC"
    );
  }
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return (
      d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
      }) + " UTC"
    );
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

/**
 * High-DPI 3x Canvas Generator to export a crisp, publication-ready PNG receipt
 */
async function generateHighResReceiptImage(params: {
  invoiceNumber: string;
  formattedAmount: string;
  currency: string;
  merchantName: string;
  receiptNumber: string;
  paymentDate: string;
  networkLabel: string;
  primaryTxHash: string | null;
  thankYouMessage: string;
  lineItems?: LineItem[] | null;
  subtotalFormatted?: string | null;
  taxFormatted?: string | null;
  discountFormatted?: string | null;
}) {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  // Await web fonts ready for crisp typography
  if (document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // ignore
    }
  }

  const scale = 3; // 3x Retina resolution (~300 DPI)
  const cardWidth = 460;
  const padding = 32;

  // Calculate dynamic card height based on items
  const hasItems = params.lineItems && params.lineItems.length > 0;
  const itemsHeight = hasItems ? (params.lineItems!.length * 28 + 120) : 0;
  const cardHeight = 560 + itemsHeight;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(cardWidth * scale);
  canvas.height = Math.round(cardHeight * scale);

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.scale(scale, scale);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Helpers
  const drawRoundRect = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  };

  // 1. Background Card with subtle shadow
  ctx.save();
  ctx.shadowColor = "rgba(24, 26, 23, 0.08)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 8;
  drawRoundRect(8, 8, cardWidth - 16, cardHeight - 16, 20);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();

  // Thin subtle border
  drawRoundRect(8, 8, cardWidth - 16, cardHeight - 16, 20);
  ctx.strokeStyle = "#e5e5df";
  ctx.lineWidth = 1;
  ctx.stroke();

  let curY = 44;
  const centerX = cardWidth / 2;

  // 2. Circular Success Checkmark Badge
  ctx.beginPath();
  ctx.arc(centerX, curY, 22, 0, Math.PI * 2);
  ctx.fillStyle = "#16a34a";
  ctx.fill();

  // White Checkmark Icon inside badge
  ctx.beginPath();
  ctx.moveTo(centerX - 7, curY);
  ctx.lineTo(centerX - 2, curY + 6);
  ctx.lineTo(centerX + 8, curY - 4);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2.75;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();

  // 3. PAYMENT VERIFIED Pill
  curY += 34;
  const pillW = 126;
  const pillH = 20;
  drawRoundRect(centerX - pillW / 2, curY, pillW, pillH, 10);
  ctx.fillStyle = "#f0fdf4";
  ctx.fill();
  ctx.strokeStyle = "#bbf7d0";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Green dot in pill
  ctx.beginPath();
  ctx.arc(centerX - pillW / 2 + 13, curY + pillH / 2, 3, 0, Math.PI * 2);
  ctx.fillStyle = "#16a34a";
  ctx.fill();

  ctx.fillStyle = "#166534";
  ctx.font = "bold 8.5px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("PAYMENT VERIFIED", centerX + 5, curY + pillH / 2 + 0.5);

  // 4. Handwritten Thank You headline
  curY += 46;
  ctx.fillStyle = "#171816";
  ctx.font = "600 28px 'Caveat', 'Segoe Print', cursive, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(params.thankYouMessage, centerX, curY);

  // 5. Amount Paid Display Box
  curY += 26;
  const boxW = cardWidth - padding * 2;
  const boxH = 76;
  drawRoundRect(padding, curY, boxW, boxH, 12);
  ctx.fillStyle = "#fafaf9";
  ctx.fill();
  ctx.strokeStyle = "#ebebe6";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Amount eyebrow
  ctx.fillStyle = "#85877f";
  ctx.font = "500 8.5px monospace";
  ctx.textAlign = "center";
  ctx.fillText("AMOUNT PAID", centerX, curY + 18);

  // Amount value
  ctx.fillStyle = "#171816";
  ctx.font = "bold 27px sans-serif";
  ctx.fillText(params.formattedAmount, centerX, curY + 44);

  // Settled via USDC
  ctx.fillStyle = "#4a6b4f";
  ctx.font = "500 10.5px sans-serif";
  ctx.fillText(`Settled via USDC on ${params.networkLabel}`, centerX, curY + 63);

  // 6. Subtle Separator Line
  curY += boxH + 18;
  ctx.beginPath();
  ctx.moveTo(padding, curY);
  ctx.lineTo(cardWidth - padding, curY);
  ctx.strokeStyle = "#ededeb";
  ctx.lineWidth = 1;
  ctx.stroke();

  // 7. Key-Value Confirmation Rows
  curY += 16;
  const rowLeft = padding;
  const rowRight = cardWidth - padding;
  const rowH = 22;

  const rows = [
    { label: "Status", value: "Verified on-chain", isGreen: true },
    { label: "Invoice reference", value: `#${params.invoiceNumber}` },
    { label: "Paid to", value: params.merchantName },
    { label: "Payment date", value: params.paymentDate },
    { label: "Receipt number", value: `#${params.receiptNumber}` },
    { label: "Settlement network", value: params.networkLabel },
    ...(params.primaryTxHash
      ? [{ label: "Destination tx", value: shortHash(params.primaryTxHash) }]
      : []),
  ];

  for (const r of rows) {
    ctx.fillStyle = "#73756e";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(r.label, rowLeft, curY);

    if (r.isGreen) {
      ctx.beginPath();
      ctx.arc(rowRight - 94, curY - 3, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#16a34a";
      ctx.fill();

      ctx.fillStyle = "#166534";
      ctx.font = "600 11.5px sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(r.value, rowRight, curY);
    } else {
      ctx.fillStyle = "#1e293b";
      ctx.font = r.label.includes("number") || r.label.includes("reference") || r.label.includes("tx")
        ? "11px monospace"
        : "500 11.5px sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(r.value, rowRight, curY);
    }
    curY += rowH;
  }

  // 8. Itemized breakdown (if present)
  if (hasItems && params.lineItems) {
    curY += 8;
    ctx.beginPath();
    ctx.moveTo(padding, curY);
    ctx.lineTo(cardWidth - padding, curY);
    ctx.strokeStyle = "#ededeb";
    ctx.lineWidth = 1;
    ctx.stroke();

    curY += 16;
    ctx.fillStyle = "#85877f";
    ctx.font = "500 8.5px monospace";
    ctx.textAlign = "left";
    ctx.fillText("ITEMIZED BREAKDOWN", rowLeft, curY);
    curY += 14;

    for (const item of params.lineItems) {
      ctx.fillStyle = "#272823";
      ctx.font = "500 11px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(item.description, rowLeft, curY);

      ctx.fillStyle = "#1e293b";
      ctx.font = "500 11px monospace";
      ctx.textAlign = "right";
      ctx.fillText(safeFormatMoney(item.lineTotalMinor, params.currency), rowRight, curY);
      curY += 18;
    }

    if (params.subtotalFormatted) {
      curY += 4;
      ctx.fillStyle = "#686a63";
      ctx.font = "10.5px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("Subtotal", rowLeft, curY);
      ctx.textAlign = "right";
      ctx.fillText(params.subtotalFormatted, rowRight, curY);
      curY += 16;
    }

    if (params.taxFormatted) {
      ctx.fillStyle = "#686a63";
      ctx.font = "10.5px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("Tax", rowLeft, curY);
      ctx.textAlign = "right";
      ctx.fillText(params.taxFormatted, rowRight, curY);
      curY += 16;
    }

    if (params.discountFormatted) {
      ctx.fillStyle = "#b91c1c";
      ctx.font = "10.5px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("Discount", rowLeft, curY);
      ctx.textAlign = "right";
      ctx.fillText(`−${params.discountFormatted}`, rowRight, curY);
      curY += 16;
    }

    curY += 2;
    ctx.fillStyle = "#171816";
    ctx.font = "bold 11.5px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Total Paid", rowLeft, curY);
    ctx.textAlign = "right";
    ctx.fillText(params.formattedAmount, rowRight, curY);
    curY += 16;
  }

  // 9. Footer
  curY = cardHeight - 44;
  ctx.beginPath();
  ctx.moveTo(padding, curY);
  ctx.lineTo(cardWidth - padding, curY);
  ctx.strokeStyle = "#e5e5df";
  ctx.lineWidth = 1;
  ctx.stroke();

  curY += 18;
  ctx.fillStyle = "#171816";
  ctx.font = "bold 14px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("nodus.", centerX, curY);

  curY += 13;
  ctx.fillStyle = "#9ca3af";
  ctx.font = "8px monospace";
  ctx.fillText("Powered by nodus. • Independent On-Chain Verification", centerX, curY);

  // 10. Trigger Download
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `NODUS-Receipt-${params.invoiceNumber}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }, "image/png", 1.0);
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
  const [isExportingImage, setIsExportingImage] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);

  // Active receipt item resolution
  const activeReceipt = receipt ?? receipts?.[0] ?? null;
  const receiptNumber = activeReceipt?.receipt_number ?? `RCP-${invoiceNumber.replace(/^NOD-|^INV-/i, "")}`;
  const paymentDate = formatReceiptDate(activeReceipt?.issued_at ?? null);
  const effectiveNetwork = activeReceipt?.destination_network ?? destinationNetwork ?? "Arbitrum Sepolia";
  const networkLabel = formatNetworkLabel(effectiveNetwork);
  const merchantDisplayName = activeReceipt?.business_name || businessName || "Merchant";
  const formattedAmount = safeFormatMoney(amountMinor, currency);

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

  const handleDownloadImage = async () => {
    setIsExportingImage(true);
    try {
      await generateHighResReceiptImage({
        invoiceNumber,
        formattedAmount,
        currency,
        merchantName: merchantDisplayName,
        receiptNumber,
        paymentDate,
        networkLabel,
        primaryTxHash,
        thankYouMessage,
        lineItems: lineItems ?? null,
        subtotalFormatted: subtotalMinor ? safeFormatMoney(subtotalMinor, currency) : null,
        taxFormatted: (taxRateBps ?? 0) > 0
          ? safeFormatMoney(Math.round(((subtotalMinor ?? amountMinor) * (taxRateBps ?? 0)) / 10000), currency)
          : null,
        discountFormatted: (discountMinor ?? 0) > 0
          ? safeFormatMoney(discountMinor ?? 0, currency)
          : null,
      });
      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 2500);
    } catch (e) {
      console.error("Failed to generate receipt image:", e);
    } finally {
      setIsExportingImage(false);
    }
  };

  return (
    <div className="receipt-card-wrapper" role="region" aria-label="Payment receipt">
      <div className="receipt-card">
        {/* 1. Header with circular success badge & draw animation */}
        <div className="receipt-badge-container">
          <div className="receipt-success-badge" aria-hidden="true">
            <svg
              className="receipt-checkmark-svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline className="receipt-checkmark-path" points="20 6 9 17 4 12" />
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

        {/* 3. Prominent Amount Paid with specular highlight */}
        <div className="receipt-amount-display">
          <span className="receipt-amount-eyebrow">AMOUNT PAID</span>
          <strong className="receipt-amount-value">
            {formattedAmount}
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

        {/* 6. Quick Action Row: Download HD Image & Print Receipt */}
        <div className="receipt-top-actions">
          <button
            type="button"
            onClick={handleDownloadImage}
            disabled={isExportingImage}
            className="receipt-download-btn"
            title="Download high quality PNG receipt image"
            aria-label="Download high quality PNG receipt image"
          >
            {isExportingImage ? (
              <>
                <span className="button-spinner" aria-hidden="true" />
                <span>Preparing HD Image…</span>
              </>
            ) : exportSuccess ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Downloaded HD Image</span>
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span>Download HD Image</span>
              </>
            )}
          </button>
        </div>

        {/* 7. Itemized breakdown toggle */}
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
                  <span>{formattedAmount}</span>
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

        {/* 8. Extensible slot for upcoming 5-star service rating and written feedback */}
        <div className="receipt-review-slot" id="receipt-review-section">
          {reviewSlot}
        </div>

        {/* 9. Subtle NODUS branding footer */}
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
