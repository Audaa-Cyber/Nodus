"use client";

import { useEffect, useState, useTransition } from "react";
import { executeCircleChallenge } from "@/lib/wallet/circle-web-sdk";

interface CircleWallet {
  id: string;
  address: string;
  blockchain: string;
  state?: string;
}

interface MerchantCircleWalletCardProps {
  currentReceivingAddress: string;
  onAddressConnected: (address: string, network: string) => void;
}

export function MerchantCircleWalletCard({
  currentReceivingAddress,
  onAddressConnected,
}: MerchantCircleWalletCardProps) {
  const [wallets, setWallets] = useState<CircleWallet[]>([]);
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);
  const [appId, setAppId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Load existing merchant wallets on mount
  useEffect(() => {
    let active = true;
    async function loadMerchantWallets() {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const res = await fetch("/api/wallet/circle/merchant", { cache: "no-store" });
        if (!res.ok) {
          if (res.status === 401) {
            setErrorMessage("Please sign in to access your Circle wallet.");
            return;
          }
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to load Circle merchant wallets.");
        }
        const data = await res.json();
        if (active) {
          setIsConfigured(data.configured === true);
          setAppId(data.appId || null);
          setWallets(Array.isArray(data.wallets) ? data.wallets : []);
        }
      } catch (err) {
        if (active) {
          setErrorMessage(err instanceof Error ? err.message : "Unable to load Circle wallet.");
        }
      } finally {
        if (active) setIsLoading(false);
      }
    }
    void loadMerchantWallets();
    return () => {
      active = false;
    };
  }, []);

  // Handle wallet and PIN creation
  const handleCreateWallet = () => {
    setErrorMessage(null);
    setStatusMessage(null);
    startTransition(async () => {
      try {
        const initRes = await fetch("/api/wallet/circle/merchant/init", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });

        if (!initRes.ok) {
          const data = await initRes.json().catch(() => ({}));
          throw new Error(data.error || "Failed to initiate Circle wallet creation.");
        }

        const data = await initRes.json();
        const targetAppId = data.appId || appId;
        if (!targetAppId) {
          throw new Error("Circle App ID is not configured on the server.");
        }

        setStatusMessage("Enter your new PIN in the Circle secure dialog…");

        // Execute challenge in browser via official Web SDK
        const challengeResult = await executeCircleChallenge({
          appId: targetAppId,
          userToken: data.userToken,
          encryptionKey: data.encryptionKey,
          challengeId: data.challengeId,
        });

        if (!challengeResult.success) {
          throw new Error(challengeResult.error || "Circle PIN setup was cancelled.");
        }

        setStatusMessage("PIN established! Loading your new wallet…");

        // Refresh wallet list with polling for async provisioning
        let newWallets: CircleWallet[] = [];
        for (let attempt = 0; attempt < 5; attempt++) {
          const refreshRes = await fetch("/api/wallet/circle/merchant", { cache: "no-store" });
          if (refreshRes.ok) {
            const refreshData = await refreshRes.json();
            if (Array.isArray(refreshData.wallets) && refreshData.wallets.length > 0) {
              newWallets = refreshData.wallets;
              break;
            }
          }
          if (attempt < 4) {
            await new Promise((resolve) => setTimeout(resolve, 1500));
          }
        }
        setWallets(newWallets);
        if (newWallets.length > 0) {
          setStatusMessage("Circle User-Controlled Wallet created successfully!");
        }
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "Circle wallet setup failed.");
      }
    });
  };

  // Connect verified wallet address to business profile
  const handleConnectProfile = (wallet: CircleWallet) => {
    setErrorMessage(null);
    setStatusMessage(null);
    startTransition(async () => {
      try {
        const network = wallet.blockchain.toLowerCase().includes("base") ? "base-sepolia" : "arbitrum-sepolia";
        const res = await fetch("/api/wallet/circle/merchant/connect-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            walletAddress: wallet.address,
            networkKey: network,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to connect Circle wallet to profile.");
        }

        const result = await res.json();
        onAddressConnected(result.receiving_address, result.receiving_network);
        setStatusMessage("Connected verified Circle wallet to business profile ✓");
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "Failed to connect wallet.");
      }
    });
  };

  const primaryWallet =
    wallets.find((w) => w.blockchain.toUpperCase().includes("BASE")) ||
    wallets[0] ||
    null;

  const isCurrentConnected =
    Boolean(primaryWallet?.address && primaryWallet.address.toLowerCase() === currentReceivingAddress.trim().toLowerCase());

  return (
    <div
      className="rounded-lg p-4 sm:p-5 mb-5 border transition-all"
      style={{
        background: "var(--card-bg, #ffffff)",
        borderColor: "var(--card-border, #e2e8f0)",
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-800">
            Circle User-Controlled Wallet
          </h3>
        </div>
        {isCurrentConnected && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            ✓ Active Receiving Destination
          </span>
        )}
      </div>

      <p className="text-xs text-slate-600 mb-4 leading-relaxed">
        Secure non-custodial wallet powered by Circle MPC. Backed by your personal PIN, with no browser extensions or seed phrases required.
      </p>

      {isLoading ? (
        <p className="text-xs text-slate-500">Checking Circle wallet status…</p>
      ) : isConfigured === false ? (
        <div className="text-xs text-amber-700 bg-amber-50 p-3 rounded-md border border-amber-200">
          Circle User-Controlled Wallets are not configured on this server. Configure <code>CIRCLE_API_KEY</code> and <code>NEXT_PUBLIC_CIRCLE_APP_ID</code> to enable.
        </div>
      ) : primaryWallet ? (
        <div className="space-y-3">
          <div className="p-3 bg-slate-50 rounded-md border border-slate-200 text-xs font-mono-code break-all">
            <div className="flex justify-between items-center text-[10px] uppercase text-slate-500 mb-1">
              <span>{primaryWallet.blockchain}</span>
              <span className="text-emerald-600 font-semibold">Verified</span>
            </div>
            <span className="text-slate-900 font-medium">{primaryWallet.address}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!isCurrentConnected ? (
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleConnectProfile(primaryWallet)}
                className="btn-save-pill text-xs px-3 py-1.5 cursor-pointer disabled:opacity-50"
              >
                {isPending ? "Connecting…" : "Connect address to business profile"}
              </button>
            ) : (
              <span className="text-xs text-emerald-600 font-medium">
                This wallet is receiving customer payments for your business.
              </span>
            )}
          </div>
        </div>
      ) : (
        <div>
          <button
            type="button"
            disabled={isPending}
            onClick={handleCreateWallet}
            className="btn-save-pill text-xs px-3.5 py-1.5 cursor-pointer disabled:opacity-50"
          >
            {isPending ? "Starting PIN setup…" : "Create Circle User-Controlled Wallet"}
          </button>
        </div>
      )}

      {statusMessage && (
        <p className="text-xs text-emerald-600 mt-3 font-medium" role="status">
          {statusMessage}
        </p>
      )}
      {errorMessage && (
        <p className="text-xs text-rose-500 mt-3 font-medium" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  );
}

