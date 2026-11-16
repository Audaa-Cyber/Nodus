import test from "node:test";
import assert from "node:assert/strict";
import { buildNetworkSegments, formatNetworkShare, getNetworkColor } from "../src/lib/dashboard/network-distribution.ts";

test("a 0.1% balance gets a proportional arc and a nonzero percentage", () => {
  const slices = buildNetworkSegments([
    { networkKey: "sepolia", totalBaseUnits: "999000000" },
    { networkKey: "base-sepolia", totalBaseUnits: "1000000" },
  ], "1000000000");
  assert.equal(slices[0].length, 99.9);
  assert.equal(slices[1].start, 99.9);
  assert.ok(Math.abs(slices[1].length - 0.1) < 1e-10);
  assert.equal(formatNetworkShare(1000000n, 1000000000n), "0.1%");
  assert.equal(formatNetworkShare(999000000n, 1000000000n), "99.9%");
});

test("small positive shares and almost-full shares are never labeled zero or all", () => {
  assert.equal(formatNetworkShare(1n, 1000000n), "<0.1%");
  assert.equal(formatNetworkShare(999999n, 1000000n), ">99.9%");
  assert.equal(formatNetworkShare(0n, 1000000n), "0%");
  assert.equal(formatNetworkShare(1n, 1n), "100%");
  assert.equal(formatNetworkShare(0n, 0n), "0%");
});

test("empty networks have no arc and a single funded network fills exactly one circle", () => {
  const chains = [
    { networkKey: "sepolia", totalBaseUnits: "0" },
    { networkKey: "base-sepolia", totalBaseUnits: "123456789" },
  ];
  assert.deepEqual(buildNetworkSegments(chains, "0"), []);
  const slices = buildNetworkSegments(chains, "123456789");
  assert.equal(slices.length, 1);
  assert.equal(slices[0].start, 0);
  assert.equal(slices[0].length, 100);
  assert.equal(chains.length, 2, "zero balance networks remain available for the legend");
});

test("very large exact receipt amounts produce finite contiguous segments", () => {
  const amount = 10n ** 400n;
  const slices = buildNetworkSegments([
    { networkKey: "sepolia", totalBaseUnits: amount.toString() },
    { networkKey: "arc-testnet", totalBaseUnits: (amount * 3n).toString() },
  ], (amount * 4n).toString());
  assert.deepEqual(slices.map(({ start, length }) => ({ start, length })), [
    { start: 0, length: 25 }, { start: 25, length: 75 },
  ]);
  assert.equal(formatNetworkShare(amount, amount * 4n), "25%");
});

test("unknown and object prototype network keys use the neutral fallback color", () => {
  assert.equal(getNetworkColor("unknown"), "#71717A");
  assert.equal(getNetworkColor("constructor"), "#71717A");
  assert.equal(getNetworkColor("__proto__"), "#71717A");
});
