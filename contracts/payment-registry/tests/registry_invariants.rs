use near_sdk::{test_utils::VMContextBuilder, testing_env, AccountId};
use nodus_payment_registry::{
    evidence_digest_for, AttestationInput, Contract, InvoiceStatus, InvoiceTerms, SettlementOutcome,
};

fn account(value: &str) -> AccountId {
    value.parse().expect("valid NEAR account")
}

fn terms() -> InvoiceTerms {
    InvoiceTerms {
        currency: "USD".to_string(),
        amount_minor: near_sdk::json_types::U128(10_000),
        destination_chain_id: 421_614,
        token_decimals: 6,
        token_address: "0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d".to_string(),
        merchant_recipient: "0x2222222222222222222222222222222222222222".to_string(),
    }
}

fn setup(predecessor: &str) -> Contract {
    testing_env!(VMContextBuilder::new()
        .predecessor_account_id(account(predecessor))
        .build());
    Contract::new(
        account("owner.near"),
        account("registrar.near"),
        account("attestor.near"),
    )
}

fn uuid_bytes(value: &str) -> Vec<u8> {
    hex_bytes(&value.replace('-', ""))
}

fn hex_bytes(value: &str) -> Vec<u8> {
    value
        .as_bytes()
        .chunks_exact(2)
        .map(|pair| {
            let digit = |byte: u8| match byte {
                b'0'..=b'9' => byte - b'0',
                b'a'..=b'f' => byte - b'a' + 10,
                _ => panic!("invalid test hex"),
            };
            (digit(pair[0]) << 4) | digit(pair[1])
        })
        .collect()
}

fn digest_hex(value: &[u8]) -> String {
    let encoded = value
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    format!("0x{encoded}")
}

fn register_invoice(contract: &mut Contract) {
    testing_env!(VMContextBuilder::new()
        .predecessor_account_id(account("registrar.near"))
        .build());
    contract.register_invoice("00000000-0000-4000-8000-000000000001".to_string(), terms());
}

fn register_attempt(contract: &mut Contract, id: &str) {
    testing_env!(VMContextBuilder::new()
        .predecessor_account_id(account("registrar.near"))
        .build());
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
        source_transaction_hash: format!(
            "0x{}",
            suffix.repeat(64).chars().take(64).collect::<String>()
        ),
        source_block_number: 100,
        source_block_hash: format!("0x{}", "1".repeat(64)),
        cctp_message_nonce: u64::from_str_radix(suffix, 16).expect("hex fixture suffix"),
        cctp_message_hash: format!(
            "0x{}",
            suffix.repeat(64).chars().take(64).collect::<String>()
        ),
        destination_chain_id: 421_614,
        destination_transaction_hash: format!(
            "0x{}",
            suffix.repeat(64).chars().take(64).collect::<String>()
        ),
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

    let invoice = contract
        .get_invoice("00000000-0000-4000-8000-000000000001".to_string())
        .unwrap();
    assert_eq!(
        invoice.terms.amount_minor,
        near_sdk::json_types::U128(10_000)
    );
    assert_eq!(invoice.terms_commitment.len(), 66);
    assert_eq!(invoice.status, InvoiceStatus::Open);
}

#[test]
#[should_panic(expected = "unauthorized_registrar")]
fn only_the_registrar_or_owner_can_register_an_invoice() {
    let mut contract = setup("mallory.near");
    contract.register_invoice("00000000-0000-4000-8000-000000000001".to_string(), terms());
}

#[test]
#[should_panic(expected = "unauthorized_registrar")]
fn only_the_registrar_or_owner_can_register_a_payment_attempt() {
    let mut contract = setup("registrar.near");
    register_invoice(&mut contract);
    testing_env!(VMContextBuilder::new()
        .predecessor_account_id(account("mallory.near"))
        .build());
    contract.register_attempt(
        "00000000-0000-4000-8000-000000000002".to_string(),
        "00000000-0000-4000-8000-000000000001".to_string(),
        84_532,
    );
}

