import assert from "node:assert/strict";
import { mock, test } from "node:test";

mock.module("server-only", { defaultExport: {} });
const {
  circleFeeQuoteRequest,
  circleQuoteValidationRequest,
  validateCircleSignedQuote,
  fetchCircleReceiveExactQuote,
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

test("quote validation binds signed quote to exact amount, domains, merchant, fee token and payer", () => {
  const result = circleQuoteValidationRequest({
    source, destination, payer, recipient, amountBaseUnits: "25000000", quote: signedQuote,
    feeTotal: "0.01", feeItems: [{ type: "FORWARD", amount: "0.01" }], expiresAt,
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
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
