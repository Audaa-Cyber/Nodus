import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const summaryModule = await import("../src/lib/dashboard/invoice-summary.ts");
const today = "2026-11-16";

// Exercise the real Supabase query builder; only the external HTTP boundary is replaced.
function database({ failStatus, omitCount = false, empty = false } = {}) {
  const requests = [];
  const client = createClient("https://database.example", "test-anon-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        const url = new URL(input);
        requests.push({ url, method: init.method, headers: new Headers(init.headers) });
        const status = url.searchParams.get("status");
        if (status === failStatus) return new Response(null, { status: 503 });
        const counts = { "eq.paid": 1100, "eq.open": 35, "eq.draft": 9, "eq.cancelled": 40 };
        const count = empty ? 0 : status ? counts[status] : url.searchParams.has("or") ? 22 : 1206;
        return new Response(null, {
          status: 200,
          headers: omitCount ? {} : { "content-range": `*/${count}` },
        });
      },
    },
  });
  return { client, requests };
}

test("Overview counts include every invoice status and exceed the 1000-row API cap", async () => {
  assert.equal(typeof summaryModule.getInvoiceSummary, "function", "Overview needs an exact database summary");
  const { client, requests } = database();
  const summary = await summaryModule.getInvoiceSummary(client, "business-a", today);
  assert.deepEqual(summary, { total: 1206, paid: 1100, open: 35, overdue: 22, draft: 9, cancelled: 40 });
  assert.equal(requests.length, 6);
  for (const { url, method, headers } of requests) {
    assert.equal(url.pathname, "/rest/v1/invoices");
    assert.equal(url.searchParams.get("business_id"), "eq.business-a");
    assert.equal(method, "HEAD");
    assert.equal(headers.get("prefer"), "count=exact");
  }
  const open = requests.find(({ url }) => url.searchParams.get("status") === "eq.open").url;
  assert.equal(open.searchParams.get("or"), "(due_date.is.null,due_date.gte.2026-11-16)");
  const overdue = requests.find(({ url }) => !url.searchParams.has("status") && url.searchParams.has("or")).url;
  assert.equal(overdue.searchParams.get("or"), "(status.eq.overdue,and(status.eq.open,due_date.lt.2026-11-16))");
});

test("Overview shows an error instead of a false zero when one status count fails", async () => {
  assert.equal(typeof summaryModule.getInvoiceSummary, "function");
  const { client } = database({ failStatus: "eq.paid" });
  assert.equal(await summaryModule.getInvoiceSummary(client, "business-a", today), null);
});

test("Overview rejects missing count metadata instead of presenting fabricated counts", async () => {
  assert.equal(typeof summaryModule.getInvoiceSummary, "function");
  const { client } = database({ omitCount: true });
  assert.equal(await summaryModule.getInvoiceSummary(client, "business-a", today), null);
});

test("Overview displays real zero counts for an empty business", async () => {
  assert.equal(typeof summaryModule.getInvoiceSummary, "function");
  const { client } = database({ empty: true });
  assert.deepEqual(await summaryModule.getInvoiceSummary(client, "business-a", today), {
    total: 0, paid: 0, open: 0, overdue: 0, draft: 0, cancelled: 0,
  });
});
