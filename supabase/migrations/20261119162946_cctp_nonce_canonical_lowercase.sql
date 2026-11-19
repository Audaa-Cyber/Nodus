-- Require the canonical lowercase bytes32 nonce representation at the SQL
-- eligibility boundary; the worker and contract already preserve all 32 bytes.
create or replace function public.near_settlement_evidence_eligible(
  p_settlement public.payment_settlements,
  p_attempt public.payment_attempts
) returns boolean language sql immutable set search_path = '' as $$
  select coalesce(
    p_settlement.provider_status = 'SUCCESS'
    and p_settlement.outcome in ('VERIFIED','PARTIAL','OVERPAID','REVIEW_REQUIRED')
    and p_settlement.destination_network in ('sepolia','base-sepolia','arbitrum-sepolia','optimism-sepolia')
    and p_settlement.destination_asset_id = (p_settlement.destination_network || ':usdc')
    and p_attempt.mode = 'live'
    and p_attempt.source_network in ('sepolia','base-sepolia','arbitrum-sepolia','optimism-sepolia')
    and p_attempt.source_asset_id = (p_attempt.source_network || ':usdc')
    and p_attempt.destination_network = p_settlement.destination_network
    and p_attempt.destination_network <> p_attempt.source_network
    and p_attempt.destination_asset_id = (p_attempt.destination_network || ':usdc')
    and p_attempt.quote_snapshot->>'type' = 'circle_cctp'
    and jsonb_typeof(p_settlement.evidence) = 'object'
    and p_settlement.evidence->'sourceProof'->>'sourceTransactionHash' = p_attempt.transaction_hash
    and p_settlement.evidence->'sourceProof'->>'sourceBlockNumber' ~ '^[1-9][0-9]*$'
    and p_settlement.evidence->'sourceProof'->>'sourceBlockHash' ~ '^0x[0-9a-fA-F]{64}$'
    and p_settlement.evidence->'sourceProof'->>'nonce' ~ '^0x[0-9a-f]{64}$'
    and p_settlement.evidence->'sourceProof'->>'messageHash' ~ '^0x[0-9a-fA-F]{64}$'
    and p_settlement.evidence->'destinationProof'->>'verified' = 'true'
    and p_settlement.evidence->'destinationProof'->>'finalityConfirmed' = 'true'
    and p_settlement.evidence->'destinationProof'->>'amount' = p_settlement.received_amount_base_units
    and jsonb_typeof(p_settlement.evidence->'destinationProof'->'transactionHashes') = 'array'
    and p_settlement.evidence->'destinationProof'->'transactionHashes' = p_settlement.destination_tx_hashes
    and jsonb_typeof(p_settlement.evidence->'destinationProof'->'transactions') = 'array'
    and jsonb_array_length(p_settlement.evidence->'destinationProof'->'transactions') = 1
    and p_settlement.evidence->'destinationProof'->'transactions'->0->>'transactionHash' = p_settlement.destination_tx_hashes->>0
    and p_settlement.evidence->'destinationProof'->'transactions'->0->>'blockNumber' ~ '^[1-9][0-9]*$'
    and p_settlement.evidence->'destinationProof'->'transactions'->0->>'blockHash' ~ '^0x[0-9a-fA-F]{64}$'
    and jsonb_array_length(p_settlement.destination_tx_hashes) = 1,
    false
  );
$$;
revoke all on function public.near_settlement_evidence_eligible(public.payment_settlements, public.payment_attempts) from public, anon, authenticated;
