import type { BillLineItem, BillCalculation } from "./types";

export interface CalculationOptions {
  serviceChargePercent?: number;
  taxPercent?: number;
  currency?: string;
}

/**
 * Calculates itemized invoice subtotals, service charges, taxes, and final total.
 * Pure business calculation logic without side effects.
 */
export function calculateBill(
  items: BillLineItem[],
  options: CalculationOptions = {}
): BillCalculation {
  const {
    serviceChargePercent = 0.10, // 10% standard default
    taxPercent = 0.0,
    currency = "USD",
  } = options;

  const rawSubtotal = items.reduce(
    (sum, item) => sum + Math.max(0, item.quantity) * Math.max(0, item.unitPrice),
    0
  );

  // Round subtotal to 2 decimal places to prevent floating-point accumulation
  const subtotal = Math.round(rawSubtotal * 100) / 100;
  const serviceChargeAmount = Math.round(subtotal * serviceChargePercent * 100) / 100;
  const taxAmount = Math.round(subtotal * taxPercent * 100) / 100;
  const total = Math.round((subtotal + serviceChargeAmount + taxAmount) * 100) / 100;

  return {
    subtotal,
    serviceChargePercent,
    serviceChargeAmount,
    taxPercent,
    taxAmount,
    total,
    currency,
  };
}

