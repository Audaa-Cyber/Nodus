"use client";

import { useEffect, useState, useCallback, useTransition } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { DEFAULT_RECOMMENDED_CHAIN_ID, evmWalletChains, getEvmWalletNetwork } from "@/lib/wallet/networks";
import type { WalletConnectionSnapshot } from "@/lib/wallet/types";
import { getSharedCircleProvider } from "@/lib/wallet/circle-eip1193-provider";
import { executeCircleChallenge } from "@/lib/wallet/circle-web-sdk";

interface CircleWalletInfo {
  id: string;
  address: string;
  blockchain: string;
  state?: string;
}

const GUEST_UID_KEY = "nodus:circle:guest_uid";

export function CircleGuestWalletCard({
  selectedChainId = DEFAULT_RECOMMENDED_CHAIN_ID,
  onConnectionChange,
}: {
  selectedChainId?: number;
  onConnectionChange: (connection: WalletConnectionSnapshot) => void;
}) {
  const { address, chainId, isConnected } = useAccount();
  const { connectors, connectAsync } = useConnect();
  const { disconnectAsync, isPending: isDisconnecting } = useDisconnect();

  const [guestUserId, setGuestUserId] = useState<string>("");
  const [wallets, setWallets] = useState<CircleWalletInfo[]>([]);
  const [activeWallet, setActiveWallet] = useState<CircleWalletInfo | null>(null);
  const [isCircleConfigured, setIsCircleConfigured] = useState<boolean | null>(null);
  const [appId, setAppId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  // Find the wagmi connector for Circle
  const circleConnector = connectors.find((c) => c.id === "circle-user-controlled");

  // Load existing guest UID or generate one
  useEffect(() => {
    let uid = typeof window !== "undefined" ? window.localStorage.getItem(GUEST_UID_KEY) : null;
    if (!uid || !/^[0-9a-f-]{36}$/i.test(uid)) {
      uid = crypto.randomUUID();
      try {
        window.localStorage.setItem(GUEST_UID_KEY, uid);
      } catch {
        // Ignore storage errors
      }
    }
    setGuestUserId(uid);
  }, []);

  // Check config and load wallets
  const checkConfigAndLoadWallets = useCallback(async (uid: string) => {
    setIsLoading(true);
    setMessage("");
    try {
      const configRes = await fetch("/api/wallet/circle/config", { cache: "no-store" });
      const configData = await configRes.json().catch(() => ({ configured: false }));
      setIsCircleConfigured(configData.configured === true);
      setAppId(configData.appId || null);

      if (!configData.configured) {
        setIsLoading(false);
        return;
      }

      // Query guest wallets
      const walletsRes = await fetch(`/api/wallet/circle/guest/wallets?guestUserId=${encodeURIComponent(uid)}`, {
        cache: "no-store",
      });
      if (walletsRes.ok) {
        const payload = await walletsRes.json();
        if (Array.isArray(payload.wallets) && payload.wallets.length > 0) {
          setWallets(payload.wallets);
          const preferred =
            payload.wallets.find((w: CircleWalletInfo) => w.blockchain.toUpperCase().includes("BASE")) ||
            payload.wallets[0];
          setActiveWallet(preferred);
        }
      }
    } catch {
      setMessage("Could not load Circle wallet status.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (guestUserId) {
      void checkConfigAndLoadWallets(guestUserId);
    }
  }, [guestUserId, checkConfigAndLoadWallets]);

  // Sync connection state with parent
  useEffect(() => {
    const isCircleConnected = isConnected && circleConnector?.id === "circle-user-controlled";
    if (isCircleConnected && address) {
      onConnectionChange({
        address,
        network: getEvmWalletNetwork(chainId) ?? null,
      });
    }
  }, [address, chainId, isConnected, circleConnector, onConnectionChange]);

  // Handle wallet / PIN initialization challenge
  async function handleInitWallet() {
    setMessage("");
    if (!guestUserId) return;

    startTransition(async () => {
      try {
        const initRes = await fetch("/api/wallet/circle/guest/init", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ guestUserId }),
        });

        if (!initRes.ok) {
          const err = await initRes.json().catch(() => ({}));
          throw new Error(err.error || "Failed to initialize Circle wallet challenge.");
        }

        const data = (await initRes.json()) as {
          challengeId: string;
          userToken: string;
          encryptionKey: string;
          appId: string;
          guestUserId: string;
        };

        const targetAppId = data.appId || appId;
        if (!targetAppId) {
          throw new Error("Circle App ID is not configured on the server.");
        }

        // Execute challenge in browser via official Circle Web SDK
        const challengeResult = await executeCircleChallenge({
          appId: targetAppId,
          userToken: data.userToken,
          encryptionKey: data.encryptionKey,
          challengeId: data.challengeId,
        });

        if (!challengeResult.success) {
          throw new Error(challengeResult.error || "PIN setup was cancelled or failed.");
        }

        // Reload wallets after challenge completion with polling for async provisioning
        let createdWallets: CircleWalletInfo[] = [];
        for (let attempt = 0; attempt < 5; attempt++) {
          const walletsRes = await fetch(
            `/api/wallet/circle/guest/wallets?guestUserId=${encodeURIComponent(data.guestUserId)}`,
            { cache: "no-store" }
          );

          if (walletsRes.ok) {
            const walletsPayload = await walletsRes.json();
            if (Array.isArray(walletsPayload.wallets) && walletsPayload.wallets.length > 0) {
              createdWallets = walletsPayload.wallets;
              break;
            }
          }
          if (attempt < 4) {
            await new Promise((resolve) => setTimeout(resolve, 1500));
          }
        }

        if (createdWallets.length === 0) {
          setMessage("Circle is provisioning your wallet. Please click 'Use Circle Wallet' in a moment.");
          return;
        }

        setWallets(createdWallets);

        const chosen =
          createdWallets.find((w) => w.blockchain.toUpperCase().includes("BASE")) ||
          createdWallets[0];

        if (!chosen?.address) {
          throw new Error("Circle did not return a valid wallet address.");
        }

        setActiveWallet(chosen);

        // Update shared EIP-1193 provider session
        const sharedProvider = getSharedCircleProvider();
        sharedProvider.setSession({
          address: chosen.address as `0x${string}`,
          walletId: chosen.id,
          chainId: selectedChainId,
          userToken: data.userToken,
          encryptionKey: data.encryptionKey,
          guestUserId: data.guestUserId,
          appId: targetAppId,
        });

        // Connect through Wagmi
        if (circleConnector) {
          await connectAsync({ connector: circleConnector });
        }
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Circle wallet setup failed.");
      }
    });
  }

  // Handle connecting an already created wallet
  async function handleConnectExistingWallet() {
    setMessage("");
    if (!activeWallet || !circleConnector) return;

    startTransition(async () => {
      try {
        const sharedProvider = getSharedCircleProvider();
        sharedProvider.setSession({
          address: activeWallet.address as `0x${string}`,
          walletId: activeWallet.id,
          chainId: selectedChainId,
          userToken: "", // Filled on demand if transaction signing is initiated
          encryptionKey: "",
          guestUserId,
          appId: appId || undefined,
        });

        await connectAsync({ connector: circleConnector });
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Could not connect Circle wallet.");
      }
    });
  }

  async function handleDisconnect() {
    setMessage("");
    try {
      const sharedProvider = getSharedCircleProvider();
      sharedProvider.setSession(null);
      await disconnectAsync();
      onConnectionChange({ address: null, network: null });
    } catch {
      setMessage("Failed to disconnect wallet.");
    }
  }

  const isConnectedToCircle = Boolean(isConnected && address && circleConnector?.id === "circle-user-controlled");
  const activeChain = evmWalletChains.find((chain) => chain.id === chainId);

  return (
    <section className="wallet-card" aria-labelledby="circle-wallet-title">
      <div className="wallet-card-heading">
        <div>
          <p className="wallet-eyebrow">USER-CONTROLLED WALLET</p>
          <h3 id="circle-wallet-title">Circle Wallet</h3>
        </div>
        {isConnectedToCircle && <span className="wallet-connected-label">Connected</span>}
      </div>

      {isLoading ? (
        <p className="wallet-description">Loading Circle wallet options…</p>
      ) : isCircleConfigured === false ? (
        <div className="wallet-switch-alert" role="status">
          <p className="wallet-inline-status">
            Circle User-Controlled Wallets are not configured on this environment. To enable, configure Circle API credentials.
          </p>
        </div>
      ) : isConnectedToCircle && address ? (
        <>
          <p className="wallet-address" title={address}>
            {address}
          </p>
          <p className="wallet-network">
            {activeChain ? activeChain.name : `Base Sepolia (${chainId ?? 84532})`}
          </p>
          <p className="wallet-description" style={{ fontSize: "0.75rem", color: "#166534" }}>
            ✓ Protected by your PIN &amp; Circle MPC. No NODUS account required.
          </p>
          <button
            className="wallet-secondary-button"
            type="button"
            onClick={handleDisconnect}
            disabled={isDisconnecting}
          >
            {isDisconnecting ? "Disconnecting…" : "Disconnect Circle wallet"}
          </button>
        </>
      ) : (
        <>
          <p className="wallet-description">
            Create or access an embedded Circle wallet. No browser extensions or NODUS account required.
          </p>
          <div className="wallet-connect-options" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {wallets.length > 1 && (
              <div style={{ marginBottom: "0.5rem" }}>
                <label style={{ fontSize: "0.75rem", color: "#64748b", display: "block", marginBottom: "4px" }}>
                  Select Circle Wallet:
                </label>
                <select
                  value={activeWallet?.id || ""}
                  onChange={(e) => {
                    const found = wallets.find((w) => w.id === e.target.value);
                    if (found) setActiveWallet(found);
                  }}
                  className="nodus-input"
                  style={{ fontSize: "0.75rem", padding: "4px 8px" }}
                >
                  {wallets.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.blockchain}: {w.address.slice(0, 6)}…{w.address.slice(-4)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {activeWallet ? (
              <button
                type="button"
                className="wallet-primary-button"
                disabled={isPending}
                onClick={handleConnectExistingWallet}
              >
                {isPending ? "Connecting…" : `Use Circle Wallet (${activeWallet.address.slice(0, 6)}…${activeWallet.address.slice(-4)})`}
              </button>
            ) : null}

            <button
              type="button"
              className={activeWallet ? "wallet-secondary-button" : "wallet-primary-button"}
              disabled={isPending}
              onClick={handleInitWallet}
            >
              {isPending
                ? "Launching Circle PIN setup…"
                : activeWallet
                  ? "Create New Circle Wallet"
                  : "Set Up Circle Wallet (PIN Protected)"}
            </button>
          </div>
        </>
      )}

      {message && (
        <p className="wallet-error" role="alert" style={{ marginTop: "0.5rem" }}>
          {message}
        </p>
      )}
    </section>
  );
}
