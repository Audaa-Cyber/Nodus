import test from "node:test";
import assert from "node:assert/strict";
import {
  estimateCircleSourceGas,
  fetchCircleAllowance,
  fetchCircleGasPriceWei,
  withTimeout,
  CIRCLE_GAS_ESTIMATE_UNAVAILABLE_MESSAGE,
  APPROVE_GAS_LIMIT,
  DEPOSIT_FOR_BURN_WITH_FEES_GAS_LIMIT,
  BASE_SEPOLIA_USDC_ADDRESS,
  BASE_SEPOLIA_TOKEN_MESSENGER_WITH_FEES,
} from "../src/lib/payments/circle-gas-estimation.ts";

const VALID_PAYER = "0x1111111111111111111111111111111111111111";
const AMOUNT_USDC_BASE_UNITS = 10_086_919n; // 10.086919 USDC
const MOCK_GAS_PRICE = 7_000_000n; // 0.007 gwei

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function createMockClient(options = {}) {
  const {
    allowance = 0n,
    allowanceError = null,
    allowanceDelay = 0,
    fees = { maxFeePerGas: MOCK_GAS_PRICE, maxPriorityFeePerGas: 1_000_000n },
    feesError = null,
    feesDelay = 0,
    gasPrice = MOCK_GAS_PRICE,
    gasPriceError = null,
    gasPriceDelay = 0,
  } = options;

  return {
    async readContract() {
      if (allowanceDelay > 0) {
        await sleep(allowanceDelay);
      }
      if (allowanceError) {
        throw allowanceError;
      }
      return allowance;
    },
    async estimateFeesPerGas() {
      if (feesDelay > 0) {
        await sleep(feesDelay);
      }
      if (feesError) {
        throw feesError;
      }
      return fees;
    },
    async getGasPrice() {
      if (gasPriceDelay > 0) {
        await sleep(gasPriceDelay);
      }
      if (gasPriceError) {
        throw gasPriceError;
      }
      return gasPrice;
    },
  };
}

test("successful gas estimate when approval is required (allowance < amount)", async () => {
  const mockClient = createMockClient({ allowance: 0n });
  const result = await estimateCircleSourceGas({
    payerAddress: VALID_PAYER,
    amountBaseUnits: AMOUNT_USDC_BASE_UNITS,
    publicClient: mockClient,
    timeoutMs: 1000,
  });

  const expectedUnits = APPROVE_GAS_LIMIT + DEPOSIT_FOR_BURN_WITH_FEES_GAS_LIMIT;
  const expectedGasWei = expectedUnits * MOCK_GAS_PRICE;

  assert.equal(result.requiresApproval, true);
  assert.equal(result.allowanceSufficient, false);
  assert.equal(result.gasUnits, expectedUnits);
  assert.equal(result.gasPriceWei, MOCK_GAS_PRICE);
  assert.equal(result.estimatedGasWei, expectedGasWei);
  assert.equal(result.rpcUsed, "primary");
  assert.ok(result.estimatedGasWei > 0n);
});

test("successful gas estimate when allowance is already sufficient", async () => {
  const mockClient = createMockClient({ allowance: AMOUNT_USDC_BASE_UNITS + 1000n });
  const result = await estimateCircleSourceGas({
    payerAddress: VALID_PAYER,
    amountBaseUnits: AMOUNT_USDC_BASE_UNITS,
    publicClient: mockClient,
    timeoutMs: 1000,
  });

  const expectedUnits = DEPOSIT_FOR_BURN_WITH_FEES_GAS_LIMIT;
  const expectedGasWei = expectedUnits * MOCK_GAS_PRICE;

  assert.equal(result.requiresApproval, false);
  assert.equal(result.allowanceSufficient, true);
  assert.equal(result.gasUnits, expectedUnits);
  assert.equal(result.gasPriceWei, MOCK_GAS_PRICE);
  assert.equal(result.estimatedGasWei, expectedGasWei);
  assert.equal(result.rpcUsed, "primary");
  assert.ok(result.estimatedGasWei > 0n);
});

test("fallback to backup RPC when primary client throws an error", async () => {
  const failingPrimaryClient = createMockClient({
    allowanceError: new Error("Primary RPC connection refused"),
  });

  const result = await estimateCircleSourceGas({
    payerAddress: VALID_PAYER,
    amountBaseUnits: AMOUNT_USDC_BASE_UNITS,
    publicClient: failingPrimaryClient,
    timeoutMs: 5000,
  });

  assert.equal(result.rpcUsed, "fallback");
  assert.ok(result.estimatedGasWei > 0n);
  assert.ok(result.gasPriceWei > 0n);
  assert.equal(result.gasUnits, APPROVE_GAS_LIMIT + DEPOSIT_FOR_BURN_WITH_FEES_GAS_LIMIT);
});

