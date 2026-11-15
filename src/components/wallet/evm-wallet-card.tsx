"use client";

import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { DEFAULT_RECOMMENDED_CHAIN_ID, evmWalletChains } from "@/lib/wallet/networks";
import { connectWalletConnectWithRequiredChain, isMobileWalletBrowser, prepareRabbyForWalletConnectRequest, setWalletConnectSessionDefaultChain, walletConnectSessionIncludesChain } from "@/lib/wallet/rabby-mobile-handoff";

type WalletChoice = "metaMask" | "rabby" | "coinbaseWallet";

const WALLET_CHOICES: { id: WalletChoice; name: string }[] = [
  { id: "metaMask", name: "MetaMask" },
  { id: "rabby", name: "Rabby Wallet" },
  { id: "coinbaseWallet", name: "Coinbase Wallet" },
];

function mobileWalletUrl(wallet: WalletChoice, invoiceUrl: string) {
  const invoice = new URL(invoiceUrl);
  if (wallet === "metaMask") {
    return `https://link.metamask.io/dapp/${encodeURIComponent(invoice.href)}`;
  }
  if (wallet === "coinbaseWallet") {
    return `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(invoice.href)}`;
  }
  return null;
}

export function EvmWalletCard({ selectedChainId }: {
  selectedChainId?: number;
}) {
  const { address, chainId, isConnected, connector } = useAccount();
  const { connectors, connectAsync, isPending } = useConnect();
  const { disconnectAsync, isPending: isDisconnecting } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const [message, setMessage] = useState("");
  const [switchRequestPending, setSwitchRequestPending] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [injectedWallets, setInjectedWallets] = useState<Set<WalletChoice>>(() => new Set());
  const activeChain = evmWalletChains.find((chain) => chain.id === chainId);
  const selectedChain = evmWalletChains.find((chain) => chain.id === selectedChainId);
  const walletConnectConnector = connectors.find((candidate) => candidate.id === "walletConnect");

  useEffect(() => {
    setMobile(isMobileWalletBrowser());
    let cancelled = false;
    void Promise.all(WALLET_CHOICES.map(async ({ id }) => {
      const connector = connectors.find((candidate) => candidate.id === id);
      if (!connector) return null;
      try {
        return await connector.getProvider() ? id : null;
      } catch {
        return null;
      }
    })).then((available) => {
      if (!cancelled) setInjectedWallets(new Set(available.filter((id): id is WalletChoice => id !== null)));
    });
    return () => { cancelled = true; };
  }, [connectors]);

  async function connect(wallet: WalletChoice) {
    setMessage("");
    const walletName = WALLET_CHOICES.find((choice) => choice.id === wallet)?.name ?? "Selected wallet";
    try {
      if (mobile && !injectedWallets.has(wallet)) {
        const invoiceUrl = window.location.href;
        if (wallet === "rabby") {
          if (!walletConnectConnector) {
            setMessage("Rabby mobile connection needs a WalletConnect project ID. Open this invoice in Rabby Wallet to continue.");
            return;
          }
          const onMessage = (event: { type: string; data?: unknown }) => {
            if (event.type === "display_uri" && typeof event.data === "string") {
              setMessage("Opening Rabby Wallet. Approve the connection there, then return to this invoice.");
              window.location.assign(`rabby://wc?uri=${encodeURIComponent(event.data)}`);
            }
          };
          walletConnectConnector.emitter.on("message", onMessage);
          try {
            const result = selectedChainId
              ? await connectWalletConnectWithRequiredChain(
                  walletConnectConnector,
                  selectedChainId,
                  () => connectAsync({ connector: walletConnectConnector }),
                )
              : await connectAsync({ connector: walletConnectConnector });
            if (selectedChainId) {
              await setWalletConnectSessionDefaultChain(walletConnectConnector, selectedChainId, result.accounts[0]);
            }
          } finally {
            walletConnectConnector.emitter.off("message", onMessage);
          }
          return;
        }
        const handoffUrl = mobileWalletUrl(wallet, invoiceUrl);
        if (handoffUrl) {
          window.location.assign(handoffUrl);
          return;
        }
      }

      const connector = connectors.find((candidate) => candidate.id === wallet);
      if (!connector) {
        setMessage("That wallet is no longer available. Refresh and try again.");
        return;
      }
      await connectAsync({ connector, ...(mobile && selectedChainId ? { chainId: selectedChainId } : {}) });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "";
      if (/user rejected|user denied|request rejected|user cancelled|user canceled|4001/i.test(detail)) {
        setMessage("The wallet connection was declined. Choose Connect when you are ready to continue.");
      } else if (/provider not found|no provider|not found|not available/i.test(detail)) {
        setMessage(`${walletName} is not available in this browser. Open this invoice inside that wallet app, or continue with another payment option on this page.`);
      } else {
        setMessage("Wallet connection could not be completed. Unlock your wallet and try again.");
      }
    }
  }

  async function disconnectWallet() {
    setMessage("");
    try {
      await disconnectAsync();
    } catch {
      setMessage("The wallet could not be disconnected. Try again in your wallet.");
    }
  }

  async function reconnectWalletConnectForChain(targetId: number) {
    if (!connector || connector.id !== "walletConnect" || !walletConnectConnector) {
      throw new Error("WalletConnect is not available for this connection.");
    }
    await disconnectAsync({ connector });
    const onMessage = (event: { type: string; data?: unknown }) => {
      if (event.type === "display_uri" && typeof event.data === "string") {
        setMessage("Opening Rabby to approve a WalletConnect session that requires the selected network.");
        window.location.assign(`rabby://wc?uri=${encodeURIComponent(event.data)}`);
      }
    };
    walletConnectConnector.emitter.on("message", onMessage);
    try {
      const result = await connectWalletConnectWithRequiredChain(
        walletConnectConnector,
        targetId,
        () => connectAsync({ connector: walletConnectConnector }),
      );
      const aligned = await setWalletConnectSessionDefaultChain(walletConnectConnector, targetId, result.accounts[0]);
      if (!aligned) throw new Error(`Rabby did not approve eip155:${targetId} for the connected account.`);
    } finally {
      walletConnectConnector.emitter.off("message", onMessage);
    }
  }

  async function handleSwitchChain(targetId: number) {
    setMessage("");
    if (!connector) {
      setMessage("No connected wallet is available to switch networks.");
      return;
    }
    if (connector.id === "walletConnect" && isMobileWalletBrowser()) {
      try {
        const targetApproved = await walletConnectSessionIncludesChain(connector, targetId, address);
        if (!targetApproved) {
          setSwitchRequestPending(true);
          await reconnectWalletConnectForChain(targetId);
          setMessage("");
          return;
        }
        const synced = await setWalletConnectSessionDefaultChain(connector, targetId, address);
        if (synced) {
          setMessage("");
          return;
        }
      } catch {
        setMessage("Rabby did not approve the selected network in the new WalletConnect session. Reconnect and approve that network to continue.");
        return;
      } finally {
        setSwitchRequestPending(false);
      }
    }
    let walletConnectChainApproved = true;
    if (isMobileWalletBrowser() && connector.id === "walletConnect") {
      try {
        walletConnectChainApproved = await walletConnectSessionIncludesChain(connector, targetId, address);
      } catch {
        // If the session cannot be inspected, still try its normal switch request.
      }
    }
    let timeoutId: number | undefined;
    const timeoutError = new Error("The wallet did not confirm the network change in time.");
    setSwitchRequestPending(true);
    try {
      prepareRabbyForWalletConnectRequest(connector.id);
      const switchRequest = switchChainAsync({ chainId: targetId, connector });
      await Promise.race([
        switchRequest,
        new Promise<never>((_resolve, reject) => {
          timeoutId = window.setTimeout(() => reject(timeoutError), 15_000);
        }),
      ]);
    } catch (err) {
      const rejected = err instanceof Error && /reject|denied|user refused|cancel/i.test(err.message);
      if (err === timeoutError && connector.id === "walletConnect" && !walletConnectChainApproved) {
        setMessage("This network is not approved for the connected account in the WalletConnect session. Reconnect Rabby from this browser and approve the network for the session.");
      } else if (err === timeoutError && connector.id === "walletConnect") {
        setMessage("The WalletConnect session did not confirm the network change. Reconnect Rabby from this browser and approve the requested network.");
      } else if (err === timeoutError) {
        setMessage("The wallet did not confirm the network change in time. Switch in your wallet, then refresh the wallet network.");
      } else if (rejected) {
        setMessage("The network change was declined in your wallet. Try again, or switch networks in the wallet and retry.");
      } else {
        setMessage("The wallet could not change networks. Approve the network request in your wallet, or switch there and retry.");
      }
    } finally {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      setSwitchRequestPending(false);
    }
  }

  return (
    <section className="wallet-card" aria-labelledby="evm-wallet-title">
      <div className="wallet-card-heading">
        <div><p className="wallet-eyebrow">EVM NETWORKS</p><h3 id="evm-wallet-title">EVM wallets</h3></div>
        {isConnected && <span className="wallet-connected-label">Connected</span>}
      </div>
      {isConnected && address ? (
        <>
          <p className="wallet-address" title={address}>{address}</p>
          <p className="wallet-network">{activeChain ? activeChain.name : `Unsupported network (${chainId ?? "unknown"})`}</p>
          {selectedChainId && chainId !== selectedChainId && (
            <div className="wallet-switch-alert" role="status">
              <p className="wallet-inline-status">
                Your wallet is currently on {activeChain?.name ?? "another network"}. Switch to {selectedChain?.name ?? "the selected network"} to pay with this asset.
              </p>
              <button
                type="button"
                className="wallet-primary-button"
                style={{ marginTop: "8px" }}
                disabled={switchRequestPending}
                onClick={() => void handleSwitchChain(selectedChainId)}
              >
                {switchRequestPending ? "Requesting network change…" : `Switch to ${selectedChain?.name ?? "network"}`}
              </button>
            </div>
          )}
          {chainId !== undefined && !activeChain && (
            <div className="wallet-switch-alert" role="status">
              <p className="wallet-inline-status">This network is outside the supported set. Please switch to a supported network.</p>
              <button
                type="button"
                className="wallet-primary-button"
                style={{ marginTop: "8px" }}
                disabled={switchRequestPending}
                onClick={() => void handleSwitchChain(DEFAULT_RECOMMENDED_CHAIN_ID)}
              >
                {switchRequestPending ? "Requesting network change…" : "Switch to Base (Recommended)"}
              </button>
            </div>
          )}
          <button className="wallet-secondary-button" type="button" onClick={disconnectWallet} disabled={isDisconnecting}>
            {isDisconnecting ? "Disconnecting…" : "Disconnect EVM wallet"}
          </button>
        </>
      ) : (
        <>
          <p className="wallet-description">Choose MetaMask, Rabby, or Coinbase Wallet. On mobile, NODUS opens the selected wallet with this invoice.</p>
          <div className="wallet-connect-options">
            {WALLET_CHOICES.map(({ id, name }) => (
              <button key={id} className="wallet-primary-button" type="button" disabled={isPending} onClick={() => void connect(id)}>
                {isPending ? "Connecting…" : mobile && !injectedWallets.has(id) ? `Open ${name}` : `Connect ${name}`}
              </button>
            ))}
          </div>
        </>
      )}
      {message && <p className="wallet-error" role="alert">{message}</p>}
    </section>
  );
}
