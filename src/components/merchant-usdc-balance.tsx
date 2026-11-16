"use client";

import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatUsdcBaseUnits } from "@/lib/payments/nodus-received-balance";
import { useInvoiceRealtime } from "@/components/invoice-realtime-provider";
import { NetworkLogo } from "@/components/network-logo";
import { circleTestnetUsdcNetworks } from "@/lib/wallet/networks";
import { useAnimatedInteger } from "@/components/use-data-motion";
import { MerchantReceiptsChart } from "@/components/merchant-receipts-chart";
import type { DailyReceiptPoint } from "@/lib/dashboard/daily-receipts";

type ChainBalance = {
  networkKey: string;
  networkLabel: string;
  totalBaseUnits: string;
  paymentCount: number;
  dailyReceipts?: DailyReceiptPoint[];
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
  const [networkFilter, setNetworkFilter] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const fetchingRef = useRef(false);
  const requestRef = useRef<AbortController | null>(null);
  const { subscribeToInvoices } = useInvoiceRealtime();

  const fetchBalance = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setIsRefreshing(true);
    setState((current) => current.phase === "ok" ? { ...current, refreshError: undefined } : { phase: "loading" });
    const controller = new AbortController();
    requestRef.current = controller;
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
      if (!response.ok || data.status !== "ok" || !/^\d+$/.test(data.totalBaseUnits ?? "") || !Array.isArray(data.chains)
        || !data.chains.every((chain) => chain && typeof chain.networkKey === "string" && /^\d+$/.test(chain.totalBaseUnits))) {
        throw new Error(data.message ?? "NODUS received balance is unavailable.");
      }

      if (requestRef.current !== controller) return;
      setState({
        phase: "ok",
        totalBaseUnits: data.totalBaseUnits!,
        selectedNetwork: data.selectedNetwork ?? null,
        chains: data.chains,
        fetchedAt: new Date(),
      });
    } catch (error) {
      if (requestRef.current !== controller) return;
      const message = controller.signal.aborted
        ? "Balance refresh timed out. Try again."
        : error instanceof Error ? error.message : "NODUS received balance is unavailable.";
      setState((current) => current.phase === "ok"
        ? { ...current, refreshError: message }
        : { phase: "error", message });
    } finally {
      window.clearTimeout(timeout);
      if (requestRef.current === controller) {
        requestRef.current = null;
        fetchingRef.current = false;
        setIsRefreshing(false);
      }
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
    const unsubscribe = subscribeToInvoices((invoice) => {
      if (invoice.status === "paid") refreshWhenVisible();
    });
    return () => {
      requestRef.current?.abort();
      requestRef.current = null;
      fetchingRef.current = false;
      unsubscribe();
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenVisible);
      window.removeEventListener("nodus:payment-verified", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [fetchBalance, subscribeToInvoices]);

  // Follow the configured destination until the user chooses a balance filter.
  const selectedChain = networkFilter ?? (state.phase === "ok" ? state.selectedNetwork : initialSelectedNetwork);
  const isAll = selectedChain === "all";
  const activeChainObj = state.phase === "ok"
    ? (state.chains.find((c) => c.networkKey === selectedChain) ?? null)
    : null;
  const displayedBaseUnits = state.phase === "ok"
    ? isAll ? state.totalBaseUnits : (activeChainObj?.totalBaseUnits ?? "0")
    : "0";

  const { displayed: animatedBaseUnits, changed: isAmountUpdated } = useAnimatedInteger(
    BigInt(displayedBaseUnits),
    state.phase === "ok" && (activeChainObj || isAll) ? `${selectedChain}` : "unavailable",
    700,
  );

  const displayedPaymentCount = state.phase === "ok"
    ? isAll ? state.chains.reduce((sum, chain) => sum + chain.paymentCount, 0) : (activeChainObj?.paymentCount ?? 0)
    : 0;
  const displayedNetworkLabel = isAll ? "All networks"
    : circleTestnetUsdcNetworks.find((network) => network.key === selectedChain)?.label
      ?? activeChainObj?.networkLabel
      ?? selectedChain?.replaceAll("-", " ")
      ?? "Network not configured";

  const chartDailyReceipts = useMemo<DailyReceiptPoint[]>(() => {
    if (state.phase !== "ok") return [];
    if (isAll) {
      const firstChain = state.chains[0];
      if (!firstChain?.dailyReceipts) return [];
      return firstChain.dailyReceipts.map((pt, idx) => {
        let sumBaseUnits = 0n;
        let sumCount = 0;
        for (const chain of state.chains) {
          const item = chain.dailyReceipts?.[idx];
          if (item) {
            sumBaseUnits += BigInt(item.totalBaseUnits);
            sumCount += item.paymentCount;
          }
        }
        return {
          date: pt.date,
          totalBaseUnits: sumBaseUnits.toString(),
          paymentCount: sumCount,
          usdcFormatted: formatUsdcBaseUnits(sumBaseUnits.toString()),
        };
      });
    }
    return activeChainObj?.dailyReceipts ?? [];
  }, [state, isAll, activeChainObj]);

  return (
    <section className="overview-card overview-balance" aria-labelledby="nodus-received-title" aria-busy={isRefreshing}>
      <div className="overview-balance-heading">
        <div className="overview-balance-title-group">
          <h2 id="nodus-received-title">NODUS Received</h2>
          <span className="overview-auto-status"><span aria-hidden="true" />Refreshes every 15s</span>
        </div>
        <div className="overview-balance-actions">
          <label className="overview-balance-network">
            <NetworkLogo networkKey={selectedChain} size="sm" />
            <select
              aria-label="Filter NODUS received balance by network"
              value={selectedChain ?? ""}
              onChange={(event) => setNetworkFilter(event.target.value)}
            >
              {!selectedChain && <option value="">Network not configured</option>}
              {selectedChain && !isAll && !circleTestnetUsdcNetworks.some((network) => network.key === selectedChain) && (
                <option value={selectedChain}>{displayedNetworkLabel}</option>
              )}
              <option value="all">All networks</option>
              {circleTestnetUsdcNetworks.map((network) => (
                <option key={network.key} value={network.key}>{network.label}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="overview-balance-refresh-btn"
            onClick={() => void fetchBalance()}
            disabled={isRefreshing}
            aria-label="Refresh NODUS received balance"
          >
            <RefreshCw size={13} className={isRefreshing ? "animate-spin" : ""} aria-hidden="true" />
            <span>{isRefreshing ? "Refreshing..." : "Refresh"}</span>
          </button>
        </div>
      </div>
      <div className="overview-balance-content">
        {state.phase === "loading" && (
          <div className="overview-balance-loading" role="status"><span className="sr-only">Loading received balance</span><div /><div /></div>
        )}
        {state.phase === "error" && (
          <div className="overview-balance-error" role="alert"><p>{state.message}</p><button type="button" onClick={() => void fetchBalance()}>Retry</button></div>
        )}
        {state.phase === "ok" && (
          <div aria-live="polite">
            {activeChainObj || isAll ? (
              <>
                <div className="overview-balance-amount">
                  <p className={`nodus-balance-value ${isAmountUpdated ? "is-updated" : ""}`}>
                    <span className="sr-only">{formatUsdcBaseUnits(displayedBaseUnits)}</span>
                    <span aria-hidden="true" className="overview-balance-number">{formatUsdcBaseUnits(animatedBaseUnits.toString())}</span>
                  </p>
                  <span>USDC</span>
                </div>
                <p className="overview-balance-description">
                  From {displayedPaymentCount} verified invoice {displayedPaymentCount === 1 ? "payment" : "payments"}
                </p>

                <MerchantReceiptsChart
                  data={chartDailyReceipts}
                  networkLabel={displayedNetworkLabel}
                  isUpdated={isAmountUpdated}
                />

                {/* Balance Details — Horizontal row showing each network's balance */}
                <div className="overview-balance-details">
                  <div className="overview-balance-details-header">
                    <span className="overview-balance-details-title">Balance Details</span>
                    <span className="overview-balance-details-note">By network</span>
                  </div>
                  <div className="overview-network-chips-scroll" role="tablist" aria-label="Network balances">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={isAll}
                      className={`overview-network-chip ${isAll ? "is-active" : ""}`}
                      onClick={() => setNetworkFilter("all")}
                    >
                      <div className="overview-chip-ring overview-chip-ring-all">
                        <span className="overview-chip-ring-arc" />
                      </div>
                      <div className="overview-chip-info">
                        <span className="overview-chip-label">All Networks</span>
                        <span className="overview-chip-amount">{formatUsdcBaseUnits(state.totalBaseUnits)} USDC</span>
                      </div>
                    </button>

                    {state.chains.map((chain) => {
                      const isSelected = selectedChain === chain.networkKey;
                      return (
                        <button
                          key={chain.networkKey}
                          type="button"
                          role="tab"
                          aria-selected={isSelected}
                          className={`overview-network-chip ${isSelected ? "is-active" : ""}`}
                          onClick={() => setNetworkFilter(chain.networkKey)}
                        >
                          <div className="overview-chip-ring">
                            <NetworkLogo networkKey={chain.networkKey} size="sm" />
                          </div>
                          <div className="overview-chip-info">
                            <span className="overview-chip-label">{chain.networkLabel}</span>
                            <span className="overview-chip-amount">{formatUsdcBaseUnits(chain.totalBaseUnits)} USDC</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
              <p className="overview-balance-description">{selectedChain ? "Balance unavailable for this network." : "Set your receiving network in business settings."}</p>
            )}
            {state.refreshError && <p className="overview-balance-error" role="status">{state.refreshError}</p>}
          </div>
        )}
      </div>
      <div className="overview-balance-footer">
        <span className={`overview-refresh-feedback ${!isRefreshing && state.phase === "ok" && !state.refreshError && isAmountUpdated ? "is-changed" : ""}`} role="status">
          {isRefreshing ? "Refreshing balance…" : state.phase === "ok" ? state.refreshError ? <>Refresh failed · Last updated <time dateTime={state.fetchedAt.toISOString()}>{state.fetchedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time></> : isAmountUpdated ? "Updated just now" : <>Updated <time dateTime={state.fetchedAt.toISOString()}>{state.fetchedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time></> : "Not yet updated"}
        </span>
      </div>
    </section>
  );
}