test("fallback to backup RPC when primary client times out", async () => {
  const hangingPrimaryClient = createMockClient({
    allowanceDelay: 500, // exceeds timeoutMs of 50ms
  });
  const fastFallbackClient = createMockClient({
    allowance: 0n,
  });

  const result = await estimateCircleSourceGas({
    payerAddress: VALID_PAYER,
    amountBaseUnits: AMOUNT_USDC_BASE_UNITS,
    publicClient: hangingPrimaryClient,
    fallbackClient: fastFallbackClient,
    timeoutMs: 50, // Short timeout triggers fallback
  });

  assert.equal(result.rpcUsed, "fallback");
  assert.ok(result.estimatedGasWei > 0n);
  assert.ok(result.gasPriceWei > 0n);
});

test("strict fail-closed: throws standard error when both primary and fallback fail", async () => {
  const failingPrimaryClient = createMockClient({
    allowanceError: new Error("Primary unreachable"),
  });

  await assert.rejects(
    async () => {
      await estimateCircleSourceGas({
        payerAddress: VALID_PAYER,
        amountBaseUnits: AMOUNT_USDC_BASE_UNITS,
        publicClient: failingPrimaryClient,
        fallbackRpcUrl: "http://127.0.0.1:59999/unreachable-rpc",
        timeoutMs: 500,
      });
    },
    {
      name: "Error",
      message: CIRCLE_GAS_ESTIMATE_UNAVAILABLE_MESSAGE,
    }
  );
});

test("strict fail-closed: withTimeout throws expected error on timeout", async () => {
  await assert.rejects(
    async () => {
      await withTimeout(
        sleep(200),
        50,
        "Operation timed out test"
      );
    },
    {
      name: "Error",
      message: "Operation timed out test",
    }
  );
});

test("strict fail-closed: throws when gas price is zero or negative, never returns zero gas", async () => {
  const zeroPriceClient = createMockClient({
    fees: { maxFeePerGas: 0n, maxPriorityFeePerGas: 0n },
    gasPrice: 0n,
  });

  await assert.rejects(
    async () => {
      await estimateCircleSourceGas({
        payerAddress: VALID_PAYER,
        amountBaseUnits: AMOUNT_USDC_BASE_UNITS,
        publicClient: zeroPriceClient,
        fallbackRpcUrl: "http://127.0.0.1:59999/no-rpc",
        timeoutMs: 500,
      });
    },
    {
      name: "Error",
      message: CIRCLE_GAS_ESTIMATE_UNAVAILABLE_MESSAGE,
    }
  );
});

test("input validation: rejects invalid payer address", async () => {
  await assert.rejects(
    async () => {
      await estimateCircleSourceGas({
        payerAddress: "0xinvalid",
        amountBaseUnits: AMOUNT_USDC_BASE_UNITS,
      });
    },
    {
      name: "Error",
      message: CIRCLE_GAS_ESTIMATE_UNAVAILABLE_MESSAGE,
    }
  );
});

test("input validation: rejects non-positive payment amount", async () => {
  await assert.rejects(
    async () => {
      await estimateCircleSourceGas({
        payerAddress: VALID_PAYER,
        amountBaseUnits: 0n,
      });
    },
    {
      name: "Error",
      message: CIRCLE_GAS_ESTIMATE_UNAVAILABLE_MESSAGE,
    }
  );

  await assert.rejects(
    async () => {
      await estimateCircleSourceGas({
        payerAddress: VALID_PAYER,
        amountBaseUnits: -100n,
      });
    },
    {
      name: "Error",
      message: CIRCLE_GAS_ESTIMATE_UNAVAILABLE_MESSAGE,
    }
  );
});

test("live integration: queries real Base Sepolia RPC and produces positive gas estimate", async () => {
  const result = await estimateCircleSourceGas({
    payerAddress: VALID_PAYER,
    amountBaseUnits: AMOUNT_USDC_BASE_UNITS,
    timeoutMs: 8000,
  });

  assert.equal(result.rpcUsed, "fallback"); // No primaryClient passed, used default RPC
  assert.ok(result.gasPriceWei > 0n);
  assert.ok(result.estimatedGasWei > 0n);
  assert.equal(result.gasUnits, APPROVE_GAS_LIMIT + DEPOSIT_FOR_BURN_WITH_FEES_GAS_LIMIT);
  assert.ok(result.estimatedGasWei > 1_000_000_000_000n);
  assert.ok(result.estimatedGasWei < 100_000_000_000_000n);
});
