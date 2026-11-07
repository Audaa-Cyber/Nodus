"use client";

import dynamic from "next/dynamic";
import { PageLoader } from "@/components/page-loader";

export const LazyInvoiceWalletCheckout = dynamic(
  () =>
    import("./invoice-wallet-checkout").then(
      (mod) => mod.InvoiceWalletCheckout
    ),
  {
    ssr: false,
    loading: () => (
      <PageLoader variant="inline" label="Loading wallet settlement options" />
    ),
  }
);

