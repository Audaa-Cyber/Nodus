"use client";

import { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { evmWalletChains, getEvmWalletNetwork } from "@/lib/wallet/networks";
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
            <p className="wallet-inline-status" role="status">
              Switch your wallet to {selectedChain?.name ?? "the selected network"} to use this asset.
            </p>
          )}
          {chainId !== undefined && !activeChain && (
            <p className="wallet-inline-status" role="status">This network is outside the supported wallet set.</p>
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
