"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type BalanceState =
  | { phase: "loading" }
  | { phase: "ok"; balance: string; networkLabel: string; walletAddress: string; fetchedAt: Date }
  | { phase: "not_configured"; message: string }
  | { phase: "unsupported_network"; message: string }
  | { phase: "invalid_address"; message: string }
  | { phase: "error"; message: string };

export default function MerchantUsdcBalance() {
  const [state, setState] = useState<BalanceState>({ phase: "loading" });
  const fetchingRef = useRef(false);

  const fetchBalance = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setState({ phase: "loading" });
    try {
      const res = await fetch("/api/merchant/balance", { cache: "no-store" });
      const data: {
        error: string | null;
        status: string;
        balance?: string;
        networkLabel?: string;
        walletAddress?: string;
        message?: string;
      } = await res.json();

      if (data.status === "ok" && data.balance !== undefined) {
        setState({
          phase: "ok",
          balance: data.balance,
          networkLabel: data.networkLabel ?? "Network",
          walletAddress: data.walletAddress ?? "",
          fetchedAt: new Date(),
        });
      } else if (data.status === "not_configured") {
        setState({ phase: "not_configured", message: data.message ?? "No receiving wallet configured." });
      } else if (data.status === "unsupported_network" || data.status === "invalid_address") {
        setState({ phase: "unsupported_network", message: data.message ?? "Unsupported network or address." });
      } else {
        setState({ phase: "error", message: data.message ?? "Balance unavailable." });
      }
    } catch {
      setState({ phase: "error", message: "Network error. Could not reach balance endpoint." });
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  return (
    <div className="card-perspective stagger-item delay-2">
      <div className="aether-card p-6 sm:p-7">
        <div className="top-highlight" />
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-3">
            <div>
              <span
                className="text-[10px] font-semibold uppercase tracking-wider block"
                style={{ color: "var(--text-muted)" }}
              >
                USDC BALANCE
              </span>
              <h3 className="text-base font-bold text-slate-900 mt-0.5">
                {state.phase === "ok" ? `${state.networkLabel}` : "Receiving Wallet"}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              {state.phase === "ok" && (
                <span
                  className="font-mono-code text-xs px-2.5 py-1 rounded-full font-semibold bg-emerald-500/10 text-emerald-600"
                >
                  Live
                </span>
              )}
              {(state.phase === "error") && (
                <span
                  className="font-mono-code text-xs px-2.5 py-1 rounded-full font-semibold bg-rose-500/10 text-rose-600"
                >
                  Unavailable
                </span>
              )}
              <button
                onClick={fetchBalance}
                disabled={state.phase === "loading"}
                aria-label="Refresh USDC balance"
                className="w-7 h-7 rounded-full border flex items-center justify-center transition-colors hover:bg-slate-100 disabled:opacity-50"
                style={{ borderColor: "var(--card-border)" }}
                title="Refresh balance"
              >
                <svg
                  className={`w-3.5 h-3.5 ${state.phase === "loading" ? "animate-spin" : ""}`}
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden="true"
                >
                  <path d="M13.5 2.5A6.5 6.5 0 1 1 8 1.5" strokeLinecap="round" />
                  <path d="M13.5 2.5V6h-3.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>

          {state.phase === "loading" && (
            <div className="mt-2 space-y-2">
              <div className="h-8 w-40 rounded-md bg-slate-100 animate-pulse" />
              <div className="h-3 w-56 rounded bg-slate-100 animate-pulse" />
            </div>
          )}

          {state.phase === "ok" && (
            <div className="mt-1">
              <p className="text-3xl font-bold tracking-tight text-slate-900">
                {state.balance}{" "}
                <span className="text-base font-semibold text-slate-500">USDC</span>
              </p>
              <p
                className="text-xs mt-1.5 font-mono-code break-all"
                style={{ color: "var(--text-muted)" }}
              >
                {state.walletAddress}
              </p>
              <p
                className="text-[11px] mt-1"
                style={{ color: "var(--text-muted)" }}
              >
                Fetched {state.fetchedAt.toLocaleTimeString()}
              </p>
            </div>
          )}

          {(state.phase === "not_configured" || state.phase === "unsupported_network" || state.phase === "invalid_address") && (
            <p className="text-xs mt-2 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              {state.message}
            </p>
          )}

          {state.phase === "error" && (
            <div className="mt-2">
              <p className="text-xs text-rose-600 leading-relaxed" role="alert">
                {state.message}
              </p>
              <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
                Balance is hidden when the RPC is unreachable to prevent misleading zero displays.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
