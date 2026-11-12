import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { isServerSupabaseConfigured } from "@/config/env.server";
import { circleTestnetUsdcNetworks } from "@/lib/wallet/networks";
import { CircleQuoteValidationError, validateCircleSignedQuote } from "@/lib/server/circle-quote-validation";
import type { Json } from "@/types/database";

export const dynamic = "force-dynamic";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVM_ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
function usdcToUnits(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d+(\.\d{1,6})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return (BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"))).toString();
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN_PATTERN.test(token)) {
    return NextResponse.json({ error: "invoice_unavailable" }, { status: 404 });
  }

  if (!isServerSupabaseConfigured()) {
    return NextResponse.json({ error: "server_not_configured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request_body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_request_body" }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const idempotencyKey = String(input.idempotencyKey ?? "").trim();
  const sourceAssetId = String(input.sourceAssetId ?? "").trim();
  const sourceNetwork = String(input.sourceNetwork ?? "").trim();
  const destinationAssetId = String(input.destinationAssetId ?? "").trim();
  const destinationNetwork = String(input.destinationNetwork ?? "").trim();
  const requestedRecipient = String(input.recipientAddress ?? "").trim();
  const requestedAmount = String(input.requestedAmount ?? "").trim();
  const expectedReceivedAmount = String(input.expectedReceivedAmount ?? "").trim();
  const quoteExpiresAt = String(input.quoteExpiresAt ?? "").trim();
  const quoteSnapshotInput = input.quoteSnapshot && typeof input.quoteSnapshot === "object"
    ? input.quoteSnapshot as Record<string, unknown> : null;
  const senderAddress = String(input.senderAddress ?? "").trim();
  const quoteType = quoteSnapshotInput?.type;
  if (
    !UUID_PATTERN.test(idempotencyKey) ||
    !sourceAssetId ||
    !sourceNetwork ||
    !destinationAssetId ||
    !destinationNetwork ||
    !EVM_ADDRESS_PATTERN.test(senderAddress) ||
    !/^[0-9]+$/.test(requestedAmount) ||
    !/^[0-9]+$/.test(expectedReceivedAmount) ||
    !quoteExpiresAt ||
    !quoteSnapshotInput ||
    (quoteType !== "circle_cctp" && quoteType !== "circle_direct")
  ) {
    return NextResponse.json({ error: "invalid_attempt_parameters" }, { status: 400 });
  }

  if (quoteType === "circle_cctp") {
    if (typeof quoteSnapshotInput.quote !== "string"
      || JSON.stringify(quoteSnapshotInput).length > 48_000
      || (Array.isArray(quoteSnapshotInput.feeItems) && quoteSnapshotInput.feeItems.length > 20)) {
      return NextResponse.json({ error: "circle_quote_terms_invalid" }, { status: 400 });
    }
  } else if (JSON.stringify(quoteSnapshotInput).length > 48_000) {
    return NextResponse.json({ error: "invalid_attempt_parameters" }, { status: 400 });
  }

  // Load the invoice again at the privileged boundary. Client destination and
  // amount values are assertions only; stored invoice/business data is authority.
  const supabaseAdmin = getSupabaseAdminClient();
  const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
  const { data: contexts, error: contextError } = await supabaseAdmin.rpc("lookup_shared_payment_context", {
    p_token_hash: tokenHash,
  });
  const context = contexts?.[0];
  if (contextError || !context || !context.receiving_address || !context.receiving_network
      || !["open", "overdue"].includes(context.invoice_status)
      || String(context.currency).toUpperCase() !== "USD") {
    return NextResponse.json({ error: "invoice_unavailable" }, { status: 404 });
  }
  const amountBaseUnits = (BigInt(context.amount_minor) * 10_000n).toString();
  const { getCircleChain } = await import("@/lib/server/circle");
  const destinationNetworkOption = circleTestnetUsdcNetworks.find((network) => network.key === context.receiving_network);
  const destinationCircle = destinationNetworkOption ? getCircleChain(context.receiving_network, true) : null;
  if (!destinationCircle) {
    return NextResponse.json({ error: "invoice_payment_terms_mismatch" }, { status: 409 });
  }

  let depositAddress: string;
  let quoteSnapshot: Record<string, unknown>;

  if (quoteType === "circle_cctp") {
    const sourceNetworkOption = circleTestnetUsdcNetworks.find((network) => network.key === sourceNetwork);
    const sourceCircle = sourceNetworkOption ? getCircleChain(sourceNetwork, true) : null;
    if (!sourceCircle || sourceNetwork === destinationNetwork
        || destinationNetwork !== context.receiving_network
        || requestedRecipient.toLowerCase() !== context.receiving_address.toLowerCase()
        || expectedReceivedAmount !== amountBaseUnits || destinationAssetId !== `${context.receiving_network}:usdc`
        || sourceAssetId !== `${sourceNetwork}:usdc`) {
      return NextResponse.json({ error: "invoice_payment_terms_mismatch" }, { status: 409 });
    }
    const quotedReceived = usdcToUnits(quoteSnapshotInput.amountReceived);
    const quotedDebit = usdcToUnits(quoteSnapshotInput.totalDebit);
    const quotedFees = usdcToUnits(quoteSnapshotInput.feeTotal);
    if (quotedReceived !== amountBaseUnits || quotedDebit !== requestedAmount || quotedFees === null
      || BigInt(quotedDebit) - BigInt(quotedReceived) !== BigInt(quotedFees)
      || !Array.isArray(quoteSnapshotInput.feeItems)
      || quoteSnapshotInput.feeItems.some((item) => !item || typeof item !== "object"
        || typeof (item as Record<string, unknown>).type !== "string"
        || usdcToUnits((item as Record<string, unknown>).amount) === null)) {
      return NextResponse.json({ error: "circle_quote_terms_invalid" }, { status: 409 });
    }
    try {
      await validateCircleSignedQuote({
        source: sourceCircle,
        destination: destinationCircle,
        payer: senderAddress,
        recipient: context.receiving_address,
        amountBaseUnits: amountBaseUnits,
        quote: String(quoteSnapshotInput.quote),
        feeTotal: String(quoteSnapshotInput.feeTotal),
        feeItems: quoteSnapshotInput.feeItems as Array<{ type: string; amount: string }>,
        expiresAt: quoteExpiresAt,
      });
    } catch (error) {
      if (error instanceof CircleQuoteValidationError && error.code === "unavailable") {
        return NextResponse.json({ error: "circle_quote_validation_unavailable" }, { status: 503 });
      }
      return NextResponse.json({ error: "circle_quote_terms_invalid" }, { status: 409 });
    }
    depositAddress = sourceCircle.tokenMessengerAddress;
    quoteSnapshot = {
      type: "circle_cctp",
      invoiceId: context.invoice_id,
      invoiceAmountMinor: String(context.amount_minor),
      invoiceCurrency: String(context.currency),
      payer: senderAddress.toLowerCase(),
      sourceNetwork,
      sourceAssetId: `${sourceNetwork}:usdc`,
      sourceUsdc: sourceCircle.usdcAddress,
      sourceDomain: sourceCircle.cctpDomainId,
      destinationNetwork: context.receiving_network,
      destinationAssetId: `${context.receiving_network}:usdc`,
      destinationUsdc: destinationCircle.usdcAddress,
      destinationDomain: destinationCircle.cctpDomainId,
      recipient: context.receiving_address.toLowerCase(),
      amountReceived: String(quoteSnapshotInput.amountReceived ?? ""),
      feeTotal: String(quoteSnapshotInput.feeTotal ?? ""),
      feeItems: Array.isArray(quoteSnapshotInput.feeItems) ? quoteSnapshotInput.feeItems : [],
      totalDebit: String(quoteSnapshotInput.totalDebit ?? ""),
      minimumReceived: amountBaseUnits,
      quoteExpiresAt,
      quote: quoteSnapshotInput.quote,
    };
  } else {
    // circle_direct (same-chain USDC transfer)
    if (sourceNetwork !== destinationNetwork
        || !destinationNetworkOption
        || destinationNetwork !== context.receiving_network
        || requestedRecipient.toLowerCase() !== context.receiving_address.toLowerCase()
        || expectedReceivedAmount !== amountBaseUnits || requestedAmount !== amountBaseUnits
        || destinationAssetId !== `${context.receiving_network}:usdc`
        || sourceAssetId !== `${context.receiving_network}:usdc`) {
      return NextResponse.json({ error: "invoice_payment_terms_mismatch" }, { status: 409 });
    }
    depositAddress = context.receiving_address;
    quoteSnapshot = {
      type: "circle_direct",
      invoiceId: context.invoice_id,
      invoiceAmountMinor: String(context.amount_minor),
      invoiceCurrency: String(context.currency),
      payer: senderAddress.toLowerCase(),
      sourceNetwork: context.receiving_network,
      sourceAssetId: `${context.receiving_network}:usdc`,
      destinationNetwork: context.receiving_network,
      destinationAssetId: `${context.receiving_network}:usdc`,
      recipient: context.receiving_address.toLowerCase(),
      minimumReceived: amountBaseUnits,
      totalDebit: amountBaseUnits,
      quoteExpiresAt,
    };
  }

  // Pre-authorization check: Ensure quote is not expired
  const expiresAtMs = Date.parse(quoteExpiresAt);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now() || expiresAtMs > Date.now() + 5 * 60_000) {
    return NextResponse.json({ error: "quote_expired" }, { status: 410 });
  }

  try {
    const { data, error } = await supabaseAdmin.rpc("create_committed_payment_attempt", {
      p_token_hash: tokenHash,
      p_idempotency_key: idempotencyKey,
      p_source_asset_id: quoteType === "circle_cctp" ? `${sourceNetwork}:usdc` : `${context.receiving_network}:usdc`,
      p_source_network: quoteType === "circle_cctp" ? sourceNetwork : context.receiving_network,
      p_destination_asset_id: `${context.receiving_network}:usdc`,
      p_destination_network: context.receiving_network,
      p_recipient_address: context.receiving_address,
      p_requested_amount: requestedAmount,
      p_expected_received_amount: amountBaseUnits,
      p_deposit_address: depositAddress,
      p_deposit_memo: null,
      p_quote_expires_at: quoteExpiresAt,
      p_quote_snapshot: quoteSnapshot as unknown as Json,
    });

    if (error) {
      if (error.message.includes("active_payment_attempt_exists")) {
        return NextResponse.json({ error: "active_payment_attempt_exists" }, { status: 409 });
      }
      return NextResponse.json({ error: error.message || "failed_to_create_attempt" }, { status: 409 });
    }

    const createdAttempt = data?.[0];
    if (!createdAttempt) {
      return NextResponse.json({ error: "failed_to_create_attempt" }, { status: 409 });
    }

    const publicAttempt = { ...createdAttempt } as Record<string, unknown>;
    delete publicAttempt.quote_snapshot;
    return NextResponse.json(
      {
        success: true,
        attempt: publicAttempt,
      },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
