type PaymentReferences = {
  transactionHash?: string | null;
  approvalTransactionHash?: string | null;
};

type ReferenceStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const HASH_PATTERN = /^0x[0-9a-f]{64}$/i;

/** Saves references only. This recovery path never signs or broadcasts a transaction. */
export function createPaymentReferenceWriter(
  shareToken: string,
  options: {
    storage?: () => ReferenceStorage | null;
    fetcher?: typeof fetch;
    pause?: (ms: number) => Promise<void>;
  } = {},
) {
  const memory = new Map<string, PaymentReferences>();
  const queues = new Map<string, Promise<boolean>>();
  const fetcher = options.fetcher ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const pause = options.pause ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const storage = () => {
    try {
      return options.storage ? options.storage() : window.localStorage;
    } catch {
      return null;
    }
  };
  const key = (attemptId: string) => `nodus:live-references:${shareToken}:${attemptId}`;

  function read(attemptId: string): PaymentReferences {
    if (memory.has(attemptId)) return { ...memory.get(attemptId) };
    try {
      const saved = JSON.parse(storage()?.getItem(key(attemptId)) ?? "null");
      const references: PaymentReferences = {};
      for (const field of ["transactionHash", "approvalTransactionHash"] as const) {
        if (typeof saved?.[field] === "string" && HASH_PATTERN.test(saved[field])) references[field] = saved[field];
      }
      memory.set(attemptId, references);
      return { ...references };
    } catch {
      return {};
    }
  }

  function record(attemptId: string, incoming: PaymentReferences): boolean {
    const references = read(attemptId);
    for (const field of ["transactionHash", "approvalTransactionHash"] as const) {
      const hash = incoming[field];
      if (hash == null) continue;
      if (!HASH_PATTERN.test(hash)) return false;
      if (references[field] && references[field].toLowerCase() !== hash.toLowerCase()) return false;
      references[field] = hash;
    }
    if (!references.transactionHash && !references.approvalTransactionHash) return false;
    memory.set(attemptId, references);
    try {
      storage()?.setItem(key(attemptId), JSON.stringify(references));
    } catch { /* Keep the in-memory copy when browser storage is unavailable. */ }
    return true;
  }

  function persist(attemptId: string, incoming: PaymentReferences = {}): Promise<boolean> {
    // Journal synchronously, before a request or another SDK event can interrupt execution.
    if (!record(attemptId, incoming)) return Promise.resolve(false);
    const pending = (queues.get(attemptId) ?? Promise.resolve(true)).then(async () => {
      for (let retry = 0; retry < 3; retry += 1) {
        const references = read(attemptId);
        if (!references.transactionHash && !references.approvalTransactionHash) return false;
        try {
          const response = await fetcher(
            `/api/pay/${encodeURIComponent(shareToken)}/attempt/${attemptId}/submit`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              keepalive: true,
              signal: AbortSignal.timeout(8000),
              body: JSON.stringify(references),
            },
          );
          const data = await response.json();
          const matches = (Object.keys(references) as Array<keyof PaymentReferences>).every((field) => {
            const savedField = field === "transactionHash" ? "transaction_hash" : "circle_approval_tx_hash";
            return typeof data.attempt?.[savedField] === "string"
              && data.attempt[savedField].toLowerCase() === references[field]?.toLowerCase();
          });
          if (response.ok && data.success === true && data.attempt?.id === attemptId && matches) return true;
          // Conflicts and invalid attempts need review, not repeated submissions.
          if (response.status >= 400 && response.status < 500 && response.status !== 429) return false;
        } catch { /* Timeouts, offline responses, and malformed replies are retried. */ }
        if (retry < 2) await pause(retry === 0 ? 250 : 750);
      }
      return false;
    });
    queues.set(attemptId, pending);
    return pending;
  }

  function clear(attemptId: string) {
    memory.delete(attemptId);
    try { storage()?.removeItem(key(attemptId)); } catch { /* Storage may be disabled. */ }
  }

  return { read, record, persist, clear };
}
