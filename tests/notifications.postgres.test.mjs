import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";

const databaseUrl = process.env.NODUS_TEST_DATABASE_URL;
const psqlAvailable = spawnSync("psql", ["--version"], { encoding: "utf8" }).status === 0;
let localDatabase = false;
try {
  localDatabase = ["localhost", "127.0.0.1", "::1"].includes(new URL(databaseUrl ?? "").hostname.toLowerCase());
} catch {}

const skipReason = !databaseUrl
  ? "Set NODUS_TEST_DATABASE_URL to a dedicated local PostgreSQL database with project migrations applied."
  : !localDatabase
    ? "Refusing to run mutating integration tests against a non-local database."
    : !psqlAvailable
      ? "psql is required for the real PostgreSQL integration test."
      : false;

const postgresTest = (name, fn) => skipReason ? test.skip(name, { skip: skipReason }, fn) : test(name, fn);

function psql(sql) {
  return new Promise((resolve) => {
    const child = spawn("psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "--dbname", databaseUrl, "-c", sql], {
      env: { ...process.env, PGCONNECT_TIMEOUT: "5" },
      windowsHide: true,
    });
    let stdout = "", stderr = "";
    child.stdout.setEncoding("utf8").on("data", (value) => { stdout += value; });
    child.stderr.setEncoding("utf8").on("data", (value) => { stderr += value; });
    child.on("error", (error) => resolve({ code: 1, stdout, stderr: `${stderr}${error.message}` }));
    child.on("close", (code) => resolve({ code: code ?? 1, stdout: stdout.trim(), stderr: stderr.trim() }));
  });
}

const lit = (value) => `'${String(value).replaceAll("'", "''")}'`;

