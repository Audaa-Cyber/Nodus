"use client";

import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { DEFAULT_RECOMMENDED_CHAIN_ID, evmWalletChains, getEvmWalletNetwork } from "@/lib/wallet/networks";
import type { WalletConnectionSnapshot } from "@/lib/wallet/types";

export function EvmWalletCard({
  selectedChainId,
  onConnectionChange,
}: {
  selectedChainId?: number;
  onConnectionChange: (connection: WalletConnectionSnapshot) => void;
}) {
  const { address, chainId, isConnected } = useAccount();
  const { connectors, connectAsync, isPending } = useConnect();
  const { disconnectAsync, isPending: isDisconnecting } = useDisconnect();
  const { switchChainAsync, isPending: isSwitchingChain } = useSwitchChain();
  const [message, setMessage] = useState("");
  const activeChain = evmWalletChains.find((chain) => chain.id === chainId);
  const selectedChain = evmWalletChains.find((chain) => chain.id === selectedChainId);

  useEffect(() => {
    onConnectionChange({
      address: isConnected && address ? address : null,
      network: isConnected ? getEvmWalletNetwork(chainId) ?? null : null,
    });
  }, [address, chainId, isConnected, onConnectionChange]);

  async function connect(connectorId: string) {
    setMessage("");
    try {
      const connector = connectors.find((candidate) => candidate.uid === connectorId);
      if (!connector) {
        setMessage("That wallet is no longer available. Refresh and try again.");
        return;
      }
      await connectAsync({ connector });
    } catch {
      setMessage("Wallet connection was declined or could not be completed.");
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

  async function handleSwitchChain(targetId: number) {
    setMessage("");
    try {
      await switchChainAsync({ chainId: targetId });
    } catch (err) {
      const rejected = err instanceof Error && /reject|denied|user refused|cancel/i.test(err.message);
      if (rejected) {
        setMessage("Network switch was declined in your wallet. You can try again or switch manually.");
      } else {
        setMessage("Could not switch networks automatically. Please switch the network inside your wallet.");
      }
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
                disabled={isSwitchingChain}
                onClick={() => void handleSwitchChain(selectedChainId)}
              >
                {isSwitchingChain ? "Approve switch in wallet…" : `Switch to ${selectedChain?.name ?? "network"}`}
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
                disabled={isSwitchingChain}
                onClick={() => void handleSwitchChain(DEFAULT_RECOMMENDED_CHAIN_ID)}
              >
                {isSwitchingChain ? "Approve switch in wallet…" : "Switch to Base (Recommended)"}
              </button>
            </div>
          )}
          <button className="wallet-secondary-button" type="button" onClick={disconnectWallet} disabled={isDisconnecting}>
            {isDisconnecting ? "Disconnecting…" : "Disconnect EVM wallet"}
          </button>
        </>
      ) : (
        <>
          <p className="wallet-description">Connect an Ethereum-compatible wallet. Your address stays in this browser.</p>
          <div className="wallet-connect-options">
            {connectors.map((connector) => (
              <button key={connector.uid} className="wallet-primary-button" type="button" disabled={isPending} onClick={() => connect(connector.uid)}>
                {isPending ? "Connecting…" : `Connect ${connector.name.toLowerCase() === "injected" ? "browser wallet" : connector.name}`}
              </button>
            ))}
          </div>
        </>
      )}
      {message && <p className="wallet-error" role="alert">{message}</p>}
    </section>
  );
}
