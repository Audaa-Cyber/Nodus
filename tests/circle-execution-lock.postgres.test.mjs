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

async function createAttempt({ status = "PENDING_DEPOSIT", expired = false } = {}) {
  const attemptId = randomUUID();
  const invoiceId = randomUUID();
  const userId = randomUUID();
  const idempotencyKey = randomUUID();
  const payer = `0x${randomUUID().replaceAll("-", "").padEnd(40, "a")}`;
  const recipient = `0x${randomUUID().replaceAll("-", "").padEnd(40, "b")}`;
  const shareToken = randomUUID().replaceAll("-", "").padEnd(43, "a").slice(0, 43);
  const tokenHash = createHash("sha256").update(shareToken).digest("hex");
  const expiresAt = expired ? "2000-01-01T00:00:00Z" : "2099-01-01T00:00:00Z";
  const email = `circle-lock-${userId}@example.test`;
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
    select ${sqlLiteral(invoiceId)}::uuid, bp.id, ${sqlLiteral(`LOCK-${attemptId}`)}, 'Test payer',
      'PostgreSQL execution lock test', 10000, 'USD', current_date, 'open',
      ${sqlLiteral(tokenHash)}, '2099-01-01T00:00:00Z'::timestamptz
    from public.business_profiles bp where bp.owner_user_id = ${sqlLiteral(userId)}::uuid;
    insert into public.payment_attempts (id, invoice_id, business_id, mode, source_asset_id,
      source_network, destination_asset_id, destination_network, recipient_address, idempotency_key,
      requested_amount, expected_received_amount, deposit_address, quote_expires_at, quote_snapshot, status)
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
      ${sqlLiteral(status)}::public.payment_attempt_status
    from public.invoices i where i.id = ${sqlLiteral(invoiceId)}::uuid;
    select ${sqlLiteral(attemptId)};
  `;
  const result = await psql(sql);
  assert.equal(result.code, 0, `fixture setup failed: ${result.stderr}`);
  return { attemptId, invoiceId, userId, tokenHash, payer };
}

async function cleanup(fixture) {
  await psql(`delete from public.payment_attempts where id = ${sqlLiteral(fixture.attemptId)}::uuid;
    delete from public.invoices where id = ${sqlLiteral(fixture.invoiceId)}::uuid;
    delete from auth.users where id = ${sqlLiteral(fixture.userId)}::uuid;`);
}

function reserveSql(fixture, payer = fixture.payer) {
  return `select status::text, circle_execution_reserved_at is not null
    from public.mark_circle_execution_started(${sqlLiteral(fixture.tokenHash)},
      ${sqlLiteral(fixture.attemptId)}::uuid, ${sqlLiteral(payer)});`;
}

function assertRpcRejected(result, expectedMessage) {
  assert.notEqual(result.code, 0, `expected database RPC rejection, got: ${result.stdout}`);
  assert.match(result.stderr, new RegExp(expectedMessage));
}

postgresTest("PostgreSQL permits the first reservation and rejects the second request", async () => {
  const fixture = await createAttempt();
  try {
    const first = await psql(reserveSql(fixture));
    assert.equal(first.code, 0, first.stderr);
    assert.equal(first.stdout, "PROCESSING|t");
    const second = await psql(reserveSql(fixture));
    assertRpcRejected(second, "circle_execution_already_reserved");
  } finally { await cleanup(fixture); }
});

postgresTest("PostgreSQL rejects an unreserved PROCESSING attempt", async () => {
  const fixture = await createAttempt({ status: "PROCESSING" });
  try {
    const result = await psql(reserveSql(fixture));
    assertRpcRejected(result, "invalid_execution_start_state");
  } finally { await cleanup(fixture); }
});

postgresTest("concurrent PostgreSQL connections produce exactly one reservation", async () => {
  const fixture = await createAttempt();
  try {
    const first = psql(`begin; ${reserveSql(fixture)} select pg_sleep(1); commit;`);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const second = psql(reserveSql(fixture));
    const results = await Promise.all([first, second]);
    assert.equal(results.filter((result) => result.code === 0).length, 1, JSON.stringify(results));
    assert.equal(results.filter((result) => result.code !== 0).length, 1, JSON.stringify(results));
    const winner = results.find((result) => result.code === 0);
    const loser = results.find((result) => result.code !== 0);
    assert.equal(winner.stdout, "PROCESSING|t");
    assert.match(loser.stderr, /circle_execution_already_reserved|invalid_execution_start_state/);
  } finally { await cleanup(fixture); }
});

postgresTest("PostgreSQL rejects a terminal, expired, or wrong-payer reservation", async (t) => {
  for (const options of [
    { name: "terminal attempt", setup: { status: "FAILED" }, error: "invalid_execution_start_state" },
    { name: "expired attempt", setup: { expired: true }, error: "quote_expired" },
    { name: "different payer", setup: {}, error: "attempt_quote_binding_mismatch" },
  ]) {
    await t.test(options.name, async () => {
      const fixture = await createAttempt(options.setup);
      try {
        const payer = options.name === "different payer" ? `0x${"9".repeat(40)}` : fixture.payer;
        const result = await psql(reserveSql(fixture, payer));
        assertRpcRejected(result, options.error);
      } finally { await cleanup(fixture); }
    });
  }
});

postgresTest("PostgreSQL rejects a destination changed from the immutable quoted business destination", async () => {
  const fixture = await createAttempt();
  try {
    await psql(`update public.business_profiles bp set receiving_address = '0x${"9".repeat(40)}'
      from public.invoices i where i.id = ${sqlLiteral(fixture.invoiceId)}::uuid
        and bp.id = i.business_id;`);
    const result = await psql(reserveSql(fixture));
    assertRpcRejected(result, "attempt_quote_binding_mismatch");
  } finally { await cleanup(fixture); }
});

postgresTest("PostgreSQL prevents replacing a recorded source transaction hash", async () => {
  const fixture = await createAttempt();
  try {
    const firstHash = `0x${"1".repeat(64)}`;
    const secondHash = `0x${"2".repeat(64)}`;
    const submit = (hash) => `select id from public.submit_circle_broadcast_references(
      ${sqlLiteral(fixture.tokenHash)}, ${sqlLiteral(fixture.attemptId)}::uuid, ${sqlLiteral(hash)}, null);`;
    assert.equal((await psql(reserveSql(fixture))).code, 0);
    assert.equal((await psql(submit(firstHash))).code, 0);
    assertRpcRejected(await psql(submit(secondHash)), "source_burn_reference_already_recorded");
  } finally { await cleanup(fixture); }
});

postgresTest("PostgreSQL rejects a broadcast reference before execution is reserved", async () => {
  const fixture = await createAttempt();
  try {
    const result = await psql(`select id from public.submit_circle_broadcast_references(
      ${sqlLiteral(fixture.tokenHash)}, ${sqlLiteral(fixture.attemptId)}::uuid,
      ${sqlLiteral(`0x${"1".repeat(64)}`)}, null);`);
    assertRpcRejected(result, "attempt_unavailable");
  } finally { await cleanup(fixture); }
});

postgresTest("PostgreSQL rejects an attempt that already has a resolved settlement", async () => {
  const fixture = await createAttempt();
  try {
    await psql(`update public.payment_attempts set settlement_resolved_at = statement_timestamp()
      where id = ${sqlLiteral(fixture.attemptId)}::uuid;`);
    assertRpcRejected(await psql(reserveSql(fixture)), "invalid_execution_start_state");
  } finally { await cleanup(fixture); }
});

postgresTest("PostgreSQL reservation timestamp cannot be cleared or replaced", async () => {
  const fixture = await createAttempt();
  try {
    const first = await psql(reserveSql(fixture));
    assert.equal(first.code, 0, first.stderr);
    const clear = await psql(`update public.payment_attempts set circle_execution_reserved_at = null
      where id = ${sqlLiteral(fixture.attemptId)}::uuid;`);
    assertRpcRejected(clear, "circle_execution_reservation_is_immutable");
    const replace = await psql(`update public.payment_attempts
      set circle_execution_reserved_at = circle_execution_reserved_at + interval '1 second'
      where id = ${sqlLiteral(fixture.attemptId)}::uuid;`);
    assertRpcRejected(replace, "circle_execution_reservation_is_immutable");
  } finally { await cleanup(fixture); }
});

postgresTest("PostgreSQL grants execution only to service_role among API roles", async () => {
  const result = await psql(`select
    has_function_privilege('anon', 'public.mark_circle_execution_started(text,uuid,text)', 'execute') OR
    has_function_privilege('authenticated', 'public.mark_circle_execution_started(text,uuid,text)', 'execute'),
    has_function_privilege('service_role', 'public.mark_circle_execution_started(text,uuid,text)', 'execute'),
    to_regprocedure('public.mark_circle_execution_started(text,uuid)') is null;`);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, "f|t|t");
});
