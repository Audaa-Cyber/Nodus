"use client";

import { useCallback, useState, type ReactNode } from "react";
import type { InvoiceWalletCheckoutProps } from "@/components/wallet/invoice-wallet-checkout";
import { LazyInvoiceWalletCheckout } from "@/components/wallet/lazy-wallet-checkout";

export function PayerInvoiceFrame({ children, checkout }: { children: ReactNode; checkout: InvoiceWalletCheckoutProps | null }) {
  const [settled, setSettled] = useState(false);
  const onSettled = useCallback(() => setSettled(true), []);
  return <div className={settled ? undefined : "payer-design"}>
    <div className={settled ? undefined : "wrap"}>
      <main>
        {!settled && children}
        {checkout && <LazyInvoiceWalletCheckout {...checkout} onSettled={onSettled} />}
      </main>
    </div>
  </div>;
}
