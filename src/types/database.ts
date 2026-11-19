export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      business_profiles: {
        Row: {
          business_address: string | null
          business_name: string
          business_phone: string | null
          created_at: string
          default_currency: string
          default_payment_terms_days: number
          email: string
          id: string
          invoice_footer: string
          invoice_prefix: string
          logo_url: string | null
          next_invoice_number: number
          owner_user_id: string
          receiving_address: string | null
          receiving_network: string | null
          receiving_networks: string[]
          tax_registration_number: string | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          business_address?: string | null
          business_name: string
          business_phone?: string | null
          created_at?: string
          default_currency?: string
          default_payment_terms_days?: number
          email: string
          id?: string
          invoice_footer?: string
          invoice_prefix?: string
          logo_url?: string | null
          next_invoice_number?: number
          owner_user_id: string
          receiving_address?: string | null
          receiving_network?: string | null
          receiving_networks?: string[]
          tax_registration_number?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          business_address?: string | null
          business_name?: string
          business_phone?: string | null
          created_at?: string
          default_currency?: string
          default_payment_terms_days?: number
          email?: string
          id?: string
          invoice_footer?: string
          invoice_prefix?: string
          logo_url?: string | null
          next_invoice_number?: number
          owner_user_id?: string
          receiving_address?: string | null
          receiving_network?: string | null
          receiving_networks?: string[]
          tax_registration_number?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      invoice_feedback: {
        Row: {
          business_id: string
          comment: string | null
          invoice_id: string
          rating: number
          submitted_at: string
        }
        Insert: {
          business_id: string
          comment?: string | null
          invoice_id: string
          rating: number
          submitted_at?: string
        }
        Update: {
          business_id?: string
          comment?: string | null
          invoice_id?: string
          rating?: number
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_feedback_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_feedback_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: true
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_minor: number
          business_id: string
          created_at: string
          currency: string
          customer_email: string | null
          customer_name: string | null
          description: string | null
          discount_minor: number
          due_date: string | null
          id: string
          invoice_footer: string | null
          invoice_number: string
          issue_date: string
          line_items: Json
          payment_networks: string[]
          payment_receiving_address: string | null
          seller_snapshot: Json | null
          share_token_expires_at: string | null
          share_token_hash: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal_minor: number | null
          tax_rate_bps: number
          updated_at: string
        }
        Insert: {
          amount_minor: number
          business_id: string
          created_at?: string
          currency: string
          customer_email?: string | null
          customer_name?: string | null
          description?: string | null
          discount_minor?: number
          due_date?: string | null
          id?: string
          invoice_footer?: string | null
          invoice_number: string
          issue_date: string
          line_items?: Json
          payment_networks?: string[]
          payment_receiving_address?: string | null
          seller_snapshot?: Json | null
          share_token_expires_at?: string | null
          share_token_hash?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal_minor?: number | null
          tax_rate_bps?: number
          updated_at?: string
        }
        Update: {
          amount_minor?: number
          business_id?: string
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_name?: string | null
          description?: string | null
          discount_minor?: number
          due_date?: string | null
          id?: string
          invoice_footer?: string | null
          invoice_number?: string
          issue_date?: string
          line_items?: Json
          payment_networks?: string[]
          payment_receiving_address?: string | null
          seller_snapshot?: Json | null
          share_token_expires_at?: string | null
          share_token_hash?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal_minor?: number | null
          tax_rate_bps?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          business_id: string
          created_at: string
          destination_url: string | null
          id: string
          invoice_id: string | null
          message: string
          read_at: string | null
          recipient_user_id: string
          title: string
          type: string
        }
        Insert: {
          business_id: string
          created_at?: string
          destination_url?: string | null
          id?: string
          invoice_id?: string | null
          message: string
          read_at?: string | null
          recipient_user_id: string
          title: string
          type: string
        }
        Update: {
          business_id?: string
          created_at?: string
          destination_url?: string | null
          id?: string
          invoice_id?: string | null
          message?: string
          read_at?: string | null
          recipient_user_id?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_attempts: {
        Row: {
          business_id: string
          circle_approval_tx_hash: string | null
          circle_destination_tx_hashes: Json
          circle_execution_reserved_at: string | null
          circle_message_hash: string | null
          circle_message_nonce: string | null
          circle_recovery_state: string
          circle_recovery_updated_at: string
          circle_sdk_result_state: string | null
          circle_sdk_steps: Json
          created_at: string
          deposit_address: string | null
          deposit_memo: string | null
          destination_asset_id: string
          destination_network: string
          expected_received_amount: string | null
          id: string
          idempotency_key: string
          invoice_id: string
          mode: string
          quote_expires_at: string | null
          quote_snapshot: Json | null
          recipient_address: string | null
          requested_amount: string | null
          settlement_resolved_at: string | null
          source_asset_id: string
          source_network: string
          status: Database["public"]["Enums"]["payment_attempt_status"]
          transaction_hash: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          circle_approval_tx_hash?: string | null
          circle_destination_tx_hashes?: Json
          circle_execution_reserved_at?: string | null
          circle_message_hash?: string | null
          circle_message_nonce?: string | null
          circle_recovery_state?: string
          circle_recovery_updated_at?: string
          circle_sdk_result_state?: string | null
          circle_sdk_steps?: Json
          created_at?: string
          deposit_address?: string | null
          deposit_memo?: string | null
          destination_asset_id: string
          destination_network: string
          expected_received_amount?: string | null
          id?: string
          idempotency_key: string
          invoice_id: string
          mode: string
          quote_expires_at?: string | null
          quote_snapshot?: Json | null
          recipient_address?: string | null
          requested_amount?: string | null
          settlement_resolved_at?: string | null
          source_asset_id: string
          source_network: string
          status: Database["public"]["Enums"]["payment_attempt_status"]
          transaction_hash?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          circle_approval_tx_hash?: string | null
          circle_destination_tx_hashes?: Json
          circle_execution_reserved_at?: string | null
          circle_message_hash?: string | null
          circle_message_nonce?: string | null
          circle_recovery_state?: string
          circle_recovery_updated_at?: string
          circle_sdk_result_state?: string | null
          circle_sdk_steps?: Json
          created_at?: string
          deposit_address?: string | null
          deposit_memo?: string | null
          destination_asset_id?: string
          destination_network?: string
          expected_received_amount?: string | null
          id?: string
          idempotency_key?: string
          invoice_id?: string
          mode?: string
          quote_expires_at?: string | null
          quote_snapshot?: Json | null
          recipient_address?: string | null
          requested_amount?: string | null
          settlement_resolved_at?: string | null
          source_asset_id?: string
          source_network?: string
          status?: Database["public"]["Enums"]["payment_attempt_status"]
          transaction_hash?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_attempt_invoice_business_fk"
            columns: ["invoice_id", "business_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "payment_attempts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_attempts_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_receipts: {
        Row: {
          business_id: string
          id: string
          invoice_id: string
          issued_at: string
          payment_attempt_id: string
          payment_settlement_id: string
          receipt_number: string
        }
        Insert: {
          business_id: string
          id?: string
          invoice_id: string
          issued_at?: string
          payment_attempt_id: string
          payment_settlement_id: string
          receipt_number: string
        }
        Update: {
          business_id?: string
          id?: string
          invoice_id?: string
          issued_at?: string
          payment_attempt_id?: string
          payment_settlement_id?: string
          receipt_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_receipt_invoice_business_fk"
            columns: ["invoice_id", "business_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "payment_receipts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_receipts_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_receipts_payment_attempt_id_fkey"
            columns: ["payment_attempt_id"]
            isOneToOne: true
            referencedRelation: "payment_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_receipts_payment_settlement_id_fkey"
            columns: ["payment_settlement_id"]
            isOneToOne: true
            referencedRelation: "payment_settlements"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_settlement_transactions: {
        Row: {
          destination_network: string
          payment_settlement_id: string
          transaction_hash: string
        }
        Insert: {
          destination_network: string
          payment_settlement_id: string
          transaction_hash: string
        }
        Update: {
          destination_network?: string
          payment_settlement_id?: string
          transaction_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_settlement_transactions_payment_settlement_id_fkey"
            columns: ["payment_settlement_id"]
            isOneToOne: false
            referencedRelation: "payment_settlements"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_settlements: {
        Row: {
          business_id: string
          created_at: string
          destination_asset_id: string | null
          destination_network: string | null
          destination_tx_hashes: Json
          evidence: Json
          id: string
          invoice_id: string
          outcome: Database["public"]["Enums"]["payment_settlement_outcome"]
          payment_attempt_id: string
          provider_status: Database["public"]["Enums"]["payment_attempt_status"]
          received_amount_base_units: string | null
          received_asset_decimals: number | null
          received_value_invoice_minor: number | null
          recipient_address: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          destination_asset_id?: string | null
          destination_network?: string | null
          destination_tx_hashes?: Json
          evidence?: Json
          id?: string
          invoice_id: string
          outcome: Database["public"]["Enums"]["payment_settlement_outcome"]
          payment_attempt_id: string
          provider_status: Database["public"]["Enums"]["payment_attempt_status"]
          received_amount_base_units?: string | null
          received_asset_decimals?: number | null
          received_value_invoice_minor?: number | null
          recipient_address?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          destination_asset_id?: string | null
          destination_network?: string | null
          destination_tx_hashes?: Json
          evidence?: Json
          id?: string
          invoice_id?: string
          outcome?: Database["public"]["Enums"]["payment_settlement_outcome"]
          payment_attempt_id?: string
          provider_status?: Database["public"]["Enums"]["payment_attempt_status"]
          received_amount_base_units?: string | null
          received_asset_decimals?: number | null
          received_value_invoice_minor?: number | null
          recipient_address?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_settlement_invoice_business_fk"
            columns: ["invoice_id", "business_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "payment_settlements_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_settlements_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_settlements_payment_attempt_id_fkey"
            columns: ["payment_attempt_id"]
            isOneToOne: true
            referencedRelation: "payment_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      advance_mock_payment_attempt: {
        Args: {
          p_attempt_id: string
          p_next_status: Database["public"]["Enums"]["payment_attempt_status"]
          p_token_hash: string
        }
        Returns: {
          business_id: string
          circle_approval_tx_hash: string | null
          circle_destination_tx_hashes: Json
          circle_execution_reserved_at: string | null
          circle_message_hash: string | null
          circle_message_nonce: string | null
          circle_recovery_state: string
          circle_recovery_updated_at: string
          circle_sdk_result_state: string | null
          circle_sdk_steps: Json
          created_at: string
          deposit_address: string | null
          deposit_memo: string | null
          destination_asset_id: string
          destination_network: string
          expected_received_amount: string | null
          id: string
          idempotency_key: string
          invoice_id: string
          mode: string
          quote_expires_at: string | null
          quote_snapshot: Json | null
          recipient_address: string | null
          requested_amount: string | null
          settlement_resolved_at: string | null
          source_asset_id: string
          source_network: string
          status: Database["public"]["Enums"]["payment_attempt_status"]
          transaction_hash: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "payment_attempts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      allocate_invoice_number: {
        Args: { p_business_id: string }
        Returns: string
      }
      close_live_attempt: {
        Args: {
          p_attempt_id: string
          p_status: Database["public"]["Enums"]["payment_attempt_status"]
          p_token_hash: string
        }
        Returns: {
          business_id: string
          circle_approval_tx_hash: string | null
          circle_destination_tx_hashes: Json
          circle_execution_reserved_at: string | null
          circle_message_hash: string | null
          circle_message_nonce: string | null
          circle_recovery_state: string
          circle_recovery_updated_at: string
          circle_sdk_result_state: string | null
          circle_sdk_steps: Json
          created_at: string
          deposit_address: string | null
          deposit_memo: string | null
          destination_asset_id: string
          destination_network: string
          expected_received_amount: string | null
          id: string
          idempotency_key: string
          invoice_id: string
          mode: string
          quote_expires_at: string | null
          quote_snapshot: Json | null
          recipient_address: string | null
          requested_amount: string | null
          settlement_resolved_at: string | null
          source_asset_id: string
          source_network: string
          status: Database["public"]["Enums"]["payment_attempt_status"]
          transaction_hash: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "payment_attempts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      create_committed_payment_attempt: {
        Args: {
          p_deposit_address: string
          p_deposit_memo: string
          p_destination_asset_id: string
          p_destination_network: string
          p_expected_received_amount: string
          p_idempotency_key: string
          p_quote_expires_at: string
          p_quote_snapshot: Json
          p_recipient_address: string
          p_requested_amount: string
          p_source_asset_id: string
          p_source_network: string
          p_token_hash: string
        }
        Returns: {
          business_id: string
          circle_approval_tx_hash: string | null
          circle_destination_tx_hashes: Json
          circle_execution_reserved_at: string | null
          circle_message_hash: string | null
          circle_message_nonce: string | null
          circle_recovery_state: string
          circle_recovery_updated_at: string
          circle_sdk_result_state: string | null
          circle_sdk_steps: Json
          created_at: string
          deposit_address: string | null
          deposit_memo: string | null
          destination_asset_id: string
          destination_network: string
          expected_received_amount: string | null
          id: string
          idempotency_key: string
          invoice_id: string
          mode: string
          quote_expires_at: string | null
          quote_snapshot: Json | null
          recipient_address: string | null
          requested_amount: string | null
          settlement_resolved_at: string | null
          source_asset_id: string
          source_network: string
          status: Database["public"]["Enums"]["payment_attempt_status"]
          transaction_hash: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "payment_attempts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      create_mock_payment_attempt: {
        Args: {
          p_idempotency_key: string
          p_source_asset_id: string
          p_source_network: string
          p_token_hash: string
        }
        Returns: {
          business_id: string
          circle_approval_tx_hash: string | null
          circle_destination_tx_hashes: Json
          circle_execution_reserved_at: string | null
          circle_message_hash: string | null
          circle_message_nonce: string | null
          circle_recovery_state: string
          circle_recovery_updated_at: string
          circle_sdk_result_state: string | null
          circle_sdk_steps: Json
          created_at: string
          deposit_address: string | null
          deposit_memo: string | null
          destination_asset_id: string
          destination_network: string
          expected_received_amount: string | null
          id: string
          idempotency_key: string
          invoice_id: string
          mode: string
          quote_expires_at: string | null
          quote_snapshot: Json | null
          recipient_address: string | null
          requested_amount: string | null
          settlement_resolved_at: string | null
          source_asset_id: string
          source_network: string
          status: Database["public"]["Enums"]["payment_attempt_status"]
          transaction_hash: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "payment_attempts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      expire_abandoned_payment_attempts: {
        Args: { p_token_hash: string }
        Returns: {
          business_id: string
          circle_approval_tx_hash: string | null
          circle_destination_tx_hashes: Json
          circle_execution_reserved_at: string | null
          circle_message_hash: string | null
          circle_message_nonce: string | null
          circle_recovery_state: string
          circle_recovery_updated_at: string
          circle_sdk_result_state: string | null
          circle_sdk_steps: Json
          created_at: string
          deposit_address: string | null
          deposit_memo: string | null
          destination_asset_id: string
          destination_network: string
          expected_received_amount: string | null
          id: string
          idempotency_key: string
          invoice_id: string
          mode: string
          quote_expires_at: string | null
          quote_snapshot: Json | null
          recipient_address: string | null
          requested_amount: string | null
          settlement_resolved_at: string | null
          source_asset_id: string
          source_network: string
          status: Database["public"]["Enums"]["payment_attempt_status"]
          transaction_hash: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "payment_attempts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_shared_live_attempt: {
        Args: { p_attempt_id: string; p_token_hash: string }
        Returns: {
          business_id: string
          circle_approval_tx_hash: string | null
          circle_destination_tx_hashes: Json
          circle_execution_reserved_at: string | null
          circle_message_hash: string | null
          circle_message_nonce: string | null
          circle_recovery_state: string
          circle_recovery_updated_at: string
          circle_sdk_result_state: string | null
          circle_sdk_steps: Json
          created_at: string
          deposit_address: string | null
          deposit_memo: string | null
          destination_asset_id: string
          destination_network: string
          expected_received_amount: string | null
          id: string
          idempotency_key: string
          invoice_id: string
          mode: string
          quote_expires_at: string | null
          quote_snapshot: Json | null
          recipient_address: string | null
          requested_amount: string | null
          settlement_resolved_at: string | null
          source_asset_id: string
          source_network: string
          status: Database["public"]["Enums"]["payment_attempt_status"]
          transaction_hash: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "payment_attempts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      lookup_shared_invoice: {
        Args: { p_token_hash: string }
        Returns: {
          amount_minor: number
          business_name: string
          currency: string
          description: string
          discount_minor: number
          due_date: string
          expires_at: string
          invoice_footer: string
          invoice_number: string
          issue_date: string
          line_items: Json
          link_status: string
          logo_url: string
          seller_snapshot: Json
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal_minor: number
          tax_rate_bps: number
        }[]
      }
      lookup_shared_invoice_feedback: {
        Args: { p_token_hash: string }
        Returns: {
          comment: string
          customer_name: string
          rating: number
          submitted_at: string
        }[]
      }
      lookup_shared_invoice_parties: {
        Args: { p_token_hash: string }
        Returns: {
          customer_address: string
          customer_company: string
          customer_email: string
          customer_name: string
          customer_phone: string
          invoice_id: string
        }[]
      }
      lookup_shared_payment_context: {
        Args: { p_token_hash: string }
        Returns: {
          amount_minor: number
          business_id: string
          business_name: string
          currency: string
          invoice_id: string
          invoice_number: string
          invoice_status: Database["public"]["Enums"]["invoice_status"]
          receiving_address: string
          receiving_network: string
        }[]
      }
      lookup_shared_payment_networks: {
        Args: { p_token_hash: string }
        Returns: {
          invoice_id: string
          receiving_address: string | null
          receiving_networks: string[]
        }[]
      }
      lookup_shared_payment_receipts: {
        Args: { p_token_hash: string }
        Returns: {
          business_name: string
          destination_asset_id: string
          destination_network: string
          destination_tx_hashes: Json
          invoice_number: string
          issued_at: string
          outcome: Database["public"]["Enums"]["payment_settlement_outcome"]
          receipt_number: string
          received_amount_base_units: string
          received_asset_decimals: number
        }[]
      }
      lookup_shared_receipt_destinations: {
        Args: { p_token_hash: string }
        Returns: {
          receipt_number: string
          recipient_address: string
        }[]
      }
      mark_circle_execution_started: {
        Args: {
          p_attempt_id: string
          p_expected_payer: string
          p_token_hash: string
        }
        Returns: {
          business_id: string
          circle_approval_tx_hash: string | null
          circle_destination_tx_hashes: Json
          circle_execution_reserved_at: string | null
          circle_message_hash: string | null
          circle_message_nonce: string | null
          circle_recovery_state: string
          circle_recovery_updated_at: string
          circle_sdk_result_state: string | null
          circle_sdk_steps: Json
          created_at: string
          deposit_address: string | null
          deposit_memo: string | null
          destination_asset_id: string
          destination_network: string
          expected_received_amount: string | null
          id: string
          idempotency_key: string
          invoice_id: string
          mode: string
          quote_expires_at: string | null
          quote_snapshot: Json | null
          recipient_address: string | null
          requested_amount: string | null
          settlement_resolved_at: string | null
          source_asset_id: string
          source_network: string
          status: Database["public"]["Enums"]["payment_attempt_status"]
          transaction_hash: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "payment_attempts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      merchant_nodus_received_by_chain: {
        Args: never
        Returns: {
          destination_network: string
          payment_count: number
          total_base_units: string
        }[]
      }
      record_circle_recovery_progress: {
        Args: {
          p_attempt_id: string
          p_destination_tx_hashes?: Json
          p_message_hash?: string
          p_message_nonce?: string
          p_state: string
        }
        Returns: undefined
      }
      record_circle_sdk_progress: {
        Args: {
          p_attempt_id: string
          p_result_state: string
          p_step?: Json
          p_token_hash: string
        }
        Returns: {
          business_id: string
          circle_approval_tx_hash: string | null
          circle_destination_tx_hashes: Json
          circle_execution_reserved_at: string | null
          circle_message_hash: string | null
          circle_message_nonce: string | null
          circle_recovery_state: string
          circle_recovery_updated_at: string
          circle_sdk_result_state: string | null
          circle_sdk_steps: Json
          created_at: string
          deposit_address: string | null
          deposit_memo: string | null
          destination_asset_id: string
          destination_network: string
          expected_received_amount: string | null
          id: string
          idempotency_key: string
          invoice_id: string
          mode: string
          quote_expires_at: string | null
          quote_snapshot: Json | null
          recipient_address: string | null
          requested_amount: string | null
          settlement_resolved_at: string | null
          source_asset_id: string
          source_network: string
          status: Database["public"]["Enums"]["payment_attempt_status"]
          transaction_hash: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "payment_attempts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      record_payment_reconciliation: {
        Args: {
          p_attempt_id: string
          p_chain_transfer_verified?: boolean
          p_destination_asset_id?: string
          p_destination_network?: string
          p_destination_tx_hashes?: Json
          p_evidence?: Json
          p_provider_signature_verified: boolean
          p_provider_status: Database["public"]["Enums"]["payment_attempt_status"]
          p_received_amount_base_units?: string
          p_received_asset_decimals?: number
          p_received_value_invoice_minor?: string
          p_recipient_address?: string
        }
        Returns: Json
      }
      reserve_direct_payment_execution: {
        Args: {
          p_attempt_id: string
          p_expected_payer: string
          p_token_hash: string
        }
        Returns: {
          business_id: string
          circle_approval_tx_hash: string | null
          circle_destination_tx_hashes: Json
          circle_execution_reserved_at: string | null
          circle_message_hash: string | null
          circle_message_nonce: string | null
          circle_recovery_state: string
          circle_recovery_updated_at: string
          circle_sdk_result_state: string | null
          circle_sdk_steps: Json
          created_at: string
          deposit_address: string | null
          deposit_memo: string | null
          destination_asset_id: string
          destination_network: string
          expected_received_amount: string | null
          id: string
          idempotency_key: string
          invoice_id: string
          mode: string
          quote_expires_at: string | null
          quote_snapshot: Json | null
          recipient_address: string | null
          requested_amount: string | null
          settlement_resolved_at: string | null
          source_asset_id: string
          source_network: string
          status: Database["public"]["Enums"]["payment_attempt_status"]
          transaction_hash: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "payment_attempts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      submit_circle_broadcast_references: {
        Args: {
          p_approval_tx_hash?: string
          p_attempt_id: string
          p_source_tx_hash: string
          p_token_hash: string
        }
        Returns: {
          business_id: string
          circle_approval_tx_hash: string | null
          circle_destination_tx_hashes: Json
          circle_execution_reserved_at: string | null
          circle_message_hash: string | null
          circle_message_nonce: string | null
          circle_recovery_state: string
          circle_recovery_updated_at: string
          circle_sdk_result_state: string | null
          circle_sdk_steps: Json
          created_at: string
          deposit_address: string | null
          deposit_memo: string | null
          destination_asset_id: string
          destination_network: string
          expected_received_amount: string | null
          id: string
          idempotency_key: string
          invoice_id: string
          mode: string
          quote_expires_at: string | null
          quote_snapshot: Json | null
          recipient_address: string | null
          requested_amount: string | null
          settlement_resolved_at: string | null
          source_asset_id: string
          source_network: string
          status: Database["public"]["Enums"]["payment_attempt_status"]
          transaction_hash: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "payment_attempts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      submit_circle_direct_broadcast_reference: {
        Args: {
          p_approval_tx_hash?: string
          p_attempt_id: string
          p_source_tx_hash: string
          p_token_hash: string
        }
        Returns: {
          business_id: string
          circle_approval_tx_hash: string | null
          circle_destination_tx_hashes: Json
          circle_execution_reserved_at: string | null
          circle_message_hash: string | null
          circle_message_nonce: string | null
          circle_recovery_state: string
          circle_recovery_updated_at: string
          circle_sdk_result_state: string | null
          circle_sdk_steps: Json
          created_at: string
          deposit_address: string | null
          deposit_memo: string | null
          destination_asset_id: string
          destination_network: string
          expected_received_amount: string | null
          id: string
          idempotency_key: string
          invoice_id: string
          mode: string
          quote_expires_at: string | null
          quote_snapshot: Json | null
          recipient_address: string | null
          requested_amount: string | null
          settlement_resolved_at: string | null
          source_asset_id: string
          source_network: string
          status: Database["public"]["Enums"]["payment_attempt_status"]
          transaction_hash: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "payment_attempts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      submit_shared_invoice_feedback: {
        Args: { p_comment?: string; p_rating: number; p_token_hash: string }
        Returns: {
          comment: string
          customer_name: string
          rating: number
          submitted_at: string
        }[]
      }
      update_live_attempt_status: {
        Args: {
          p_attempt_id: string
          p_status: Database["public"]["Enums"]["payment_attempt_status"]
          p_token_hash: string
          p_transaction_hash?: string
        }
        Returns: {
          business_id: string
          circle_approval_tx_hash: string | null
          circle_destination_tx_hashes: Json
          circle_execution_reserved_at: string | null
          circle_message_hash: string | null
          circle_message_nonce: string | null
          circle_recovery_state: string
          circle_recovery_updated_at: string
          circle_sdk_result_state: string | null
          circle_sdk_steps: Json
          created_at: string
          deposit_address: string | null
          deposit_memo: string | null
          destination_asset_id: string
          destination_network: string
          expected_received_amount: string | null
          id: string
          idempotency_key: string
          invoice_id: string
          mode: string
          quote_expires_at: string | null
          quote_snapshot: Json | null
          recipient_address: string | null
          requested_amount: string | null
          settlement_resolved_at: string | null
          source_asset_id: string
          source_network: string
          status: Database["public"]["Enums"]["payment_attempt_status"]
          transaction_hash: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "payment_attempts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
    }
    Enums: {
      invoice_status: "draft" | "open" | "paid" | "cancelled" | "overdue"
      payment_attempt_status:
        | "MOCK_QUOTE_READY"
        | "QUOTE_EXPIRED"
        | "PENDING_DEPOSIT"
        | "KNOWN_DEPOSIT_TX"
        | "PROCESSING"
        | "SUCCESS"
        | "REFUNDED"
        | "FAILED"
        | "INCOMPLETE_DEPOSIT"
      payment_settlement_outcome:
        | "VERIFIED"
        | "PARTIAL"
        | "OVERPAID"
        | "REVIEW_REQUIRED"
        | "REFUNDED"
        | "FAILED"
        | "INCOMPLETE_DEPOSIT"
        | "EXPIRED"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      invoice_status: ["draft", "open", "paid", "cancelled", "overdue"],
      payment_attempt_status: [
        "MOCK_QUOTE_READY",
        "QUOTE_EXPIRED",
        "PENDING_DEPOSIT",
        "KNOWN_DEPOSIT_TX",
        "PROCESSING",
        "SUCCESS",
        "REFUNDED",
        "FAILED",
        "INCOMPLETE_DEPOSIT",
      ],
      payment_settlement_outcome: [
        "VERIFIED",
        "PARTIAL",
        "OVERPAID",
        "REVIEW_REQUIRED",
        "REFUNDED",
        "FAILED",
        "INCOMPLETE_DEPOSIT",
        "EXPIRED",
      ],
    },
  },
} as const