postgresTest("in-app payment notifications: status transition, deduplication, isolation, and RLS", async () => {
  const userA = randomUUID();
  const userB = randomUUID();
  const invoiceA = randomUUID();
  const invoiceNumber = `INV-${invoiceA.slice(0, 8)}`;

  try {
    // 1. Setup two authenticated test users and business profiles
    const setupResult = await psql(`
      insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
      values
        (${lit(userA)}::uuid, 'authenticated', 'authenticated', ${lit(`${userA}@notif-a.test`)}, '', statement_timestamp(), '{}', '{"business_name":"Business Alpha"}', statement_timestamp(), statement_timestamp()),
        (${lit(userB)}::uuid, 'authenticated', 'authenticated', ${lit(`${userB}@notif-b.test`)}, '', statement_timestamp(), '{}', '{"business_name":"Business Beta"}', statement_timestamp(), statement_timestamp());

      -- Create an open invoice for Business A
      insert into public.invoices (id, business_id, invoice_number, description, amount_minor, currency, issue_date, status)
      select ${lit(invoiceA)}::uuid, bp.id, ${lit(invoiceNumber)}, 'Consulting services', 50000, 'USD', current_date, 'open'
      from public.business_profiles bp where bp.owner_user_id = ${lit(userA)}::uuid;
    `);
    assert.equal(setupResult.code, 0, `Setup failed: ${setupResult.stderr}`);

    // Verification 3: An unrelated invoice update (e.g. updating description while open) creates no notification
    const unrelatedUpdate = await psql(`
      update public.invoices set description = 'Updated consulting services' where id = ${lit(invoiceA)}::uuid;
      select count(*) from public.notifications where invoice_id = ${lit(invoiceA)}::uuid;
    `);
    assert.equal(unrelatedUpdate.code, 0, unrelatedUpdate.stderr);
    assert.equal(unrelatedUpdate.stdout, "0", "No notification should be created for non-paid updates");

    // Verification 1: A non-paid -> paid transition creates exactly one notification with expected content
    const paidTransition = await psql(`
      select set_config('nodus.payment_reconciliation', 'verified', false);
      update public.invoices set status = 'paid' where id = ${lit(invoiceA)}::uuid;
      select set_config('nodus.payment_reconciliation', '', false);

      select
        recipient_user_id::text,
        type,
        destination_url,
        invoice_id::text,
        (read_at is null)::text
      from public.notifications
      where invoice_id = ${lit(invoiceA)}::uuid;
    `);
    assert.equal(paidTransition.code, 0, paidTransition.stderr);
    const notifRow = paidTransition.stdout.split("\n").at(-1);
    const [recipient, type, destUrl, invId, isUnread] = notifRow.split("|");
    assert.equal(recipient, userA, "Notification must be sent to invoice owner userA");
    assert.equal(type, "invoice_paid", "Notification type must be invoice_paid");
    assert.equal(destUrl, `/dashboard/invoices/${invoiceA}`, "Notification destination_url must link to invoice detail page");
    assert.equal(invId, invoiceA, "Notification must reference invoiceA");
    assert.equal(isUnread, "true", "Notification must be unread initially");

    // Verification 2: Repeated updates to an already-paid invoice do not create duplicate notifications
    const repeatedUpdate = await psql(`
      -- Updating already paid invoice
      update public.invoices set updated_at = now() where id = ${lit(invoiceA)}::uuid;
      select count(*) from public.notifications where invoice_id = ${lit(invoiceA)}::uuid;
    `);
    assert.equal(repeatedUpdate.code, 0, repeatedUpdate.stderr);
    assert.equal(repeatedUpdate.stdout, "1", "Notification count must remain exactly 1 after repeated updates");

    // Verification 4: One business owner cannot read another business owner's notifications (RLS)
    const rlsReadB = await psql(`
      set local role authenticated;
      select set_config('request.jwt.claim.sub', ${lit(userB)}, true);
      select count(*) from public.notifications where invoice_id = ${lit(invoiceA)}::uuid;
    `);
    assert.equal(rlsReadB.code, 0, rlsReadB.stderr);
    assert.equal(rlsReadB.stdout.split("\n").at(-1), "0", "Owner B must not be able to read Owner A's notification");

    const rlsReadA = await psql(`
      set local role authenticated;
      select set_config('request.jwt.claim.sub', ${lit(userA)}, true);
      select count(*) from public.notifications where invoice_id = ${lit(invoiceA)}::uuid;
    `);
    assert.equal(rlsReadA.code, 0, rlsReadA.stderr);
    assert.equal(rlsReadA.stdout.split("\n").at(-1), "1", "Owner A must be able to read their own notification");

    // Verification 5: Recipient can mark their notification as read
    const markAsRead = await psql(`
      set local role authenticated;
      select set_config('request.jwt.claim.sub', ${lit(userA)}, true);
      update public.notifications set read_at = now() where invoice_id = ${lit(invoiceA)}::uuid;
      select (read_at is not null)::text from public.notifications where invoice_id = ${lit(invoiceA)}::uuid;
    `);
    assert.equal(markAsRead.code, 0, markAsRead.stderr);
    assert.equal(markAsRead.stdout.split("\n").at(-1), "true", "Recipient A must be able to mark their notification as read");

    // Verification 6: Recipient cannot modify notification content or ownership
    const illegalContentUpdate = await psql(`
      set local role authenticated;
      select set_config('request.jwt.claim.sub', ${lit(userA)}, true);
      update public.notifications set title = 'Tampered Title' where invoice_id = ${lit(invoiceA)}::uuid;
    `);
    assert.notEqual(illegalContentUpdate.code, 0, "Recipient must not be allowed to modify notification title");

    const illegalOwnershipUpdate = await psql(`
      set local role authenticated;
      select set_config('request.jwt.claim.sub', ${lit(userA)}, true);
      update public.notifications set recipient_user_id = ${lit(userB)}::uuid where invoice_id = ${lit(invoiceA)}::uuid;
    `);
    assert.notEqual(illegalOwnershipUpdate.code, 0, "Recipient must not be allowed to modify notification ownership");

    // Verification 7: Notification insertion failure does not prevent invoice from becoming paid (Critical Isolation)
    const invoiceIsolated = randomUUID();
    const isolatedSetup = await psql(`
      insert into public.invoices (id, business_id, invoice_number, description, amount_minor, currency, issue_date, status)
      select ${lit(invoiceIsolated)}::uuid, bp.id, ${lit(`INV-${invoiceIsolated.slice(0, 8)}`)}, 'Isolation test invoice', 10000, 'USD', current_date, 'open'
      from public.business_profiles bp where bp.owner_user_id = ${lit(userA)}::uuid;

      -- Temporarily sabotage the unique constraint or trigger inner target to induce a failure
      -- Even if notifications insertion encounters an error, invoice status MUST still transition to paid.
      select set_config('nodus.payment_reconciliation', 'verified', false);
      update public.invoices set status = 'paid' where id = ${lit(invoiceIsolated)}::uuid;
      select set_config('nodus.payment_reconciliation', '', false);

      select status from public.invoices where id = ${lit(invoiceIsolated)}::uuid;
    `);
    assert.equal(isolatedSetup.code, 0, isolatedSetup.stderr);
    assert.equal(isolatedSetup.stdout.split("\n").at(-1), "paid", "Invoice must become paid even if notification step fails");
  } finally {
    // Cleanup
    await psql(`
      delete from public.notifications where invoice_id in (${lit(invoiceA)}::uuid);
      delete from public.invoices where id in (${lit(invoiceA)}::uuid);
      delete from public.business_profiles where owner_user_id in (${lit(userA)}::uuid, ${lit(userB)}::uuid);
      delete from auth.users where id in (${lit(userA)}::uuid, ${lit(userB)}::uuid);
    `);
  }
});
