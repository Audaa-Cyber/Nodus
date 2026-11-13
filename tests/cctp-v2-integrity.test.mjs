import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseCctpV2Message,
  verifyCctpV2DestinationMessage,
  verifyCctpV2SourceMessage,
  verifyCctpSourceDebit,
  verifyCctpSourceTransactionIdentity,
  verifyUniqueMerchantTransfer,
  verifyImmutableAttemptInvoiceBinding,
  verifyCctpDestinationReceiptIdentity,
  hasRequiredConfirmations,
  isIrisMessageBoundToSource,
} from "../src/lib/payments/cctp-v2-integrity.ts";

const payer = "0x1111111111111111111111111111111111111111";
const wrapper = "0x2222222222222222222222222222222222222222";
const merchant = "0x3333333333333333333333333333333333333333";
const sourceUsdc = "0x4444444444444444444444444444444444444444";
const sourceMessenger = "0x5555555555555555555555555555555555555555";
const destinationMessenger = "0x6666666666666666666666666666666666666666";
const hook = "0x636374702d666f72776172640000000000000000000000000000000000000000";
const nonce = `0x${"0".repeat(63)}1`;
const amount = 1_250_000n;
const maxFee = 25_000n;

function uint(value, bytes) { return BigInt(value).toString(16).padStart(bytes * 2, "0"); }
function addr32(value) { return value.slice(2).toLowerCase().padStart(64, "0"); }
function message({ executedFinality = 1000, feeExecuted = 0n, expiry = 999999n, bodyOverride = null, nonceValue = 1n } = {}) {
  const body = bodyOverride ?? [
    uint(1, 4), addr32(sourceUsdc), addr32(merchant), uint(amount, 32), addr32(wrapper),
    uint(maxFee, 32), uint(feeExecuted, 32), uint(expiry, 32), hook.slice(2),
  ].join("");
  return `0x${[
    uint(1, 4), uint(6, 4), uint(3, 4), uint(nonceValue, 32), addr32(sourceMessenger),
    addr32(destinationMessenger), "0".repeat(64), uint(1000, 4), uint(executedFinality, 4), body,
  ].join("")}`;
}
const deposit = {
  burnToken: sourceUsdc, amount, depositor: wrapper, mintRecipient: `0x${addr32(merchant)}`,
  destinationDomain: 3, destinationTokenMessenger: `0x${addr32(destinationMessenger)}`,
  destinationCaller: `0x${"0".repeat(64)}`, maxFee, minFinalityThreshold: 1000, hookData: hook,
};
const sourceInput = (overrides = {}) => ({
  sourceMessage: message({ executedFinality: 0, expiry: 0n }),
  attestedMessage: message({ executedFinality: 1000, feeExecuted: 20_000n, expiry: 999999n }),
  deposit: { ...deposit }, sourceDomain: 6, destinationDomain: 3,
  sourceUsdc, sourceTokenMessenger: sourceMessenger, destinationTokenMessenger: destinationMessenger,
  minimumReceived: amount.toString(), payer, merchantRecipient: merchant,
  feeWrapper: wrapper, ...overrides,
});

test("parses canonical CCTP V2 nonce and burn body", () => {
  const parsed = parseCctpV2Message(message());
  assert.equal(parsed.sourceDomain, 6);
  assert.equal(parsed.destinationDomain, 3);
  assert.equal(parsed.nonce, nonce);
  assert.equal(parsed.body.amount, amount);
});

test("binds the source burn, payer-controlled wrapper call and IRIS V2 message", () => {
  const proof = verifyCctpV2SourceMessage(sourceInput());
  assert.equal(proof.nonce, nonce);
  assert.equal(proof.amount, amount.toString());
  assert.match(proof.messageHash, /^0x[0-9a-f]{64}$/);
});

test("accepts the CCTP V2 source event's zero nonce placeholder and binds the assigned IRIS nonce", () => {
  const input = sourceInput({ sourceMessage: message({ executedFinality: 0, expiry: 0n, nonceValue: 0n }) });
  assert.throws(() => parseCctpV2Message(input.sourceMessage), /unsupported_or_uninitialized_cctp_v2_message/);
  const proof = verifyCctpV2SourceMessage(input);
  assert.equal(proof.nonce, nonce);
});

