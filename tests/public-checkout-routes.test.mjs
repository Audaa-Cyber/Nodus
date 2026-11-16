import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const token = Buffer.alloc(32, 7).toString("base64url");
const invoiceContext = {
  invoice_id: "123e4567-e89b-42d3-a456-426614174000",
  invoice_number: "NOD-2026-0042",
  amount_minor: 18500,
  currency: "USD",
  invoice_status: "open",
  receiving_address: "0x1111111111111111111111111111111111111111",
  receiving_network: "arbitrum-sepolia",
};
const rpcCalls = [];

mock.module("server-only", { defaultExport: {} });
mock.module(new URL("../src/lib/supabase/server.ts", import.meta.url).href, {
  namedExports: {
    createSupabaseAnonymousServerClient: () => ({
      rpc: async (...args) => {
        rpcCalls.push(args);
        return { data: [invoiceContext], error: null };
      },
    }),
    createSupabaseServerClient: () => { throw new Error("cookie-bound client cannot resolve public checkout context"); },
  },
});

const { lookupPublicPaymentContext } = await import("../src/lib/payments/public-payment-context.ts");
const routeSource = await readFile(new URL("../src/app/api/pay/[token]/routes/route.ts", import.meta.url), "utf8");
const attemptSource = await readFile(new URL("../src/app/api/pay/[token]/attempt/route.ts", import.meta.url), "utf8");
const invoicePageSource = await readFile(new URL("../src/app/pay/[token]/page.tsx", import.meta.url), "utf8");
const checkoutSource = await readFile(new URL("../src/components/wallet/invoice-wallet-checkout.tsx", import.meta.url), "utf8");
const liveFlowSource = await readFile(new URL("../src/components/wallet/live-payment-flow.tsx", import.meta.url), "utf8");
const profileFormSource = await readFile(new URL("../src/components/profile-form.tsx", import.meta.url), "utf8");

test("public Circle invoice context hashes the path share token and uses an anonymous RPC client", async () => {
  rpcCalls.length = 0;
  const result = await lookupPublicPaymentContext(token);
  assert.equal(result.context, invoiceContext);
  assert.equal(result.error, null);
  assert.deepEqual(rpcCalls, [["lookup_shared_payment_context", {
    p_token_hash: createHash("sha256").update(token, "utf8").digest("hex"),
  }]]);
  assert.match(routeSource, /lookupPublicPaymentContext\(token\)/);
  assert.doesNotMatch(routeSource, /createSupabaseServerClient/);
  assert.match(invoicePageSource, /shareToken=\{token\}/);
  assert.match(checkoutSource, /<LivePaymentFlow[\s\S]*?shareToken=\{shareToken\}/);
  assert.match(liveFlowSource, /fetch\(`\/api\/pay\/\$\{encodeURIComponent\(shareToken\)\}\/routes`/);
});

test("route discovery keeps invoice amount, status, recipient, and network authoritative on the server", () => {
  assert.match(routeSource, /invoice\.invoice_status !== "open" && invoice\.invoice_status !== "overdue"/);
  assert.match(routeSource, /amountMinor:\s*Number\(invoice\.amount_minor\)/);
  assert.match(routeSource, /recipientAddress:\s*invoice\.receiving_address/);
  assert.match(routeSource, /destinationNetwork:\s*invoice\.receiving_network/);
  assert.doesNotMatch(routeSource, /input\.(amountMinor|recipientAddress|destinationNetwork)/);
});

test("payer and merchant can select supported testnet networks without a Base-to-Arbitrum-only gate", () => {
  assert.match(checkoutSource, /id="payerSourceNetwork"/);
  assert.match(checkoutSource, /circleTestnetUsdcNetworks\.map/);
  assert.match(profileFormSource, /name="receivingNetwork"/);
  assert.match(profileFormSource, /circleTestnetUsdcNetworks\.map/);
  assert.match(routeSource, /circleTestnetUsdcNetworks\.find\(\(network\) => network\.key === sourceNetwork\)/);
  assert.match(routeSource, /sourceContractAddress\?\.toLowerCase\(\) !== sourceCircle\.usdcAddress\.toLowerCase\(\)/);
  assert.doesNotMatch(routeSource, /sourceNetwork !== "base-sepolia"/);
  assert.doesNotMatch(routeSource, /invoice\.receiving_network !== "arbitrum-sepolia"/);
});

test("CCTP routes carry a server fetched Circle quote and attempts revalidate it with Circle", () => {
  assert.match(routeSource, /fetchCircleReceiveExactQuote/);
  assert.match(routeSource, /routes\.push\(\{[\s\S]*?quoteSnapshot:[\s\S]*?quote: quote\.quote/);
  assert.doesNotMatch(routeSource, /routes:\s*result\.routes/);
  assert.match(attemptSource, /validateCircleSignedQuote/);
  assert.match(attemptSource, /circle_quote_validation_unavailable/);
});
