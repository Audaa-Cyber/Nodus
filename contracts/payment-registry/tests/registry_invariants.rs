use near_sdk::{test_utils::VMContextBuilder, testing_env, AccountId};
use nodus_payment_registry::{
    evidence_digest_for, AttestationInput, Contract, InvoiceTerms, InvoiceStatus, SettlementOutcome,
};

fn account(value: &str) -> AccountId {
    value.parse().expect("valid NEAR account")
}

fn terms() -> InvoiceTerms {
    InvoiceTerms {
        currency: "USD".to_string(),
        amount_minor: 10_000,
        destination_chain_id: 421_614,
        token_decimals: 6,
        token_address: "0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d".to_string(),
        merchant_recipient: "0x2222222222222222222222222222222222222222".to_string(),
    }
}

fn setup(predecessor: &str) -> Contract {
    testing_env!(VMContextBuilder::new().predecessor_account_id(account(predecessor)).build());
    Contract::new(account("owner.near"), account("registrar.near"), account("attestor.near"))
}

fn register_invoice(contract: &mut Contract) {
    testing_env!(VMContextBuilder::new().predecessor_account_id(account("registrar.near")).build());
    contract.register_invoice("00000000-0000-4000-8000-000000000001".to_string(), terms());
}

fn register_attempt(contract: &mut Contract, id: &str) {
    testing_env!(VMContextBuilder::new().predecessor_account_id(account("registrar.near")).build());
    contract.register_attempt(
        id.to_string(),
        "00000000-0000-4000-8000-000000000001".to_string(),
        84_532,
    );
}

fn attestation(attempt_id: &str, amount: u128, suffix: &str) -> AttestationInput {
    let mut value = AttestationInput {
        reconciliation_id: format!("00000000-0000-4000-8000-{suffix:0>12}"),
        attempt_id: attempt_id.to_string(),
        source_chain_id: 84_532,
        source_transaction_hash: format!("0x{}", suffix.repeat(64).chars().take(64).collect::<String>()),
        source_block_number: 100,
        source_block_hash: format!("0x{}", "1".repeat(64)),
        cctp_message_nonce: 7,
        cctp_message_hash: format!("0x{}", "2".repeat(64)),
        destination_chain_id: 421_614,
        destination_transaction_hash: format!("0x{}", suffix.repeat(64).chars().take(64).collect::<String>()),
        destination_block_number: 200,
        destination_block_hash: format!("0x{}", "3".repeat(64)),
        token_address: terms().token_address,
        merchant_recipient: terms().merchant_recipient,
        amount_base_units: near_sdk::json_types::U128(amount),
        token_decimals: 6,
        verifier_policy_version: 1,
        evidence_digest: String::new(),
    };
    value.evidence_digest = evidence_digest_for("00000000-0000-4000-8000-000000000001", &value);
    value
}

#[test]
fn registrar_registers_terms_and_contract_computes_commitment() {
    let mut contract = setup("registrar.near");
    register_invoice(&mut contract);

    let invoice = contract.get_invoice("00000000-0000-4000-8000-000000000001".to_string()).unwrap();
    assert_eq!(invoice.terms.amount_minor, 10_000);
    assert_eq!(invoice.terms_commitment.len(), 66);
    assert_eq!(invoice.status, InvoiceStatus::Open);
}

#[test]
fn attestor_records_full_settlement_once_and_marks_invoice_paid() {
    let mut contract = setup("registrar.near");
    register_invoice(&mut contract);
    register_attempt(&mut contract, "00000000-0000-4000-8000-000000000002");
    testing_env!(VMContextBuilder::new().predecessor_account_id(account("attestor.near")).build());

    let result = contract.attest_settlement(attestation(
        "00000000-0000-4000-8000-000000000002", 100_000_000, "b",
    ));
    assert_eq!(result.outcome, SettlementOutcome::Verified);
    assert_eq!(contract.get_invoice("00000000-0000-4000-8000-000000000001".to_string()).unwrap().status, InvoiceStatus::Paid);
    assert!(contract.get_settlement("00000000-0000-4000-8000-00000000000b".to_string()).is_some());
}

#[test]
#[should_panic(expected = "attempt_already_attested")]
fn an_attempt_cannot_be_settled_twice() {
    let mut contract = setup("registrar.near");
    register_invoice(&mut contract);
    register_attempt(&mut contract, "00000000-0000-4000-8000-000000000002");
    testing_env!(VMContextBuilder::new().predecessor_account_id(account("attestor.near")).build());
    contract.attest_settlement(attestation("00000000-0000-4000-8000-000000000002", 100_000_000, "b"));
    contract.attest_settlement(attestation("00000000-0000-4000-8000-000000000002", 100_000_000, "c"));
}