#[test]
fn attempt_is_bound_to_invoice_terms_and_base_sepolia_usdc() {
    let mut contract = setup("registrar.near");
    register_invoice(&mut contract);
    let id = "00000000-0000-4000-8000-000000000002";
    register_attempt(&mut contract, id);

    let attempt = contract.get_attempt(id.to_string()).unwrap();
    assert_eq!(attempt.invoice_id, "00000000-0000-4000-8000-000000000001");
    assert_eq!(attempt.source_chain_id, 84_532);
    assert_eq!(
        attempt.source_token_address,
        "0x036cbd53842c5426634e7929541ec2318f3dcf7e"
    );
    assert_eq!(attempt.attempt_terms_commitment.len(), 66);
}

#[test]
fn invoice_and_attempt_commitments_bind_the_registered_terms() {
    let mut contract = setup("registrar.near");
    register_invoice(&mut contract);
    let attempt_id = "00000000-0000-4000-8000-000000000002";
    register_attempt(&mut contract, attempt_id);
    let invoice = contract
        .get_invoice("00000000-0000-4000-8000-000000000001".to_string())
        .unwrap();
    let attempt = contract.get_attempt(attempt_id.to_string()).unwrap();

    let mut invoice_encoding = b"NODUS_PAYMENT_TERMS_V1\0".to_vec();
    invoice_encoding.extend_from_slice(&uuid_bytes(&invoice.invoice_id));
    invoice_encoding.extend_from_slice(&invoice.terms.amount_minor.0.to_be_bytes());
    invoice_encoding.extend_from_slice(&invoice.terms.destination_chain_id.to_be_bytes());
    invoice_encoding.push(invoice.terms.token_decimals);
    invoice_encoding.extend(hex_bytes(&invoice.terms.token_address[2..]));
    invoice_encoding.extend(hex_bytes(&invoice.terms.merchant_recipient[2..]));
    invoice_encoding.extend_from_slice(&(invoice.terms.currency.len() as u16).to_be_bytes());
    invoice_encoding.extend_from_slice(invoice.terms.currency.as_bytes());
    assert_eq!(
        invoice.terms_commitment,
        digest_hex(&near_sdk::env::sha256(&invoice_encoding))
    );

    let mut attempt_encoding = b"NODUS_PAYMENT_ATTEMPT_TERMS_V1\0".to_vec();
    attempt_encoding.extend_from_slice(&uuid_bytes(&attempt.attempt_id));
    attempt_encoding.extend_from_slice(&uuid_bytes(&attempt.invoice_id));
    attempt_encoding.extend(hex_bytes(&invoice.terms_commitment[2..]));
    attempt_encoding.extend_from_slice(&attempt.source_chain_id.to_be_bytes());
    attempt_encoding.extend(hex_bytes(&attempt.source_token_address[2..]));
    assert_eq!(
        attempt.attempt_terms_commitment,
        digest_hex(&near_sdk::env::sha256(&attempt_encoding))
    );
}

#[test]
fn registration_emits_nep297_invoice_event() {
    use near_sdk::test_utils::get_logs;

    let mut contract = setup("registrar.near");
    register_invoice(&mut contract);
    assert!(get_logs().iter().any(|log| {
        log.starts_with("EVENT_JSON:")
            && log.contains("\"standard\":\"nodus_payment_registry\"")
            && log.contains("\"event\":\"invoice_registered\"")
    }));
}

#[test]
fn attestor_records_full_settlement_once_and_marks_invoice_paid() {
    let mut contract = setup("registrar.near");
    register_invoice(&mut contract);
    register_attempt(&mut contract, "00000000-0000-4000-8000-000000000002");
    testing_env!(VMContextBuilder::new()
        .predecessor_account_id(account("attestor.near"))
        .build());

    let result = contract.attest_settlement(attestation(
        "00000000-0000-4000-8000-000000000002",
        100_000_000,
        "b",
    ));
    assert_eq!(result.outcome, SettlementOutcome::Verified);
    assert_eq!(
        contract
            .get_invoice("00000000-0000-4000-8000-000000000001".to_string())
            .unwrap()
            .status,
        InvoiceStatus::Paid
    );
    assert!(contract
        .get_settlement("00000000-0000-4000-8000-00000000000b".to_string())
        .is_some());
}

