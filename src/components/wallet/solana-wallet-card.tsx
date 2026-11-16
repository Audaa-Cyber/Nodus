"use client";

import { useEffect, useState } from "react";
import { useClient } from "@solana/react";
import {
  useConnect,
  useConnectedWallet,
  useDisconnect,
  useIsWalletReady,
  useWallets,
} from "@solana/kit-plugin-wallet/react";
import type { SolanaClient } from "./wallet-providers";
import type { WalletConnectionSnapshot } from "@/lib/wallet/types";

function SolanaWalletCardContent({ selected, onConnectionChange }: {
  selected: boolean;
  onConnectionChange: (connection: WalletConnectionSnapshot) => void;
}) {
  const client = useClient<SolanaClient>();
  const wallets = useWallets(client);
  const connected = useConnectedWallet(client);
  const ready = useIsWalletReady(client);
  const connectAction = useConnect(client);
  const disconnectAction = useDisconnect(client);
  const [message, setMessage] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    onConnectionChange({
      address: connected?.account.address ?? null,
      network: connected ? { key: "solana", label: "Solana", family: "solana" } : null,
    });
  }, [connected, onConnectionChange]);

  async function connect(wallet: (typeof wallets)[number]) {
    setMessage("");
    try {
      await connectAction.dispatchAsync(wallet);
    } catch {
      setMessage("Wallet connection was declined or could not be completed.");
    }
  }

  async function disconnect() {
    setMessage("");
    try {
      await disconnectAction.dispatchAsync();
    } catch {
      setMessage("The wallet could not be disconnected. Try again in your wallet.");
    }
  }

  return (
    <section className="wallet-card" aria-labelledby="solana-wallet-title">
      <div className="wallet-card-heading">
        <div><p className="wallet-eyebrow">SOLANA</p><h3 id="solana-wallet-title">Solana wallets</h3></div>
        {connected && <span className="wallet-connected-label">Connected</span>}
      </div>
      {!hydrated || !ready ? <p className="wallet-description" role="status">Checking wallet connection…</p> : connected ? (
        <>
          <p className="wallet-address" title={connected.account.address}>{connected.account.address}</p>
          <p className="wallet-network">Solana Mainnet</p>
          <button className="wallet-secondary-button" type="button" onClick={disconnect} disabled={disconnectAction.isRunning}>
            {disconnectAction.isRunning ? "Disconnecting…" : "Disconnect Solana wallet"}
          </button>
        </>
      ) : wallets.length > 0 ? (
        <>
          <p className="wallet-description">Connect a Wallet Standard wallet on Solana Mainnet.</p>
          <div className="wallet-connect-options">
            {wallets.map((wallet) => (
              <button key={wallet.name} className="wallet-primary-button" type="button" disabled={connectAction.isRunning} onClick={() => connect(wallet)}>
                {connectAction.isRunning ? "Connecting…" : `Connect ${wallet.name}`}
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="wallet-description">No compatible Solana wallet was detected. Install or open a Wallet Standard wallet, then refresh this page.</p>
      )}
      {selected && connected && <p className="wallet-inline-status" role="status">This wallet is selected for the chosen Solana asset.</p>}
      {message && <p className="wallet-error" role="alert">{message}</p>}
    </section>
  );
}

export function SolanaWalletCard({ selected, onConnectionChange }: {
  selected: boolean;
  onConnectionChange: (connection: WalletConnectionSnapshot) => void;
}) {
  return <SolanaWalletCardContent selected={selected} onConnectionChange={onConnectionChange} />;
}
