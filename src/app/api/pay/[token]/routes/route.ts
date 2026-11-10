import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { discoverPaymentRoutes } from "@/lib/payments/route-orchestrator";
import { getCircleChain } from "@/lib/server/circle";

export const dynamic = "force-dynamic";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN_PATTERN.test(token)) {
    return NextResponse.json({ error: "invoice_unavailable" }, { status: 404 });
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
  const sourceAssetId = String(input.sourceAssetId ?? "").trim();
  const sourceNetwork = String(input.sourceNetwork ?? "").trim();
  const sourceSymbol = String(input.sourceSymbol ?? "").trim();
  const sourceDecimals = Number(input.sourceDecimals ?? 6);
  const sourceContractAddress = typeof input.sourceContractAddress === "string" ? input.sourceContractAddress : null;
  const senderAddress = typeof input.senderAddress === "string" ? input.senderAddress : undefined;

  if (!sourceAssetId || !sourceNetwork || !sourceSymbol) {
    return NextResponse.json({ error: "missing_asset_parameters" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");

  const { data: contextRows, error: ctxError } = await supabase.rpc("lookup_shared_payment_context", {
    p_token_hash: tokenHash,
  });

  if (ctxError || !contextRows || contextRows.length === 0) {
    return NextResponse.json({ error: "invoice_unavailable" }, { status: 404 });
  }

  const invoice = contextRows[0];
  if (!invoice || (invoice.invoice_status !== "open" && invoice.invoice_status !== "overdue")) {
    return NextResponse.json({ error: "invoice_not_payable" }, { status: 409 });
  }

  if (!invoice.receiving_address || !invoice.receiving_network) {
    return NextResponse.json({ error: "receiving_destination_not_configured" }, { status: 400 });
  }

  const baseSepolia = getCircleChain("base-sepolia", true);
  const arbSepolia = getCircleChain("arbitrum-sepolia", true);
  if (sourceNetwork !== "base-sepolia" || sourceAssetId !== "base-sepolia:usdc"
    || sourceSymbol.toUpperCase() !== "USDC" || sourceDecimals !== 6
    || sourceContractAddress?.toLowerCase() !== baseSepolia?.usdcAddress.toLowerCase()
    || invoice.receiving_network !== "arbitrum-sepolia" || !baseSepolia || !arbSepolia) {
    return NextResponse.json({ error: "unsupported_circle_testnet_payment_route" }, { status: 400 });
  }

  const result = await discoverPaymentRoutes({
    invoiceId: invoice.invoice_id,
    amountMinor: Number(invoice.amount_minor),
    currency: invoice.currency,
    destinationNetwork: invoice.receiving_network,
    recipientAddress: invoice.receiving_address,
    sourceAssetId,
    sourceNetwork,
    sourceSymbol,
    sourceDecimals,
    sourceContractAddress,
    senderAddress,
    isTestnet: true,
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(
    {
      success: true,
      routes: result.routes,
      invoice: {
        id: invoice.invoice_id,
        invoiceNumber: invoice.invoice_number,
        amountMinor: invoice.amount_minor,
        currency: invoice.currency,
        receivingAddress: invoice.receiving_address,
        receivingNetwork: invoice.receiving_network,
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