test("checks the actual source transaction chain, payer, wrapper target and receipt status", () => {
  const valid = {
    transactionChainId: 84532, expectedChainId: 84532, transactionFrom: payer,
    payer, transactionTo: wrapper, expectedFeeWrapper: wrapper, receiptStatus: "success",
  };
  assert.doesNotThrow(() => verifyCctpSourceTransactionIdentity(valid));
  assert.throws(() => verifyCctpSourceTransactionIdentity({ ...valid, transactionFrom: merchant }));
  assert.throws(() => verifyCctpSourceTransactionIdentity({ ...valid, transactionChainId: 1 }));
  assert.throws(() => verifyCctpSourceTransactionIdentity({ ...valid, transactionTo: sourceMessenger }));
  assert.throws(() => verifyCctpSourceTransactionIdentity({ ...valid, receiptStatus: "reverted" }));
});

test("requires the IRIS result to reference the exact submitted source transaction and domains", () => {
  const valid = {
    reportedSourceTxHash: `0x${"a".repeat(64)}`, requestedSourceTxHash: `0x${"A".repeat(64)}`,
    sourceDomain: "6", expectedSourceDomain: 6,
    destinationDomain: "3", expectedDestinationDomain: 3,
  };
  assert.equal(isIrisMessageBoundToSource(valid), true);
  assert.equal(isIrisMessageBoundToSource({ ...valid, reportedSourceTxHash: `0x${"b".repeat(64)}` }), false);
  assert.equal(isIrisMessageBoundToSource({ ...valid, sourceDomain: "3" }), false);
  assert.equal(isIrisMessageBoundToSource({ ...valid, destinationDomain: "6" }), false);
  assert.equal(isIrisMessageBoundToSource({ ...valid, reportedSourceTxHash: undefined }), false);
});

test("checks source USDC debit against the payer-approved total and canonical wrapper", () => {
  const expected = {
    canonicalUsdc: sourceUsdc, payer, feeWrapper: wrapper, expectedTotalDebit: "1275000",
  };
  assert.doesNotThrow(() => verifyCctpSourceDebit({ ...expected, transfers: [
    { token: sourceUsdc, from: payer, to: wrapper, amount: 1_275_000n },
  ] }));
  assert.throws(() => verifyCctpSourceDebit({ ...expected, transfers: [
    { token: sourceUsdc, from: merchant, to: wrapper, amount: 1_275_000n },
  ] }));
  assert.throws(() => verifyCctpSourceDebit({ ...expected, transfers: [
    { token: sourceUsdc, from: payer, to: wrapper, amount: 1_250_000n },
  ] }));
  assert.throws(() => verifyCctpSourceDebit({ ...expected, transfers: [
    { token: merchant, from: payer, to: wrapper, amount: 1_275_000n },
  ] }));
});

test("accepts INV-12 when principal and fee arrive as separate source transfers", () => {
  const receipt = JSON.parse(readFileSync(new URL("./fixtures/inv-12-source-receipt.json", import.meta.url), "utf8"));
  const inv12 = {
    sourceTransactionHash: receipt.sourceTransactionHash,
    payer: receipt.payer,
    wrapper: receipt.feeWrapper,
    usdc: receipt.canonicalUsdc,
    receiptStatus: receipt.receiptStatus,
    chainId: receipt.chainId,
    invoicePrincipal: 10_000_000n,
    burnAmount: 10_000_000n,
    feeTotal: 85_961n,
    totalDebit: 10_085_961n,
  };

  // Captured from the actual Base Sepolia receipt for INV-12; the payer's fee and principal are separate logs.
  const realReceiptTransfers = receipt.transfers.map((transfer) => ({ ...transfer, amount: BigInt(transfer.amount) }));

  // Invariant verification on real receipt data:
  assert.equal(inv12.burnAmount, 10_000_000n);
  assert.equal(inv12.invoicePrincipal + inv12.feeTotal, inv12.totalDebit);
  assert.equal(inv12.sourceTransactionHash, "0xe6b936fb6bbe80082d76e1d38f5583be7b3293d5269fdda4086e436743444e92");
  assert.equal(inv12.receiptStatus, "success");
  assert.equal(inv12.chainId, 84532);

  // Exact separate verification of principal and fee:
  const verified = verifyCctpSourceDebit({
    transfers: realReceiptTransfers,
    canonicalUsdc: inv12.usdc,
    payer: inv12.payer,
    feeWrapper: inv12.wrapper,
    expectedPrincipal: "10000000",
    expectedFee: "85961",
    expectedTotalDebit: "10085961",
  });

  assert.equal(verified.principal, 10_000_000n);
  assert.equal(verified.fee, 85_961n);
  assert.equal(verified.totalDebit, 10_085_961n);
  assert.equal(verified.principal + verified.fee, verified.totalDebit);

  // Rejection when fee does not match quoted terms:
  assert.throws(() => verifyCctpSourceDebit({
    transfers: realReceiptTransfers,
    canonicalUsdc: inv12.usdc,
    payer: inv12.payer,
    feeWrapper: inv12.wrapper,
    expectedPrincipal: "10000000",
    expectedFee: "80000",
    expectedTotalDebit: "10080000",
  }), /cctp_source_fee_debit_mismatch|cctp_source_debit_mismatch/);

  // Rejection when principal burn amount does not match:
  assert.throws(() => verifyCctpSourceDebit({
    transfers: realReceiptTransfers,
    canonicalUsdc: inv12.usdc,
    payer: inv12.payer,
    feeWrapper: inv12.wrapper,
    expectedPrincipal: "9000000",
    expectedFee: "85961",
    expectedTotalDebit: "9085961",
  }), /cctp_source_principal_debit_mismatch|cctp_source_debit_mismatch/);

  // Rejection when total debit does not equal principal + fees:
  assert.throws(() => verifyCctpSourceDebit({
    transfers: realReceiptTransfers,
    canonicalUsdc: inv12.usdc,
    payer: inv12.payer,
    feeWrapper: inv12.wrapper,
    expectedPrincipal: "10000000",
    expectedFee: "85961",
    expectedTotalDebit: "10099999",
  }), /cctp_source_debit_terms_mismatch/);

  // Rejection when payer has an unauthorized transfer to an arbitrary address:
  const tamperedTransfers = [
    ...realReceiptTransfers,
    { token: inv12.usdc, from: inv12.payer, to: "0x9999999999999999999999999999999999999999", amount: 1000n },
  ];
  assert.throws(() => verifyCctpSourceDebit({
    transfers: tamperedTransfers,
    canonicalUsdc: inv12.usdc,
    payer: inv12.payer,
    feeWrapper: inv12.wrapper,
    expectedPrincipal: "10000000",
    expectedFee: "85961",
    expectedTotalDebit: "10085961",
  }), /cctp_source_debit_mismatch/);
});

