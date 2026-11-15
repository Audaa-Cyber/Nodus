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
      refreshError?: string;
    }
  | { phase: "error"; message: string };

export default function MerchantUsdcBalance() {
  const [state, setState] = useState<BalanceState>({ phase: "loading" });
  const [selectedChain, setSelectedChain] = useState("all");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const fetchingRef = useRef(false);

  const fetchBalance = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setIsRefreshing(true);
    setState((current) => current.phase === "ok" ? { ...current, refreshError: undefined } : { phase: "loading" });
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch("/api/merchant/balance", { cache: "no-store", signal: controller.signal });
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
      const message = controller.signal.aborted
        ? "Balance refresh timed out. Try again."
        : error instanceof Error ? error.message : "NODUS received balance is unavailable.";
      setState((current) => current.phase === "ok"
        ? { ...current, refreshError: message }
        : { phase: "error", message });
    } finally {
      window.clearTimeout(timeout);
      fetchingRef.current = false;
      setIsRefreshing(false);
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
    <div className="card-perspective stagger-item delay-2 min-w-0">
      <div className="aether-card min-w-0 p-5 sm:p-7">
        <div className="top-highlight" />
        <div className="relative z-10">
          <div className="flex min-w-0 items-start justify-between gap-3 mb-3">
            <div className="min-w-0">
              <span className="text-[10px] font-semibold uppercase tracking-wider block" style={{ color: "var(--text-muted)" }}>
                NODUS RECEIVED
              </span>
            </div>
            <div className="flex shrink-0 items-center">
              <button
                type="button"
                onClick={() => void fetchBalance()}
                disabled={isRefreshing}
                aria-label={isRefreshing ? "Refreshing NODUS received balance" : "Refresh NODUS received balance"}
                aria-busy={isRefreshing}
                className="flex h-11 w-11 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 disabled:opacity-50 sm:h-10 sm:w-10"
                title={isRefreshing ? "Refreshing received balance" : "Refresh received balance"}
              >
                <svg className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
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
              <p className="mt-1 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                {formatUsdcBaseUnits(state.totalBaseUnits)} <span className="text-base font-semibold text-slate-500">USDC</span>
              </p>
              <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
                Invoice payments through Nodus. Separate from wallet balance.
              </p>
              {state.refreshError && <p className="text-xs text-rose-600 mt-2" role="status">{state.refreshError}</p>}

              <div className="mt-4 mb-2 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(180px,240px)] sm:items-center">
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                  By network
                </span>
                <label className="block min-w-0">
                  <span className="sr-only">Filter Nodus received balance by network</span>
                  <select
                    value={selectedChain}
                    onChange={(event) => setSelectedChain(event.target.value)}
                    className="nodus-input h-10 min-h-10 min-w-0 truncate py-2 text-xs"
                  >
                    <option value="all">All networks</option>
                    {state.chains.map((chain) => (
                      <option key={chain.networkKey} value={chain.networkKey}>
                        {chain.networkLabel}{state.selectedNetwork === chain.networkKey ? " · selected" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <ul className="min-w-0 divide-y" style={{ borderColor: "var(--card-border)" }}>
                {shownChains.map((chain) => (
                  <li key={chain.networkKey} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2 text-xs">
                    <span className="min-w-0 break-words font-medium text-slate-700">{chain.networkLabel}</span>
                    <span className="min-w-0 text-right font-mono-code text-slate-900">
                      {formatUsdcBaseUnits(chain.totalBaseUnits)} USDC
                      <span className="block text-[10px] text-slate-500">{chain.paymentCount} payment{chain.paymentCount === 1 ? "" : "s"}</span>
                    </span>
                  </li>
                ))}
              </ul>

              {state.totalBaseUnits === "0" && (
                <p className="text-[11px] mt-2" style={{ color: "var(--text-muted)" }}>No Nodus invoice payments received yet.</p>
              )}
              <p className="text-[10px] mt-2" style={{ color: "var(--text-muted)" }}>
                Updated {state.fetchedAt.toLocaleTimeString()}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
