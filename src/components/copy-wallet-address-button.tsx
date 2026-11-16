"use client";

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
      >
        {feedback === "copied" ? "Copied" : feedback === "error" ? "Copy failed" : "Copy"}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {feedback === "copied" ? "Full wallet address copied" : feedback === "error" ? "Could not copy wallet address" : ""}
      </span>
    </div>
  );
}
