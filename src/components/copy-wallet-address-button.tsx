"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export default function CopyWalletAddressButton({ address }: { address: string }) {
  const [feedback, setFeedback] = useState<"idle" | "copied" | "error">("idle");
  const feedbackTimeout = useRef<number | null>(null);

  useEffect(() => () => {
    if (feedbackTimeout.current !== null) window.clearTimeout(feedbackTimeout.current);
  }, []);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address);
      setFeedback("copied");
      if (feedbackTimeout.current !== null) window.clearTimeout(feedbackTimeout.current);
      feedbackTimeout.current = window.setTimeout(() => setFeedback("idle"), 1800);
    } catch {
      setFeedback("error");
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        onClick={() => void copyAddress()}
        className="button button-outline min-h-10 px-3 text-xs transition-all duration-150 active:scale-95"
        aria-label="Copy full wallet address"
        data-feedback={feedback}
      >
        <span className="overview-copy-button-inner">
          {feedback === "copied" ? (
            <>
              <Check size={12} strokeWidth={2.4} className="overview-copy-icon-check" aria-hidden="true" />
              <span>Copied</span>
            </>
          ) : feedback === "error" ? (
            <span>Copy failed</span>
          ) : (
            <>
              <Copy size={12} strokeWidth={1.8} className="overview-copy-icon-copy" aria-hidden="true" />
              <span>Copy</span>
            </>
          )}
        </span>
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {feedback === "copied" ? "Full wallet address copied" : feedback === "error" ? "Could not copy wallet address" : ""}
      </span>
    </div>
  );
}
