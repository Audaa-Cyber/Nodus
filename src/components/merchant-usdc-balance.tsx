"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatUsdcBaseUnits } from "@/lib/payments/nodus-received-balance";

type ChainBalance = {
  networkKey: string;
  networkLabel: string;
  totalBaseUnits: string;
  paymentCount: number;
};

type BalanceState =
  | { phase: "loading" }
  | {
      phase: "ok";
      totalBaseUnits: string;
      selectedNetwork: string | null;
      chains: ChainBalance[];
      fetchedAt: Date;
    }
  | { phase: "error"; message: string };

export default function MerchantUsdcBalance() {
  const [state, setState] = useState<BalanceState>({ phase: "loading" });
  const [selectedChain, setSelectedChain] = useState("all");
  const fetchingRef = useRef(false);

  const fetchBalance = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setState((current) => current.phase === "ok" ? current : { phase: "loading" });
    try {
      const response = await fetch("/api/merchant/balance", { cache: "no-store" });
      const data = await response.json() as {
        status?: string;
        totalBaseUnits?: string;
        selectedNetwork?: string | null;
        chains?: ChainBalance[];
        message?: string;
      };
      if (!response.ok || data.status !== "ok" || !/^\d+$/.test(data.totalBaseUnits ?? "") || !Array.isArray(data.chains)) {
        throw new Error(data.message ?? "NODUS received balance is unavailable.");
      }
      setState({
        phase: "ok",
        totalBaseUnits: data.totalBaseUnits!,
        selectedNetwork: data.selectedNetwork ?? null,
        chains: data.chains,
        fetchedAt: new Date(),
      });
    } catch (error) {
      setState({ phase: "error", message: error instanceof Error ? error.message : "NODUS received balance is unavailable." });
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    void fetchBalance();
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void fetchBalance();
    };
    const interval = window.setInterval(refreshWhenVisible, 15_000);
    window.addEventListener("focus", refreshWhenVisible);
    window.addEventListener("nodus:payment-verified", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenVisible);
      window.removeEventListener("nodus:payment-verified", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [fetchBalance]);

  const shownChains = state.phase === "ok"
    ? selectedChain === "all" ? state.chains : state.chains.filter((chain) => chain.networkKey === selectedChain)
    : [];

  return (
    <div className="card-perspective stagger-item delay-2">
      <div className="aether-card p-6 sm:p-7">
        <div className="top-highlight" />
        <div className="relative z-10">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider block" style={{ color: "var(--text-muted)" }}>
                TOTAL RECEIVED THROUGH NODUS
              </span>
              <h3 className="text-base font-bold text-slate-900 mt-0.5">Verified invoice payments</h3>
            </div>
            <div className="flex items-center gap-2">
              {state.phase === "ok" && <span className="font-mono-code text-xs px-2.5 py-1 rounded-full font-semibold bg-emerald-500/10 text-emerald-600">Verified</span>}
              {state.phase === "error" && <span className="font-mono-code text-xs px-2.5 py-1 rounded-full font-semibold bg-rose-500/10 text-rose-600">Unavailable</span>}
              <button
                onClick={() => void fetchBalance()}
                disabled={state.phase === "loading"}
                aria-label="Refresh NODUS received balance"
                className="w-7 h-7 rounded-full border flex items-center justify-center transition-colors hover:bg-slate-100 disabled:opacity-50"
                style={{ borderColor: "var(--card-border)" }}
                title="Refresh received balance"
              >
                <svg className={`w-3.5 h-3.5 ${state.phase === "loading" ? "animate-spin" : ""}`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                  <path d="M13.5 2.5A6.5 6.5 0 1 1 8 1.5" strokeLinecap="round" />
                  <path d="M13.5 2.5V6h-3.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>

          {state.phase === "loading" && (
            <div className="mt-2 space-y-2" aria-label="Loading received balance">
              <div className="h-8 w-40 rounded-md bg-slate-100 animate-pulse" />
              <div className="h-3 w-56 rounded bg-slate-100 animate-pulse" />
            </div>
          )}

          {state.phase === "error" && <p className="text-xs text-rose-600 mt-3" role="alert">{state.message}</p>}

          {state.phase === "ok" && (
            <>
              <p className="text-3xl font-bold tracking-tight text-slate-900 mt-1">
                {formatUsdcBaseUnits(state.totalBaseUnits)} <span className="text-base font-semibold text-slate-500">USDC</span>
              </p>
              <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
                Verified, successful NODUS invoice payments only. This is not your wallet balance.
              </p>

              <div className="flex items-center justify-between gap-3 mt-4 mb-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                  Chain breakdown
                </span>
                <label className="text-xs flex items-center gap-2" style={{ color: "var(--text-secondary)" }}>
                  <span>View</span>
                  <select
                    aria-label="Filter NODUS received balance by chain"
                    value={selectedChain}
                    onChange={(event) => setSelectedChain(event.target.value)}
                    className="rounded-md border bg-white px-2 py-1 text-xs text-slate-700"
                    style={{ borderColor: "var(--card-border)" }}
                  >
                    <option value="all">All chains</option>
                    {state.chains.map((chain) => (
                      <option key={chain.networkKey} value={chain.networkKey}>
                        {chain.networkLabel}{state.selectedNetwork === chain.networkKey ? " · selected" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <ul className="divide-y" style={{ borderColor: "var(--card-border)" }}>
                {shownChains.map((chain) => (
                  <li key={chain.networkKey} className="flex items-center justify-between py-2 text-xs">
                    <span className="font-medium text-slate-700">{chain.networkLabel}</span>
                    <span className="font-mono-code text-slate-900">
                      {formatUsdcBaseUnits(chain.totalBaseUnits)} USDC
                      <span className="ml-2 text-[10px] text-slate-500">{chain.paymentCount} payment{chain.paymentCount === 1 ? "" : "s"}</span>
                    </span>
                  </li>
                ))}
              </ul>

              {state.totalBaseUnits === "0" && (
                <p className="text-[11px] mt-2" style={{ color: "var(--text-muted)" }}>No verified NODUS invoice payments have been received yet.</p>
              )}
              <p className="text-[10px] mt-2" style={{ color: "var(--text-muted)" }}>
                Updated {state.fetchedAt.toLocaleTimeString()} · refreshes while this page is open.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
