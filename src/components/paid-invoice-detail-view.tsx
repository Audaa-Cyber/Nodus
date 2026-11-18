"use client";

import { MerchantPaidSurface } from "@/components/merchant-paid-surface";

export type LineItem = {
  description?: string;
  quantity?: number;
  unitPriceMinor?: number;
  lineTotalMinor?: number;
};

export type PaidInvoiceProps = {
  invoice: {
    id: string;
    invoice_number: string;
    amount_minor: number;
    currency: string;
    issue_date: string;
    due_date?: string | null;
    created_at: string;
    updated_at: string;
    customer_name?: string | null;
    customer_email?: string | null;
    customer_company?: string | null;
    customer_phone?: string | null;
    customer_address?: string | null;
    description?: string | null;
    line_items?: unknown;
    subtotal_minor?: number | null;
    tax_rate_bps?: number | null;
    discount_minor?: number | null;
    seller_snapshot?: unknown;
    invoice_footer?: string | null;
    near_registration_status?: string | null;
    near_registration_transaction_hash?: string | null;
    near_registration_failure_reason?: string | null;
  };
  seller: {
    business_name: string;
    logo_url?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    website?: string | null;
    tax_id?: string | null;
    invoice_footer?: string | null;
    receiving_address?: string | null;
  };
  primaryReceipt?: {
    id: string;
    receipt_number: string;
    issued_at: string;
    payment_attempt_id?: string | null;
    payment_settlement_id?: string | null;
  } | null;
  primarySettlement?: {
    id: string;
    payment_attempt_id: string;
    outcome: string;
    destination_asset_id: string | null;
    destination_network: string | null;
    recipient_address: string | null;
    received_amount_base_units: string | null;
    received_asset_decimals: number | null;
    destination_tx_hashes: unknown;
    evidence: unknown;
    created_at: string;
  } | null;
  primaryAttempt?: {
    id: string;
    source_asset_id: string;
    source_network: string;
    destination_asset_id: string;
    destination_network: string;
    transaction_hash: string | null;
    requested_amount: string | null;
    expected_received_amount: string | null;
    deposit_address: string | null;
    mode: "mock" | "live";
    status: string;
    quote_snapshot?: unknown;
    created_at: string;
    updated_at: string;
  } | null;
  primaryNearEntry?: {
    id: string;
    status: "pending" | "processing" | "retrying" | "submitted" | "blocked";
    near_transaction_hash: string | null;
    last_error_code: string | null;
    submitted_at: string | null;
    created_at: string;
    attempt_count: number;
  } | null;
  nearSettlementEligibility?: "eligible" | "not_applicable" | "unsupported" | "unknown";
  nearOutboxError?: boolean;
  nearInvoiceRegistration?: {
    id: string;
    status: string;
    attempt_count: number;
    near_transaction_hash?: string | null;
    failure_reason?: string | null;
    registered_at?: string | null;
  } | null;
  receipts?: Array<{
    id: string;
    receipt_number: string;
    issued_at: string;
    payment_attempt_id: string;
    payment_settlement_id: string;
  }> | null;
  settlements?: Array<{
    id: string;
    payment_attempt_id: string;
    outcome: string;
    destination_asset_id: string | null;
    destination_network: string | null;
    received_amount_base_units: string | null;
    received_asset_decimals: number | null;
    destination_tx_hashes: unknown;
  }> | null;
};


export function PaidInvoiceDetailView(props: PaidInvoiceProps) {
  return <MerchantPaidSurface {...props} />;
}