#[test]
#[should_panic(expected = "transaction_already_attested")]
fn an_evm_transaction_cannot_be_replayed_for_another_attempt() {
    let mut contract = setup("registrar.near");
    register_invoice(&mut contract);
    register_attempt(&mut contract, "00000000-0000-4000-8000-000000000002");
    register_attempt(&mut contract, "00000000-0000-4000-8000-000000000004");
    testing_env!(VMContextBuilder::new().predecessor_account_id(account("attestor.near")).build());
    contract.attest_settlement(attestation("00000000-0000-4000-8000-000000000002", 50_000_000, "b"));
    let mut replay = attestation("00000000-0000-4000-8000-000000000004", 50_000_000, "c");
    replay.source_transaction_hash = attestation("00000000-0000-4000-8000-000000000002", 50_000_000, "b").source_transaction_hash;
    contract.attest_settlement(replay);
}

#[test]
#[should_panic(expected = "recipient_mismatch")]
fn attestation_must_match_registered_merchant_recipient() {
    let mut contract = setup("registrar.near");
    register_invoice(&mut contract);
    register_attempt(&mut contract, "00000000-0000-4000-8000-000000000002");
    testing_env!(VMContextBuilder::new().predecessor_account_id(account("attestor.near")).build());
    let mut value = attestation("00000000-0000-4000-8000-000000000002", 100_000_000, "b");
    value.merchant_recipient = "0x3333333333333333333333333333333333333333".to_string();
    contract.attest_settlement(value);
}

#[test]
#[should_panic(expected = "evidence_digest_mismatch")]
fn evidence_digest_cannot_be_reused_after_attestation_fields_change() {
    let mut contract = setup("registrar.near");
    register_invoice(&mut contract);
    register_attempt(&mut contract, "00000000-0000-4000-8000-000000000002");
    testing_env!(VMContextBuilder::new().predecessor_account_id(account("attestor.near")).build());
    let mut value = attestation("00000000-0000-4000-8000-000000000002", 100_000_000, "b");
    value.amount_base_units = near_sdk::json_types::U128(99_000_000);
    contract.attest_settlement(value);
}

#[test]
fn partial_settlements_accumulate_and_only_exact_total_pays_invoice() {
    let mut contract = setup("registrar.near");
    register_invoice(&mut contract);
    register_attempt(&mut contract, "00000000-0000-4000-8000-000000000002");
    register_attempt(&mut contract, "00000000-0000-4000-8000-000000000004");
    testing_env!(VMContextBuilder::new().predecessor_account_id(account("attestor.near")).build());

    let first = contract.attest_settlement(attestation("00000000-0000-4000-8000-000000000002", 40_000_000, "b"));
    assert_eq!(first.outcome, SettlementOutcome::Partial);
    assert_eq!(contract.get_invoice("00000000-0000-4000-8000-000000000001".to_string()).unwrap().status, InvoiceStatus::Open);
    let second = contract.attest_settlement(attestation("00000000-0000-4000-8000-000000000004", 60_000_000, "c"));
    assert_eq!(second.outcome, SettlementOutcome::Verified);
    assert_eq!(contract.get_invoice("00000000-0000-4000-8000-000000000001".to_string()).unwrap().status, InvoiceStatus::Paid);
}

#[test]
fn overpayment_requires_review_and_blocks_follow_on_attempts() {
    let mut contract = setup("registrar.near");
    register_invoice(&mut contract);
    register_attempt(&mut contract, "00000000-0000-4000-8000-000000000002");
    testing_env!(VMContextBuilder::new().predecessor_account_id(account("attestor.near")).build());

    let result = contract.attest_settlement(attestation("00000000-0000-4000-8000-000000000002", 100_000_001, "b"));
    assert_eq!(result.outcome, SettlementOutcome::Overpaid);
    assert_eq!(contract.get_invoice("00000000-0000-4000-8000-000000000001".to_string()).unwrap().status, InvoiceStatus::ReviewRequired);
    testing_env!(VMContextBuilder::new().predecessor_account_id(account("registrar.near")).build());
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        contract.register_attempt("00000000-0000-4000-8000-000000000004".to_string(), "00000000-0000-4000-8000-000000000001".to_string(), 84_532);
    })).is_err());
}

#[test]
#[should_panic(expected = "unauthorized_attestor")]
fn unregistered_account_cannot_attest_settlement() {
    let mut contract = setup("registrar.near");
    register_invoice(&mut contract);
    register_attempt(&mut contract, "00000000-0000-4000-8000-000000000002");
    testing_env!(VMContextBuilder::new().predecessor_account_id(account("mallory.near")).build());
    contract.attest_settlement(attestation("00000000-0000-4000-8000-000000000002", 100_000_000, "b"));
}

