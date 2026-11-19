"use client";

import { useEffect, useRef, useState } from "react";

export function WalletAddressCopy({ value }: { value?: string | null }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copyAddress() {
    if (!value) return;
    try {
      try {
        await navigator.clipboard.writeText(value);
      } catch {
        const field = document.createElement("textarea");
        field.value = value;
        field.style.cssText = "position:fixed;opacity:0";
        document.body.appendChild(field);
        field.select();
        const success = document.execCommand("copy");
        field.remove();
        if (!success) throw new Error("Clipboard unavailable");
      }
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <span className="wallet-address-copy">
      <span className="m">{value ? value.slice(0, 6) + "..." + value.slice(-4) : "Unavailable"}</span>
      {value && (
        <button type="button" className="wallet-copy-button" onClick={() => void copyAddress()} aria-label="Copy full receiving wallet address">
          {copied ? "Copied" : "Copy"}
        </button>
      )}
    </span>
  );
}
