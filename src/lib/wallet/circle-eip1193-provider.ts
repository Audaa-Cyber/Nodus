"use client";

import { executeCircleChallenge } from "./circle-web-sdk.ts";

export interface CircleWalletSession {
  address: `0x${string}`;
  walletId: string;
  chainId: number;
  userToken: string;
  encryptionKey: string;
  guestUserId?: string;
  appId?: string;
}

const DEFAULT_RPC_MAP: Record<number, string> = {
  84532: "https://sepolia.base.org",
  421614: "https://sepolia-rollup.arbitrum.io/rpc",
  11155111: "https://ethereum-sepolia-rpc.publicnode.com",
  8453: "https://mainnet.base.org",
  42161: "https://arb1.arbitrum.io/rpc",
  1: "https://eth.llamarpc.com",
};

export class CircleEip1193Provider {
  private session: CircleWalletSession | null = null;
  private currentChainId: number = 84532; // Default Base Sepolia
  private listeners: Map<string, Set<(...args: unknown[]) => void>> = new Map();

  constructor(initialSession?: CircleWalletSession | null) {
    if (initialSession) {
      this.setSession(initialSession);
    }
  }

  setSession(session: CircleWalletSession | null) {
    this.session = session;
    if (session?.chainId) {
      this.currentChainId = session.chainId;
    }
    this.emit("accountsChanged", session?.address ? [session.address] : []);
  }

  getSession(): CircleWalletSession | null {
    return this.session;
  }

  getChainId(): number {
    return this.currentChainId;
  }

  setChainId(chainId: number) {
    this.currentChainId = chainId;
    this.emit("chainChanged", `0x${chainId.toString(16)}`);
  }

  on(event: string, listener: (...args: unknown[]) => void): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
    return this;
  }

  removeListener(event: string, listener: (...args: unknown[]) => void): this {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  private emit(event: string, ...args: unknown[]) {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.forEach((fn) => {
        try {
          fn(...args);
        } catch {
          // Ignore listener errors
        }
      });
    }
  }

  async request({
    method,
    params = [],
  }: {
    method: string;
    params?: unknown[] | Record<string, unknown>;
  }): Promise<unknown> {
    const paramsList = Array.isArray(params) ? params : [params];

    switch (method) {
      case "eth_accounts":
      case "eth_requestAccounts": {
        return this.session?.address ? [this.session.address] : [];
      }

      case "eth_chainId": {
        return `0x${this.currentChainId.toString(16)}`;
      }

      case "net_version": {
        return String(this.currentChainId);
      }

      case "wallet_switchEthereumChain": {
        const target = paramsList[0] as { chainId?: string } | undefined;
        if (target?.chainId) {
          const parsed = parseInt(target.chainId, 16);
          if (!isNaN(parsed)) {
            this.setChainId(parsed);
          }
        }
        return null;
      }

      case "eth_sendTransaction": {
        return this.handleSendTransaction(paramsList[0] as {
          from?: string;
          to?: string;
          value?: string;
          data?: string;
        });
      }

      default: {
        // Delegate read and standard node methods to RPC endpoint
        return this.forwardToRpc(method, params);
      }
    }
  }

  private async handleSendTransaction(tx: {
    from?: string;
    to?: string;
    value?: string;
    data?: string;
  }): Promise<string> {
    if (!this.session) {
      throw new Error("Circle wallet session is not connected.");
    }
    if (!this.session.appId) {
      throw new Error("Circle App ID is missing from session.");
    }

    const { guestUserId, walletId, userToken, encryptionKey, appId } = this.session;

    // Call server to initiate transaction challenge
    const res = await fetch("/api/wallet/circle/guest/transaction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guestUserId,
        walletId,
        to: tx.to,
        value: tx.value,
        data: tx.data,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to create Circle transaction challenge.");
    }

    const payload = (await res.json()) as {
      challengeId: string;
      userToken?: string;
      encryptionKey?: string;
    };

    // Execute the challenge in the user's browser using Circle W3SSdk modal
    const challengeResult = await executeCircleChallenge({
      appId,
      userToken: payload.userToken || userToken,
      encryptionKey: payload.encryptionKey || encryptionKey,
      challengeId: payload.challengeId,
    });

    if (!challengeResult.success) {
      throw new Error(challengeResult.error || "Circle challenge execution was declined or failed.");
    }

    // Extract transaction hash from result or generate reference
    const data = challengeResult.result as { data?: { txHash?: string } } | undefined;
    const txHash = data?.data?.txHash;
    if (txHash && /^0x[a-fA-F0-9]{64}$/.test(txHash)) {
      return txHash;
    }

    // If Circle returns challenge ID upon submission, return it as hex-safe tracking ref
    return `0x${payload.challengeId.replace(/-/g, "").padEnd(64, "0").slice(0, 64)}`;
  }

  private async forwardToRpc(method: string, params: unknown): Promise<unknown> {
    const rpcUrl = DEFAULT_RPC_MAP[this.currentChainId] || "https://sepolia.base.org";
    const body = {
      jsonrpc: "2.0",
      id: Math.floor(Math.random() * 1_000_000),
      method,
      params,
    };

    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`RPC request failed: ${res.statusText}`);
    }

    const json = (await res.json()) as { result?: unknown; error?: { message: string } };
    if (json.error) {
      throw new Error(json.error.message || `RPC Error on ${method}`);
    }
    return json.result;
  }
}

let activeProviderInstance: CircleEip1193Provider | null = null;

export function getSharedCircleProvider(session?: CircleWalletSession | null): CircleEip1193Provider {
  if (!activeProviderInstance) {
    activeProviderInstance = new CircleEip1193Provider(session);
  } else if (session) {
    activeProviderInstance.setSession(session);
  }
  return activeProviderInstance;
}
