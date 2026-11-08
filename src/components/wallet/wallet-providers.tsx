"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createConfig, http, WagmiProvider } from "wagmi";
import { injected } from "wagmi/connectors/injected";
import {
  arbitrum,
  arbitrumSepoliaChain,
  avalanche,
  base,
  baseSepoliaChain,
  bsc,
  evmWalletChains,
  mainnet,
  optimism,
  optimismSepoliaChain,
  polygon,
  sepoliaChain,
} from "@/lib/wallet/networks";
import { createClient } from "@solana/kit";
import { solanaRpc } from "@solana/kit-plugin-rpc";
import { walletSigner } from "@solana/kit-plugin-wallet";
import { ClientProvider } from "@solana/react";

const evmConfig = createConfig({
  chains: evmWalletChains,
  connectors: [injected()],
  transports: {
    [mainnet.id]: http(),
    [arbitrum.id]: http(),
    [base.id]: http(),
    [optimism.id]: http(),
    [polygon.id]: http(),
    [bsc.id]: http(),
    [avalanche.id]: http(),
    [sepoliaChain.id]: http(),
    [baseSepoliaChain.id]: http(),
    [arbitrumSepoliaChain.id]: http(),
    [optimismSepoliaChain.id]: http(),
  },
  ssr: true,
});

const solanaClient = createClient()
  .use(walletSigner({ chain: "solana:mainnet" }))
  .use(solanaRpc({ rpcUrl: process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com" }));

export type SolanaClient = Awaited<typeof solanaClient>;

export function WalletProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={evmConfig}>
      <QueryClientProvider client={queryClient}>
        <ClientProvider client={solanaClient}>{children}</ClientProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
