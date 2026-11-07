"use client";

import dynamic from "next/dynamic";

export const LazyInvoiceWalletCheckout = dynamic(
  () =>
    import("./invoice-wallet-checkout").then(
      (mod) => mod.InvoiceWalletCheckout
    ),
  {
    ssr: false,
    loading: () => (
      <div className="wallet-preparation">
        <p className="wallet-network">Loading wallet settlement options…</p>
      </div>
    ),
  }
);

