// Distinct chart accents; logo assets retain their original brand artwork.
const networkColors = new Map([
  ["sepolia", "#8C8C8C"],
  ["base-sepolia", "#0000FF"],
  ["arbitrum-sepolia", "#12AAFF"],
  ["optimism-sepolia", "#FF0421"],
  ["arc-testnet", "#3E2B63"],
]);

export function getNetworkColor(key: string) {
  return networkColors.get(key) ?? "#71717A";
}

export function formatNetworkShare(amount: bigint, total: bigint) {
  if (amount <= 0n || total <= 0n) return "0%";
  if (amount === total) return "100%";
  const tenths = (amount * 1000n + total / 2n) / total;
  if (tenths === 0n) return "<0.1%";
  if (tenths >= 1000n) return ">99.9%";
  return `${tenths / 10n}${tenths % 10n ? `.${tenths % 10n}` : ""}%`;
}

/** Convert only bounded proportions to Number; receipt amounts stay exact. */
function percentage(amount: bigint, total: bigint) {
  return Number(amount * 100_000_000_000_000n / total) / 1_000_000_000_000;
}

export function buildNetworkSegments<T extends { networkKey: string; totalBaseUnits: string }>(
  chains: readonly T[], totalBaseUnits: string,
) {
  const total = BigInt(totalBaseUnits);
  let cumulative = 0n;
  if (total <= 0n) return [];
  return chains.filter((chain) => BigInt(chain.totalBaseUnits) > 0n).map((chain) => {
    const start = percentage(cumulative, total);
    cumulative += BigInt(chain.totalBaseUnits);
    const length = percentage(cumulative, total) - start;
    return { ...chain, start, length, color: getNetworkColor(chain.networkKey) };
  });
}
