import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import CancelInvoiceForm from "@/components/cancel-invoice-form";
import InvoiceSharePanel from "@/components/invoice-share-panel";
import { retryNearInvoiceRegistrationAction } from "@/app/actions/invoices";
import { getBusinessContext } from "@/lib/auth/business-context";
import { effectiveStatus, formatMoney, formatUtcDate } from "@/lib/invoices";
import { withTransitionDelay } from "@/lib/utils/timing";

function formatUtcDateTime(dateString: string): string {
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

function formatBaseUnits(amount: string | null, decimals: number | null): string {
  if (
    !amount ||
    !/^\d+$/.test(amount) ||
    !Number.isInteger(decimals) ||
    decimals === null ||
    decimals < 0 ||
    decimals > 30
  )
    return "Amount unavailable";
  if (decimals === 0) return amount;
  const padded = amount.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

function explorerTxUrl(networkKey: string | null, txHash: string): string | null {
  if (!networkKey || !txHash) return null;
  const explorers: Record<string, string> = {
    "base-sepolia": "https://sepolia.basescan.org/tx/",
    "arbitrum-sepolia": "https://sepolia.arbiscan.io/tx/",
    "sepolia": "https://sepolia.etherscan.io/tx/",
    "optimism-sepolia": "https://sepolia-optimism.etherscan.io/tx/",
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

function TxHashLink({
  hash,
  networkKey,
  label,
}: {
  hash: string;
  networkKey: string | null;
  label: string;
}) {
  const url = explorerTxUrl(networkKey, hash);
  return (
    <span className="font-mono-code text-[11px] break-all">
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline"
        >
          {hash.slice(0, 10)}…{hash.slice(-8)}{" "}
          <span className="text-[10px] opacity-70">↗ {label}</span>
        </a>
      ) : (
        hash
      )}
    </span>
  );
}

export default async function InvoiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cancelled?: string; error?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
  )
    notFound();

  const { supabase, user, business } = await getBusinessContext();
  if (!user) redirect("/login");
  if (!business) notFound();

  const [
    { data: invoice, error },
    { data: receipts },
    { data: settlements },
    { data: attempts },
    { data: nearOutbox },
    { data: nearInvoiceRegistration },
  ] = await withTransitionDelay(
    Promise.all([
      supabase
        .from("invoices")
        .select("*")
        .eq("id", id)
        .eq("business_id", business.id)
        .maybeSingle(),

      supabase
        .from("payment_receipts")
        .select("id,receipt_number,issued_at,payment_attempt_id,payment_settlement_id")
        .eq("invoice_id", id)
        .eq("business_id", business.id)
        .order("issued_at", { ascending: false }),

      supabase
        .from("payment_settlements")
        .select(
          "id,payment_attempt_id,outcome,destination_asset_id,destination_network,recipient_address,received_amount_base_units,received_asset_decimals,destination_tx_hashes,evidence,created_at"
        )
        .eq("invoice_id", id)
        .eq("business_id", business.id),

      supabase
        .from("payment_attempts")
        .select(
          "id,source_asset_id,source_network,destination_asset_id,destination_network,transaction_hash,requested_amount,expected_received_amount,deposit_address,mode,status,created_at,updated_at"
        )
        .eq("invoice_id", id)
        .eq("business_id", business.id)
        .order("created_at", { ascending: false }),

      supabase
        .from("near_settlement_outbox")
        .select(
          "id,payment_attempt_id,source_transaction_hash,status,near_transaction_hash,last_error_code,submitted_at,created_at,attempt_count"
        )
        .eq("invoice_id", id),

      supabase
        .from("near_invoice_registration_outbox")
        .select("id,status,attempt_count,near_transaction_hash,failure_reason,registered_at")
        .eq("invoice_id", id)
        .maybeSingle(),
    ]),
    700
  );

  if (error || !invoice) notFound();

  const status = effectiveStatus(invoice);
  const isPaid = invoice.status === "paid";
  const isCancelled = invoice.status === "cancelled";

  // Share panel state
  const shareState = !invoice.share_token_hash
    ? "none"
    : invoice.share_token_expires_at &&
        new Date(invoice.share_token_expires_at).getTime() > Date.now()
      ? "active"
      : "expired";

  const canEdit = status === "draft" || status === "open" || status === "overdue";
  const canCancel = canEdit;
  // Paid and cancelled invoices must not expose active share/payment actions
  const canShare = !isPaid && !isCancelled;

  // For paid invoices, find the primary verified receipt + settlement
  const primaryReceipt = receipts && receipts.length > 0 ? receipts[0] : null;
  const primarySettlement = primaryReceipt
    ? settlements?.find((s) => s.payment_attempt_id === primaryReceipt.payment_attempt_id) ?? null
    : null;
  const primaryAttempt = primaryReceipt
    ? attempts?.find((a) => a.id === primaryReceipt.payment_attempt_id) ?? null
    : null;

  // NEAR outbox entries for the primary attempt
  const primaryNearEntry = primaryAttempt
    ? nearOutbox?.find((n) => n.payment_attempt_id === primaryAttempt.id) ?? null
    : null;

  // Extract validated destination tx hashes
  const destinationHashes = Array.isArray(primarySettlement?.destination_tx_hashes)
    ? primarySettlement.destination_tx_hashes.filter(
        (h): h is string => typeof h === "string" && /^0x[0-9a-fA-F]{64}$/.test(h)
      )
    : [];

  // Source tx hash from the payment attempt
  const sourceTxHash =
    primaryAttempt?.transaction_hash &&
    /^0x[0-9a-fA-F]{64}$/.test(primaryAttempt.transaction_hash)
      ? primaryAttempt.transaction_hash
      : null;

  return (
    <div className="dashboard-content narrow-content">
      <Link className="back-link" href="/dashboard/invoices">
        ← Back to invoices
      </Link>

      <header className="detail-heading">
        <div>
          <p className="eyebrow">INVOICE · {invoice.invoice_number}</p>
          <h1>{invoice.customer_name}</h1>
          <span className={`status status-${status}`}>{status}</span>
        </div>
        <div className="detail-actions">
          {canEdit && (
            <Link className="button button-outline" href={`/dashboard/invoices/${id}/edit`}>
              Edit invoice
            </Link>
          )}
        </div>
      </header>

      {query.cancelled && (
        <p className="form-success" role="status">
          Invoice cancelled. It can no longer be payable.
        </p>
      )}
      {query.error && (
        <p className="form-error" role="alert">
          Invoice could not be cancelled.
        </p>
      )}

      {/* Invoice details */}
      <section className="invoice-detail-sheet">
        <div className="detail-amount">
          <span>{isPaid ? "AMOUNT PAID" : "AMOUNT DUE"}</span>
          <strong>{formatMoney(invoice.amount_minor, invoice.currency)}</strong>
        </div>
        <dl>
          <div>
            <dt>From</dt>
            <dd>{business.business_name}</dd>
          </div>
          <div>
            <dt>Customer</dt>
            <dd>
              {invoice.customer_name}
              {invoice.customer_email && <span>{invoice.customer_email}</span>}
            </dd>
          </div>
          <div>
            <dt>Description</dt>
            <dd>{invoice.description}</dd>
          </div>
          <div>
            <dt>Issue date</dt>
            <dd>{formatUtcDate(invoice.issue_date)}</dd>
          </div>
          <div>
            <dt>Due date</dt>
            <dd>{invoice.due_date ? formatUtcDate(invoice.due_date) : "Not set"}</dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>{formatUtcDateTime(invoice.created_at)}</dd>
          </div>
          <div>
            <dt>Updated</dt>
            <dd>{formatUtcDateTime(invoice.updated_at)}</dd>
          </div>
        </dl>
      </section>

      {/* Share panel — hidden for paid and cancelled invoices */}
      {!isPaid && !isCancelled && (
        <InvoiceSharePanel
          invoiceId={id}
          shareState={shareState}
          expiresAt={invoice.share_token_expires_at}
          canShare={canShare}
        />
      )}

      {invoice.status !== "draft" && nearInvoiceRegistration && (
        <section className="invoice-detail-sheet" aria-label="NEAR invoice registration" style={{ marginTop: 18, padding: 18 }}>
          <p className="eyebrow" style={{ margin: "0 0 8px" }}>NEAR INVOICE REGISTRATION</p>
          <p style={{ margin: 0, fontSize: 13 }}>
            {invoice.near_registration_status === "registered"
              ? "Registered on NEAR"
              : invoice.near_registration_status === "submitting"
                ? "Registration transaction is being verified"
                : invoice.near_registration_status === "failed"
                  ? `Registration failed${invoice.near_registration_failure_reason ? `: ${invoice.near_registration_failure_reason}` : "."}`
                  : "Registration is queued"}
          </p>
          {invoice.near_registration_status === "registered" && invoice.near_registration_transaction_hash && (
            <a className="form-help" href={`https://nearblocks.io/txns/${invoice.near_registration_transaction_hash}`} target="_blank" rel="noopener noreferrer">
              View registration transaction
            </a>
          )}
          {invoice.near_registration_status === "failed" && (
            <form action={retryNearInvoiceRegistrationAction} style={{ marginTop: 12 }}>
              <input type="hidden" name="invoiceId" value={invoice.id} />
              <button type="submit" className="button button-secondary">Retry NEAR registration</button>
            </form>
          )}
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════
          PAID INVOICE — PAYMENT SUMMARY RECEIPT
          Source of truth: backend settlement + receipt records
          ═══════════════════════════════════════════════════════ */}
      {isPaid && primaryReceipt && (
        <section
          className="invoice-detail-sheet"
          aria-labelledby="payment-receipt-heading"
          style={{ marginTop: 24 }}
        >
          {/* Receipt heading */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              paddingBottom: 18,
              borderBottom: "1px solid #e4e4df",
              marginBottom: 4,
            }}
          >
            <div>
              <p className="eyebrow" style={{ margin: "0 0 6px" }}>
                PAYMENT CONFIRMED
              </p>
              <h2
                id="payment-receipt-heading"
                style={{
                  margin: 0,
                  fontSize: 21,
                  fontWeight: 500,
                  letterSpacing: "-.04em",
                }}
              >
                Payment Summary
              </h2>
            </div>
            <span
              className="status status-paid"
              style={{ fontSize: 11, padding: "6px 12px" }}
            >
              ✓ Verified / Paid
            </span>
          </div>

          <dl>
            {/* Receipt number */}
            <div>
              <dt>Receipt number</dt>
              <dd>
                <span className="font-mono-code text-[12px]">{primaryReceipt.receipt_number}</span>
              </dd>
            </div>

            {/* Invoice principal */}
            <div>
              <dt>Invoice amount</dt>
              <dd>{formatMoney(invoice.amount_minor, invoice.currency)}</dd>
            </div>

            {/* Payment status */}
            <div>
              <dt>Settlement status</dt>
              <dd>
                {primarySettlement ? (
                  <span style={{ textTransform: "capitalize" }}>
                    {primarySettlement.outcome.replaceAll("_", " ").toLowerCase()}
                  </span>
                ) : (
                  <span style={{ color: "#888" }}>Pending verification</span>
                )}
              </dd>
            </div>

            {/* Source details */}
            <div>
              <dt>Source asset</dt>
              <dd>
                {primaryAttempt?.source_asset_id ? (
                  <span className="font-mono-code text-[12px]">
                    {primaryAttempt.source_asset_id}
                  </span>
                ) : (
                  <span style={{ color: "#888" }}>Unavailable</span>
                )}
              </dd>
            </div>
            <div>
              <dt>Source network</dt>
              <dd>
                {primaryAttempt?.source_network ?? (
                  <span style={{ color: "#888" }}>Unavailable</span>
                )}
              </dd>
            </div>

            {/* Destination details */}
            <div>
              <dt>Destination asset</dt>
              <dd>
                {primarySettlement?.destination_asset_id ?? (
                  <span style={{ color: "#888" }}>Unavailable</span>
                )}
              </dd>
            </div>
            <div>
              <dt>Destination network</dt>
              <dd>
                {primarySettlement?.destination_network ?? (
                  <span style={{ color: "#888" }}>Unavailable</span>
                )}
              </dd>
            </div>

            {/* Amount received */}
            <div>
              <dt>Merchant received</dt>
              <dd>
                {primarySettlement?.received_amount_base_units ? (
                  <strong>
                    {formatBaseUnits(
                      primarySettlement.received_amount_base_units,
                      primarySettlement.received_asset_decimals
                    )}{" "}
                    {primarySettlement.destination_asset_id ?? "USDC"}
                  </strong>
                ) : (
                  <span style={{ color: "#888" }}>Unavailable</span>
                )}
              </dd>
            </div>

            {/* Total payer debit */}
            <div>
              <dt>Payer debit</dt>
              <dd>
                {primaryAttempt?.requested_amount ? (
                  <span className="font-mono-code text-[12px]">
                    {primaryAttempt.requested_amount}{" "}
                    <span style={{ color: "#888", fontSize: 11 }}>
                      ({primaryAttempt.source_asset_id ?? "asset"})
                    </span>
                  </span>
                ) : (
                  <span style={{ color: "#888" }}>Unavailable</span>
                )}
              </dd>
            </div>

            {/* Circle fees (derived: requested - expected) */}
            <div>
              <dt>Circle fees</dt>
              <dd>
                {primaryAttempt?.requested_amount && primaryAttempt?.expected_received_amount ? (
                  (() => {
                    try {
                      const req = parseFloat(primaryAttempt.requested_amount);
                      const exp = parseFloat(primaryAttempt.expected_received_amount);
                      const fee = req - exp;
                      return (
                        <span className="font-mono-code text-[12px]">
                          {fee >= 0 ? fee.toFixed(6) : "0"}{" "}
                          <span style={{ color: "#888", fontSize: 11 }}>
                            ({primaryAttempt.source_asset_id ?? "asset"})
                          </span>
                        </span>
                      );
                    } catch {
                      return <span style={{ color: "#888" }}>Unavailable</span>;
                    }
                  })()
                ) : (
                  <span style={{ color: "#888" }}>Unavailable</span>
                )}
              </dd>
            </div>

            {/* Payer wallet */}
            <div>
              <dt>Payer wallet</dt>
              <dd>
                {primaryAttempt?.deposit_address ? (
                  <span className="font-mono-code text-[11px] break-all">
                    {primaryAttempt.deposit_address}
                  </span>
                ) : (
                  <span style={{ color: "#888" }}>Unavailable</span>
                )}
              </dd>
            </div>

            {/* Merchant receiving wallet */}
            <div>
              <dt>Merchant wallet</dt>
              <dd>
                {primarySettlement?.recipient_address ?? business.receiving_address ? (
                  <span className="font-mono-code text-[11px] break-all">
                    {primarySettlement?.recipient_address ?? business.receiving_address}
                  </span>
                ) : (
                  <span style={{ color: "#888" }}>Unavailable</span>
                )}
              </dd>
            </div>

            {/* Source transaction hash */}
            <div>
              <dt>Source transaction</dt>
              <dd>
                {sourceTxHash ? (
                  <TxHashLink
                    hash={sourceTxHash}
                    networkKey={primaryAttempt?.source_network ?? null}
                    label="Explorer"
                  />
                ) : (
                  <span style={{ color: "#888" }}>Unavailable</span>
                )}
              </dd>
            </div>

            {/* Destination transaction hashes */}
            <div>
              <dt>Destination transaction</dt>
              <dd>
                {destinationHashes.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {destinationHashes.map((hash) => (
                      <TxHashLink
                        key={hash}
                        hash={hash}
                        networkKey={primarySettlement?.destination_network ?? null}
                        label="Explorer"
                      />
                    ))}
                  </div>
                ) : (
                  <span style={{ color: "#888" }}>Unavailable</span>
                )}
              </dd>
            </div>

            {/* Settlement timestamp */}
            <div>
              <dt>Settled at</dt>
              <dd>
                {primaryReceipt?.issued_at ? (
                  formatUtcDateTime(primaryReceipt.issued_at)
                ) : primarySettlement?.created_at ? (
                  formatUtcDateTime(primarySettlement.created_at)
                ) : (
                  <span style={{ color: "#888" }}>Unavailable</span>
                )}
              </dd>
            </div>

            {/* Payment mode */}
            <div>
              <dt>Payment mode</dt>
              <dd>
                {primaryAttempt?.mode === "mock" ? (
                  <span
                    style={{
                      display: "inline-flex",
                      padding: "3px 8px",
                      borderRadius: 999,
                      background: "#fff8e7",
                      color: "#7a5c00",
                      fontSize: 11,
                    }}
                  >
                    Mock / Demo
                  </span>
                ) : primaryAttempt?.mode === "live" ? (
                  <span
                    style={{
                      display: "inline-flex",
                      padding: "3px 8px",
                      borderRadius: 999,
                      background: "#eaf2e9",
                      color: "#345438",
                      fontSize: 11,
                    }}
                  >
                    Live
                  </span>
                ) : (
                  <span style={{ color: "#888" }}>Unavailable</span>
                )}
              </dd>
            </div>
          </dl>

          {/* ─── NEAR Reconciliation Status ─── */}
          <div
            style={{
              marginTop: 20,
              paddingTop: 18,
              borderTop: "1px solid #e4e4df",
            }}
          >
            <p
              className="eyebrow"
              style={{ margin: "0 0 10px", color: "#8996a6" }}
            >
              NEAR PROTOCOL RECONCILIATION
            </p>
            {!primaryNearEntry ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 14px",
                  background: "#f8f8f6",
                  borderRadius: 6,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#b0b0a8",
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 12, color: "#777870" }}>
                  NEAR reconciliation record not found for this payment.
                </span>
              </div>
            ) : primaryNearEntry.status === "submitted" && primaryNearEntry.near_transaction_hash ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "10px 14px",
                  background: "#eaf2e9",
                  borderRadius: 6,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#3e6540",
                    marginTop: 4,
                    flexShrink: 0,
                  }}
                />
                <div>
                  <p style={{ margin: 0, fontSize: 12, color: "#345438", fontWeight: 500 }}>
                    NEAR reconciliation confirmed
                  </p>
                  <p style={{ margin: "4px 0 0", fontSize: 11, color: "#4a7049" }}>
                    Transaction:{" "}
                    <a
                      href={`https://nearblocks.io/txns/${primaryNearEntry.near_transaction_hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono-code"
                      style={{ color: "#345438", textDecoration: "underline" }}
                    >
                      {primaryNearEntry.near_transaction_hash.slice(0, 12)}…
                      {primaryNearEntry.near_transaction_hash.slice(-8)}
                    </a>
                    {primaryNearEntry.submitted_at && (
                      <span style={{ marginLeft: 8, color: "#6a9068" }}>
                        · {formatUtcDateTime(primaryNearEntry.submitted_at)}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            ) : primaryNearEntry.status === "blocked" ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "10px 14px",
                  background: "#fff0e8",
                  borderRadius: 6,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#9c4d24",
                    marginTop: 4,
                    flexShrink: 0,
                  }}
                />
                <div>
                  <p style={{ margin: 0, fontSize: 12, color: "#7a3a1a", fontWeight: 500 }}>
                    NEAR reconciliation blocked
                  </p>
                  <p style={{ margin: "4px 0 0", fontSize: 11, color: "#9c4d24" }}>
                    Error: {primaryNearEntry.last_error_code ?? "Unknown error"}
                  </p>
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "10px 14px",
                  background: "#e9f0f6",
                  borderRadius: 6,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#315572",
                    marginTop: 4,
                    flexShrink: 0,
                    animation: "nodePing 1.8s ease-in-out infinite",
                  }}
                />
                <div>
                  <p style={{ margin: 0, fontSize: 12, color: "#2a4760", fontWeight: 500 }}>
                    NEAR reconciliation{" "}
                    {primaryNearEntry.status === "processing" ? "in progress" : "pending"}
                  </p>
                  <p style={{ margin: "4px 0 0", fontSize: 11, color: "#315572" }}>
                    Attempt {primaryNearEntry.attempt_count ?? 0}. EVM settlement is verified
                    independently.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* ─── Verification note ─── */}
          <p className="form-help" style={{ marginTop: 14 }}>
            Paid status is recorded only after independent destination chain settlement verification.
            NEAR reconciliation status is tracked separately.
          </p>
        </section>
      )}

      {/* Historical receipts for invoices with payment history (non-primary or multi-receipt) */}
      {receipts && receipts.length > 1 && (
        <section
          className="invoice-detail-sheet"
          aria-labelledby="payment-history-title"
          style={{ marginTop: 16 }}
        >
          <h2 id="payment-history-title" style={{ marginBottom: 12 }}>
            All payment receipts
          </h2>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 12 }}>
            {receipts.map((receipt) => {
              const settlement = settlements?.find(
                (entry) => entry.payment_attempt_id === receipt.payment_attempt_id
              );
              const hashes = Array.isArray(settlement?.destination_tx_hashes)
                ? settlement.destination_tx_hashes.filter(
                    (hash): hash is string =>
                      typeof hash === "string" && /^0x[0-9a-fA-F]{64}$/.test(hash)
                  )
                : [];
              return (
                <li
                  key={receipt.payment_attempt_id}
                  style={{
                    padding: "12px 14px",
                    background: "#f8f8f6",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                >
                  <strong>{receipt.receipt_number}</strong> ·{" "}
                  {formatUtcDateTime(receipt.issued_at)}
                  {settlement && (
                    <>
                      <p style={{ margin: "6px 0 0", color: "#555" }}>
                        {settlement.outcome.replaceAll("_", " ")}:{" "}
                        {formatBaseUnits(
                          settlement.received_amount_base_units,
                          settlement.received_asset_decimals
                        )}{" "}
                        {settlement.destination_asset_id ?? "asset"} on{" "}
                        {settlement.destination_network ?? "network"}
                      </p>
                      {hashes.map((hash) => (
                        <p key={hash} style={{ margin: "4px 0 0" }}>
                          Destination tx:{" "}
                          <TxHashLink
                            hash={hash}
                            networkKey={settlement.destination_network}
                            label="Explorer"
                          />
                        </p>
                      ))}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Show single receipt history for non-paid invoices that happen to have receipts */}
      {!isPaid && receipts && receipts.length > 0 && (
        <section
          className="invoice-detail-sheet"
          aria-labelledby="payment-history-title"
          style={{ marginTop: 16 }}
        >
          <h2 id="payment-history-title">Payment receipts</h2>
          <ul>
            {receipts.map((receipt) => {
              const settlement = settlements?.find(
                (entry) => entry.payment_attempt_id === receipt.payment_attempt_id
              );
              const hashes = Array.isArray(settlement?.destination_tx_hashes)
                ? settlement.destination_tx_hashes.filter(
                    (hash): hash is string =>
                      typeof hash === "string" && /^0x[0-9a-fA-F]{64}$/.test(hash)
                  )
                : [];
              return (
                <li key={receipt.payment_attempt_id}>
                  <strong>{receipt.receipt_number}</strong> ·{" "}
                  {formatUtcDateTime(receipt.issued_at)}
                  {settlement && (
                    <>
                      <p>
                        {settlement.outcome.replaceAll("_", " ")}:{" "}
                        {formatBaseUnits(
                          settlement.received_amount_base_units,
                          settlement.received_asset_decimals
                        )}{" "}
                        {settlement.destination_asset_id ?? "asset"} on{" "}
                        {settlement.destination_network ?? "network"}
                      </p>
                      {hashes.map((hash) => (
                        <p key={hash}>
                          Destination transaction: <code>{hash}</code>
                        </p>
                      ))}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Cancel panel — only for cancellable statuses */}
      {canCancel && (
        <section className="cancel-panel">
          <div>
            <h2>Cancel invoice</h2>
            <p>Cancelled invoices cannot be reopened and will not be payable.</p>
          </div>
          <CancelInvoiceForm invoiceId={id} />
        </section>
      )}

      {/* Paid status note — shown when no receipt data is available yet */}
      {isPaid && !primaryReceipt && (
        <p className="form-help" style={{ marginTop: 20 }}>
          Paid status is recorded only after verified settlement. Receipt data may still be loading.
        </p>
      )}
    </div>
  );
}
