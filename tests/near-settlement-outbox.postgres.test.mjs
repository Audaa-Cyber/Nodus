import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";

const databaseUrl = process.env.NODUS_TEST_DATABASE_URL;
const psqlAvailable = spawnSync("psql", ["--version"], { encoding: "utf8" }).status === 0;
let localDatabase = false;
try { localDatabase = ["localhost", "127.0.0.1", "::1"].includes(new URL(databaseUrl ?? "").hostname.toLowerCase()); } catch {}
const skipReason = !databaseUrl ? "Set NODUS_TEST_DATABASE_URL to a dedicated local PostgreSQL database with project migrations applied."
  : !localDatabase ? "Refusing to run mutating integration tests against a non-local database."
    : !psqlAvailable ? "psql is required for the real PostgreSQL integration test." : false;
const postgresTest = (name, fn) => skipReason ? test.skip(name, { skip: skipReason }, fn) : test(name, fn);
function psql(sql) {
  return new Promise((resolve) => {
    const child = spawn("psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "--dbname", databaseUrl, "-c", sql], {
      env: { ...process.env, PGCONNECT_TIMEOUT: "5" }, windowsHide: true,
    });
    let stdout = "", stderr = "";
    child.stdout.setEncoding("utf8").on("data", (value) => { stdout += value; });
    child.stderr.setEncoding("utf8").on("data", (value) => { stderr += value; });
    child.on("error", (error) => resolve({ code: 1, stdout, stderr: `${stderr}${error.message}` }));
    child.on("close", (code) => resolve({ code: code ?? 1, stdout: stdout.trim(), stderr: stderr.trim() }));
  });
}
const lit = (value) => `'${String(value).replaceAll("'", "''")}'`;

async function createSettlement(overrides = {}) {
  const userId = randomUUID(), invoiceId = randomUUID(), attemptId = randomUUID();
  const sourceTx = `0x${randomUUID().replaceAll("-", "").padEnd(64, "b")}`;
  const recipient = `0x${randomUUID().replaceAll("-", "").padEnd(40, "c")}`;
  const idempotency = randomUUID();
  const destinationHash = `0x${"2".repeat(64)}`;
  const messageHash = `0x${"3".repeat(64)}`, blockHash = `0x${"4".repeat(64)}`;
  const evidence = overrides.evidence ?? {
    sourceProof: { sourceTransactionHash: sourceTx, sourceBlockNumber: "100", sourceBlockHash: blockHash, nonce: "7", messageHash },
    destinationProof: { verified: true, finalityConfirmed: true, amount: "100000000", transactionHashes: [destinationHash],
      transactions: [{ transactionHash: destinationHash, blockNumber: "200", blockHash }] },
  };
  const setup = await psql(`
    insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    values (${lit(userId)}::uuid,'authenticated','authenticated',${lit(`${userId}@outbox.test`)},'',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp());
    update public.business_profiles set receiving_address=${lit(recipient)},receiving_network='arbitrum-sepolia' where owner_user_id=${lit(userId)}::uuid;
    insert into public.invoices(id,business_id,invoice_number,customer_name,description,amount_minor,currency,issue_date,status)
    select ${lit(invoiceId)}::uuid,id,${lit(`NAR-${invoiceId}`)},'Outbox test','Local queue integration',10000,'USD',current_date,'open'
    from public.business_profiles where owner_user_id=${lit(userId)}::uuid;
    insert into public.payment_attempts(id,invoice_id,business_id,mode,source_asset_id,source_network,destination_asset_id,destination_network,
      recipient_address,idempotency_key,requested_amount,expected_received_amount,deposit_address,quote_snapshot,status,transaction_hash)
    select ${lit(attemptId)}::uuid,i.id,i.business_id,'live','base-sepolia:usdc','base-sepolia','arbitrum-sepolia:usdc','arbitrum-sepolia',
      ${lit(recipient)},${lit(idempotency)}::uuid,'100010000','100000000','0x8745D906D67C346E5eb1aEEED38Eb87F34DF0C0A',
      jsonb_build_object('type','circle_cctp'), 'PROCESSING',${lit(sourceTx)} from public.invoices i where i.id=${lit(invoiceId)}::uuid;
    select '${evidence.sourceProof.sourceTransactionHash}';
  `);
  assert.equal(setup.code, 0, setup.stderr);
  const reconcile = await psql(`select public.record_payment_reconciliation(
    ${lit(attemptId)}::uuid,'SUCCESS',true,true,'arbitrum-sepolia:usdc','arbitrum-sepolia',${lit(recipient)},'100000000',6,'10000',
    ${lit(JSON.stringify([destinationHash]))}::jsonb,${lit(JSON.stringify(evidence))}::jsonb)->>'settlementId';`);
  assert.equal(reconcile.code, 0, reconcile.stderr);
  return { userId, invoiceId, attemptId, settlementId: reconcile.stdout, destinationHash };
}
async function cleanup(f) {
  await psql(`delete from public.near_settlement_outbox where payment_attempt_id=${lit(f.attemptId)}::uuid;
    delete from public.payment_receipts where payment_attempt_id=${lit(f.attemptId)}::uuid;
    delete from public.payment_settlements where payment_attempt_id=${lit(f.attemptId)}::uuid;
    delete from public.payment_attempts where id=${lit(f.attemptId)}::uuid;
    delete from public.invoices where id=${lit(f.invoiceId)}::uuid;
    delete from auth.users where id=${lit(f.userId)}::uuid;`);
}

