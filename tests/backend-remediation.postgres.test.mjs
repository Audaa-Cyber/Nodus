import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";

const databaseUrl = process.env.NODUS_TEST_DATABASE_URL;
const psqlAvailable = spawnSync("psql", ["--version"], { encoding: "utf8" }).status === 0;
let localDatabase = false;
try {
  const host = new URL(databaseUrl ?? "").hostname.toLowerCase();
  localDatabase = ["localhost", "127.0.0.1", "::1"].includes(host);
} catch { /* missing or malformed URL */ }

const skipReason = !databaseUrl
  ? "Set NODUS_TEST_DATABASE_URL to a dedicated local PostgreSQL database with project migrations applied."
  : !localDatabase
    ? "Refusing to run mutating integration tests against a non-local database."
    : !psqlAvailable
      ? "psql is required for the real PostgreSQL integration test."
      : false;

function postgresTest(name, fn) {
  if (skipReason) test.skip(name, { skip: skipReason }, fn);
  else test(name, fn);
}

function psql(sql, extraEnv = {}) {
  return new Promise((resolve) => {
    const child = spawn("psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "--dbname", databaseUrl, "-c", sql], {
      env: { ...process.env, ...extraEnv, PGCONNECT_TIMEOUT: "5" },
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => resolve({ code: 1, stdout, stderr: `${stderr}${error.message}` }));
    child.on("close", (code) => resolve({ code: code ?? 1, stdout: stdout.trim(), stderr: stderr.trim() }));
  });
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function createFixture({
  status = "PENDING_DEPOSIT",
  expired = false,
  reserved = false,
  broadcast = false,
  approval = false,
  settled = false,
} = {}) {
  const attemptId = randomUUID();
  const invoiceId = randomUUID();
  const userId = randomUUID();
  const idempotencyKey = randomUUID();
  const payer = `0x${randomUUID().replaceAll("-", "").padEnd(40, "a")}`;
  const recipient = `0x${randomUUID().replaceAll("-", "").padEnd(40, "b")}`;
  const shareToken = randomUUID().replaceAll("-", "").padEnd(43, "a").slice(0, 43);
  const tokenHash = createHash("sha256").update(shareToken).digest("hex");
  const expiresAt = expired ? "2000-01-01T00:00:00Z" : "2099-01-01T00:00:00Z";
  const reservedAt = reserved ? "statement_timestamp()" : "null";
  const txHash = broadcast ? sqlLiteral(`0x${"1".repeat(64)}`) : "null";
  const approvalHash = approval ? sqlLiteral(`0x${"a".repeat(64)}`) : "null";
  const settledAt = settled ? "statement_timestamp()" : "null";
  const email = `remediation-${userId}@example.test`;

  const sql = `
    insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (${sqlLiteral(userId)}::uuid, 'authenticated', 'authenticated', ${sqlLiteral(email)}, '',
      statement_timestamp(), '{}'::jsonb, '{}'::jsonb, statement_timestamp(), statement_timestamp());
    update public.business_profiles set receiving_address = ${sqlLiteral(recipient)},
      receiving_network = 'arbitrum-sepolia'
    where owner_user_id = ${sqlLiteral(userId)}::uuid;
    insert into public.invoices (id, business_id, invoice_number, customer_name, description,
      amount_minor, currency, issue_date, status, share_token_hash, share_token_expires_at)
    select ${sqlLiteral(invoiceId)}::uuid, bp.id, ${sqlLiteral(`REM-${attemptId}`)}, 'Remediation payer',
      'PostgreSQL remediation test', 10000, 'USD', current_date, 'open',
      ${sqlLiteral(tokenHash)}, '2099-01-01T00:00:00Z'::timestamptz
    from public.business_profiles bp where bp.owner_user_id = ${sqlLiteral(userId)}::uuid;
    insert into public.payment_attempts (id, invoice_id, business_id, mode, source_asset_id,
      source_network, destination_asset_id, destination_network, recipient_address, idempotency_key,
      requested_amount, expected_received_amount, deposit_address, quote_expires_at, quote_snapshot,
      status, circle_execution_reserved_at, transaction_hash, circle_approval_tx_hash, settlement_resolved_at)
    select ${sqlLiteral(attemptId)}::uuid, i.id, i.business_id, 'live', 'base-sepolia:usdc',
      'base-sepolia', 'arbitrum-sepolia:usdc', 'arbitrum-sepolia', ${sqlLiteral(recipient)},
      ${sqlLiteral(idempotencyKey)}::uuid, '100010000', '100000000', '0x8745D906D67C346E5eb1aEEED38Eb87F34DF0C0A',
      ${sqlLiteral(expiresAt)}::timestamptz,
      jsonb_build_object('type','circle_cctp','invoiceId',i.id::text,'invoiceAmountMinor','10000',
        'invoiceCurrency','USD','payer',lower(${sqlLiteral(payer)}),'sourceNetwork','base-sepolia',
        'sourceAssetId','base-sepolia:usdc','destinationNetwork','arbitrum-sepolia',
        'destinationAssetId','arbitrum-sepolia:usdc','recipient',lower(${sqlLiteral(recipient)}),
        'amountReceived','100','totalDebit','100.01','feeTotal','0.01',
        'minimumReceived','100000000','quoteExpiresAt',${sqlLiteral(expiresAt)},'quote','0x1234'),
      ${sqlLiteral(status)}::public.payment_attempt_status,
      ${reservedAt}, ${txHash}, ${approvalHash}, ${settledAt}
    from public.invoices i where i.id = ${sqlLiteral(invoiceId)}::uuid;
    select ${sqlLiteral(attemptId)};
  `;
  const result = await psql(sql);
  assert.equal(result.code, 0, `fixture setup failed: ${result.stderr}`);
  return { attemptId, invoiceId, userId, tokenHash, payer, recipient };
}

async function cleanup(fixture) {
  await psql(`
    delete from public.payment_attempts where invoice_id = ${sqlLiteral(fixture.invoiceId)}::uuid;
    delete from public.invoices where id = ${sqlLiteral(fixture.invoiceId)}::uuid;
    delete from auth.users where id = ${sqlLiteral(fixture.userId)}::uuid;
  `);
}

function createNewAttemptSql(fixture, newIdempotencyKey = randomUUID()) {
  const expiresAt = "2099-01-01T00:00:00Z";
  return `
    select id::text, status::text from public.create_committed_payment_attempt(
      ${sqlLiteral(fixture.tokenHash)},
      ${sqlLiteral(newIdempotencyKey)}::uuid,
      'base-sepolia:usdc',
      'base-sepolia',
      'arbitrum-sepolia:usdc',
      'arbitrum-sepolia',
      ${sqlLiteral(fixture.recipient)},
      '100010000',
      '100000000',
      '0x8745D906D67C346E5eb1aEEED38Eb87F34DF0C0A',
      null,
      ${sqlLiteral(expiresAt)}::timestamptz,
      jsonb_build_object(
        'type','circle_cctp','invoiceId',${sqlLiteral(fixture.invoiceId)},'invoiceAmountMinor','10000',
        'invoiceCurrency','USD','payer',lower(${sqlLiteral(fixture.payer)}),'sourceNetwork','base-sepolia',
        'sourceAssetId','base-sepolia:usdc','destinationNetwork','arbitrum-sepolia',
        'destinationAssetId','arbitrum-sepolia:usdc','recipient',lower(${sqlLiteral(fixture.recipient)}),
        'amountReceived','100','totalDebit','100.01','feeTotal','0.01',
        'minimumReceived','100000000','quoteExpiresAt',${sqlLiteral(expiresAt)},'quote','0x1234'
      )
    );
  `;
}

function assertRpcRejected(result, expectedMessage) {
  assert.notEqual(result.code, 0, `expected database RPC rejection, got: ${result.stdout}`);
  assert.match(result.stderr, new RegExp(expectedMessage));
}

// -----------------------------------------------------------------------------
// Task 1: Fix abandoned expired payment attempts
// -----------------------------------------------------------------------------

postgresTest("expired unreserved attempt is atomically expired and does not lock new attempt creation", async () => {
  const fixture = await createFixture({ status: "PENDING_DEPOSIT", expired: true, reserved: false, broadcast: false });
  try {
    // Attempt creation with new idempotency key
    const newAttemptKey = randomUUID();
    const result = await psql(createNewAttemptSql(fixture, newAttemptKey));
    assert.equal(result.code, 0, `failed to create new attempt: ${result.stderr}`);
    const [newAttemptId, status] = result.stdout.split("|");
    assert.ok(newAttemptId && newAttemptId !== fixture.attemptId, "new attempt has distinct id");
    assert.equal(status, "PENDING_DEPOSIT");

    // Verify original attempt is now QUOTE_EXPIRED
    const checkOriginal = await psql(`select status::text from public.payment_attempts where id = ${sqlLiteral(fixture.attemptId)}::uuid;`);
    assert.equal(checkOriginal.code, 0);
    assert.equal(checkOriginal.stdout, "QUOTE_EXPIRED");
  } finally {
    await cleanup(fixture);
  }
});

postgresTest("unexpired attempt cannot be expired and blocks new attempt creation", async () => {
  const fixture = await createFixture({ status: "PENDING_DEPOSIT", expired: false, reserved: false, broadcast: false });
  try {
    const result = await psql(createNewAttemptSql(fixture));
    assertRpcRejected(result, "active_payment_attempt_exists");

    const checkOriginal = await psql(`select status::text from public.payment_attempts where id = ${sqlLiteral(fixture.attemptId)}::uuid;`);
    assert.equal(checkOriginal.stdout, "PENDING_DEPOSIT");
  } finally {
    await cleanup(fixture);
  }
});

postgresTest("never expire a reserved attempt even if quote timestamp is in the past", async () => {
  const fixture = await createFixture({
    status: "PROCESSING",
    expired: true,
    reserved: true,
    broadcast: false,
  });
  try {
    const result = await psql(createNewAttemptSql(fixture));
    assertRpcRejected(result, "active_payment_attempt_exists");

    const checkOriginal = await psql(`select status::text, circle_execution_reserved_at is not null
      from public.payment_attempts where id = ${sqlLiteral(fixture.attemptId)}::uuid;`);
    assert.equal(checkOriginal.stdout, "PROCESSING|t");
  } finally {
    await cleanup(fixture);
  }
});

postgresTest("never expire a broadcast payment attempt even if quote timestamp is in the past", async () => {
  const fixture = await createFixture({
    status: "KNOWN_DEPOSIT_TX",
    expired: true,
    reserved: true,
    broadcast: true,
  });
  try {
    const result = await psql(createNewAttemptSql(fixture));
    assertRpcRejected(result, "active_payment_attempt_exists");

    const checkOriginal = await psql(`select status::text from public.payment_attempts where id = ${sqlLiteral(fixture.attemptId)}::uuid;`);
    assert.equal(checkOriginal.stdout, "KNOWN_DEPOSIT_TX");
  } finally {
    await cleanup(fixture);
  }
});

postgresTest("never expire an attempt with recorded approval transaction", async () => {
  const fixture = await createFixture({
    status: "PROCESSING",
    expired: true,
    reserved: true,
    approval: true,
  });
  try {
    const result = await psql(createNewAttemptSql(fixture));
    assertRpcRejected(result, "active_payment_attempt_exists");

    const checkOriginal = await psql(`select status::text from public.payment_attempts where id = ${sqlLiteral(fixture.attemptId)}::uuid;`);
    assert.equal(checkOriginal.stdout, "PROCESSING");
  } finally {
    await cleanup(fixture);
  }
});

// -----------------------------------------------------------------------------
// Task 5: Reservation and wallet-rejection protection
// -----------------------------------------------------------------------------

postgresTest("cannot close or fail an attempt once execution is reserved", async () => {
  const fixture = await createFixture({ status: "PROCESSING", reserved: true });
  try {
    const closeFailed = await psql(`select id from public.close_live_attempt(
      ${sqlLiteral(fixture.tokenHash)}, ${sqlLiteral(fixture.attemptId)}::uuid, 'FAILED');`);
    assertRpcRejected(closeFailed, "circle_execution_already_reserved|invalid_execution_start_state");

    const closeExpired = await psql(`select id from public.close_live_attempt(
      ${sqlLiteral(fixture.tokenHash)}, ${sqlLiteral(fixture.attemptId)}::uuid, 'QUOTE_EXPIRED');`);
    assertRpcRejected(closeExpired, "circle_execution_already_reserved|invalid_execution_start_state");
  } finally {
    await cleanup(fixture);
  }
});

postgresTest("cannot revert a reserved attempt to PENDING_DEPOSIT or QUOTE_EXPIRED via update_live_attempt_status", async () => {
  const fixture = await createFixture({ status: "PROCESSING", reserved: true });
  try {
    const revertPending = await psql(`select id from public.update_live_attempt_status(
      ${sqlLiteral(fixture.tokenHash)}, ${sqlLiteral(fixture.attemptId)}::uuid, 'PENDING_DEPOSIT');`);
    assertRpcRejected(revertPending, "circle_execution_already_reserved");

    const revertExpired = await psql(`select id from public.update_live_attempt_status(
      ${sqlLiteral(fixture.tokenHash)}, ${sqlLiteral(fixture.attemptId)}::uuid, 'QUOTE_EXPIRED');`);
    assertRpcRejected(revertExpired, "circle_execution_already_reserved");
  } finally {
    await cleanup(fixture);
  }
});

postgresTest("unreserved expired attempt can be explicitly closed as QUOTE_EXPIRED", async () => {
  const fixture = await createFixture({ status: "PENDING_DEPOSIT", expired: true, reserved: false });
  try {
    const result = await psql(`select status::text from public.update_live_attempt_status(
      ${sqlLiteral(fixture.tokenHash)}, ${sqlLiteral(fixture.attemptId)}::uuid, 'QUOTE_EXPIRED');`);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout, "QUOTE_EXPIRED");
  } finally {
    await cleanup(fixture);
  }
});

