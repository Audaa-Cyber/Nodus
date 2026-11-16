import assert from "node:assert/strict";
import { mock, test } from "node:test";

mock.module("server-only", { defaultExport: {} });
const {
  circleFeeQuoteRequest,
  circleQuoteValidationRequest,
  validateCircleSignedQuote,
  fetchCircleReceiveExactQuote,
  CircleQuoteValidationError,
} = await import("../src/lib/server/circle-quote-validation.ts");

const source = {
  networkKey: "base",
  name: "Base Sepolia",
  chainId: 84532,
  cctpDomainId: 6,
  usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  tokenMessengerAddress: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
};
const destination = {
  networkKey: "optimism",
  name: "Optimism Sepolia",
  chainId: 11155420,
  cctpDomainId: 2,
  usdcAddress: "0x5fd84259d66Cd46123540766Be93DFE6D43130D7",
  tokenMessengerAddress: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
};
const arcSource = {
  networkKey: "arc-testnet",
  name: "Arc Testnet",
  chainId: 5042002,
  cctpDomainId: 26,
  usdcAddress: "0x3600000000000000000000000000000000000000",
  tokenMessengerAddress: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
  tokenMessengerWithFees: "0x8745D906D67C346E5eb1aEEED38Eb87F34DF0C0A",
  supportsFastTransfer: false,
};
const ethereumSepolia = {
  networkKey: "ethereum",
  name: "Ethereum Sepolia",
  chainId: 11155111,
  cctpDomainId: 0,
  usdcAddress: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  tokenMessengerAddress: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA",
};
const payer = "0x1111111111111111111111111111111111111111";
const recipient = "0x2222222222222222222222222222222222222222";
const signedQuote = `0x${"ab".repeat(65)}`;
const expiresAt = new Date(1_900_000_000_000).toISOString();

test("Circle quote requests bind amount, source token and forwarding destination", () => {
  const result = circleFeeQuoteRequest({ source, destination, amountBaseUnits: "25000000" });
  assert.equal(result.url, "https://iris-api-sandbox.circle.com/v2/quote/burn/usdc/6/2");
  assert.equal(result.body.amount, "25000000");
  assert.equal(result.body.feeToken, source.usdcAddress);
  assert.equal(result.body.requests[0].type, "FORWARD");
  assert.equal(result.body.requests[0].params.destinationCaller, "0x0000000000000000000000000000000000000000");
  assert.equal(result.body.requests[0].params.hookData, `0x${Buffer.concat([Buffer.from("cctp-forward"), Buffer.alloc(20)]).toString("hex")}`);
  assert.equal(result.body.requests[1].type, "PRE_FINALITY");
});

test("Arc Testnet to Ethereum Sepolia requests only the supported Standard Transfer quote", () => {
  const result = circleFeeQuoteRequest({ source: arcSource, destination: ethereumSepolia, amountBaseUnits: "50000000" });
  assert.equal(result.url, "https://iris-api-sandbox.circle.com/v2/quote/burn/usdc/26/0");
  assert.equal(result.body.amount, "50000000");
  assert.equal(result.body.feeToken, arcSource.usdcAddress);
  assert.deepEqual(result.body.requests.map((request) => request.type), ["FORWARD"]);
});

test("Ethereum Sepolia to Arc Testnet retains supported fast-transfer quote discovery", () => {
  const result = circleFeeQuoteRequest({ source: ethereumSepolia, destination: arcSource, amountBaseUnits: "50000000" });
  assert.equal(result.url, "https://iris-api-sandbox.circle.com/v2/quote/burn/usdc/0/26");
  assert.deepEqual(result.body.requests.map((request) => request.type), ["FORWARD", "PRE_FINALITY"]);
});

test("quote validation binds signed quote to exact amount, domains, merchant, fee token and payer", () => {
  const result = circleQuoteValidationRequest({
    source, destination, payer, recipient, amountBaseUnits: "25000000", quote: signedQuote,
    feeTotal: "0.01", feeItems: [{ type: "FORWARD", amount: "0.01" }], expiresAt,
    expiryMode: "TIMESTAMP",
  });
  assert.equal(result.url, "https://iris-api-sandbox.circle.com/v2/quote/validate/usdc/6");
  assert.deepEqual(result.body.args, [
    "25000000", "2", `0x${"0".repeat(24)}${recipient.slice(2)}`, source.usdcAddress,
    `0x${"0".repeat(64)}`,
    `0x${Buffer.concat([Buffer.from("cctp-forward"), Buffer.alloc(20)]).toString("hex")}`,
    [signedQuote, payer],
  ]);
});

