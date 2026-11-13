use near_sdk::{test_utils::VMContextBuilder, testing_env, AccountId};
use nodus_payment_registry::{
    evidence_digest_for, evidence_digest_for_v2, AttestationInput, Contract,
    CctpV2AttestationInput, InvoiceStatus, InvoiceTerms, SettlementOutcome,
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
    register_attempt_for_chain(contract, id, 84_532);
}

fn register_attempt_for_chain(contract: &mut Contract, id: &str, source_chain_id: u64) {
    testing_env!(VMContextBuilder::new()
        .predecessor_account_id(account("registrar.near"))
        .build());
    contract.register_attempt(
        id.to_string(),
        "00000000-0000-4000-8000-000000000001".to_string(),
        source_chain_id,
    );
}

fn attestation(attempt_id: &str, amount: u128, suffix: &str) -> AttestationInput {
    let destination_suffix = char::from_digit(
        u32::from_str_radix(suffix, 16).expect("hex fixture suffix") + 1,
        16,
    )
    .expect("valid destination fixture suffix");
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
        destination_transaction_hash: format!("0x{}", destination_suffix.to_string().repeat(64)),
        destination_block_number: 101,
        destination_block_hash: format!("0x{}", "2".repeat(64)),
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

fn v2_attestation(attempt_id: &str, amount: u128, suffix: &str, nonce: &str) -> CctpV2AttestationInput {
    let legacy = attestation(attempt_id, amount, suffix);
    let mut value = CctpV2AttestationInput {
        reconciliation_id: legacy.reconciliation_id,
        attempt_id: legacy.attempt_id,
        source_chain_id: legacy.source_chain_id,
        cctp_source_domain: 6,
        source_transaction_hash: legacy.source_transaction_hash,
        source_block_number: legacy.source_block_number,
        source_block_hash: legacy.source_block_hash,
        cctp_message_nonce: nonce.to_string(),
        cctp_message_hash: legacy.cctp_message_hash,
        destination_chain_id: legacy.destination_chain_id,
        destination_transaction_hash: legacy.destination_transaction_hash,
        destination_block_number: legacy.destination_block_number,
        destination_block_hash: legacy.destination_block_hash,
        token_address: legacy.token_address,
        merchant_recipient: legacy.merchant_recipient,
        amount_base_units: legacy.amount_base_units,
        token_decimals: legacy.token_decimals,
        verifier_policy_version: legacy.verifier_policy_version,
        evidence_digest: String::new(),
    };
    value.evidence_digest = evidence_digest_for_v2(
        "00000000-0000-4000-8000-000000000001",
        &value,
    );
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
fn accepts_circle_testnet_usdc_sources_and_destinations() {
    let cases = [
        (11_155_111, "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238"),
        (84_532, "0x036cbd53842c5426634e7929541ec2318f3dcf7e"),
        (421_614, "0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d"),
        (11_155_420, "0x5fd84259d66cd46123540766be93dfe6d43130d7"),
    ];
    for (index, (chain_id, token)) in cases.into_iter().enumerate() {
        let mut contract = setup("registrar.near");
        let invoice_id = format!("00000000-0000-4000-8000-{:012}", index + 1);
        let mut invoice_terms = terms();
        invoice_terms.destination_chain_id = chain_id;
        invoice_terms.token_address = token.to_string();
        contract.register_invoice(invoice_id.clone(), invoice_terms);
        let attempt_id = format!("00000000-0000-4000-8000-{:012}", index + 2);
        contract.register_attempt(attempt_id.clone(), invoice_id, chain_id);
        assert_eq!(contract.get_attempt(attempt_id).unwrap().source_token_address, token);
    }
}

#[test]
#[should_panic(expected = "unsupported_source_chain")]
fn rejects_source_chains_without_circle_testnet_usdc() {
    let mut contract = setup("registrar.near");
    register_invoice(&mut contract);
    contract.register_attempt(
        "00000000-0000-4000-8000-000000000099".to_string(),
        "00000000-0000-4000-8000-000000000001".to_string(),
        1,
    );
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

#[test]
fn cctp_v2_accepts_inv12_and_maximum_width_nonces_and_persists_the_exact_value() {
    let mut contract = setup("registrar.near");
    register_invoice(&mut contract);
    register_attempt(&mut contract, "00000000-0000-4000-8000-000000000002");
    register_attempt(&mut contract, "00000000-0000-4000-8000-000000000004");
    testing_env!(VMContextBuilder::new()
        .predecessor_account_id(account("attestor.near"))
        .build());

    let inv12_nonce = "0x4ee259295b1fcf171b082ba2a1b0d46a9b0b5bc9fa55ff3d2178f5574c05ebba";
    let inv12 = contract.attest_settlement_v2(v2_attestation(
        "00000000-0000-4000-8000-000000000002", 40_000_000, "b", inv12_nonce,
    ));
    assert_eq!(inv12.cctp_message_nonce.as_deref(), Some(inv12_nonce));
    assert_eq!(inv12.cctp_source_domain, Some(6));
    assert_eq!(
        v2_attestation("00000000-0000-4000-8000-000000000002", 100_000_000, "b", inv12_nonce)
            .evidence_digest,
        "0x629340847e8e8b346e3293636dbc207dc449b7fdf1343ffe409231c28a45b47b"
    );
    assert_eq!(
        contract
            .get_settlement("00000000-0000-4000-8000-00000000000b".to_string())
            .unwrap()
            .cctp_message_nonce
            .as_deref(),
        Some(inv12_nonce)
    );

    let maximum = format!("0x{}", "ff".repeat(32));
    let max_record = contract.attest_settlement_v2(v2_attestation(
        "00000000-0000-4000-8000-000000000004", 60_000_000, "c", &maximum,
    ));
    assert_eq!(max_record.cctp_message_nonce.as_deref(), Some(maximum.as_str()));
}

#[test]
#[should_panic(expected = "invalid_hex_hash")]
fn cctp_v2_rejects_invalid_nonce_hex() {
    let mut contract = setup("registrar.near");
    register_invoice(&mut contract);
    register_attempt(&mut contract, "00000000-0000-4000-8000-000000000002");
    testing_env!(VMContextBuilder::new()
        .predecessor_account_id(account("attestor.near"))
        .build());
    let mut value = v2_attestation(
        "00000000-0000-4000-8000-000000000002", 100_000_000, "b", &format!("0x{}", "g".repeat(64)),
    );
    value.evidence_digest = "0x0000000000000000000000000000000000000000000000000000000000000000".to_string();
    contract.attest_settlement_v2(value);
}

#[test]
#[should_panic(expected = "invalid_hex_hash")]
fn cctp_v2_rejects_nonce_with_the_wrong_length() {
    let mut contract = setup("registrar.near");
    register_invoice(&mut contract);
    register_attempt(&mut contract, "00000000-0000-4000-8000-000000000002");
    testing_env!(VMContextBuilder::new()
        .predecessor_account_id(account("attestor.near"))
        .build());
    let mut value = v2_attestation(
        "00000000-0000-4000-8000-000000000002", 100_000_000, "b", &format!("0x{}", "ab".repeat(31)),
    );
    value.evidence_digest = "0x0000000000000000000000000000000000000000000000000000000000000000".to_string();
    contract.attest_settlement_v2(value);
}

#[test]
#[should_panic(expected = "cctp_message_already_attested")]
fn cctp_v2_rejects_duplicate_nonce_within_the_same_source_domain() {
    let mut contract = setup("registrar.near");
    register_invoice(&mut contract);
    register_attempt(&mut contract, "00000000-0000-4000-8000-000000000002");
    register_attempt(&mut contract, "00000000-0000-4000-8000-000000000004");
    testing_env!(VMContextBuilder::new()
        .predecessor_account_id(account("attestor.near"))
        .build());
    let nonce = "0x4ee259295b1fcf171b082ba2a1b0d46a9b0b5bc9fa55ff3d2178f5574c05ebba";
    contract.attest_settlement_v2(v2_attestation(
        "00000000-0000-4000-8000-000000000002", 40_000_000, "b", nonce,
    ));
    contract.attest_settlement_v2(v2_attestation(
        "00000000-0000-4000-8000-000000000004", 60_000_000, "c", nonce,
    ));
}

#[test]
fn cctp_v2_replay_scope_uses_source_domain_and_legacy_u64_settlements_remain_readable() {
    let mut contract = setup("registrar.near");
    register_invoice(&mut contract);
    register_attempt(&mut contract, "00000000-0000-4000-8000-000000000002");
    register_attempt_for_chain(
        &mut contract,
        "00000000-0000-4000-8000-000000000004",
        11_155_111,
    );
    register_attempt(&mut contract, "00000000-0000-4000-8000-000000000008");
    testing_env!(VMContextBuilder::new()
        .predecessor_account_id(account("attestor.near"))
        .build());
    let nonce = "0x000000000000000000000000000000000000000000000000000000000000000b";
    contract.attest_settlement_v2(v2_attestation(
        "00000000-0000-4000-8000-000000000002", 20_000_000, "b", nonce,
    ));
    let mut other_domain = v2_attestation(
        "00000000-0000-4000-8000-000000000004", 20_000_000, "c", nonce,
    );
    other_domain.source_chain_id = 11_155_111;
    other_domain.cctp_source_domain = 0;
    other_domain.evidence_digest = evidence_digest_for_v2(
        "00000000-0000-4000-8000-000000000001", &other_domain,
    );
    contract.attest_settlement_v2(other_domain);

    let legacy = attestation("00000000-0000-4000-8000-000000000008", 60_000_000, "d");
    let legacy_id = legacy.reconciliation_id.clone();
    contract.attest_settlement(legacy);
    let legacy_view = contract.get_settlement(legacy_id).unwrap();
    assert_eq!(legacy_view.cctp_message_nonce, None);
    assert_eq!(legacy_view.outcome, SettlementOutcome::Verified);
}
