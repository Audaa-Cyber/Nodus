"use client";

import { createConnector } from "wagmi";
import type { Address } from "viem";
import { getSharedCircleProvider } from "./circle-eip1193-provider.ts";

export function circleWalletConnector() {
  return createConnector((config) => {
    const provider = getSharedCircleProvider();

    return {
      id: "circle-user-controlled",
      name: "Circle Wallet",
      type: "circle",

      async connect<withCapabilities extends boolean = false>(parameters?: {
        chainId?: number;
        isReconnecting?: boolean;
        withCapabilities?: withCapabilities | boolean;
      }) {
        const session = provider.getSession();
        if (!session?.address) {
          throw new Error("Circle wallet is not initialized. Please set up or unlock your Circle wallet.");
        }
        if (parameters?.chainId) {
          provider.setChainId(parameters.chainId);
        }
        const activeChainId = provider.getChainId();
        config.emitter.emit("connect", {
          accounts: [session.address as Address],
          chainId: activeChainId,
        });

        if (parameters?.withCapabilities) {
          return {
            accounts: [{ address: session.address as Address, capabilities: {} }] as never,
            chainId: activeChainId,
          };
        }

        return {
          accounts: [session.address as Address] as never,
          chainId: activeChainId,
        };
      },

      async disconnect() {
        provider.setSession(null);
        config.emitter.emit("disconnect");
      },

      async getAccounts() {
        const session = provider.getSession();
        return session?.address ? ([session.address as Address] as readonly Address[]) : [];
      },

      async getChainId() {
        return provider.getChainId();
      },

      async getProvider() {
        return provider;
      },

      async isAuthorized() {
        const session = provider.getSession();
        return Boolean(session?.address);
      },

      async switchChain({ chainId }) {
        provider.setChainId(chainId);
        config.emitter.emit("change", { chainId });
        const chain = config.chains.find((x) => x.id === chainId);
        if (!chain) throw new Error(`Chain ${chainId} not configured.`);
        return chain;
      },

      onAccountsChanged(accounts) {
        config.emitter.emit("change", {
          accounts: accounts.map((x) => x as Address),
        });
      },

      onChainChanged(chainId) {
        const parsed = typeof chainId === "string" ? parseInt(chainId, 16) : Number(chainId);
        config.emitter.emit("change", { chainId: parsed });
      },

      onDisconnect() {
        config.emitter.emit("disconnect");
      },
    };
  });
}
