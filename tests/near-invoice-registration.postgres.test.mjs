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

postgresTest("issued invoices enqueue once and only register after the worker verifies NEAR", async () => {
  const userId = randomUUID(), invoiceId = randomUUID();
  const transactionHash = `near-tx-${randomUUID()}`;
  try {
    const inserted = await psql(`
      insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      values (${lit(userId)}::uuid,'authenticated','authenticated',${lit(`${userId}@registration.test`)},'',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp());
      update public.business_profiles set receiving_address='0x${"b".repeat(40)}',receiving_network='base-sepolia' where owner_user_id=${lit(userId)}::uuid;
      insert into public.invoices(id,business_id,invoice_number,customer_name,description,amount_minor,currency,issue_date,status)
      select ${lit(invoiceId)}::uuid,id,${lit(`REG-${invoiceId}`)},'Registration test','Private customer data stays off-chain',1200,'USD',current_date,'open'
      from public.business_profiles where owner_user_id=${lit(userId)}::uuid;
      update public.invoices set description='Updated off-chain detail' where id=${lit(invoiceId)}::uuid;
      select count(*) from public.near_invoice_registration_outbox where invoice_id=${lit(invoiceId)}::uuid;
    `);
    assert.equal(inserted.code, 0, inserted.stderr);
    assert.equal(inserted.stdout, "1");

    const claimed = await psql(`select id::text||'|'||lock_token::text from public.claim_near_invoice_registration_outbox(10) where invoice_id=${lit(invoiceId)}::uuid;`);
    assert.equal(claimed.code, 0, claimed.stderr);
    const [outboxId, lockToken] = claimed.stdout.split("|");
    assert.ok(outboxId && lockToken);
    const finalized = await psql(`
      select public.mark_near_invoice_registration_submitted(${lit(outboxId)}::uuid,${lit(lockToken)}::uuid,${lit(transactionHash)});
      select public.finish_near_invoice_registration(${lit(outboxId)}::uuid,${lit(lockToken)}::uuid,${lit(transactionHash)},${lit(invoiceId)});
      select near_registration_status||'|'||near_registration_transaction_hash||'|'||near_invoice_reference
      from public.invoices where id=${lit(invoiceId)}::uuid;
    `);
    assert.equal(finalized.code, 0, finalized.stderr);
    assert.equal(finalized.stdout.split("\n").at(-1), `registered|${transactionHash}|${invoiceId}`);
  } finally {
    await psql(`delete from public.near_invoice_registration_outbox where invoice_id=${lit(invoiceId)}::uuid;
      delete from public.invoices where id=${lit(invoiceId)}::uuid;
      delete from auth.users where id=${lit(userId)}::uuid;`);
  }
});
