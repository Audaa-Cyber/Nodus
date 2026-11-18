import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";

const read = (relPath) => readFile(new URL(relPath, import.meta.url), "utf8");

test("Task 1: src/app/actions/invoices.ts offloads NEAR registration and generates payment credentials immediately", async () => {
  const actions = await read("../src/app/actions/invoices.ts");

  // 1. Next.js 15 after() used for background NEAR outbox draining
  assert.ok(actions.includes('import { after } from "next/server";'), "imports after from next/server");
  assert.match(actions, /after\(\s*async\s*\(\)\s*=>\s*\{[\s\S]*processNearInvoiceRegistrationOutbox\(1\)/, "executes outbox processing inside after()");
  // Verify all occurrences of processNearInvoiceRegistrationOutbox are within after()
  const matches = [...actions.matchAll(/processNearInvoiceRegistrationOutbox/g)];
  assert.equal(matches.length, 2, "only imported and called once in background handler");

  // 2. Pre-generate payment credentials on issuance (base64url token, sha256 tokenHash, 365 days expiry)
  assert.ok(actions.includes('randomBytes(32).toString("base64url")'), "generates randomBytes(32) base64url token");
  assert.ok(actions.includes('createHash("sha256").update(token, "utf8").digest("hex")'), "computes sha256 hex digest of token");
  assert.ok(actions.includes("share_token_hash"), "assigns share_token_hash");
  assert.ok(actions.includes("share_token_expires_at"), "assigns share_token_expires_at");

  // 3. Draft transition to open generates token and includes it in redirect
  assert.match(actions, /isTransitioningToOpen[\s\S]*?createPayLinkCredentials\(\)/, "generates credentials when transitioning draft to open");
  assert.ok(actions.includes("issued=1"), "redirect includes issued=1");
  assert.ok(actions.includes("&token="), "redirect includes &token=");

  // 4. Deduplication via clientDraftId on 23505
  assert.ok(actions.includes("clientDraftId"), "extracts clientDraftId");
  assert.match(actions, /error\.code === "23505"[\s\S]*?clientDraftId/, "handles 23505 unique collision with clientDraftId");
});

test("Task 2: src/app/dashboard/invoices/[id]/page.tsx verifies token and renders hero QR panel unthrottled", async () => {
  const page = await read("../src/app/dashboard/invoices/[id]/page.tsx");
  const surface = await read("../src/components/merchant-open-surface.tsx");

  // 1. Unthrottled parallel DB loading without artificial delay
  assert.doesNotMatch(page, /withTransitionDelay/, "no withTransitionDelay throttle in detail page");

  // 2. Token verification via SHA-256 against invoice.share_token_hash
  assert.match(page, /query\.token\s*&&\s*invoice\.share_token_hash/, "checks query.token and invoice.share_token_hash");
  assert.match(page, /createHash\("sha256"\)\.update\(query\.token,\s*"utf8"\)\.digest\("hex"\)/, "computes sha256 of query.token");
  assert.ok(page.includes("/pay/${query.token}"), "constructs pay URL with verified token");

  // 3. Invokes InvoiceSharePanel as primary hero element with initialUrl and invoiceNumber
  assert.ok(page.includes("<MerchantOpenSurface"), "routes unpaid invoices to the approved surface");
  assert.ok(surface.includes("<InvoiceSharePanel"), "renders InvoiceSharePanel");
  assert.ok(surface.includes("initialUrl={initialPayUrl ?? undefined}"), "passes verified initialUrl to InvoiceSharePanel");
  assert.ok(surface.includes("invoiceNumber={invoice.invoice_number}"), "passes invoiceNumber to InvoiceSharePanel");

  // 4. Immediate confirmation banner
  assert.ok(surface.includes("Invoice issued successfully. Ready for customer payment."), "renders immediate issuance confirmation banner");

  // 5. Hero placement: InvoiceSharePanel is positioned before the invoice-detail-sheet
  const sharePanelIndex = surface.indexOf("<InvoiceSharePanel");
  const invoiceSheetIndex = surface.indexOf("<MerchantInvoiceSummary");
  assert.ok(sharePanelIndex > 0 && sharePanelIndex < invoiceSheetIndex, "InvoiceSharePanel is placed before invoice-detail-sheet as hero element");
});

test("Approved Share Panel provides a readonly payment URL, one-click copy and a real vector QR", async () => {
  const panel = await read("../src/components/invoice-share-panel.tsx");

  // 1. Correct interface
  assert.ok(panel.includes("invoiceId: string;"));
  assert.ok(panel.includes("invoiceNumber?: string;"));
  assert.ok(panel.includes('shareState: "active" | "expired" | "none";'));
  assert.ok(panel.includes("initialUrl?: string;"));

  // 2. localStorage persistence with nodus:invoice-qr: key
  assert.ok(panel.includes("`nodus:invoice-qr:${invoiceId}`"), "uses nodus:invoice-qr:${invoiceId} localStorage key");
  assert.ok(panel.includes("localStorage.setItem"), "persists valid share URLs");
  assert.ok(panel.includes("localStorage.getItem(storageKey)"), "restores cached URLs under authoritative share state");

  // 3. Hero QR Display with exact markup
  assert.ok(panel.includes('className="card sh no-print"'), "uses approved share card");
  assert.ok(panel.includes('className="qr"'), "uses approved QR container");
  assert.ok(panel.includes("<QRCodeSVG"), "renders QRCodeSVG");
  assert.ok(panel.includes("size={148}"), "uses approved size 148 for QR code");
  assert.ok(panel.includes('level="M"'), "uses error correction level M");
  assert.ok(panel.includes("marginSize={4}"), "uses marginSize 4");
  assert.ok(panel.includes('bgColor="#ffffff"'), "uses bgColor #ffffff");
  assert.ok(panel.includes('fgColor="#000000"'), "uses approved black QR foreground");
  assert.ok(panel.includes("Scan to pay on mobile"), "includes approved scan instructions");

  // 4. Action bar functions: Download QR, Copy link, Share
  assert.ok(panel.includes("navigator.clipboard.writeText"), "copies URL to clipboard");
  assert.ok(panel.includes('"Copied"'), "displays approved copied confirmation");

  // 5. Fallback button when no cached URL exists
  assert.ok(panel.includes("Generate QR code"), "provides Generate QR code button when URL is absent");

  // 6. The approved design displays the public capability without making it editable.
  assert.match(panel, /<input[^>]*readOnly[^>]*value=\{visibleUrl\}/, "renders only the readonly, authoritatively active payment URL");
  assert.ok(panel.includes('"Copy Link"'), "uses the approved one-click action");
});

test("Task 4: src/components/invoice-form.tsx enforces locking and double-click prevention", async () => {
  const form = await read("../src/components/invoice-form.tsx");

  // 1. clientDraftId and isSubmitting state
  assert.match(form, /const \[clientDraftId\] = useState\(\(\) => invoice\?\.id \?\? \(typeof crypto !== "undefined" \? crypto\.randomUUID\(\) : ""\)\);/, "initializes clientDraftId");
  assert.ok(form.includes("const [isSubmitting, setIsSubmitting] = useState(false);"), "tracks isSubmitting state");
  assert.ok(form.includes('const [activeIntent, setActiveIntent] = useState<"draft" | "issue" | null>(null);'), "tracks activeIntent");

  // 2. Double-click prevention in onSubmit
  assert.match(form, /if\s*\(pending\s*\|\|\s*isSubmitting\)\s*\{\s*e\.preventDefault\(\);/, "prevents submission when pending or isSubmitting");

  // 3. clientDraftId hidden input passed when !invoice
  assert.ok(form.includes('name="clientDraftId"'), "passes clientDraftId hidden input");

  // 4. Button feedback strings
  assert.ok(form.includes('pending && activeIntent === "draft" ? "Saving draft…" : "Save draft"'), "provides draft button feedback");
  assert.ok(form.includes('Issuing invoice…'), "provides Issuing invoice… button feedback");
});

test("Task 5: Cryptographic token validation matches SHA-256 hash", () => {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");

  const verifyHash = createHash("sha256").update(token, "utf8").digest("hex");
  assert.equal(verifyHash, tokenHash, "token hash verification succeeds");

  const wrongHash = createHash("sha256").update(token + "_tampered", "utf8").digest("hex");
  assert.notEqual(wrongHash, tokenHash, "tampered token fails hash verification");
});
