export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

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
        Row: { id: string; business_id: string; invoice_number: string; customer_name: string; customer_email: string | null; description: string; amount_minor: number; currency: string; issue_date: string; due_date: string | null; status: "draft" | "open" | "paid" | "cancelled" | "overdue"; share_token_hash: string | null; share_token_expires_at: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; business_id: string; invoice_number: string; customer_name: string; customer_email?: string | null; description: string; amount_minor: number; currency: string; issue_date: string; due_date?: string | null; status?: "draft" | "open" | "cancelled"; share_token_hash?: string | null; share_token_expires_at?: string | null; created_at?: string; updated_at?: string };
        Update: { invoice_number?: string; customer_name?: string; customer_email?: string | null; description?: string; amount_minor?: number; currency?: string; issue_date?: string; due_date?: string | null; status?: "draft" | "open" | "cancelled" | "overdue"; share_token_hash?: string | null; share_token_expires_at?: string | null; updated_at?: string };
        Relationships: [{ foreignKeyName: "invoices_business_id_fkey"; columns: ["business_id"]; isOneToOne: false; referencedRelation: "business_profiles"; referencedColumns: ["id"] }];
      };
      payment_attempts: {
        Row: { id: string; invoice_id: string; business_id: string; mode: "mock" | "live"; source_asset_id: string; source_network: string; destination_asset_id: string; destination_network: string; recipient_address: string | null; deposit_memo: string | null; idempotency_key: string; requested_amount: string | null; expected_received_amount: string | null; deposit_address: string | null; quote_expires_at: string | null; transaction_hash: string | null; quote_snapshot: Json | null; status: Database["public"]["Enums"]["payment_attempt_status"]; created_at: string; updated_at: string };
        Insert: { id?: string; invoice_id: string; business_id: string; mode: "mock" | "live"; source_asset_id: string; source_network: string; destination_asset_id: string; destination_network: string; recipient_address?: string | null; deposit_memo?: string | null; idempotency_key: string; requested_amount?: string | null; expected_received_amount?: string | null; deposit_address?: string | null; quote_expires_at?: string | null; transaction_hash?: string | null; quote_snapshot?: Json | null; status: Database["public"]["Enums"]["payment_attempt_status"]; created_at?: string; updated_at?: string };
        Update: { status?: "MOCK_QUOTE_READY" | "PENDING_DEPOSIT" | "KNOWN_DEPOSIT_TX" | "PROCESSING" | "SUCCESS" | "REFUNDED" | "FAILED" | "INCOMPLETE_DEPOSIT"; expected_received_amount?: string | null; deposit_address?: string | null; quote_expires_at?: string | null; transaction_hash?: string | null; updated_at?: string };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      lookup_shared_invoice: {
        Args: { p_token_hash: string };
        Returns: { link_status: string; business_name: string | null; invoice_number: string | null; description: string | null; amount_minor: number | null; currency: string | null; issue_date: string | null; due_date: string | null; status: "draft" | "open" | "paid" | "cancelled" | "overdue" | null; expires_at: string }[];
      };
      create_mock_payment_attempt: { Args: { p_token_hash: string; p_idempotency_key: string; p_source_asset_id: string; p_source_network: string }; Returns: Database["public"]["Tables"]["payment_attempts"]["Row"][] };
      advance_mock_payment_attempt: { Args: { p_token_hash: string; p_attempt_id: string; p_next_status: Database["public"]["Enums"]["payment_attempt_status"] }; Returns: Database["public"]["Tables"]["payment_attempts"]["Row"][] };
      lookup_shared_payment_context: { Args: { p_token_hash: string }; Returns: { invoice_id: string; business_id: string; invoice_number: string; business_name: string; amount_minor: number; currency: string; invoice_status: "draft" | "open" | "paid" | "cancelled" | "overdue"; receiving_address: string | null; receiving_network: string | null }[] };
      create_committed_payment_attempt: { Args: { p_token_hash: string; p_idempotency_key: string; p_source_asset_id: string; p_source_network: string; p_destination_asset_id: string; p_destination_network: string; p_recipient_address: string; p_requested_amount: string; p_expected_received_amount: string; p_deposit_address: string; p_deposit_memo: string | null; p_quote_expires_at: string; p_quote_snapshot: Json }; Returns: Database["public"]["Tables"]["payment_attempts"]["Row"][] };
      get_shared_live_attempt: { Args: { p_token_hash: string; p_attempt_id: string }; Returns: Database["public"]["Tables"]["payment_attempts"]["Row"][] };
      update_live_attempt_status: { Args: { p_token_hash: string; p_attempt_id: string; p_status: Database["public"]["Enums"]["payment_attempt_status"]; p_transaction_hash?: string | null }; Returns: Database["public"]["Tables"]["payment_attempts"]["Row"][] };
      close_live_attempt: { Args: { p_token_hash: string; p_attempt_id: string; p_status: Database["public"]["Enums"]["payment_attempt_status"] }; Returns: Database["public"]["Tables"]["payment_attempts"]["Row"][] };
    };
    Enums: { payment_attempt_status: "MOCK_QUOTE_READY" | "QUOTE_EXPIRED" | "PENDING_DEPOSIT" | "KNOWN_DEPOSIT_TX" | "PROCESSING" | "SUCCESS" | "REFUNDED" | "FAILED" | "INCOMPLETE_DEPOSIT" };
    CompositeTypes: Record<string, never>;
  };
}
