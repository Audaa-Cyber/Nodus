export function formatUsdcBaseUnits(baseUnits: string): string {
  if (!/^\d+$/.test(baseUnits)) return "Unavailable";
  const amount = BigInt(baseUnits);
  const whole = (amount / 1_000_000n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = (amount % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

export function sumUsdcBaseUnits(amounts: string[]): string {
  return amounts.reduce((sum, amount) => {
    if (!/^\d+$/.test(amount)) throw new Error("invalid_usdc_base_units");
    return sum + BigInt(amount);
  }, 0n).toString();
}