#[test]
#[should_panic(expected = "attempt_already_attested")]
fn an_attempt_cannot_be_settled_twice() {
    let mut contract = setup("registrar.near");
    register_invoice(&mut contract);
    register_attempt(&mut contract, "00000000-0000-4000-8000-000000000002");
    testing_env!(VMContextBuilder::new()
        .predecessor_account_id(account("attestor.near"))
        .build());
    contract.attest_settlement(attestation(
        "00000000-0000-4000-8000-000000000002",
        100_000_000,
        "b",
    ));
    contract.attest_settlement(attestation(
        "00000000-0000-4000-8000-000000000002",
        100_000_000,
        "c",
    ));
}

#[test]
#[should_panic(expected = "reconciliation_already_attested")]
fn a_reconciliation_id_cannot_be_reused_for_another_attempt() {
    let mut contract = setup("registrar.near");
    register_invoice(&mut contract);
    register_attempt(&mut contract, "00000000-0000-4000-8000-000000000002");
    register_attempt(&mut contract, "00000000-0000-4000-8000-000000000004");
    testing_env!(VMContextBuilder::new()
        .predecessor_account_id(account("attestor.near"))
        .build());

    let original = attestation("00000000-0000-4000-8000-000000000002", 40_000_000, "b");
    contract.attest_settlement(original.clone());
    let mut replay = attestation("00000000-0000-4000-8000-000000000004", 40_000_000, "c");
    replay.cctp_message_nonce = original.cctp_message_nonce;
    replay.cctp_message_hash = original.cctp_message_hash;
    replay.reconciliation_id = "00000000-0000-4000-8000-00000000000b".to_string();
    replay.evidence_digest = evidence_digest_for("00000000-0000-4000-8000-000000000001", &replay);
    contract.attest_settlement(replay);
}

#[test]
#[should_panic(expected = "transaction_already_attested")]
fn an_evm_transaction_cannot_be_replayed_for_another_attempt() {
    let mut contract = setup("registrar.near");
    register_invoice(&mut contract);
    register_attempt(&mut contract, "00000000-0000-4000-8000-000000000002");
    register_attempt(&mut contract, "00000000-0000-4000-8000-000000000004");
    testing_env!(VMContextBuilder::new()
        .predecessor_account_id(account("attestor.near"))
        .build());
    contract.attest_settlement(attestation(
        "00000000-0000-4000-8000-000000000002",
        50_000_000,
        "b",
    ));
    let mut replay = attestation("00000000-0000-4000-8000-000000000004", 50_000_000, "c");
    replay.source_transaction_hash =
        attestation("00000000-0000-4000-8000-000000000002", 50_000_000, "b")
            .source_transaction_hash;
    replay.evidence_digest = evidence_digest_for("00000000-0000-4000-8000-000000000001", &replay);
    contract.attest_settlement(replay);
}

#[test]
#[should_panic(expected = "cctp_message_already_attested")]
fn a_cctp_message_cannot_be_reconciled_twice() {
    let mut contract = setup("registrar.near");
    register_invoice(&mut contract);
    register_attempt(&mut contract, "00000000-0000-4000-8000-000000000002");
    register_attempt(&mut contract, "00000000-0000-4000-8000-000000000004");
    testing_env!(VMContextBuilder::new()
        .predecessor_account_id(account("attestor.near"))
        .build());

    let original = attestation("00000000-0000-4000-8000-000000000002", 40_000_000, "b");
    contract.attest_settlement(original.clone());
    let mut replay = attestation("00000000-0000-4000-8000-000000000004", 40_000_000, "c");
    replay.cctp_message_nonce = original.cctp_message_nonce;
    replay.cctp_message_hash = original.cctp_message_hash;
    replay.evidence_digest = evidence_digest_for("00000000-0000-4000-8000-000000000001", &replay);
    contract.attest_settlement(replay);
}

#[test]
#[should_panic(expected = "recipient_mismatch")]
fn attestation_must_match_registered_merchant_recipient() {
    let mut contract = setup("registrar.near");
    register_invoice(&mut contract);
    register_attempt(&mut contract, "00000000-0000-4000-8000-000000000002");
    testing_env!(VMContextBuilder::new()
        .predecessor_account_id(account("attestor.near"))
        .build());
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
    testing_env!(VMContextBuilder::new()
        .predecessor_account_id(account("attestor.near"))
        .build());
    let mut value = attestation("00000000-0000-4000-8000-000000000002", 100_000_000, "b");
    value.amount_base_units = near_sdk::json_types::U128(99_000_000);
    contract.attest_settlement(value);
}