postgresTest("unexpired attempt cannot be transitioned to QUOTE_EXPIRED", async () => {
  const fixture = await createFixture({ status: "PENDING_DEPOSIT", expired: false, reserved: false });
  try {
    const result = await psql(`select id from public.update_live_attempt_status(
      ${sqlLiteral(fixture.tokenHash)}, ${sqlLiteral(fixture.attemptId)}::uuid, 'QUOTE_EXPIRED');`);
    assertRpcRejected(result, "quote_not_expired");
  } finally {
    await cleanup(fixture);
  }
});

// -----------------------------------------------------------------------------
// Concurrency test: invoice locking during atomic expiration
// -----------------------------------------------------------------------------

postgresTest("concurrent attempt creations on an expired attempt serialize safely", async () => {
  const fixture = await createFixture({ status: "PENDING_DEPOSIT", expired: true, reserved: false });
  try {
    const key1 = randomUUID();
    const key2 = randomUUID();
    // Two concurrent transactions attempting to create a new attempt
    const first = psql(`begin; ${createNewAttemptSql(fixture, key1)} select pg_sleep(1); commit;`);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const second = psql(createNewAttemptSql(fixture, key2));

    const results = await Promise.all([first, second]);
    const successful = results.filter((r) => r.code === 0);
    const rejected = results.filter((r) => r.code !== 0);

    assert.equal(successful.length, 1, `expected exactly 1 success, got ${successful.length}: ${JSON.stringify(results)}`);
    assert.equal(rejected.length, 1, `expected exactly 1 rejection, got ${rejected.length}`);
    assert.match(rejected[0].stderr, /active_payment_attempt_exists/);

    // Verify exactly one active attempt exists on the invoice
    const countActive = await psql(`
      select count(*)::text from public.payment_attempts
      where invoice_id = ${sqlLiteral(fixture.invoiceId)}::uuid
        and status in ('PENDING_DEPOSIT', 'PROCESSING', 'KNOWN_DEPOSIT_TX');
    `);
    assert.equal(countActive.stdout, "1");
  } finally {
    await cleanup(fixture);
  }
});
