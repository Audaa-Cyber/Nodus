import { NextResponse } from "next/server";
import { lookupPublicPaymentContext } from "@/lib/payments/public-payment-context";
import { discoverPaymentRoutes } from "@/lib/payments/route-orchestrator";
import { getCircleChain } from "@/lib/server/circle";
import { CircleQuoteValidationError, circleUsdcToBaseUnits, fetchCircleReceiveExactQuote } from "@/lib/server/circle-quote-validation";
import { circleTestnetUsdcNetworks } from "@/lib/wallet/networks";

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

  const { context: invoice, error: ctxError } = await lookupPublicPaymentContext(token);

  if (ctxError || !invoice) {
    return NextResponse.json({ error: "invoice_unavailable" }, { status: 404 });
  }
  if (!invoice || (invoice.invoice_status !== "open" && invoice.invoice_status !== "overdue")) {
    return NextResponse.json({ error: "invoice_not_payable" }, { status: 409 });
  }

  if (!invoice.receiving_address || !invoice.receiving_network) {
    return NextResponse.json({ error: "receiving_destination_not_configured" }, { status: 400 });
  }

  const destinationNetworkOption = circleTestnetUsdcNetworks.find((network) => network.key === invoice.receiving_network);
  const destinationCircle = destinationNetworkOption ? getCircleChain(invoice.receiving_network, true) : null;
  if (!destinationNetworkOption || !destinationCircle) {
    return NextResponse.json({ error: "unsupported_circle_testnet_destination_network" }, { status: 400 });
  }

  const sourceNetworkOption = circleTestnetUsdcNetworks.find((network) => network.key === sourceNetwork);
  const sourceCircle = sourceNetworkOption ? getCircleChain(sourceNetwork, true) : null;
  if (!sourceNetworkOption || !sourceCircle
    || sourceAssetId !== `${sourceNetwork}:usdc`
    || sourceSymbol.toUpperCase() !== "USDC" || sourceDecimals !== 6
    || sourceContractAddress?.toLowerCase() !== sourceCircle.usdcAddress.toLowerCase()) {
    return NextResponse.json({ error: "unsupported_circle_testnet_source_asset" }, { status: 400 });
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

  const routes: typeof result.routes = [];
  for (const route of result.routes) {
    if (route.provider !== "circle_cctp") {
      routes.push(route);
      continue;
    }
    const source = getCircleChain(route.sourceNetwork, true);
    const destination = getCircleChain(route.destinationNetwork, true);
    if (!source || !destination) continue;
    try {
      const quote = await fetchCircleReceiveExactQuote({
        source,
        destination,
        amountBaseUnits: route.expectedReceivedAmount,
      });
      routes.push({
        ...route,
        requestedAmount: circleUsdcToBaseUnits(quote.totalDebit) ?? route.requestedAmount,
        quoteExpiresAt: quote.expiresAt,
        fees: {
          protocolFeeUsd: quote.feeTotal,
          networkFeeEstimate: "Read from connected wallet before authorization",
        },
        quoteSnapshot: {
          type: "circle_cctp",
          invoiceId: route.quoteSnapshot.invoiceId,
          amountMinor: route.quoteSnapshot.amountMinor,
          requiredBaseUnits: route.expectedReceivedAmount,
          sourceNetwork: route.sourceNetwork,
          destinationNetwork: route.destinationNetwork,
          sourceCctpDomain: source.cctpDomainId,
          destinationCctpDomain: destination.cctpDomainId,
          recipientAddress: route.recipientAddress,
          quote: quote.quote,
          amountReceived: quote.amountReceived,
          feeTotal: quote.feeTotal,
          feeItems: quote.feeItems,
          totalDebit: quote.totalDebit,
          quoteExpiryMode: quote.expiryMode,
          ...(quote.expiresAtBlock !== undefined ? { quoteExpiresAtBlock: quote.expiresAtBlock } : {}),
          quoteExpiresAt: quote.expiresAt,
        },
      });
    } catch (error) {
      if (error instanceof CircleQuoteValidationError && error.code === "unavailable") {
        return NextResponse.json({ error: "circle_quote_provider_unavailable" }, { status: 503 });
      }
      return NextResponse.json({ error: "circle_quote_unavailable_for_route" }, { status: 422 });
    }
  }

  return NextResponse.json(
    {
      success: true,
      routes,
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
