import { createHash } from "node:crypto";
import { isAddress } from "viem";
import { NextResponse } from "next/server";
import { QuoteRequest, verifyQuoteSignature, type TokenResponse } from "@defuse-protocol/one-click-sdk-typescript";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getWalletNetwork } from "@/lib/wallet/networks";
import { allowOneClickRequest, assertLivePaymentsEnabled, getOneClickTokens, requestOneClickQuote } from "@/lib/server/one-click";

export const dynamic = "force-dynamic";
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ASSET = /^[A-Za-z0-9:_./-]{1,240}$/;
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

type Body = { sourceAssetId?: unknown; refundAddress?: unknown; idempotencyKey?: unknown; commit?: unknown };

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

function addressMatches(network: string, address: string) {
  const normalized = network.toLowerCase();
  if (["eth", "ethereum", "base", "arb", "arbitrum", "op", "optimism", "pol", "polygon", "bsc", "avax", "avalanche"].includes(normalized)) return isAddress(address);
  if (["sol", "solana"].includes(normalized)) return SOLANA_ADDRESS.test(address);
  return false;
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN.test(token)) return jsonError("invoice_unavailable", 404);
  if (Number(request.headers.get("content-length") ?? 0) > 2048) return jsonError("request_too_large", 413);
  let body: Body;
  try { body = await request.json() as Body; } catch { return jsonError("invalid_request", 400); }
  if (typeof body.sourceAssetId !== "string" || !ASSET.test(body.sourceAssetId)
    || typeof body.refundAddress !== "string" || body.refundAddress.length > 160) return jsonError("invalid_request", 400);
  const commit = body.commit === true;
  if (commit && (typeof body.idempotencyKey !== "string" || !UUID.test(body.idempotencyKey))) return jsonError("invalid_request", 400);

  let verifiedAssetIds: Set<string>;
  try { verifiedAssetIds = assertLivePaymentsEnabled(); }
  catch (error) { return jsonError(error instanceof Error ? error.message : "live_payments_disabled", 503); }
  const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
  const limitKey = `${tokenHash}:${commit ? "commit" : "preview"}`;
  if (!allowOneClickRequest(limitKey, commit ? 3 : 10, 60_000)) return jsonError("quote_rate_limit", 429);

  try {
    const supabase = await createSupabaseServerClient();
    const { data: contexts, error: contextError } = await supabase.rpc("lookup_shared_payment_context", { p_token_hash: tokenHash });
    const context = contexts?.[0];
    if (contextError || !context || !["open", "overdue"].includes(context.invoice_status)) return jsonError("invoice_not_payable", 404);
    if (context.currency !== "USD" || !context.receiving_address || !context.receiving_network) return jsonError("unsupported_invoice_or_destination", 422);
    if (!addressMatches(context.receiving_network, context.receiving_address)) return jsonError("invalid_business_destination", 422);

    const tokens = await getOneClickTokens() as TokenResponse[];
    const source = tokens.find((entry) => entry.assetId === body.sourceAssetId);
    const sourceNetwork = source && getWalletNetwork(source.blockchain);
    if (!source || !sourceNetwork || !Number.isInteger(source.decimals) || source.decimals < 0 || source.decimals > 30) return jsonError("unsupported_source_asset", 422);
    if (sourceNetwork.family !== "evm") return jsonError("wallet_execution_unverified", 422);
    if (!addressMatches(source.blockchain, body.refundAddress)) return jsonError("invalid_refund_address", 422);

    const receivingNetwork = getWalletNetwork(context.receiving_network);
    if (!receivingNetwork) return jsonError("destination_route_not_verified", 422);
    const destination = tokens.find((entry) => entry.symbol.toUpperCase() === "USDC"
      && getWalletNetwork(entry.blockchain)?.key === receivingNetwork.key
      && verifiedAssetIds.has(entry.assetId));
    if (!destination || !getWalletNetwork(destination.blockchain)) return jsonError("destination_route_not_verified", 422);
    if (!Number.isInteger(destination.decimals) || destination.decimals < 2 || destination.decimals > 30) return jsonError("invalid_destination_asset", 503);

    const targetAmount = (BigInt(context.amount_minor) * (10n ** BigInt(destination.decimals - 2))).toString();
    const idempotencyKey = commit ? body.idempotencyKey as string : null;
    const admin = commit ? getSupabaseAdminClient() : null;
    if (commit && admin && idempotencyKey) {
      const { data: existing } = await admin.from("payment_attempts").select("*").eq("invoice_id", context.invoice_id).eq("idempotency_key", idempotencyKey).maybeSingle();
      if (existing?.mode === "live" && existing.quote_snapshot) {
        return NextResponse.json({ mode: "live-committed", attempt: existing, quote: existing.quote_snapshot }, { headers: { "Cache-Control": "no-store" } });
      }
      const { data: active } = await admin.from("payment_attempts").select("id").eq("invoice_id", context.invoice_id)
        .or("status.in.(MOCK_QUOTE_READY,PENDING_DEPOSIT,KNOWN_DEPOSIT_TX,PROCESSING),and(mode.eq.live,status.eq.SUCCESS,settlement_resolved_at.is.null)").limit(1);
      if (active?.length) return jsonError("active_payment_attempt_exists", 409);
    }
    const quoteRequest: QuoteRequest = {
      dry: !commit,
      swapType: QuoteRequest.swapType.EXACT_OUTPUT,
      slippageTolerance: 100,
      originAsset: source.assetId,
      depositType: QuoteRequest.depositType.ORIGIN_CHAIN,
      destinationAsset: destination.assetId,
      amount: targetAmount,
      refundTo: body.refundAddress,
      refundType: QuoteRequest.refundType.ORIGIN_CHAIN,
      recipient: context.receiving_address,
      recipientType: QuoteRequest.recipientType.DESTINATION_CHAIN,
      deadline: new Date(Date.now() + 20 * 60_000).toISOString(),
    };
    const response = await requestOneClickQuote(quoteRequest);
    if (!verifyQuoteSignature(response)
      || !/^\d+$/.test(response.quote?.amountIn ?? "") || BigInt(response.quote?.amountIn ?? "0") <= 0n
      || !/^\d+$/.test(response.quote?.amountOut ?? "") || BigInt(response.quote?.amountOut ?? "0") <= 0n
      || !/^\d+$/.test(response.quote?.minAmountOut ?? "")
      || response.quote.amountOut !== targetAmount
      || BigInt(response.quote.minAmountOut) > BigInt(response.quote.amountOut)
      || response.quoteRequest.dry !== !commit
      || response.quoteRequest.swapType !== QuoteRequest.swapType.EXACT_OUTPUT
      || response.quoteRequest.depositType !== QuoteRequest.depositType.ORIGIN_CHAIN
      || response.quoteRequest.recipientType !== QuoteRequest.recipientType.DESTINATION_CHAIN
      || response.quoteRequest.originAsset !== source.assetId
      || response.quoteRequest.destinationAsset !== destination.assetId
      || response.quoteRequest.amount !== targetAmount
      || response.quoteRequest.slippageTolerance !== 100
      || response.quoteRequest.recipient !== context.receiving_address
      || response.quoteRequest.refundTo !== body.refundAddress) return jsonError("invalid_upstream_quote", 502);
    if (!commit) return NextResponse.json({ mode: "live-preview", invoice: { number: context.invoice_number, amountMinor: context.amount_minor, currency: context.currency }, source: { assetId: source.assetId, symbol: source.symbol, blockchain: source.blockchain, decimals: source.decimals }, destination: { assetId: destination.assetId, symbol: destination.symbol, blockchain: destination.blockchain, decimals: destination.decimals, recipient: context.receiving_address }, quote: response }, { headers: { "Cache-Control": "no-store" } });

    if (!response.quote.depositAddress || !response.quote.deadline
      || !isAddress(response.quote.depositAddress) || !Number.isFinite(Date.parse(response.quote.deadline))
      || Date.parse(response.quote.deadline) <= Date.now()) return jsonError("committed_quote_missing_deposit", 502);
    if (!admin) return jsonError("live_payments_disabled", 503);
    const { data: attempts, error: attemptError } = await admin.rpc("create_committed_payment_attempt", {
      p_token_hash: tokenHash,
      p_idempotency_key: body.idempotencyKey as string,
      p_source_asset_id: source.assetId,
      p_source_network: sourceNetwork.key,
      p_destination_asset_id: destination.assetId,
      p_destination_network: receivingNetwork.key,
      p_recipient_address: context.receiving_address,
      p_requested_amount: response.quote.amountIn,
      p_expected_received_amount: response.quote.amountOut,
      p_deposit_address: response.quote.depositAddress,
      p_deposit_memo: response.quote.depositMemo ?? null,
      p_quote_expires_at: response.quote.deadline,
      p_quote_snapshot: response,
    });
    if (attemptError || !attempts?.[0]) return jsonError("payment_attempt_conflict", 409);
    return NextResponse.json({ mode: "live-committed", attempt: attempts[0], quote: response }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "quote_failed";
    return jsonError(message.includes("timeout") ? "quote_timeout" : "quote_unavailable", 503);
  }
}
