/**
 * Represents a single line item in an itemized bill.
 */
export interface BillLineItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

/**
 * Breakdown of a calculated bill including taxes and service fees.
 */
export interface BillCalculation {
  subtotal: number;
  serviceChargePercent: number;
  serviceChargeAmount: number;
  taxPercent: number;
  taxAmount: number;
  total: number;
  currency: string;
}