postgresTest("verified settlement is enqueued once and retries recover after uncertain delivery", async () => {
  const f = await createSettlement();
  try {
    const duplicate = await psql(`select public.record_payment_reconciliation(${lit(f.attemptId)}::uuid,'SUCCESS',true,true,
      'arbitrum-sepolia:usdc','arbitrum-sepolia',(select recipient_address from public.payment_attempts where id=${lit(f.attemptId)}::uuid),
      '100000000',6,'10000',jsonb_build_array(${lit(f.destinationHash)}), '{}'::jsonb);`);
    assert.equal(duplicate.code, 0, duplicate.stderr);
    const count = await psql(`select count(*) from public.near_settlement_outbox where payment_settlement_id=${lit(f.settlementId)}::uuid;`);
    assert.equal(count.stdout, "1", "the unique settlement outbox must deduplicate reconciliation replay");

    const claim = await psql(`select id::text||'|'||lock_token::text from public.claim_near_settlement_outbox(1);`);
    assert.equal(claim.code, 0, claim.stderr);
    const [outboxId, token] = claim.stdout.split("|");
    assert.ok(outboxId && token);
    const failed = await psql(`select public.retry_near_settlement_outbox(${lit(outboxId)}::uuid,${lit(token)}::uuid,'near_submission_uncertain');
      update public.near_settlement_outbox set next_attempt_at=statement_timestamp()-interval '1 second' where id=${lit(outboxId)}::uuid;`);
    assert.equal(failed.code, 0, failed.stderr);
    const recoveryClaim = await psql(`select id::text||'|'||lock_token::text||'|'||attempt_count from public.claim_near_settlement_outbox(1);`);
    assert.equal(recoveryClaim.code, 0, recoveryClaim.stderr);
    const [recoveredId, recoveredToken, attemptCount] = recoveryClaim.stdout.split("|");
    assert.equal(recoveredId, outboxId);
    assert.equal(attemptCount, "2", "retry increments delivery attempt count");
    const finished = await psql(`select public.finish_near_settlement_outbox(${lit(recoveredId)}::uuid,${lit(recoveredToken)}::uuid,${lit(txHash(f))});`);
    assert.equal(finished.code, 0, finished.stderr);
    const state = await psql(`select status||'|'||attempt_count from public.near_settlement_outbox where id=${lit(outboxId)}::uuid;`);
    assert.equal(state.stdout, "submitted|2");
  } finally { await cleanup(f); }
});

function txHash(f) { return `0x${String(f.settlementId).replaceAll("-", "").padEnd(64, "5")}`; }

postgresTest("ineligible destination evidence is retained as blocked and never claimable", async () => {
  const f = await createSettlement({ evidence: {} });
  try {
    const blocked = await psql(`select status||'|'||coalesce(last_error_code,'') from public.near_settlement_outbox where payment_settlement_id=${lit(f.settlementId)}::uuid;`);
    assert.equal(blocked.code, 0, blocked.stderr);
    assert.equal(blocked.stdout, "blocked|near_evidence_ineligible");
    const claimable = await psql(`select count(*) from public.near_settlement_outbox where payment_settlement_id=${lit(f.settlementId)}::uuid and status in ('pending','processing');`);
    assert.equal(claimable.stdout, "0", "unverified evidence must never enter delivery");
  } finally { await cleanup(f); }
});
