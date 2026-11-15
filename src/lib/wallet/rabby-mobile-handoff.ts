export function isMobileWalletBrowser() {
  return typeof navigator !== "undefined" && (
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

const WALLETCONNECT_DEEPLINK_CHOICE = "WALLETCONNECT_DEEPLINK_CHOICE";

/**
 * Tell WalletConnect which wallet should receive its next mobile request.
 * The WalletConnect SignClient adds the request ID and session topic to this
 * base URL before opening it, so Rabby can route directly to the pending
 * request instead of opening its home screen.
 */
export function prepareRabbyForWalletConnectRequest(connectorId?: string) {
  if (connectorId !== "walletConnect" || !isMobileWalletBrowser() || typeof window === "undefined") {
    return false;
  }

  try {
    window.localStorage.setItem(
      WALLETCONNECT_DEEPLINK_CHOICE,
      JSON.stringify({ name: "Rabby Wallet", href: "rabby://" }),
    );
    return true;
  } catch {
    // WalletConnect can still complete in an already-open wallet browser, but
    // it cannot perform its normal request-specific mobile handoff.
    return false;
  }
}

type WalletConnectSessionReader = {
  id: string;
  getProvider: () => Promise<unknown>;
};

type WalletConnectProviderConnect = {
  connect: (options?: { chains?: number[]; optionalChains?: number[]; [key: string]: unknown }) => Promise<unknown>;
};

/**
 * Make the requested payment chain required for this WalletConnect proposal.
 * Wagmi normally places every configured chain in optionalChains, which lets
 * a wallet approve a session without authorizing the chain the payer chose.
 */
export async function connectWalletConnectWithRequiredChain<T>(
  connector: WalletConnectSessionReader,
  chainId: number,
  connect: () => Promise<T>,
) {
  if (connector.id !== "walletConnect") return connect();

  const provider = await connector.getProvider() as WalletConnectProviderConnect;
  const originalConnect = provider.connect;
  provider.connect = function (options) {
    const optionalChains = (options?.optionalChains ?? []).filter((id) => id !== chainId);
    return originalConnect.call(this, {
      ...options,
      chains: [chainId],
      optionalChains,
    });
  };

  try {
    return await connect();
  } finally {
    provider.connect = originalConnect;
  }
}

type WalletConnectProviderSession = {
  signer?: {
    setDefaultChain?: (chain: string) => void;
  };
  session?: {
    namespaces?: Record<string, { chains?: string[]; accounts?: string[] }>;
  };
};

/**
 * Select a chain that the connected WalletConnect account already approved.
 * This updates the dapp's WalletConnect request context without asking the
 * wallet to switch its global network. It is useful when a multi-chain mobile
 * session has a stale persisted default chain.
 */
export async function setWalletConnectSessionDefaultChain(
  connector: WalletConnectSessionReader,
  chainId: number,
  address?: string,
) {
  if (connector.id !== "walletConnect") return false;

  const provider = await connector.getProvider() as WalletConnectProviderSession;
  const namespace = provider.session?.namespaces?.eip155;
  if (!namespace || typeof provider.signer?.setDefaultChain !== "function") return false;

  const targetChain = `eip155:${chainId}`;
  const authorizedAccount = (namespace.accounts ?? []).some((account) => {
    const [namespaceName, accountChainId, accountAddress] = account.split(":");
    return namespaceName === "eip155"
      && accountChainId === String(chainId)
      && (!address || accountAddress?.toLowerCase() === address.toLowerCase());
  });
  if (!authorizedAccount) return false;

  provider.signer.setDefaultChain(targetChain);
  return true;
}

export async function walletConnectSessionIncludesChain(
  connector: WalletConnectSessionReader,
  chainId: number,
  address?: string,
) {
  if (connector.id !== "walletConnect") return true;

  const provider = await connector.getProvider() as WalletConnectProviderSession;
  const namespace = provider.session?.namespaces?.eip155;
  if (!namespace) return false;

  const approvedChains = (namespace.accounts ?? []).filter((account) => {
    const [namespaceName, accountChainId, accountAddress] = account.split(":");
    return namespaceName === "eip155"
      && accountChainId === String(chainId)
      && (!address || accountAddress?.toLowerCase() === address.toLowerCase());
  });
  if (approvedChains.length === 0) return false;
  return true;
}