test("server accepts only a Circle validated quote with matching fees and expiry", async () => {
  const originalFetch = globalThis.fetch;
  const expirySeconds = Date.parse(expiresAt) / 1000;
  let requestBody;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://iris-api-sandbox.circle.com/v2/quote/validate/usdc/6");
    requestBody = JSON.parse(init.body);
    return Response.json({
      signedQuote,
      claimable: true,
      failedChecks: [],
      feeToken: source.usdcAddress,
      feeTotalAmount: "10000",
      expiry: { mode: "TIMESTAMP", expired: false, secondsRemaining: 120, expiresAt: expirySeconds },
      items: [{ type: "FORWARD", argsMatch: true, amount: "10000" }],
    });
  };
  try {
    await validateCircleSignedQuote({
      source, destination, payer, recipient, amountBaseUnits: "25000000", quote: signedQuote,
      feeTotal: "0.01", feeItems: [{ type: "FORWARD", amount: "0.01" }], expiresAt,
      expiryMode: "TIMESTAMP",
    });
    assert.equal(requestBody.args[0], "25000000");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("quote validation rejects provider response terms that differ from the invoice quote", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    signedQuote,
    claimable: true,
    failedChecks: [],
    feeToken: source.usdcAddress,
    feeTotalAmount: "20000",
    expiry: { mode: "TIMESTAMP", expired: false, secondsRemaining: 120, expiresAt: Date.parse(expiresAt) / 1000 },
    items: [{ type: "FORWARD", argsMatch: true, amount: "20000" }],
  });
  try {
    await assert.rejects(() => validateCircleSignedQuote({
      source, destination, payer, recipient, amountBaseUnits: "25000000", quote: signedQuote,
      feeTotal: "0.01", feeItems: [{ type: "FORWARD", amount: "0.01" }], expiresAt,
      expiryMode: "TIMESTAMP",
    }), /circle_quote_invalid/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("server quote parsing derives debit and fees from Circle response only", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    signedQuote,
    feeToken: source.usdcAddress,
    feeTotalAmount: "12500",
    expiry: { mode: "TIMESTAMP", expiresAt: Date.parse(expiresAt) / 1000 },
    items: [{ type: "FORWARD", amount: "12500" }],
  });
  try {
    const quote = await fetchCircleReceiveExactQuote({ source, destination, amountBaseUnits: "25000000" });
    assert.deepEqual(quote, {
      quote: signedQuote,
      amountReceived: "25",
      feeTotal: "0.0125",
      totalDebit: "25.0125",
      feeItems: [{ type: "FORWARD", amount: "0.0125" }],
      expiresAt,
      expiryMode: "TIMESTAMP",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Arc quote response is parsed and validated for exact amount, fee token, and fee total", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://iris-api-sandbox.circle.com/v2/quote/burn/usdc/26/0");
    assert.deepEqual(JSON.parse(init.body).requests.map((request) => request.type), ["FORWARD"]);
    return Response.json({
      signedQuote,
      feeToken: arcSource.usdcAddress,
      feeTotalAmount: "196714",
      expiry: { mode: "TIMESTAMP", expiresAt: Date.parse(expiresAt) / 1000 },
      items: [{ type: "FORWARD", amount: "196714" }],
    });
  };
  try {
    const quote = await fetchCircleReceiveExactQuote({ source: arcSource, destination: ethereumSepolia, amountBaseUnits: "50000000" });
    assert.equal(quote.amountReceived, "50");
    assert.equal(quote.feeTotal, "0.196714");
    assert.equal(quote.totalDebit, "50.196714");
    assert.deepEqual(quote.feeItems, [{ type: "FORWARD", amount: "0.196714" }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("quote rejection preserves a safe Circle reason and HTTP status", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ errorCode: "INVALID_REQUEST", error: "USDC pre-finality fee is unavailable for this route" }, { status: 422 });
  try {
    await assert.rejects(
      () => fetchCircleReceiveExactQuote({ source: arcSource, destination: ethereumSepolia, amountBaseUnits: "50000000" }),
      (error) => {
        assert.ok(error instanceof CircleQuoteValidationError);
        assert.equal(error.reason, "fast_transfer_quote_unavailable");
        assert.equal(error.providerStatus, 422);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("live Circle Arc Testnet to Ethereum Sepolia quote is obtained and validates", {
  skip: process.env.NODUS_LIVE_CIRCLE_QUOTE !== "1",
}, async () => {
  const amountBaseUnits = "50000000";
  for (const [sourceChain, destinationChain] of [
    [arcSource, ethereumSepolia],
    [ethereumSepolia, arcSource],
  ]) {
    const quote = await fetchCircleReceiveExactQuote({
      source: sourceChain,
      destination: destinationChain,
      amountBaseUnits,
    });
    assert.equal(quote.amountReceived, "50");
    assert.match(quote.quote, /^0x(?:[0-9a-fA-F]{2})+$/);
    assert.ok(quote.feeItems.some((item) => item.type === "FORWARD"));

    await validateCircleSignedQuote({
      source: sourceChain,
      destination: destinationChain,
      payer,
      recipient,
      amountBaseUnits,
      quote: quote.quote,
      feeTotal: quote.feeTotal,
      feeItems: quote.feeItems,
      expiresAt: quote.expiresAt,
      expiryMode: quote.expiryMode,
      ...(quote.expiresAtBlock !== undefined ? { expiresAtBlock: quote.expiresAtBlock } : {}),
    });
  }
});

test("server accepts block-number quotes and preserves the authoritative expiry block", async () => {
  const originalFetch = globalThis.fetch;
  const estimatedExpiry = 1_900_000_000;
  const expiresAtBlock = 12_345_678;
  globalThis.fetch = async () => Response.json({
    signedQuote,
    feeToken: source.usdcAddress,
    feeTotalAmount: "12500",
    expiry: { mode: "BLOCK_NUMBER", expiresAtBlock, blockEstimatedAt: estimatedExpiry },
    items: [{ type: "FORWARD", amount: "12500" }],
  });
  try {
    const quote = await fetchCircleReceiveExactQuote({ source, destination, amountBaseUnits: "25000000" });
    assert.equal(quote.expiryMode, "BLOCK_NUMBER");
    assert.equal(quote.expiresAtBlock, expiresAtBlock);
    assert.equal(quote.expiresAt, new Date(estimatedExpiry * 1000).toISOString());
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("server validates block-number expiry against Circle's authoritative block", async () => {
  const originalFetch = globalThis.fetch;
  const expiresAtBlock = 12_345_678;
  globalThis.fetch = async () => Response.json({
    signedQuote,
    claimable: true,
    failedChecks: [],
    feeToken: source.usdcAddress,
    feeTotalAmount: "10000",
    expiry: { mode: "BLOCK_NUMBER", expired: false, secondsRemaining: 120, expiresAtBlock, blockEstimatedAt: Date.parse(expiresAt) / 1000 + 15 },
    items: [{ type: "FORWARD", argsMatch: true, amount: "10000" }],
  });
  const input = {
    source, destination, payer, recipient, amountBaseUnits: "25000000", quote: signedQuote,
    feeTotal: "0.01", feeItems: [{ type: "FORWARD", amount: "0.01" }], expiresAt,
    expiryMode: "BLOCK_NUMBER", expiresAtBlock,
  };
  try {
    await validateCircleSignedQuote(input);
    await assert.rejects(() => validateCircleSignedQuote({ ...input, expiresAtBlock: expiresAtBlock + 1 }), /circle_quote_invalid/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Circle quote validation preserves a safe rejection reason for development diagnostics", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    signedQuote,
    claimable: false,
    failedChecks: ["expired"],
    feeToken: source.usdcAddress,
    feeTotalAmount: "10000",
    expiry: { mode: "BLOCK_NUMBER", expired: true, secondsRemaining: 0, expiresAtBlock: 12_345_678 },
    items: [{ type: "FORWARD", argsMatch: true, amount: "10000" }],
  });
  try {
    await assert.rejects(() => validateCircleSignedQuote({
      source, destination, payer, recipient, amountBaseUnits: "25000000", quote: signedQuote,
      feeTotal: "0.01", feeItems: [{ type: "FORWARD", amount: "0.01" }], expiresAt,
      expiryMode: "BLOCK_NUMBER", expiresAtBlock: 12_345_678,
    }), (error) => {
      assert.ok(error instanceof CircleQuoteValidationError);
      assert.equal(error.reason, "circle_quote_not_claimable");
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
