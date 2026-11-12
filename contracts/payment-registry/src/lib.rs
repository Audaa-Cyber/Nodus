use near_sdk::collections::LookupMap;
use near_sdk::json_types::U128;
use near_sdk::{env, near, AccountId, PanicOnDefault};

const TERMS_DOMAIN: &[u8] = b"NODUS_PAYMENT_TERMS_V1\0";
const ATTEMPT_TERMS_DOMAIN: &[u8] = b"NODUS_PAYMENT_ATTEMPT_TERMS_V1\0";
const EVIDENCE_DOMAIN: &[u8] = b"NODUS_CCTP_SETTLEMENT_EVIDENCE_V1\0";
const EVENT_STANDARD: &str = "nodus_payment_registry";
const EVENT_VERSION: &str = "1.0.0";
const UUID_LEN: usize = 36;
const ETHEREUM_SEPOLIA_CHAIN_ID: u64 = 11_155_111;
const BASE_SEPOLIA_CHAIN_ID: u64 = 84_532;
const ARBITRUM_SEPOLIA_CHAIN_ID: u64 = 421_614;
const OPTIMISM_SEPOLIA_CHAIN_ID: u64 = 11_155_420;

fn testnet_usdc_for_chain(chain_id: u64) -> Option<&'static str> {
    match chain_id {
        ETHEREUM_SEPOLIA_CHAIN_ID => Some("0x1c7d4b196cb0c7b01d743fbc6116a902379c7238"),
        BASE_SEPOLIA_CHAIN_ID => Some("0x036cbd53842c5426634e7929541ec2318f3dcf7e"),
        ARBITRUM_SEPOLIA_CHAIN_ID => Some("0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d"),
        OPTIMISM_SEPOLIA_CHAIN_ID => Some("0x5fd84259d66cd46123540766be93dfe6d43130d7"),
        _ => None,
    }
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct InvoiceTerms {
    pub currency: String,
    pub amount_minor: U128,
    pub destination_chain_id: u64,
    pub token_decimals: u8,
    pub token_address: String,
    pub merchant_recipient: String,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum InvoiceStatus {
    Open,
    Paid,
    ReviewRequired,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum AttemptStatus {
    Registered,
    SettlementRecorded,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum SettlementOutcome {
    Partial,
    Verified,
    Overpaid,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct InvoiceRecord {
    pub invoice_id: String,
    pub terms: InvoiceTerms,
    pub terms_commitment: String,
    pub status: InvoiceStatus,
    pub received_base_units: U128,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AttemptRecord {
    pub attempt_id: String,
    pub invoice_id: String,
    pub source_chain_id: u64,
    pub source_token_address: String,
    pub attempt_terms_commitment: String,
    pub status: AttemptStatus,
    pub reconciliation_id: Option<String>,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AttestationInput {
    pub reconciliation_id: String,
    pub attempt_id: String,
    pub source_chain_id: u64,
    pub source_transaction_hash: String,
    pub source_block_number: u64,
    pub source_block_hash: String,
    pub cctp_message_nonce: u64,
    pub cctp_message_hash: String,
    pub destination_chain_id: u64,
    pub destination_transaction_hash: String,
    pub destination_block_number: u64,
    pub destination_block_hash: String,
    pub token_address: String,
    pub merchant_recipient: String,
    pub amount_base_units: U128,
    pub token_decimals: u8,
    pub verifier_policy_version: u32,
    pub evidence_digest: String,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SettlementRecord {
    pub reconciliation_id: String,
    pub invoice_id: String,
    pub attempt_id: String,
    pub source_chain_id: u64,
    pub source_transaction_hash: String,
    pub destination_chain_id: u64,
    pub destination_transaction_hash: String,
    pub token_address: String,
    pub merchant_recipient: String,
    pub amount_base_units: U128,
    pub token_decimals: u8,
    pub outcome: SettlementOutcome,
    pub evidence_digest: String,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    owner_id: AccountId,
    registrar_id: AccountId,
    attestors: LookupMap<AccountId, bool>,
    invoices: LookupMap<String, InvoiceRecord>,
    attempts: LookupMap<String, AttemptRecord>,
    settlements: LookupMap<String, SettlementRecord>,
    used_reconciliation_ids: LookupMap<String, bool>,
    used_transactions: LookupMap<String, bool>,
    used_cctp_messages: LookupMap<String, bool>,
    attestor_count: u32,
}

#[near]
impl Contract {
    #[init]
    pub fn new(owner_id: AccountId, registrar_id: AccountId, initial_attestor: AccountId) -> Self {
        assert!(!env::state_exists(), "already_initialized");
        let mut contract = Self {
            owner_id,
            registrar_id,
            attestors: LookupMap::new(&b"attestors"[..]),
            invoices: LookupMap::new(&b"invoices"[..]),
            attempts: LookupMap::new(&b"attempts"[..]),
            settlements: LookupMap::new(&b"settlements"[..]),
            used_reconciliation_ids: LookupMap::new(&b"reconciliation_ids"[..]),
            used_transactions: LookupMap::new(&b"transactions"[..]),
            used_cctp_messages: LookupMap::new(&b"cctp_messages"[..]),
            attestor_count: 1,
        };
        contract.attestors.insert(&initial_attestor, &true);
        contract
    }

    pub fn register_invoice(&mut self, invoice_id: String, terms: InvoiceTerms) {
        self.assert_registrar();
        assert_uuid(&invoice_id);
        validate_terms(&terms);
        assert!(
            self.invoices.get(&invoice_id).is_none(),
            "invoice_already_registered"
        );
        let commitment = terms_commitment(&invoice_id, &terms);
        self.invoices.insert(
            &invoice_id,
            &InvoiceRecord {
                invoice_id: invoice_id.clone(),
                terms,
                terms_commitment: commitment.clone(),
                status: InvoiceStatus::Open,
                received_base_units: U128(0),
            },
        );
        emit_event(
            "invoice_registered",
            near_sdk::serde_json::json!({
                "invoice_id": invoice_id,
                "terms_commitment": commitment,
            }),
        );
    }

    pub fn register_attempt(
        &mut self,
        attempt_id: String,
        invoice_id: String,
        source_chain_id: u64,
    ) {
        self.assert_registrar();
        assert_uuid(&attempt_id);
        assert_uuid(&invoice_id);
        assert!(
            self.attempts.get(&attempt_id).is_none(),
            "attempt_already_registered"
        );
        let invoice = self
            .invoices
            .get(&invoice_id)
            .expect("invoice_not_registered");
        assert_eq!(invoice.status, InvoiceStatus::Open, "invoice_not_open");
        let source_token_address = testnet_usdc_for_chain(source_chain_id)
            .expect("unsupported_source_chain")
            .to_string();
        let commitment = attempt_terms_commitment(
            &attempt_id,
            &invoice_id,
            &invoice.terms_commitment,
            source_chain_id,
            &source_token_address,
        );
        self.attempts.insert(
            &attempt_id,
            &AttemptRecord {
                attempt_id: attempt_id.clone(),
                invoice_id: invoice_id.clone(),
                source_chain_id,
                source_token_address,
                attempt_terms_commitment: commitment,
                status: AttemptStatus::Registered,
                reconciliation_id: None,
            },
        );
        let attempt = self
            .attempts
            .get(&attempt_id)
            .expect("attempt_insert_failed");
        emit_event(
            "attempt_registered",
            near_sdk::serde_json::json!({
                "attempt_id": attempt.attempt_id,
                "invoice_id": attempt.invoice_id,
                "source_chain_id": attempt.source_chain_id,
                "source_token_address": attempt.source_token_address,
                "attempt_terms_commitment": attempt.attempt_terms_commitment,
            }),
        );
    }

    pub fn attest_settlement(&mut self, input: AttestationInput) -> SettlementRecord {
        assert!(
            self.attestors
                .get(&env::predecessor_account_id())
                .unwrap_or(false),
            "unauthorized_attestor"
        );
        assert_uuid(&input.reconciliation_id);
        assert_uuid(&input.attempt_id);
        assert_hex_hash(&input.source_transaction_hash);
        assert_hex_hash(&input.source_block_hash);
        assert_hex_hash(&input.cctp_message_hash);
        assert_hex_hash(&input.destination_transaction_hash);
        assert_hex_hash(&input.destination_block_hash);
        assert_hex_hash(&input.evidence_digest);
        assert_address(&input.token_address);
        assert_address(&input.merchant_recipient);
        assert!(input.amount_base_units.0 > 0, "invalid_settlement_amount");

        let mut attempt = self
            .attempts
            .get(&input.attempt_id)
            .expect("attempt_not_registered");
        assert_eq!(
            attempt.status,
            AttemptStatus::Registered,
            "attempt_already_attested"
        );
        assert_eq!(
            attempt.source_chain_id, input.source_chain_id,
            "source_chain_mismatch"
        );
        assert!(
            !self
                .used_reconciliation_ids
                .get(&input.reconciliation_id)
                .unwrap_or(false),
            "reconciliation_already_attested"
        );
        let cctp_nonce_key = format!("{}:{}", input.source_chain_id, input.cctp_message_nonce);
        let cctp_hash_key = format!("{}:{}", input.source_chain_id, input.cctp_message_hash);
        assert!(
            !self
                .used_cctp_messages
                .get(&cctp_nonce_key)
                .unwrap_or(false)
                && !self.used_cctp_messages.get(&cctp_hash_key).unwrap_or(false),
            "cctp_message_already_attested"
        );

        let mut invoice = self
            .invoices
            .get(&attempt.invoice_id)
            .expect("invoice_not_registered");
        let expected_attempt_commitment = attempt_terms_commitment(
            &attempt.attempt_id,
            &attempt.invoice_id,
            &invoice.terms_commitment,
            attempt.source_chain_id,
            &attempt.source_token_address,
        );
        assert_eq!(
            attempt.attempt_terms_commitment, expected_attempt_commitment,
            "attempt_terms_commitment_mismatch"
        );
        assert_eq!(invoice.status, InvoiceStatus::Open, "invoice_not_open");
        assert_eq!(
            input.destination_chain_id, invoice.terms.destination_chain_id,
            "destination_chain_mismatch"
        );
        assert_eq!(
            input.token_decimals, invoice.terms.token_decimals,
            "token_decimals_mismatch"
        );
        assert_eq!(
            input.token_address, invoice.terms.token_address,
            "token_address_mismatch"
        );
        assert_eq!(
            input.merchant_recipient, invoice.terms.merchant_recipient,
            "recipient_mismatch"
        );
        let base_units_per_minor = 10u128
            .checked_pow(u32::from(invoice.terms.token_decimals - 2))
            .expect("invoice_amount_overflow");
        assert_eq!(
            input.amount_base_units.0 % base_units_per_minor,
            0,
            "settlement_amount_not_exact_minor_units"
        );
        assert!(
            input.source_block_number > 0 && input.destination_block_number > 0,
            "invalid_evidence_block"
        );
        assert!(
            input.verifier_policy_version > 0,
            "invalid_verifier_policy_version"
        );
        assert_eq!(
            input.evidence_digest,
            evidence_digest_for(&attempt.invoice_id, &input),
            "evidence_digest_mismatch"
        );

        let source_key = transaction_key(input.source_chain_id, &input.source_transaction_hash);
        let destination_key = transaction_key(
            input.destination_chain_id,
            &input.destination_transaction_hash,
        );
        assert!(
            !self.used_transactions.get(&source_key).unwrap_or(false),
            "transaction_already_attested"
        );
        assert!(
            !self
                .used_transactions
                .get(&destination_key)
                .unwrap_or(false),
            "transaction_already_attested"
        );

        let new_total = invoice
            .received_base_units
            .0
            .checked_add(input.amount_base_units.0)
            .expect("settlement_total_overflow");
        let target = target_base_units(&invoice.terms).expect("invoice_amount_overflow");
        let outcome = if new_total < target {
            SettlementOutcome::Partial
        } else if new_total == target {
            invoice.status = InvoiceStatus::Paid;
            SettlementOutcome::Verified
        } else {
            invoice.status = InvoiceStatus::ReviewRequired;
            SettlementOutcome::Overpaid
        };

        invoice.received_base_units = U128(new_total);
        attempt.status = AttemptStatus::SettlementRecorded;
        attempt.reconciliation_id = Some(input.reconciliation_id.clone());
        self.used_reconciliation_ids
            .insert(&input.reconciliation_id, &true);
        self.used_cctp_messages.insert(&cctp_nonce_key, &true);
        self.used_cctp_messages.insert(&cctp_hash_key, &true);
        self.used_transactions.insert(&source_key, &true);
        self.used_transactions.insert(&destination_key, &true);

        let settlement = SettlementRecord {
            reconciliation_id: input.reconciliation_id.clone(),
            invoice_id: attempt.invoice_id.clone(),
            attempt_id: input.attempt_id,
            source_chain_id: input.source_chain_id,
            source_transaction_hash: input.source_transaction_hash,
            destination_chain_id: input.destination_chain_id,
            destination_transaction_hash: input.destination_transaction_hash,
            token_address: input.token_address,
            merchant_recipient: input.merchant_recipient,
            amount_base_units: input.amount_base_units,
            token_decimals: input.token_decimals,
            outcome,
            evidence_digest: input.evidence_digest,
        };
        self.invoices.insert(&invoice.invoice_id, &invoice);
        self.attempts.insert(&attempt.attempt_id, &attempt);
        self.settlements
            .insert(&settlement.reconciliation_id, &settlement);
        emit_event(
            "settlement_attested",
            near_sdk::serde_json::json!({
                "reconciliation_id": settlement.reconciliation_id.clone(),
                "invoice_id": settlement.invoice_id.clone(),
                "attempt_id": settlement.attempt_id.clone(),
                "source_chain_id": settlement.source_chain_id,
                "source_transaction_hash": settlement.source_transaction_hash.clone(),
                "destination_chain_id": settlement.destination_chain_id,
                "destination_transaction_hash": settlement.destination_transaction_hash.clone(),
                "token_address": settlement.token_address.clone(),
                "merchant_recipient": settlement.merchant_recipient.clone(),
                "amount_base_units": settlement.amount_base_units,
                "outcome": settlement.outcome,
                "evidence_digest": settlement.evidence_digest.clone(),
            }),
        );
        settlement
    }

    pub fn add_attestor(&mut self, account_id: AccountId) {
        self.assert_owner();
        if !self.attestors.get(&account_id).unwrap_or(false) {
            self.attestors.insert(&account_id, &true);
            self.attestor_count = self
                .attestor_count
                .checked_add(1)
                .expect("attestor_count_overflow");
            emit_event(
                "attestor_added",
                near_sdk::serde_json::json!({ "account_id": account_id }),
            );
        }
    }

    pub fn remove_attestor(&mut self, account_id: AccountId) {
        self.assert_owner();
        assert_ne!(
            account_id, self.owner_id,
            "owner_attestor_cannot_be_removed"
        );
        assert!(
            self.attestors.get(&account_id).unwrap_or(false),
            "attestor_not_found"
        );
        assert!(self.attestor_count > 1, "cannot_remove_last_attestor");
        self.attestors.remove(&account_id);
        self.attestor_count -= 1;
        emit_event(
            "attestor_removed",
            near_sdk::serde_json::json!({ "account_id": account_id }),
        );
    }

    pub fn get_invoice(&self, invoice_id: String) -> Option<InvoiceRecord> {
        self.invoices.get(&invoice_id)
    }

    pub fn get_attempt(&self, attempt_id: String) -> Option<AttemptRecord> {
        self.attempts.get(&attempt_id)
    }

    pub fn get_settlement(&self, reconciliation_id: String) -> Option<SettlementRecord> {
        self.settlements.get(&reconciliation_id)
    }

    pub fn is_attestor(&self, account_id: AccountId) -> bool {
        self.attestors.get(&account_id).unwrap_or(false)
    }

    fn assert_owner(&self) {
        assert_eq!(
            env::predecessor_account_id(),
            self.owner_id,
            "unauthorized_owner"
        );
    }

    fn assert_registrar(&self) {
        let caller = env::predecessor_account_id();
        assert!(
            caller == self.registrar_id || caller == self.owner_id,
            "unauthorized_registrar"
        );
    }
}

fn validate_terms(terms: &InvoiceTerms) {
    assert_eq!(terms.currency, "USD", "unsupported_invoice_currency");
    assert!(
        terms.amount_minor.0 > 0 && terms.amount_minor.0 <= 999_999_999_999,
        "invalid_invoice_amount"
    );
    let expected_token = testnet_usdc_for_chain(terms.destination_chain_id)
        .expect("unsupported_destination_chain");
    assert_eq!(terms.token_decimals, 6, "unsupported_token_decimals");
    assert_eq!(
        terms.token_address.to_lowercase(), expected_token,
        "unsupported_destination_token"
    );
    assert_address(&terms.token_address);
    assert_address(&terms.merchant_recipient);
    assert!(
        target_base_units(terms).is_some(),
        "invoice_amount_overflow"
    );
}

fn target_base_units(terms: &InvoiceTerms) -> Option<u128> {
    let exponent = u32::from(terms.token_decimals.checked_sub(2)?);
    terms
        .amount_minor
        .0
        .checked_mul(10u128.checked_pow(exponent)?)
}

fn terms_commitment(invoice_id: &str, terms: &InvoiceTerms) -> String {
    let mut encoded = Vec::new();
    encoded.extend_from_slice(TERMS_DOMAIN);
    encoded.extend_from_slice(&decode_uuid(invoice_id));
    encoded.extend_from_slice(&terms.amount_minor.0.to_be_bytes());
    encoded.extend_from_slice(&terms.destination_chain_id.to_be_bytes());
    encoded.push(terms.token_decimals);
    encoded.extend_from_slice(&decode_address(&terms.token_address));
    encoded.extend_from_slice(&decode_address(&terms.merchant_recipient));
    encoded.extend_from_slice(&(terms.currency.len() as u16).to_be_bytes());
    encoded.extend_from_slice(terms.currency.as_bytes());
    format!("0x{}", hex_encode(&env::sha256(&encoded)))
}

fn attempt_terms_commitment(
    attempt_id: &str,
    invoice_id: &str,
    invoice_commitment: &str,
    source_chain_id: u64,
    source_token_address: &str,
) -> String {
    assert_hex_hash(invoice_commitment);
    let mut encoded = Vec::new();
    encoded.extend_from_slice(ATTEMPT_TERMS_DOMAIN);
    encoded.extend_from_slice(&decode_uuid(attempt_id));
    encoded.extend_from_slice(&decode_uuid(invoice_id));
    encoded.extend_from_slice(&decode_hash(invoice_commitment));
    encoded.extend_from_slice(&source_chain_id.to_be_bytes());
    encoded.extend_from_slice(&decode_address(source_token_address));
    format!("0x{}", hex_encode(&env::sha256(&encoded)))
}

fn emit_event(event: &str, data: near_sdk::serde_json::Value) {
    let payload = near_sdk::serde_json::json!({
        "standard": EVENT_STANDARD,
        "version": EVENT_VERSION,
        "event": event,
        "data": [data],
    });
    env::log_str(&format!("EVENT_JSON:{payload}"));
}

/// Canonical evidence commitment used by the backend worker. The contract
/// recomputes it so the digest cannot be swapped independently of the call.
pub fn evidence_digest_for(invoice_id: &str, input: &AttestationInput) -> String {
    let mut encoded = Vec::new();
    encoded.extend_from_slice(EVIDENCE_DOMAIN);
    encoded.extend_from_slice(&decode_uuid(invoice_id));
    encoded.extend_from_slice(&decode_uuid(&input.reconciliation_id));
    encoded.extend_from_slice(&decode_uuid(&input.attempt_id));
    encoded.extend_from_slice(&input.source_chain_id.to_be_bytes());
    encoded.extend_from_slice(&decode_hash(&input.source_transaction_hash));
    encoded.extend_from_slice(&input.source_block_number.to_be_bytes());
    encoded.extend_from_slice(&decode_hash(&input.source_block_hash));
    encoded.extend_from_slice(&input.cctp_message_nonce.to_be_bytes());
    encoded.extend_from_slice(&decode_hash(&input.cctp_message_hash));
    encoded.extend_from_slice(&input.destination_chain_id.to_be_bytes());
    encoded.extend_from_slice(&decode_hash(&input.destination_transaction_hash));
    encoded.extend_from_slice(&input.destination_block_number.to_be_bytes());
    encoded.extend_from_slice(&decode_hash(&input.destination_block_hash));
    encoded.extend_from_slice(&decode_address(&input.token_address));
    encoded.extend_from_slice(&decode_address(&input.merchant_recipient));
    encoded.extend_from_slice(&input.amount_base_units.0.to_be_bytes());
    encoded.push(input.token_decimals);
    encoded.extend_from_slice(&input.verifier_policy_version.to_be_bytes());
    format!("0x{}", hex_encode(&env::sha256(&encoded)))
}

fn assert_uuid(value: &str) {
    assert!(value.len() == UUID_LEN, "invalid_uuid");
    assert!(
        value.as_bytes().iter().enumerate().all(|(i, c)| {
            if [8, 13, 18, 23].contains(&i) {
                *c == b'-'
            } else {
                c.is_ascii_digit() || (b'a'..=b'f').contains(c)
            }
        }),
        "invalid_uuid"
    );
}

fn decode_uuid(value: &str) -> [u8; 16] {
    assert_uuid(value);
    let chars: Vec<u8> = value.bytes().filter(|byte| *byte != b'-').collect();
    let mut result = [0u8; 16];
    for (index, pair) in chars.chunks_exact(2).enumerate() {
        result[index] = (hex_nibble(pair[0]) << 4) | hex_nibble(pair[1]);
    }
    result
}

fn assert_address(value: &str) {
    assert!(
        value.len() == 42
            && value.starts_with("0x")
            && value.as_bytes()[2..]
                .iter()
                .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(c)),
        "invalid_evm_address"
    );
}

fn decode_address(value: &str) -> [u8; 20] {
    assert_address(value);
    let chars = &value.as_bytes()[2..];
    let mut result = [0u8; 20];
    for (index, pair) in chars.chunks_exact(2).enumerate() {
        result[index] = (hex_nibble(pair[0]) << 4) | hex_nibble(pair[1]);
    }
    result
}

fn assert_hex_hash(value: &str) {
    assert!(
        value.len() == 66
            && value.starts_with("0x")
            && value.as_bytes()[2..]
                .iter()
                .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(c)),
        "invalid_hex_hash"
    );
}

fn decode_hash(value: &str) -> [u8; 32] {
    assert_hex_hash(value);
    let chars = &value.as_bytes()[2..];
    let mut result = [0u8; 32];
    for (index, pair) in chars.chunks_exact(2).enumerate() {
        result[index] = (hex_nibble(pair[0]) << 4) | hex_nibble(pair[1]);
    }
    result
}

fn hex_nibble(byte: u8) -> u8 {
    match byte {
        b'0'..=b'9' => byte - b'0',
        b'a'..=b'f' => byte - b'a' + 10,
        _ => env::panic_str("invalid_hex"),
    }
}

fn hex_encode(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut result = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        result.push(HEX[(byte >> 4) as usize] as char);
        result.push(HEX[(byte & 0x0f) as usize] as char);
    }
    result
}

fn transaction_key(chain_id: u64, hash: &str) -> String {
    format!("{chain_id}:{hash}")
}
