export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      business_profiles: {
        Row: { id: string; owner_user_id: string; business_name: string; email: string; receiving_address: string | null; receiving_network: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; owner_user_id: string; business_name: string; email: string; receiving_address?: string | null; receiving_network?: string | null; created_at?: string; updated_at?: string };
        Update: { business_name?: string; email?: string; receiving_address?: string | null; receiving_network?: string | null; updated_at?: string };
        Relationships: [];
      };
      invoices: {
        Row: { id: string; business_id: string; invoice_number: string; customer_name: string; customer_email: string | null; description: string; amount_minor: number; currency: string; issue_date: string; due_date: string | null; status: "draft" | "open" | "paid" | "cancelled" | "overdue"; near_registration_status: "pending" | "submitting" | "registered" | "failed"; near_registration_transaction_hash: string | null; near_invoice_reference: string | null; near_registered_at: string | null; near_registration_failure_reason: string | null; share_token_hash: string | null; share_token_expires_at: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; business_id: string; invoice_number: string; customer_name: string; customer_email: string | null; description: string; amount_minor: number; currency: string; issue_date: string; due_date?: string | null; status?: "draft" | "open" | "cancelled"; near_registration_status?: "pending" | "submitting" | "registered" | "failed"; near_registration_transaction_hash?: string | null; near_invoice_reference?: string | null; near_registered_at?: string | null; near_registration_failure_reason?: string | null; share_token_hash?: string | null; share_token_expires_at?: string | null; created_at?: string; updated_at?: string };
        Update: { invoice_number?: string; customer_name?: string; customer_email?: string | null; description?: string; amount_minor?: number; currency?: string; issue_date?: string; due_date?: string | null; status?: "draft" | "open" | "paid" | "cancelled" | "overdue"; near_registration_status?: "pending" | "submitting" | "registered" | "failed"; near_registration_transaction_hash?: string | null; near_invoice_reference?: string | null; near_registered_at?: string | null; near_registration_failure_reason?: string | null; share_token_hash?: string | null; share_token_expires_at?: string | null; updated_at?: string };
        Relationships: [{ foreignKeyName: "invoices_business_id_fkey"; columns: ["business_id"]; isOneToOne: false; referencedRelation: "business_profiles"; referencedColumns: ["id"] }];
      };
      payment_attempts: {
        Row: { id: string; invoice_id: string; business_id: string; mode: "mock" | "live"; source_asset_id: string; source_network: string; destination_asset_id: string; destination_network: string; recipient_address: string | null; deposit_memo: string | null; idempotency_key: string; requested_amount: string | null; expected_received_amount: string | null; deposit_address: string | null; quote_expires_at: string | null; transaction_hash: string | null; quote_snapshot: Json | null; settlement_resolved_at?: string | null; circle_recovery_state?: string; circle_approval_tx_hash?: string | null; circle_message_nonce?: string | null; circle_message_hash?: string | null; circle_destination_tx_hashes?: Json; circle_recovery_updated_at?: string; circle_execution_reserved_at?: string | null; circle_sdk_result_state?: "pending" | "success" | "error" | null; circle_sdk_steps?: Json; status: Database["public"]["Enums"]["payment_attempt_status"]; created_at: string; updated_at: string };
        Insert: { id?: string; invoice_id: string; business_id: string; mode: "mock" | "live"; source_asset_id: string; source_network: string; destination_asset_id: string; destination_network: string; recipient_address?: string | null; deposit_memo?: string | null; idempotency_key: string; requested_amount?: string | null; expected_received_amount?: string | null; deposit_address?: string | null; quote_expires_at?: string | null; transaction_hash?: string | null; circle_approval_tx_hash?: string | null; quote_snapshot?: Json | null; status: Database["public"]["Enums"]["payment_attempt_status"]; created_at?: string; updated_at?: string };
        Update: { status?: Database["public"]["Enums"]["payment_attempt_status"]; expected_received_amount?: string | null; deposit_address?: string | null; quote_expires_at?: string | null; transaction_hash?: string | null; circle_approval_tx_hash?: string | null; circle_recovery_state?: string; circle_message_nonce?: string | null; circle_message_hash?: string | null; circle_destination_tx_hashes?: Json; circle_recovery_updated_at?: string; circle_sdk_result_state?: "pending" | "success" | "error" | null; circle_sdk_steps?: Json; updated_at?: string };
        Relationships: [];
      };
      payment_settlements: {
        Row: { id: string; payment_attempt_id: string; invoice_id: string; business_id: string; provider_status: Database["public"]["Enums"]["payment_attempt_status"]; outcome: Database["public"]["Enums"]["payment_settlement_outcome"]; destination_asset_id: string | null; destination_network: string | null; recipient_address: string | null; received_amount_base_units: string | null; received_asset_decimals: number | null; received_value_invoice_minor: string | null; destination_tx_hashes: Json; evidence: Json; created_at: string };
        Insert: never; Update: never; Relationships: [];
      };
      payment_receipts: {
        Row: { id: string; payment_settlement_id: string; payment_attempt_id: string; invoice_id: string; business_id: string; receipt_number: string; issued_at: string };
        Insert: never; Update: never; Relationships: [];
      };
      near_settlement_outbox: {
        Row: { id: string; payment_settlement_id: string; reconciliation_id: string; invoice_id: string; payment_attempt_id: string; source_transaction_hash: string; destination_tx_hashes: Json; status: "pending" | "processing" | "submitted" | "blocked"; attempt_count: number; next_attempt_at: string; lock_token: string | null; locked_until: string | null; near_transaction_hash: string | null; last_error_code: string | null; created_at: string; updated_at: string; submitted_at: string | null };
        Insert: never; Update: never; Relationships: [];
      };
      near_invoice_registration_outbox: {
        Row: { id: string; invoice_id: string; status: "pending" | "processing" | "registered" | "failed"; attempt_count: number; next_attempt_at: string; lock_token: string | null; locked_until: string | null; near_transaction_hash: string | null; onchain_invoice_reference: string | null; failure_reason: string | null; created_at: string; updated_at: string; submitted_at: string | null; registered_at: string | null };
        Insert: never; Update: never; Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      lookup_shared_invoice: { Args: { p_token_hash: string }; Returns: { link_status: string; business_name: string | null; invoice_number: string | null; description: string | null; amount_minor: number | null; currency: string | null; issue_date: string | null; due_date: string | null; status: "draft" | "open" | "paid" | "cancelled" | "overdue" | null; expires_at: string }[] };
      create_mock_payment_attempt: { Args: { p_token_hash: string; p_idempotency_key: string; p_source_asset_id: string; p_source_network: string }; Returns: Database["public"]["Tables"]["payment_attempts"]["Row"][] };
      advance_mock_payment_attempt: { Args: { p_token_hash: string; p_attempt_id: string; p_next_status: Database["public"]["Enums"]["payment_attempt_status"] }; Returns: Database["public"]["Tables"]["payment_attempts"]["Row"][] };
      lookup_shared_payment_context: { Args: { p_token_hash: string }; Returns: { invoice_id: string; business_id: string; invoice_number: string; business_name: string; amount_minor: number; currency: string; invoice_status: "draft" | "open" | "paid" | "cancelled" | "overdue"; receiving_address: string | null; receiving_network: string | null }[] };
      create_committed_payment_attempt: { Args: { p_token_hash: string; p_idempotency_key: string; p_source_asset_id: string; p_source_network: string; p_destination_asset_id: string; p_destination_network: string; p_recipient_address: string; p_requested_amount: string; p_expected_received_amount: string; p_deposit_address: string; p_deposit_memo: string | null; p_quote_expires_at: string; p_quote_snapshot: Json }; Returns: Database["public"]["Tables"]["payment_attempts"]["Row"][] };
      expire_abandoned_payment_attempts: { Args: { p_token_hash: string }; Returns: Database["public"]["Tables"]["payment_attempts"]["Row"][] };
      get_shared_live_attempt: { Args: { p_token_hash: string; p_attempt_id: string }; Returns: Database["public"]["Tables"]["payment_attempts"]["Row"][] };
      update_live_attempt_status: { Args: { p_token_hash: string; p_attempt_id: string; p_status: Database["public"]["Enums"]["payment_attempt_status"]; p_transaction_hash?: string | null }; Returns: Database["public"]["Tables"]["payment_attempts"]["Row"][] };
      submit_circle_broadcast_references: { Args: { p_token_hash: string; p_attempt_id: string; p_source_tx_hash: string; p_approval_tx_hash?: string | null }; Returns: Database["public"]["Tables"]["payment_attempts"]["Row"][] };
      submit_circle_direct_broadcast_reference: { Args: { p_token_hash: string; p_attempt_id: string; p_source_tx_hash: string; p_approval_tx_hash?: string | null }; Returns: Database["public"]["Tables"]["payment_attempts"]["Row"][] };
      mark_circle_execution_started: { Args: { p_token_hash: string; p_attempt_id: string; p_expected_payer: string }; Returns: Database["public"]["Tables"]["payment_attempts"]["Row"][] };
      record_circle_recovery_progress: { Args: { p_attempt_id: string; p_state: string; p_message_nonce?: string | null; p_message_hash?: string | null; p_destination_tx_hashes?: Json }; Returns: undefined };
      record_circle_sdk_progress: { Args: { p_token_hash: string; p_attempt_id: string; p_result_state: "pending" | "success" | "error"; p_step?: Json | null }; Returns: Database["public"]["Tables"]["payment_attempts"]["Row"][] };
      close_live_attempt: { Args: { p_token_hash: string; p_attempt_id: string; p_status: Database["public"]["Enums"]["payment_attempt_status"] }; Returns: Database["public"]["Tables"]["payment_attempts"]["Row"][] };
      record_payment_reconciliation: { Args: { p_attempt_id: string; p_provider_status: Database["public"]["Enums"]["payment_attempt_status"]; p_provider_signature_verified: boolean; p_chain_transfer_verified?: boolean; p_destination_asset_id?: string | null; p_destination_network?: string | null; p_recipient_address?: string | null; p_received_amount_base_units?: string | null; p_received_asset_decimals?: number | null; p_received_value_invoice_minor?: string | null; p_destination_tx_hashes?: Json; p_evidence?: Json }; Returns: Json };
      lookup_shared_payment_receipts: { Args: { p_token_hash: string }; Returns: { receipt_number: string; invoice_number: string; business_name: string | null; outcome: Database["public"]["Enums"]["payment_settlement_outcome"]; destination_asset_id: string | null; destination_network: string | null; received_amount_base_units: string | null; received_asset_decimals: number | null; destination_tx_hashes: Json; issued_at: string }[] };
      merchant_nodus_received_by_chain: { Args: Record<string, never>; Returns: { destination_network: string; total_base_units: string; payment_count: number }[] };
      claim_near_settlement_outbox: { Args: { p_limit?: number }; Returns: Database["public"]["Tables"]["near_settlement_outbox"]["Row"][] };
      finish_near_settlement_outbox: { Args: { p_id: string; p_lock_token: string; p_near_transaction_hash?: string | null }; Returns: boolean };
      record_near_settlement_submission: { Args: { p_id: string; p_lock_token: string; p_near_transaction_hash: string }; Returns: boolean };
      retry_near_settlement_outbox: { Args: { p_id: string; p_lock_token: string; p_error_code: string }; Returns: boolean };
      block_near_settlement_outbox: { Args: { p_id: string; p_lock_token: string; p_error_code: string }; Returns: boolean };
      claim_near_invoice_registration_outbox: { Args: { p_limit?: number }; Returns: Database["public"]["Tables"]["near_invoice_registration_outbox"]["Row"][] };
      finish_near_invoice_registration: { Args: { p_id: string; p_lock_token: string; p_transaction_hash: string | null; p_invoice_reference: string }; Returns: boolean };
      mark_near_invoice_registration_submitted: { Args: { p_id: string; p_lock_token: string; p_transaction_hash: string }; Returns: boolean };
      retry_near_invoice_registration: { Args: { p_id: string; p_lock_token: string; p_failure_reason: string }; Returns: boolean };
      fail_near_invoice_registration: { Args: { p_id: string; p_lock_token: string; p_failure_reason: string }; Returns: boolean };
      requeue_near_invoice_registration: { Args: { p_invoice_id: string }; Returns: boolean };
    };
    Enums: {
      payment_attempt_status: "MOCK_QUOTE_READY" | "QUOTE_EXPIRED" | "PENDING_DEPOSIT" | "KNOWN_DEPOSIT_TX" | "PROCESSING" | "SUCCESS" | "REFUNDED" | "FAILED" | "INCOMPLETE_DEPOSIT";
      payment_settlement_outcome: "VERIFIED" | "PARTIAL" | "OVERPAID" | "REVIEW_REQUIRED" | "REFUNDED" | "FAILED" | "INCOMPLETE_DEPOSIT" | "EXPIRED";
    };
    CompositeTypes: Record<string, never>;
  };
}
