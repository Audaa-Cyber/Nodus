import { readFileSync } from "node:fs";
import { createRequire, Module } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const root = fileURLToPath(new URL("../", import.meta.url));
const cache = new Map();
function load(relative) {
  const filename = root + relative;
  if (cache.has(filename)) return cache.get(filename).exports;
  const source = readFileSync(filename, "utf8");
  const renderModule = new Module(filename);
  cache.set(filename, renderModule);
  renderModule.filename = filename;
  renderModule.paths = Module._nodeModulePaths(root);
  renderModule.require = (id) => {
    if (id === "next/link") return { __esModule: true, default: ({ children, ...props }) => React.createElement("a", props, children) };
    if (id === "next/navigation") return { useRouter: () => ({ refresh() {} }) };
    if (id === "@/components/invoice-print-button") return { __esModule: true, default: ({ children, className }) => React.createElement("button", { className }, children ?? "Print / Save PDF") };
    if (id === "@/components/invoice-feedback") return { CustomerFeedback: () => null };
    if (id === "@/app/actions/sharing") return { generateInvoiceShareLinkAction: async () => ({}) };
    if (id.startsWith("@/")) {
      const relative = `src/${id.slice(2)}`;
      for (const ext of [".tsx", ".ts"]) {
        try { return load(relative + ext); } catch (error) { if (error.code !== "ENOENT") throw error; }
      }
    }
    return require(id);
  };
  renderModule._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
  return renderModule.exports;
}

const { PaidInvoiceDetailView } = load("src/components/paid-invoice-detail-view.tsx");
const hash = `0x${"ab".repeat(32)}`;
const contract = `0x${"cd".repeat(20)}`;
const invoice = {
  id: "invoice-real", invoice_number: "REAL-2026-7", currency: "USD", amount_minor: 220000,
  subtotal_minor: 200000, tax_rate_bps: 1000, discount_minor: 0,
  issue_date: "2026-11-18", due_date: "2026-11-28", created_at: "2026-11-18T04:00:00Z", updated_at: "2026-11-18T04:30:15Z",
  customer_name: "Actual Customer", customer_email: "customer@example.test",
  line_items: Array.from({ length: 5 }, (_, i) => ({ description: `Actual item ${i + 1}`, quantity: 1, unitPriceMinor: 40000, lineTotalMinor: 40000 })),
};
const props = {
  invoice, seller: { business_name: "Actual Merchant", email: "merchant@example.test" },
  primaryReceipt: { id: "receipt-real", receipt_number: "RECEIPT-REAL", issued_at: "2026-11-18T04:30:15Z" },
  primarySettlement: { id: "settlement-real", payment_attempt_id: "attempt-real", outcome: "VERIFIED", destination_asset_id: "arbitrum-sepolia:usdc", destination_network: "arbitrum-sepolia", recipient_address: `0x${"ef".repeat(20)}`, received_amount_base_units: "2200000000", received_asset_decimals: 6, destination_tx_hashes: [hash], evidence: { escrow_contract: contract }, created_at: "2026-11-18T04:30:15Z" },
};
const render = (extra = {}) => renderToStaticMarkup(React.createElement(PaidInvoiceDetailView, { ...props, ...extra }));


export { render, props, load };
