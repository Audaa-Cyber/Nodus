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
const lit = (value) => `'${String(value).replaceAll("'", "''")}'`;

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

async function createMerchant(receivingNetwork = "base-sepolia") {
  const userId = randomUUID();
  const recipient = `0x${"1".repeat(40)}`;
  const result = await psql(`
    insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    values (${lit(userId)}::uuid,'authenticated','authenticated',${lit(`${userId}@balance.test`)},'',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp());
    update public.business_profiles set receiving_address=${lit(recipient)},receiving_network=${lit(receivingNetwork)}
      where owner_user_id=${lit(userId)}::uuid;
    select id from public.business_profiles where owner_user_id=${lit(userId)}::uuid;
  `);
  assert.equal(result.code, 0, result.stderr);
  return { userId, businessId: result.stdout.split(/\r?\n/).at(-1), recipient };
}

async function createInvoiceAttempt(merchant, { network, amountMinor, status = "PROCESSING" }) {
  const invoiceId = randomUUID(), attemptId = randomUUID();
  const destinationTx = `0x${randomUUID().replaceAll("-", "").padEnd(64, "a")}`;
  const result = await psql(`
    update public.business_profiles set receiving_network=${lit(network)} where id=${lit(merchant.businessId)}::uuid;
    insert into public.invoices(id,business_id,invoice_number,customer_name,description,amount_minor,currency,issue_date,status)
    values (${lit(invoiceId)}::uuid,${lit(merchant.businessId)}::uuid,${lit(`BAL-${invoiceId}`)},'Balance test','Balance aggregation',${amountMinor},'USD',current_date,'open');
    insert into public.payment_attempts(id,invoice_id,business_id,mode,source_asset_id,source_network,destination_asset_id,destination_network,
      recipient_address,idempotency_key,requested_amount,expected_received_amount,deposit_address,quote_snapshot,status,transaction_hash)
    values (${lit(attemptId)}::uuid,${lit(invoiceId)}::uuid,${lit(merchant.businessId)}::uuid,'live','sepolia:usdc','sepolia',
      ${lit(`${network}:usdc`)},${lit(network)},${lit(merchant.recipient)},${lit(randomUUID())}::uuid,
      '100000000','100000000','0x8745D906D67C346E5eb1aEEED38Eb87F34DF0C0A',
      '{"type":"circle_cctp"}'::jsonb,${lit(status)}::public.payment_attempt_status,${lit(`0x${attemptId.replaceAll("-", "").padEnd(64, "b")}`)});
    select ${lit(destinationTx)};
  `);
  assert.equal(result.code, 0, result.stderr);
  return { invoiceId, attemptId, destinationTx, merchant, network, amountMinor };
}

async function settle(payment, outcome = "SUCCESS") {
  const amount = String(BigInt(payment.amountMinor) * 10_000n);
  const destinationAsset = `${payment.network}:usdc`;
  const result = outcome === "SUCCESS"
    ? await psql(`select public.record_payment_reconciliation(
        ${lit(payment.attemptId)}::uuid,'SUCCESS',true,true,${lit(destinationAsset)},${lit(payment.network)},
        ${lit(payment.merchant.recipient)},${lit(amount)},6,${lit(String(payment.amountMinor))},
        jsonb_build_array(${lit(payment.destinationTx)}),'{}'::jsonb)->>'settlementId';`)
    : await psql(`select public.record_payment_reconciliation(
        ${lit(payment.attemptId)}::uuid,'FAILED',true,false,null,null,null,null,null,null,'[]'::jsonb,'{}'::jsonb)->>'settlementId';`);
  assert.equal(result.code, 0, result.stderr);
  return result.stdout;
}

async function balanceFor(userId) {
  const result = await psql(`
    begin;
    set local role authenticated;
    set local "request.jwt.claim.sub"=${lit(userId)};
    select coalesce(jsonb_agg(jsonb_build_object(
      'destination_network',destination_network,'total_base_units',total_base_units,'payment_count',payment_count
    ) order by destination_network),'[]'::jsonb)::text from public.merchant_nodus_received_by_chain();
    rollback;
  `);
  assert.equal(result.code, 0, result.stderr);
  return JSON.parse(result.stdout.split(/\r?\n/).at(-1));
}

async function cleanup(merchants, payments) {
  for (const payment of payments) {
    await psql(`delete from public.near_settlement_outbox where payment_attempt_id=${lit(payment.attemptId)}::uuid;
      delete from public.payment_receipts where payment_attempt_id=${lit(payment.attemptId)}::uuid;
      delete from public.payment_settlements where payment_attempt_id=${lit(payment.attemptId)}::uuid;
      delete from public.payment_attempts where id=${lit(payment.attemptId)}::uuid;
      delete from public.invoices where id=${lit(payment.invoiceId)}::uuid;`);
  }
  for (const merchant of merchants) await psql(`delete from auth.users where id=${lit(merchant.userId)}::uuid;`);
}

postgresTest("merchant NODUS balance includes verified Base and Arbitrum invoices and excludes other funds/states", async () => {
  const merchant = await createMerchant();
  const otherMerchant = await createMerchant();
  const payments = [];
  try {
    const basePayment = await createInvoiceAttempt(merchant, { network: "base-sepolia", amountMinor: 10_000 });
    payments.push(basePayment);
    await settle(basePayment);

    const arbitrumPayment = await createInvoiceAttempt(merchant, { network: "arbitrum-sepolia", amountMinor: 5_000 });
    payments.push(arbitrumPayment);
    await settle(arbitrumPayment);

    const disabledChainPayment = await createInvoiceAttempt(merchant, { network: "polygon", amountMinor: 7_000 });
    payments.push(disabledChainPayment);
    await settle(disabledChainPayment);

    const failedPayment = await createInvoiceAttempt(merchant, { network: "base-sepolia", amountMinor: 8_000 });
    payments.push(failedPayment);
    await settle(failedPayment, "FAILED");

    const pendingPayment = await createInvoiceAttempt(merchant, { network: "base-sepolia", amountMinor: 9_000, status: "PENDING_DEPOSIT" });
    payments.push(pendingPayment);

    const otherMerchantPayment = await createInvoiceAttempt(otherMerchant, { network: "base-sepolia", amountMinor: 7_700 });
    payments.push(otherMerchantPayment);
    await settle(otherMerchantPayment);

    const duplicateReplay = await settle(basePayment);
    const settlementCount = await psql(`select count(*) from public.payment_settlements where payment_attempt_id=${lit(basePayment.attemptId)}::uuid;`);
    assert.equal(duplicateReplay, (await psql(`select id::text from public.payment_settlements where payment_attempt_id=${lit(basePayment.attemptId)}::uuid;`)).stdout);
    assert.equal(settlementCount.stdout, "1", "replayed payment attempt must keep one settlement");

    const merchantBalance = await balanceFor(merchant.userId);
    assert.deepEqual(merchantBalance, [
      { destination_network: "arbitrum-sepolia", total_base_units: "50000000", payment_count: 1 },
      { destination_network: "base-sepolia", total_base_units: "100000000", payment_count: 1 },
    ]);
    assert.equal(merchantBalance.reduce((total, row) => total + BigInt(row.total_base_units), 0n).toString(), "150000000",
      "per-chain amounts must sum exactly to the combined 150 USDC total");

    const isolatedBalance = await balanceFor(otherMerchant.userId);
    assert.deepEqual(isolatedBalance, [
      { destination_network: "base-sepolia", total_base_units: "77000000", payment_count: 1 },
    ], "a merchant must see only their own paid invoice settlements");
  } finally { await cleanup([merchant, otherMerchant], payments); }
});
