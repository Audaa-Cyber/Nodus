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

interface MerchantUsdcBalanceProps {
  initialSelectedNetwork?: string | null;
}

export default function MerchantUsdcBalance({ initialSelectedNetwork }: MerchantUsdcBalanceProps) {
  const [state, setState] = useState<BalanceState>({ phase: "loading" });
  const [selectedChain, setSelectedChain] = useState<string>(() => initialSelectedNetwork || "base-sepolia");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAmountUpdated, setIsAmountUpdated] = useState(false);
  const fetchingRef = useRef(false);
  const userInteractedRef = useRef(false);
  const previousBaseUnits = useRef<string | null>(null);

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

      if (!userInteractedRef.current && data.selectedNetwork) {
        setSelectedChain(data.selectedNetwork);
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

  const isAll = selectedChain === "all";
  const activeChainObj = state.phase === "ok" ? state.chains.find((c) => c.networkKey === selectedChain) : null;
  const displayedBaseUnits = state.phase === "ok"
    ? isAll
      ? state.totalBaseUnits
      : (activeChainObj?.totalBaseUnits ?? "0")
    : "0";

  useEffect(() => {
    if (state.phase === "ok") {
      if (previousBaseUnits.current !== null && previousBaseUnits.current !== displayedBaseUnits) {
        setIsAmountUpdated(true);
        const timer = window.setTimeout(() => setIsAmountUpdated(false), 700);
        previousBaseUnits.current = displayedBaseUnits;
        return () => window.clearTimeout(timer);
      }
      previousBaseUnits.current = displayedBaseUnits;
    }
  }, [state.phase, displayedBaseUnits]);
  const displayedPaymentCount = state.phase === "ok"
    ? isAll
      ? state.chains.reduce((sum, c) => sum + c.paymentCount, 0)
      : (activeChainObj?.paymentCount ?? 0)
    : 0;
  const displayedNetworkLabel = state.phase === "ok"
    ? isAll
      ? "All networks"
      : (activeChainObj?.networkLabel ?? selectedChain)
    : (selectedChain.replaceAll("-", " "));

  const shownChains = state.phase === "ok"
    ? selectedChain === "all" ? state.chains : state.chains.filter((chain) => chain.networkKey === selectedChain)
    : [];

  return (
    <div className="surface-card aether-card w-full min-w-0 p-5 sm:p-6 flex flex-col justify-between">
      <div className="relative z-10 w-full">
        {/* Header Row */}
        <div className="flex min-w-0 items-center justify-between gap-3 mb-3">
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
              className="nodus-refresh-btn group"
              title={isRefreshing ? "Refreshing received balance" : "Refresh received balance"}
            >
              <svg
                className={`nodus-refresh-icon ${isRefreshing ? "is-spinning animate-spin" : ""}`}
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                aria-hidden="true"
              >
                <path d="M13.5 2.5A6.5 6.5 0 1 1 8 1.5" strokeLinecap="round" />
                <path d="M13.5 2.5V6h-3.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>{isRefreshing ? "Syncing…" : "Refresh"}</span>
            </button>
          </div>
        </div>

        {/* Loading State */}
        {state.phase === "loading" && (
          <div className="mt-2 space-y-3" aria-label="Loading received balance">
            <div className="h-10 w-44 rounded-md bg-slate-100 animate-pulse" />
            <div className="h-4 w-60 rounded bg-slate-100 animate-pulse" />
          </div>
        )}

        {/* Error State */}
        {state.phase === "error" && (
          <div className="mt-2 p-3 rounded-md bg-rose-50 border border-rose-200">
            <p className="text-xs text-rose-700" role="alert">{state.message}</p>
            <button
              type="button"
              onClick={() => void fetchBalance()}
              className="mt-2 text-[11px] font-semibold text-rose-800 underline underline-offset-2"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loaded State */}
        {state.phase === "ok" && (
          <>
            <div className="flex flex-wrap items-baseline gap-2">
              <p className={`text-3xl font-bold tracking-tight text-slate-900 font-mono-code sm:text-4xl nodus-balance-value ${isAmountUpdated ? "is-updated" : ""}`}>
                {formatUsdcBaseUnits(displayedBaseUnits)}
              </p>
              <span className="text-base font-semibold text-slate-500">USDC</span>
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                <span>{displayedNetworkLabel}</span>
                {!isAll && state.selectedNetwork === selectedChain && (
                  <span className="text-slate-400 font-normal">· Receiving network</span>
                )}
              </span>
              <span className="text-[11px] text-slate-500 font-mono-code">
                {displayedPaymentCount} {displayedPaymentCount === 1 ? "payment" : "payments"}
              </span>
            </div>

            <p className="text-[11px] mt-2" style={{ color: "var(--text-muted)" }}>
              Invoice payments through Nodus. Separate from wallet balance.
            </p>

            {state.refreshError && (
              <p className="text-xs text-rose-600 mt-2" role="status">
                {state.refreshError}
              </p>
            )}

            {/* Network Selector */}
            <div className="mt-4 mb-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 min-w-0">
              <span className="text-[10px] font-semibold uppercase tracking-wider shrink-0" style={{ color: "var(--text-muted)" }}>
                By network
              </span>
              <label className="block min-w-0 w-full sm:w-auto sm:min-w-[260px] sm:max-w-[320px]">
                <span className="sr-only">Filter Nodus received balance by network</span>
                <select
                  value={selectedChain}
                  onChange={(event) => {
                    userInteractedRef.current = true;
                    setSelectedChain(event.target.value);
                  }}
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

            {/* Network breakdown */}
            <ul className="min-w-0 divide-y mt-2" style={{ borderColor: "var(--card-border)" }}>
              {shownChains.map((chain) => (
                <li key={chain.networkKey} className="nodus-network-row grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2 text-xs">
                  <span className="min-w-0 break-words font-medium text-slate-700">{chain.networkLabel}</span>
                  <span className="min-w-0 text-right font-mono-code text-slate-900">
                    {formatUsdcBaseUnits(chain.totalBaseUnits)} USDC
                    <span className="block text-[10px] text-slate-500">{chain.paymentCount} payment{chain.paymentCount === 1 ? "" : "s"}</span>
                  </span>
                </li>
              ))}
            </ul>

            {displayedBaseUnits === "0" && (
              <p className="text-[11px] mt-2" style={{ color: "var(--text-muted)" }}>
                No Nodus invoice payments received yet.
              </p>
            )}
          </>
        )}
      </div>

      {state.phase === "ok" && (
        <div className="pt-3 mt-3 border-t text-[10px] text-slate-400" style={{ borderColor: "var(--card-border)" }}>
          Updated {state.fetchedAt.toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}
