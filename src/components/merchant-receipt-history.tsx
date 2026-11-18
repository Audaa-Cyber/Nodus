import type { PaidInvoiceProps } from "@/components/paid-invoice-detail-view";
import { formatUtcDate } from "@/lib/invoices";
import { evmWalletChains, getWalletNetwork } from "@/lib/wallet/networks";

function amount(baseUnits: string | null | undefined, decimals: number | null | undefined) {
  if (!baseUnits || !/^\d+$/.test(baseUnits) || decimals === null || decimals === undefined || !Number.isInteger(decimals) || decimals < 0 || decimals > 30) return "Amount unavailable";
  if (!decimals) return baseUnits;
  const value = baseUnits.padStart(decimals + 1, "0"), fraction = value.slice(-decimals).replace(/0+$/, "");
  return value.slice(0, -decimals) + (fraction ? `.${fraction}` : "");
}

export function MerchantReceiptHistory({ receipts, settlements, title = "Payment receipts" }: Pick<PaidInvoiceProps, "receipts" | "settlements"> & { title?: string }) {
  if (!receipts?.length) return null;
  return <section className="card"><h2 style={{ margin: "0 0 14px", fontSize: 18, fontWeight: 700 }}>{title}</h2><dl className="kv">{receipts.map(receipt => {
    const settlement = settlements?.find(entry => entry.payment_attempt_id === receipt.payment_attempt_id);
    const network = settlement?.destination_network ? getWalletNetwork(settlement.destination_network) : null;
    const base = evmWalletChains.find(chain => chain.id === network?.chainId)?.blockExplorers?.default.url;
    const hashes = Array.isArray(settlement?.destination_tx_hashes) ? settlement.destination_tx_hashes.filter((hash): hash is string => typeof hash === "string" && /^0x[\da-fA-F]{64}$/.test(hash)) : [];
    return <div key={receipt.id}><dt>{receipt.receipt_number}</dt><dd>{formatUtcDate(receipt.issued_at)} · {new Date(receipt.issued_at).toLocaleTimeString("en-GB", { timeZone: "UTC" })} UTC
      {settlement && <p>{settlement.outcome.replaceAll("_", " ")}: {amount(settlement.received_amount_base_units, settlement.received_asset_decimals)} {settlement.destination_asset_id ?? "asset"} on {network?.label ?? settlement.destination_network ?? "network"}</p>}
      {hashes.map(hash => <p key={hash}>Destination transaction: {base ? <a href={`${base}/tx/${hash}`} target="_blank" rel="noopener noreferrer">{hash}</a> : hash}</p>)}
    </dd><span /></div>;
  })}</dl></section>;
}