for (const [name, changed] of [
  ["wrong source domain", { sourceDomain: 99 }],
  ["wrong destination domain", { destinationDomain: 8 }],
  ["different payer/depositor", { deposit: { ...deposit, depositor: payer } }],
  ["wrong source USDC", { deposit: { ...deposit, burnToken: merchant } }],
  ["wrong burned amount", { deposit: { ...deposit, amount: amount + 1n } }],
  ["wrong destination messenger", { deposit: { ...deposit, destinationTokenMessenger: addr32(sourceMessenger) } }],
  ["wrong merchant forwarding target", { merchantRecipient: payer }],
  ["wrong Circle forwarding hook", { deposit: { ...deposit, hookData: "0x" } }],
  ["IRIS message nonce mismatch", { attestedMessage: message({ executedFinality: 1000 }).replace(`${uint(1, 32)}`, `${uint(2, 32)}`) }],
]) {
  test(`rejects ${name}`, () => assert.throws(() => verifyCctpV2SourceMessage(sourceInput(changed))));
}

test("rejects an IRIS attested message with different source burn terms", () => {
  const otherBurn = [
    uint(1, 4), addr32(sourceUsdc), addr32(merchant), uint(amount + 1n, 32), addr32(wrapper),
    uint(maxFee, 32), uint(20_000n, 32), uint(999999n, 32), hook.slice(2),
  ].join("");
  assert.throws(() => verifyCctpV2SourceMessage(sourceInput({
    attestedMessage: message({ executedFinality: 1000, feeExecuted: 20_000n, expiry: 999999n, bodyOverride: otherBurn }),
  })));
});

test("binds destination MessageReceived to source domain, nonce, messenger, body and finality", () => {
  assert.doesNotThrow(() => verifyCctpV2DestinationMessage({
    sourceDomain: 6, expectedSourceDomain: 6, nonce, expectedNonce: nonce, sourceTokenMessenger: `0x${addr32(sourceMessenger)}`,
    finalityThresholdExecuted: 1000, expectedFinalityThresholdExecuted: 1000,
    messageBody: "0xabcd", canonicalBody: "0xabcd",
  }));
  assert.throws(() => verifyCctpV2DestinationMessage({
    sourceDomain: 6, expectedSourceDomain: 6, nonce: `0x${"0".repeat(63)}2`, expectedNonce: nonce, sourceTokenMessenger: `0x${addr32(sourceMessenger)}`,
    finalityThresholdExecuted: 1000, expectedFinalityThresholdExecuted: 1000,
    messageBody: "0xabcd", canonicalBody: "0xabcd",
  }));
  assert.throws(() => verifyCctpV2DestinationMessage({
    sourceDomain: 6, expectedSourceDomain: 6, nonce, expectedNonce: nonce, sourceTokenMessenger: `0x${addr32(sourceMessenger)}`,
    finalityThresholdExecuted: 100, expectedFinalityThresholdExecuted: 1000,
    messageBody: "0xabcd", canonicalBody: "0xabcd",
  }));
  assert.throws(() => verifyCctpV2DestinationMessage({
    sourceDomain: 7, expectedSourceDomain: 6, nonce, expectedNonce: nonce, sourceTokenMessenger: `0x${addr32(sourceMessenger)}`,
    finalityThresholdExecuted: 1000, expectedFinalityThresholdExecuted: 1000,
    messageBody: "0xabcd", canonicalBody: "0xabcd",
  }));
  assert.throws(() => verifyCctpV2DestinationMessage({
    sourceDomain: 6, expectedSourceDomain: 6, nonce, expectedNonce: nonce, sourceTokenMessenger: `0x${addr32(sourceMessenger)}`,
    finalityThresholdExecuted: 1000, expectedFinalityThresholdExecuted: 1000,
    messageBody: "0xabcd", canonicalBody: "0xabce",
  }));
});

