import { createHash } from "node:crypto";
import { verifyQuoteSignature, type GetExecutionStatusResponse, type TokenResponse } from "@defuse-protocol/one-click-sdk-typescript";
import { NextResponse } from "next/server";
import { classifySettlement, type AttemptForSettlement, type InvoiceForSettlement } from "@/lib/payments/settlement-policy";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { allowOneClickRequest, assertLivePaymentsEnabled, getOneClickExecutionStatus, getOneClickTokens } from "@/lib/server/one-click";
import { verifyEvmDestinationTransfers } from "@/lib/server/settlement-chain";
import { getWalletNetwork } from "@/lib/wallet/networks";
import type { Database } from "@/types/database";

export const dynamic = "force-dynamic";
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES = new Set(["PENDING_DEPOSIT", "KNOWN_DEPOSIT_TX", "PROCESSING", "SUCCESS", "REFUNDED", "FAILED", "INCOMPLETE_DEPOSIT"]);

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const safeEvidence = (execution: GetExecutionStatusResponse) => ({
  correlationId: execution.correlationId,
  updatedAt: execution.updatedAt,
  providerStatus: execution.status,
  depositedAmount: execution.swapDetails?.depositedAmount ?? null,
});

export async function GET(_request: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  if (!TOKEN.test(token) || !UUID.test(id)) return json({ error: "attempt_unavailable" }, 404);
  if (!allowOneClickRequest(`status:${id}`, 20, 60_000)) return json({ error: "status_rate_limit" }, 429);
  let verifiedAssetIds: Set<string>;
  try { verifiedAssetIds = assertLivePaymentsEnabled(); } catch { return json({ error: "live_payments_disabled" }, 503); }
  const supabase = getSupabaseAdminClient();
  const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
  const { data: rows, error } = await supabase.rpc("get_shared_live_attempt", { p_token_hash: tokenHash, p_attempt_id: id });
  const attempt = rows?.[0];
  if (error || !attempt?.deposit_address || attempt.mode !== "live") return json({ error: "attempt_unavailable" }, 404);

  try {
    const execution = await getOneClickExecutionStatus(attempt.deposit_address, attempt.deposit_memo ?? undefined) as GetExecutionStatusResponse;
    if (!execution || !STATUSES.has(execution.status) || !execution.quoteResponse
      || !verifyQuoteSignature(execution.quoteResponse)) return json({ error: "provider_response_unverified" }, 502);

    const invoiceResult = await supabase.from("invoices").select("id,business_id,status,currency,amount_minor")
      .eq("id", attempt.invoice_id).eq("business_id", attempt.business_id).maybeSingle();
    const profileResult = await supabase.from("business_profiles").select("receiving_address,receiving_network")
      .eq("id", attempt.business_id).maybeSingle();
    const invoice = invoiceResult.data;
    const profile = profileResult.data;
    if (invoiceResult.error || profileResult.error || !invoice || !profile) return json({ error: "settlement_context_unavailable" }, 503);
    const configuredNetwork = profile.receiving_network ? getWalletNetwork(profile.receiving_network) : undefined;
    const attemptNetwork = getWalletNetwork(attempt.destination_network);
    if (!configuredNetwork || !attemptNetwork || configuredNetwork.key !== attemptNetwork.key
      || !attempt.recipient_address || profile.receiving_address !== attempt.recipient_address) return json({ error: "business_destination_changed_review_required" }, 409);

    const providerStatus = execution.status as Database["public"]["Enums"]["payment_attempt_status"];
    let proof = null;
    let destinationAsset: TokenResponse | undefined;
    if (execution.status === "SUCCESS") {
      const tokens = await getOneClickTokens() as TokenResponse[];
      const destinationId = execution.quoteResponse.quoteRequest.destinationAsset;
      const matches = tokens.filter((tokenInfo) => tokenInfo.assetId === destinationId);
      destinationAsset = matches.length === 1 ? matches[0] : undefined;
      if (!destinationAsset || !verifiedAssetIds.has(destinationAsset.assetId) || destinationAsset.symbol.toUpperCase() !== "USDC") {
        return json({ error: "destination_asset_unverified_review_required" }, 409);
      }
      const hashes = execution.swapDetails?.destinationChainTxHashes?.map(({ hash }) => hash) ?? [];
      proof = await verifyEvmDestinationTransfers({
        network: configuredNetwork.key,
        contractAddress: destinationAsset.contractAddress ?? "",
        recipient: attempt.recipient_address,
        amount: execution.swapDetails?.amountOut ?? "",
        transactionHashes: hashes,
        assetId: destinationAsset.assetId,
      });
    }

    const decision = execution.status === "SUCCESS" && destinationAsset
      ? classifySettlement({ attempt: attempt as unknown as AttemptForSettlement, invoice: invoice as InvoiceForSettlement, execution, destinationAsset, transferProof: proof, quoteSignatureValid: true })
      : null;
    if (decision?.kind === "manual_review") {
      await supabase.rpc("update_live_attempt_status", {
        p_token_hash: tokenHash, p_attempt_id: id,
        p_status: "SUCCESS" as Database["public"]["Enums"]["payment_attempt_status"], p_transaction_hash: null,
      });
      return json({ error: "settlement_requires_manual_review", reason: decision.reason, execution: { status: execution.status } }, 409);
    }

    const { data: reconciliation, error: reconcileError } = await supabase.rpc("record_payment_reconciliation", {
      p_attempt_id: id,
      p_provider_status: providerStatus,
      p_provider_signature_verified: true,
      p_chain_transfer_verified: decision?.kind === "verified" && proof?.verified === true && proof.finalityConfirmed,
      p_destination_asset_id: decision?.kind === "verified" ? decision.assetId : null,
      p_destination_network: decision?.kind === "verified" ? decision.network : null,
      p_recipient_address: decision?.kind === "verified" ? decision.recipient : null,
      p_received_amount_base_units: decision?.kind === "verified" ? decision.amountBaseUnits : null,
      p_received_asset_decimals: decision?.kind === "verified" ? decision.decimals : null,
      p_received_value_invoice_minor: decision?.kind === "verified" ? decision.receivedValueMinor : null,
      p_destination_tx_hashes: decision?.kind === "verified" ? decision.transactionHashes : [],
      p_evidence: safeEvidence(execution),
    });
    if (reconcileError) return json({ error: "reconciliation_unavailable" }, 503);
    const result = Array.isArray(reconciliation) ? reconciliation[0] : reconciliation;
    const resultObject = result && typeof result === "object" && !Array.isArray(result) ? result as Record<string, unknown> : null;
    return json({
      mode: "live",
      attempt: { id: attempt.id, status: execution.status },
      execution: { status: execution.status },
      settlement: resultObject ? {
        outcome: resultObject.outcome,
        receiptNumber: resultObject.receiptNumber,
        invoiceStatus: resultObject.invoiceStatus,
        idempotent: resultObject.idempotent,
      } : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "status_check_failed";
    if (message.includes("settlement_chain_not_configured")) return json({ error: "settlement_chain_not_configured" }, 503);
    if (message.includes("timeout")) return json({ error: "execution_status_timeout" }, 503);
    return json({ error: "execution_status_unavailable" }, 503);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  if (!TOKEN.test(token) || !UUID.test(id)) return json({ error: "attempt_unavailable" }, 404);
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "invalid_request" }, 400); }
  const status = body && typeof body === "object" ? (body as Record<string, unknown>).status : null;
  if (status !== "FAILED" && status !== "QUOTE_EXPIRED") return json({ error: "invalid_close_status" }, 400);
  try { assertLivePaymentsEnabled(); } catch { return json({ error: "live_payments_disabled" }, 503); }
  const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.rpc("close_live_attempt", {
    p_token_hash: tokenHash, p_attempt_id: id,
    p_status: status as Database["public"]["Enums"]["payment_attempt_status"],
  });
  if (error || !data?.[0]) return json({ error: "attempt_close_rejected" }, 409);
  return json({ attempt: data[0] });
}