#[test]
#[should_panic(expected = "settlement_amount_not_exact_minor_units")]
fn settlement_amount_must_map_exactly_to_usd_minor_units() {
    let mut contract = setup("registrar.near");
    register_invoice(&mut contract);
    register_attempt(&mut contract, "00000000-0000-4000-8000-000000000002");
    testing_env!(VMContextBuilder::new()
        .predecessor_account_id(account("attestor.near"))
        .build());
    contract.attest_settlement(attestation(
        "00000000-0000-4000-8000-000000000002",
        100_000_001,
        "b",
    ));
}

#[test]
fn partial_settlements_accumulate_and_only_exact_total_pays_invoice() {
    let mut contract = setup("registrar.near");
    register_invoice(&mut contract);
    register_attempt(&mut contract, "00000000-0000-4000-8000-000000000002");
    register_attempt(&mut contract, "00000000-0000-4000-8000-000000000004");
    testing_env!(VMContextBuilder::new()
        .predecessor_account_id(account("attestor.near"))
        .build());

    let first = contract.attest_settlement(attestation(
        "00000000-0000-4000-8000-000000000002",
        40_000_000,
        "b",
    ));
    assert_eq!(first.outcome, SettlementOutcome::Partial);
    assert_eq!(
        contract
            .get_invoice("00000000-0000-4000-8000-000000000001".to_string())
            .unwrap()
            .status,
        InvoiceStatus::Open
    );
    let second = contract.attest_settlement(attestation(
        "00000000-0000-4000-8000-000000000004",
        60_000_000,
        "c",
    ));
    assert_eq!(second.outcome, SettlementOutcome::Verified);
    assert_eq!(
        contract
            .get_invoice("00000000-0000-4000-8000-000000000001".to_string())
            .unwrap()
            .status,
        InvoiceStatus::Paid
    );
}

#[test]
fn overpayment_requires_review_and_blocks_follow_on_attempts() {
    let mut contract = setup("registrar.near");
    register_invoice(&mut contract);
    register_attempt(&mut contract, "00000000-0000-4000-8000-000000000002");
    testing_env!(VMContextBuilder::new()
        .predecessor_account_id(account("attestor.near"))
        .build());

    let result = contract.attest_settlement(attestation(
        "00000000-0000-4000-8000-000000000002",
        100_010_000,
        "b",
    ));
    assert_eq!(result.outcome, SettlementOutcome::Overpaid);
    assert_eq!(
        contract
            .get_invoice("00000000-0000-4000-8000-000000000001".to_string())
            .unwrap()
            .status,
        InvoiceStatus::ReviewRequired
    );
    testing_env!(VMContextBuilder::new()
        .predecessor_account_id(account("registrar.near"))
        .build());
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        contract.register_attempt(
            "00000000-0000-4000-8000-000000000004".to_string(),
            "00000000-0000-4000-8000-000000000001".to_string(),
            84_532,
        );
    }))
    .is_err());
}

#[test]
#[should_panic(expected = "unauthorized_attestor")]
fn unregistered_account_cannot_attest_settlement() {
    let mut contract = setup("registrar.near");
    register_invoice(&mut contract);
    register_attempt(&mut contract, "00000000-0000-4000-8000-000000000002");
    testing_env!(VMContextBuilder::new()
        .predecessor_account_id(account("mallory.near"))
        .build());
    contract.attest_settlement(attestation(
        "00000000-0000-4000-8000-000000000002",
        100_000_000,
        "b",
    ));
}

#[test]
#[should_panic(expected = "cannot_remove_last_attestor")]
fn owner_cannot_remove_the_last_authorized_attestor() {
    let mut contract = setup("owner.near");
    contract.remove_attestor(account("attestor.near"));
}

#[test]
fn attestor_rotation_adds_before_removing_and_keeps_authorization() {
    let mut contract = setup("owner.near");
    contract.add_attestor(account("replacement.near"));
    contract.remove_attestor(account("attestor.near"));
    assert!(!contract.is_attestor(account("attestor.near")));
    assert!(contract.is_attestor(account("replacement.near")));
}
