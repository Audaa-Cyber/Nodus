"use client";

import Link from "next/link";
import { useMemo } from "react";
import { formatUtcDate } from "@/lib/invoices";
import { formatUsdcBaseUnits } from "@/lib/payments/nodus-received-balance";
import { useSnapshotHighlights } from "@/components/use-data-motion";

export type OverviewSettlement = {
  id: string; invoice_id: string; invoiceNumber: string; outcome: string;
  destination_network: string | null; received_amount_base_units: string | null;
  destination_asset_id: string | null;
  received_asset_decimals: number | null; created_at: string;
};

export function OverviewSettlementActivity({ settlements }: { settlements: OverviewSettlement[] | null }) {
  const verified = useMemo(() => settlements?.filter((entry) => entry.outcome === "VERIFIED") ?? null, [settlements]);
  const highlights = useSnapshotHighlights(verified, "arrival");
  return (
    <section className="overview-card overview-settlements" aria-labelledby="settlement-activity-title">
      <div className="overview-section-heading"><h2 id="settlement-activity-title">Verified settlement activity</h2><span className="overview-activity-note">Refreshes with overview</span></div>
      {!verified ? <p className="overview-error" role="alert">Settlement activity could not be loaded.</p>
        : !verified.length ? <p className="overview-activity-empty">No verified settlements recorded yet.</p>
          : <ul className="overview-activity-list">{verified.map((entry) => (
            <li key={entry.id} className={highlights.has(entry.id) ? "overview-settlement-arrived" : undefined}>
              <div><Link href={`/dashboard/invoices/${entry.invoice_id}`} className="overview-invoice-number">{entry.invoiceNumber}</Link>
                <p>{entry.destination_network?.replaceAll("-", " ") ?? "Network unavailable"} · {formatUtcDate(entry.created_at)}</p></div>
              <div className="overview-activity-result">
                {entry.destination_asset_id === `${entry.destination_network}:usdc` && entry.received_asset_decimals === 6 && /^\d+$/.test(entry.received_amount_base_units ?? "") && <strong>{formatUsdcBaseUnits(entry.received_amount_base_units!)} USDC</strong>}
                <span className="overview-status overview-status-paid"><span aria-hidden="true" />Verified</span>
              </div>
            </li>
          ))}</ul>}
    </section>
  );
}
