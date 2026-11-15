type WalletConnectProviderForDiagnostics = {
  signer?: {
    client?: {
      session: { keys: string[] };
      engine: { events: { listenerCount: (event: string) => number } };
      core: {
        relayer: {
          messages: {
            getWithoutAck: (topics: string[]) => Record<string, string[]>;
            ack: (topic: string, message: string) => Promise<void>;
          };
        };
        crypto: {
          decode: (topic: string, message: string, options: { encoding: string }) => Promise<unknown>;
        };
        history: {
          get: (topic: string, id: number) => Promise<{
            request?: {
              method?: string;
              params?: { request?: { method?: string } };
            };
          }>;
        };
      };
    };
  };
};

type WalletConnectConnectorForDiagnostics = {
  id: string;
  getProvider: () => Promise<unknown>;
};

export type WalletConnectStartupDiagnostic = {
  status: string;
  sessionCount: number;
  pendingMessageCount: number;
  messages: Array<{
    index: number;
    decodedAs: string;
    responseHistory: string;
    responseListeners: string;
    error: string;
  }>;
};

function safeError(error: unknown) {
  const value = error instanceof Error
    ? `${error.name}: ${error.message}`
    : typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message)
        : String(error);

  return value
    .replace(/0x[a-f\d]{40,}|\b[a-f\d]{64,}\b/gi, "[redacted]")
    .slice(0, 180);
}

export async function inspectAndRecoverWalletConnectStartupMessages(
  connector: WalletConnectConnectorForDiagnostics | undefined,
): Promise<WalletConnectStartupDiagnostic> {
  if (!connector || connector.id !== "walletConnect") {
    return { status: "No WalletConnect connector is available on this page.", sessionCount: 0, pendingMessageCount: 0, messages: [] };
  }

  try {
    const provider = await connector.getProvider() as WalletConnectProviderForDiagnostics;
    const client = provider.signer?.client;
    if (!client) {
      return { status: "WalletConnect provider has no initialized SignClient.", sessionCount: 0, pendingMessageCount: 0, messages: [] };
    }

    const topics = client.session.keys;
    const pendingByTopic = client.core.relayer.messages.getWithoutAck(topics);
    const pending = Object.entries(pendingByTopic).flatMap(([topic, messages]) =>
      messages.map((message) => ({ topic, message })),
    );

    const diagnostics: WalletConnectStartupDiagnostic["messages"] = [];
    let recoveredResponses = 0;
    for (const [index, item] of pending.entries()) {
      const diagnostic = { index: index + 1, decodedAs: "not decoded", responseHistory: "not checked", responseListeners: "not checked", error: "" };
      try {
        const payload = await client.core.crypto.decode(item.topic, item.message, { encoding: "base64pad" });
        if (payload && typeof payload === "object") {
          const value = payload as { id?: unknown; method?: unknown };
          if (typeof value.method === "string") {
            diagnostic.decodedAs = `request: ${value.method}`;
            diagnostic.responseHistory = "not applicable";
          } else if (typeof value.id === "number") {
            diagnostic.decodedAs = `response id: ${value.id}`;
            const listenerCount = client.engine.events.listenerCount(`session_request:${value.id}`);
            diagnostic.responseListeners = `${listenerCount} in-memory handler(s)`;
            try {
              const history = await client.core.history.get(item.topic, value.id);
              const walletMethod = history.request?.params?.request?.method;
              diagnostic.responseHistory = history.request?.method
                ? `matched request: ${history.request.method}${walletMethod ? ` (${walletMethod})` : ""}`
                : "history record found without a request method";
              const isNetworkSwitch = walletMethod === "wallet_switchEthereumChain"
                || walletMethod === "wallet_addEthereumChain";
              if (listenerCount === 0 && history.request?.method === "wc_sessionRequest" && isNetworkSwitch) {
                // No page-local Promise can receive this old response after navigation or reload.
                await client.core.relayer.messages.ack(item.topic, item.message);
                recoveredResponses += 1;
                diagnostic.responseListeners += "; orphaned switch response acknowledged";
              }
            } catch (error) {
              diagnostic.responseHistory = `history lookup or recovery failed: ${safeError(error)}`;
            }
          } else {
            diagnostic.decodedAs = "decoded payload has no JSON-RPC method or numeric response ID";
            diagnostic.responseListeners = "not applicable";
          }
        } else {
          diagnostic.decodedAs = `decoded payload type: ${typeof payload}`;
        }
      } catch (error) {
        diagnostic.error = safeError(error);
      }
      if (index < 5) diagnostics.push(diagnostic);
    }

    return {
      status: recoveredResponses > 0
        ? `Acknowledged ${recoveredResponses} orphaned network-switch response(s).`
        : pending.length > 5 ? "Showing first 5 pending messages." : "Inspection complete.",
      sessionCount: topics.length,
      pendingMessageCount: pending.length,
      messages: diagnostics,
    };
  } catch (error) {
    return { status: `Inspection failed: ${safeError(error)}`, sessionCount: 0, pendingMessageCount: 0, messages: [] };
  }
}