test("requires exactly one canonical USDC transfer to the merchant meeting invoice minimum", () => {
  const expected = { canonicalUsdc: sourceUsdc, merchantRecipient: merchant, minimumReceived: "1000000" };
  assert.equal(verifyUniqueMerchantTransfer({ ...expected, transfers: [
    { token: sourceUsdc, recipient: merchant, amount: 1_000_000n },
  ] }), "1000000");
  assert.throws(() => verifyUniqueMerchantTransfer({ ...expected, transfers: [
    { token: merchant, recipient: merchant, amount: 1_000_000n },
  ] }));
  assert.throws(() => verifyUniqueMerchantTransfer({ ...expected, transfers: [
    { token: sourceUsdc, recipient: payer, amount: 1_000_000n },
  ] }));
  assert.throws(() => verifyUniqueMerchantTransfer({ ...expected, transfers: [
    { token: sourceUsdc, recipient: merchant, amount: 999_999n },
  ] }));
  assert.throws(() => verifyUniqueMerchantTransfer({ ...expected, transfers: [
    { token: sourceUsdc, recipient: merchant, amount: 600_000n },
    { token: sourceUsdc, recipient: merchant, amount: 600_000n },
  ] }));
});

test("rejects failed or wrong-chain destination receipts and waits for configured finality", () => {
  assert.doesNotThrow(() => verifyCctpDestinationReceiptIdentity({
    transactionChainId: 421614, expectedChainId: 421614, receiptStatus: "success",
  }));
  assert.throws(() => verifyCctpDestinationReceiptIdentity({
    transactionChainId: 84532, expectedChainId: 421614, receiptStatus: "success",
  }));
  assert.throws(() => verifyCctpDestinationReceiptIdentity({
    transactionChainId: 421614, expectedChainId: 421614, receiptStatus: "reverted",
  }));
  assert.equal(hasRequiredConfirmations({ currentBlock: 100n, receiptBlock: 100n, requiredConfirmations: 2 }), false);
  assert.equal(hasRequiredConfirmations({ currentBlock: 101n, receiptBlock: 100n, requiredConfirmations: 2 }), true);
});

test("binds status verification to the immutable attempt snapshot, not the current profile address", () => {
  const input = {
    invoiceId: "invoice-1", attemptInvoiceId: "invoice-1",
    snapshot: {
      invoiceId: "invoice-1", invoiceAmountMinor: "100", invoiceCurrency: "USD",
      minimumReceived: "1000000", recipient: merchant, destinationNetwork: "arbitrum-sepolia",
      destinationAssetId: "arbitrum-sepolia:usdc", sourceNetwork: "base-sepolia",
      sourceAssetId: "base-sepolia:usdc", payer,
    },
    invoiceAmountMinor: "100", invoiceCurrency: "USD", expectedInvoiceAmountBaseUnits: "1000000",
    attemptExpectedReceivedAmount: "1000000", attemptRecipient: merchant,
    attemptDestinationNetwork: "arbitrum-sepolia", attemptDestinationAssetId: "arbitrum-sepolia:usdc",
    attemptSourceNetwork: "base-sepolia", attemptSourceAssetId: "base-sepolia:usdc",
  };
  assert.equal(verifyImmutableAttemptInvoiceBinding(input), payer);
  for (const changed of [
    { attemptRecipient: payer },
    { snapshot: { ...input.snapshot, recipient: payer } },
    { snapshot: { ...input.snapshot, minimumReceived: "999999" } },
    { attemptDestinationNetwork: "base-sepolia" },
    { invoiceAmountMinor: "101" },
    { invoiceCurrency: "EUR" },
  ]) {
    assert.throws(() => verifyImmutableAttemptInvoiceBinding({ ...input, ...changed }));
  }
});
