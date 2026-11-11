const fs = require('node:fs');
const crypto = require('node:crypto');
const dir = process.argv[2];
const invoice = '00000000-0000-4000-8000-000000000001';
const attempt = '00000000-0000-4000-8000-000000000002';
const input = {
  reconciliation_id: '00000000-0000-4000-8000-00000000000b', attempt_id: attempt,
  source_chain_id: 84532, source_transaction_hash: '0x' + 'b'.repeat(64), source_block_number: 100,
  source_block_hash: '0x' + '1'.repeat(64), cctp_message_nonce: 11, cctp_message_hash: '0x' + 'b'.repeat(64),
  destination_chain_id: 421614, destination_transaction_hash: '0x' + 'c'.repeat(64), destination_block_number: 101,
  destination_block_hash: '0x' + '2'.repeat(64), token_address: '0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d',
  merchant_recipient: '0x2222222222222222222222222222222222222222', amount_base_units: '100000000',
  token_decimals: 6, verifier_policy_version: 1,
};
const uuid = (s) => Buffer.from(s.replaceAll('-', ''), 'hex');
const hex = (s) => Buffer.from(s.slice(2), 'hex');
const be = (n, bytes) => { const b = Buffer.alloc(bytes); let x = BigInt(n); for (let i = bytes - 1; i >= 0; i--) { b[i] = Number(x & 255n); x >>= 8n; } return b; };
const encoded = Buffer.concat([
  Buffer.from('NODUS_CCTP_SETTLEMENT_EVIDENCE_V1\0'), uuid(invoice), uuid(input.reconciliation_id), uuid(attempt),
  be(input.source_chain_id, 8), hex(input.source_transaction_hash), be(input.source_block_number, 8), hex(input.source_block_hash),
  be(input.cctp_message_nonce, 8), hex(input.cctp_message_hash), be(input.destination_chain_id, 8),
  hex(input.destination_transaction_hash), be(input.destination_block_number, 8), hex(input.destination_block_hash),
  hex(input.token_address), hex(input.merchant_recipient), be(input.amount_base_units, 16),
  Buffer.from([input.token_decimals]), be(input.verifier_policy_version, 4),
]);
input.evidence_digest = '0x' + crypto.createHash('sha256').update(encoded).digest('hex');
fs.writeFileSync(dir + '\\testnet-attestation.json', JSON.stringify(input), 'ascii');
console.log(input.evidence_digest);