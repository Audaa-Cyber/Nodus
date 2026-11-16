import { formatUsdcBaseUnits } from "../payments/nodus-received-balance.ts";

export type DailyReceiptPoint = {
  date: string; // YYYY-MM-DD (UTC)
  totalBaseUnits: string;
  paymentCount: number;
  usdcFormatted: string;
};

export type SettlementRow = {
  destination_network: string | null;
  received_amount_base_units: string | null;
  received_asset_decimals: number | null;
  created_at: string;
};

/**
 * Builds a 30-day UTC date sequence (YYYY-MM-DD) from 29 days ago through today.
 */
export function buildThirtyDayDateRange(referenceDate: Date = new Date()): string[] {
  const dates: string[] = [];
  const utcYear = referenceDate.getUTCFullYear();
  const utcMonth = referenceDate.getUTCMonth();
  const utcDate = referenceDate.getUTCDate();

  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.UTC(utcYear, utcMonth, utcDate - i));
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

/**
 * Aggregates verified payment settlements by date for a specific destination network.
 * Only settlements with exact 6-decimal USDC and valid base units are accumulated.
 * Missing days are represented as 0 without inventing fictional receipts.
 */
export function computeDailyReceipts(
  settlements: readonly SettlementRow[] | null | undefined,
  networkKey: string,
  dates: string[] = buildThirtyDayDateRange(),
): DailyReceiptPoint[] {
  const byDate = new Map<string, { totalBaseUnits: bigint; count: number }>();
  for (const date of dates) {
    byDate.set(date, { totalBaseUnits: 0n, count: 0 });
  }

  if (settlements) {
    for (const s of settlements) {
      if (s.destination_network !== networkKey) continue;
      if (s.received_asset_decimals !== 6) continue;
      if (!s.received_amount_base_units || !/^\d+$/.test(s.received_amount_base_units)) continue;
      if (!s.created_at) continue;

      const dateStr = new Date(s.created_at).toISOString().slice(0, 10);
      const entry = byDate.get(dateStr);
      if (entry) {
        entry.totalBaseUnits += BigInt(s.received_amount_base_units);
        entry.count += 1;
      }
    }
  }

  return dates.map((date) => {
    const entry = byDate.get(date)!;
    const baseUnitsStr = entry.totalBaseUnits.toString();
    return {
      date,
      totalBaseUnits: baseUnitsStr,
      paymentCount: entry.count,
      usdcFormatted: formatUsdcBaseUnits(baseUnitsStr),
    };
  });
}
